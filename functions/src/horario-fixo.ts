import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, motivoDeLeitura, vinculosDe } from "./acesso";
import { createHash } from "node:crypto";
import { OCUPAM_SLOT, documentoDaReserva, gravarComTravaDeHorario, liberavelNaTroca, validarPedido } from "./booking";
import { horarioDisponivel, janelasOcupadas } from "./agenda";
import { hojeNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";
import { staffIdDeQuemChamou } from "./convite-equipe";
import { isentoDeCobranca } from "./hub/contrato";

/**
 * Horário fixo do mensalista (29/09/2026).
 *
 * Pedido do dono: "mensalistas precisam ficar fixos". Até aqui cada semana era
 * marcada à mão, e na semana seguinte a vaga do mensalista ficava livre para
 * qualquer avulso — justamente nos horários mais disputados (sexta à tarde,
 * sábado de manhã).
 *
 * O horário fixo mora na ASSINATURA. A partir dele, o sistema mantém as
 * próximas semanas reservadas, sempre pelo mesmo caminho de gravação do balcão
 * (`gravarComTravaDeHorario`): nunca dois clientes na mesma cadeira.
 *
 * Três decisões que não são óbvias:
 *
 * - **Id determinístico por ocorrência** (`fixo_{assinatura}_{versão}_{data}`).
 *   Se o dono ou o cliente cancelar UMA semana, o documento continua existindo
 *   como cancelado, e a rotina não o recria. A VERSÃO muda quando o horário
 *   muda (outra hora, outro barbeiro, outro serviço): aí as semanas antigas em
 *   aberto são liberadas (`liberadaPeloFixo`) e as novas nascem com o horário
 *   novo — a liberação não conta como semana desmarcada.
 * - **Dia fechado ou horário ocupado não viram reserva por cima.** Viram um
 *   conflito registrado, para o dono resolver.
 * - **Se o cliente já tem horário naquele dia**, a rotina não cria outro: o
 *   dono pode ter marcado à mão num horário diferente de propósito.
 */

export type HorarioFixo = {
  /** 0 = domingo … 6 = sábado. */
  diaDaSemana: number;
  /** `HH:MM`. */
  hora: string;
  staffId: string;
  serviceIds: string[];
  frequencia: "semanal" | "quinzenal";
  /** Primeira data válida (`YYYY-MM-DD`). É a âncora da quinzena. */
  inicio: string;
};

/** Quantas semanas à frente ficam reservadas. */
export const SEMANAS_RESERVADAS = 8;

const DIA_MS = 24 * 60 * 60 * 1000;

function paraDia(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return Date.UTC(a, m - 1, d) / DIA_MS;
}
function paraIso(dia: number): string {
  return new Date(dia * DIA_MS).toISOString().slice(0, 10);
}
/** Dia da semana de uma data ISO, sem depender do fuso da máquina. */
export function diaDaSemanaDe(iso: string): number {
  return new Date(paraDia(iso) * DIA_MS).getUTCDay();
}

export function horarioFixoValido(h: unknown): h is HorarioFixo {
  if (!h || typeof h !== "object") return false;
  const x = h as Record<string, unknown>;
  return (
    Number.isInteger(x.diaDaSemana) &&
    (x.diaDaSemana as number) >= 0 &&
    (x.diaDaSemana as number) <= 6 &&
    typeof x.hora === "string" &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(x.hora) &&
    typeof x.staffId === "string" &&
    x.staffId.length > 0 &&
    Array.isArray(x.serviceIds) &&
    x.serviceIds.length > 0 &&
    x.serviceIds.length <= 8 &&
    x.serviceIds.every((s) => typeof s === "string" && s.length > 0) &&
    (x.frequencia === "semanal" || x.frequencia === "quinzenal") &&
    typeof x.inicio === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.inicio) &&
    diaDaSemanaDe(x.inicio) === x.diaDaSemana
  );
}

/**
 * As datas que o horário fixo deve ter reservadas, de hoje até N semanas.
 *
 * Pura: é aqui que mora a conta da quinzena, e ela tem teste.
 */
export function datasDoHorarioFixo(params: {
  horario: HorarioFixo;
  hoje: string;
  semanas?: number;
}): string[] {
  const { horario, hoje } = params;
  const semanas = params.semanas ?? SEMANAS_RESERVADAS;
  const passo = horario.frequencia === "quinzenal" ? 14 : 7;
  const inicio = paraDia(horario.inicio);
  const fim = paraDia(hoje) + semanas * 7;
  const primeiroValido = Math.max(inicio, paraDia(hoje));
  /* Avança da âncora de passo em passo: é o que mantém a quinzena alinhada
   * mesmo quando a rotina roda no meio de um ciclo. */
  const saltos = Math.max(0, Math.ceil((primeiroValido - inicio) / passo));
  const datas: string[] = [];
  for (let dia = inicio + saltos * passo; dia < fim; dia += passo) datas.push(paraIso(dia));
  return datas;
}

/** Impressão digital do horário: muda quando qualquer coisa que o define muda. */
export function versaoDoHorario(h: HorarioFixo): string {
  const chave = JSON.stringify([h.diaDaSemana, h.hora, h.staffId, [...h.serviceIds].sort(), h.frequencia]);
  return createHash("sha1").update(chave).digest("hex").slice(0, 8);
}

export const idDaOcorrencia = (subscriptionId: string, versao: string, data: string) =>
  `fixo_${subscriptionId}_${versao}_${data}`;

/**
 * A semana (segunda a domingo) de uma data, como número. A troca de horário
 * casa a ocorrência antiga com a nova pela SEMANA, e não pela data: ao mudar o
 * dia (sexta para terça), pela data a nova não teria par, e se ela não coubesse
 * a semana ficaria sem horário nenhum.
 */
export function semanaDe(iso: string): number {
  return Math.floor((paraDia(iso) + 3) / 7);
}

/** O cliente remarcou esta ocorrência: ela é horário dele agora. */
export function foiRemarcada(b: { rescheduledFrom?: unknown; origemDoFixo?: unknown }): boolean {
  return !!(b.rescheduledFrom || b.origemDoFixo);
}

/**
 * Qual das duas quinzenas o horário ocupa (0 ou 1). Semanal não tem fase.
 *
 * A versão ignora `inicio` de propósito (mudar só a âncora não pode trocar o
 * id de reservas que já existem em produção), mas na quinzena a âncora É o
 * horário: 09/10 e 16/10 são fixos diferentes. Salvar com a outra fase gerava
 * as datas novas ao lado das antigas, e o cliente vinha toda semana.
 */
export function faseDaQuinzena(h: Pick<HorarioFixo, "frequencia" | "inicio">): number {
  return h.frequencia === "quinzenal" ? Math.floor(paraDia(h.inicio) / 7) % 2 : 0;
}

/** O dono mudou o horário de um fixo que já existia (outra hora, barbeiro, serviço, frequência ou fase). */
export function horarioFixoMudou(anterior: unknown, novo: HorarioFixo | null): boolean {
  if (!novo || !horarioFixoValido(anterior)) return false;
  return versaoDoHorario(anterior) !== versaoDoHorario(novo) || faseDaQuinzena(anterior) !== faseDaQuinzena(novo);
}

/**
 * Tira da lista as datas cujo horário já passou. O fixo de hoje às 10h, salvo
 * às 14h, criava uma reserva no passado: a agenda mostrava um atendimento que
 * ninguém ia fazer. O primeiro instante válido é o próximo, não o dia de hoje.
 */
export function somenteDatasFuturas(datas: string[], hora: string, timeZone: string, agora: Date = new Date()): string[] {
  return datas.filter((d) => instanteNoFuso(d, hora, timeZone).getTime() > agora.getTime());
}

/**
 * O que acontece com cada data:
 *   - `criada`: reserva nova;
 *   - `reativada`: a ocorrência existia, LIBERADA pelo próprio fixo (horário
 *     mudou, fixo tirado, plano encerrado), e volta a valer — é o "tirei e
 *     coloquei de novo" (07/10);
 *   - `ja-existe`: já está reservada, nada a fazer;
 *   - `desmarcada`: a ocorrência existe e foi cancelada ou apagada por uma
 *     decisão de alguém — não volta sozinha;
 *   - `cliente-ja-marcado`: o cliente já resolveu a data por outro caminho.
 */
export type ResultadoDaOcorrencia =
  | {
      data: string;
      resultado: "criada" | "reativada" | "ja-existe" | "desmarcada" | "cliente-ja-marcado";
      /** Quantas ocorrências da versão antiga foram trocadas por esta, na mesma gravação. */
      liberou?: number;
    }
  | { data: string; resultado: "conflito"; motivo: string };

/**
 * Motivos que a liberação do fixo gravou antes de existir o marcador
 * `liberadaPeloFixo` (07/10). Ficam aqui para os documentos já gravados em
 * produção continuarem reconhecidos; os novos levam o marcador.
 * "Plano encerrado" não foi gravado por este código, mas é o nome que o dono
 * usa e custa nada reconhecer.
 */
export const MOTIVOS_DA_LIBERACAO = [
  "Horário fixo alterado",
  "Horário fixo removido",
  "Plano de mensalista encerrado",
  "Plano encerrado",
];

/**
 * A ocorrência foi cancelada pela LIBERAÇÃO do fixo, e não por decisão de
 * alguém sobre aquela semana.
 *
 * A diferença importa: cancelamento do cliente ou da barbearia é decisão que a
 * rotina respeita; a liberação é só o sistema abrindo espaço para o horário
 * novo. Tratar as duas igual foi o defeito de 07/10 — mudar o fixo liberava as
 * semanas antigas, e a rotina via esses cancelamentos como "semana resolvida"
 * e não reservava NENHUMA semana do horário novo.
 */
export function liberadaPeloFixo(r: { status?: unknown; cancelReason?: unknown; liberadaPeloFixo?: unknown }): boolean {
  if (!String(r.status ?? "").startsWith("cancelled")) return false;
  return r.liberadaPeloFixo === true || MOTIVOS_DA_LIBERACAO.includes(String(r.cancelReason ?? ""));
}

/** Status de ocorrência que segue valendo: reservada, feita ou em curso. */
const AINDA_VALE = ["confirmed", "confirmed_by_client", "pending_payment", "fit_in_requested", "completed", "no_show"];

/**
 * Garante as reservas de UMA assinatura. Com `simular`, só diz o que faria.
 *
 * Nada aqui apaga: ocorrência cancelada continua cancelada, e conflito vira
 * registro para o dono, não reserva por cima de ninguém. A exceção é a
 * ocorrência que a liberação do próprio fixo cancelou: essa volta a valer
 * quando o mesmo horário é recolocado (`reativada`).
 */
/**
 * O cliente já resolveu ESTA data por outro caminho — então a rotina não a
 * reserva.
 *
 * Três casos:
 *   - já tem horário nesse dia (o de sempre, marcado à mão);
 *   - o horário desse dia foi REMARCADO para outro (`rescheduledFrom`): o
 *     cliente adiantou ou adiou a semana. Era o furo de 30/09 — o Cleiton
 *     tinha quarta 10h à mão, remarcou para terça, e a rotina da madrugada viu
 *     a quarta "livre" e recriou o fixo: dois horários na mesma semana;
 *   - o horário desse dia foi CANCELADO: a semana foi desmarcada, e a rotina
 *     não pode desfazer a decisão de quem cancelou.
 *
 * O cancelamento feito pela LIBERAÇÃO do fixo (`liberadaPeloFixo`) não é
 * decisão de ninguém sobre a semana e não conta (07/10).
 *
 * A data de ORIGEM de uma remarcação vale mesmo se o documento foi liberado
 * depois (09/10): o cliente adiantou ou adiou a semana, e mudar o fixo não
 * desfaz isso. `origemDoFixo` guarda a data da PRIMEIRA remarcação, porque
 * `rescheduledFrom` só lembra a última e a segunda remarcação apagava a pista.
 *
 * Com `fixo`, o cancelamento só resolve a semana se foi de uma ocorrência deste
 * fixo ou do mesmo horário (09/10). Um avulso cancelado às 16h, ou um encaixe
 * recusado de meses atrás no mesmo dia, não é decisão sobre o horário fixo.
 * Sem `fixo`, todo cancelamento conta (comportamento de antes).
 */
export function semanaJaResolvida(
  data: string,
  reservas: Array<{
    date?: unknown;
    time?: unknown;
    status?: unknown;
    cancelReason?: unknown;
    liberadaPeloFixo?: unknown;
    horarioFixoId?: unknown;
    rescheduledFrom?: { date?: unknown } | null;
    origemDoFixo?: { date?: unknown } | null;
  }>,
  fixo?: { subscriptionId: string; hora: string }
): boolean {
  return reservas.some((r) => {
    /* Pela SEMANA, não pela data: com o dia da semana trocado, a nova data não
     * é a de origem, mas cai na mesma semana em que o cliente já remarcou. */
    const daOrigem = (o: { date?: unknown } | null | undefined) =>
      typeof o?.date === "string" && semanaDe(o.date) === semanaDe(data);
    if (daOrigem(r.rescheduledFrom) || daOrigem(r.origemDoFixo)) return true;
    if (liberadaPeloFixo(r)) return false;
    if (r.date !== data) return false;
    const status = String(r.status ?? "");
    if (status.startsWith("cancelled") && fixo && r.horarioFixoId !== fixo.subscriptionId && r.time !== fixo.hora) {
      return false;
    }
    return (
      ["confirmed", "confirmed_by_client", "pending_payment", "fit_in_requested", "completed", "removido"].includes(
        status
      ) || status.startsWith("cancelled")
    );
  });
}

export async function garantirReservasDoFixo(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  shop: FirebaseFirestore.DocumentData;
  subscriptionId: string;
  assinatura: FirebaseFirestore.DocumentData;
  simular?: boolean;
  /**
   * O horário acabou de MUDAR (09/10): as ocorrências em aberto da versão
   * antiga contam como já liberadas, e cada uma só é cancelada na mesma
   * transação que grava a nova da mesma data. Se a nova não cabe, a antiga
   * fica e o conflito é reportado. Antes a confirmação cancelava as antigas
   * primeiro e criava as novas depois — trocar corte por corte+barba com
   * outro cliente às 10h30 perdia as três terças, e a prévia, que contava as
   * antigas como ocupadas, dizia o contrário.
   */
  substituir?: boolean;
}): Promise<ResultadoDaOcorrencia[]> {
  const { db, shopRef, shop, subscriptionId, assinatura } = params;
  const horario = assinatura.horarioFixo as HorarioFixo | undefined;
  if (!horarioFixoValido(horario) || assinatura.status !== "ativo") return [];

  const locale = localeDoDocumento(shop);
  const hoje = hojeNoFuso(locale.timeZone);
  const agora = new Date();
  const versao = versaoDoHorario(horario);
  const todasAsDatas = datasDoHorarioFixo({ horario, hoje });
  /* O fixo de hoje cujo horário já passou não é criado (09/10). */
  const datas = somenteDatasFuturas(todasAsDatas, horario.hora, locale.timeZone, agora);
  const clientId = String(assinatura.clientId ?? "");
  const clienteSnap = clientId ? await shopRef.collection("clients").doc(clientId).get() : null;
  const doCliente = clientId
    ? await shopRef.collection("bookings").where("clientId", "==", clientId).get()
    : null;
  const conflitos = shopRef.collection("conflitos_horario_fixo");
  const resultados: ResultadoDaOcorrencia[] = [];

  /* Ocorrências da versão antiga que a gravação vai trocar: deste fixo, em
   * aberto, ainda no futuro, e que não são as datas do horário novo. */
  const novosIds = new Set(todasAsDatas.map((d) => idDaOcorrencia(subscriptionId, versao, d)));
  let antigas = params.substituir
    ? (doCliente?.docs ?? []).filter(
        (d) =>
          d.get("horarioFixoId") === subscriptionId &&
          !novosIds.has(d.id) &&
          liberavelNaTroca(d.data(), locale.timeZone, agora)
      )
    : [];
  /* Semana corrente em que o horário novo JÁ passou (mudar para uma hora que
   * passou hoje): a nova não nasce, e liberar a antiga, que ainda vem, deixaria
   * a semana vazia. A antiga fica, e a prévia diz. */
  for (const data of todasAsDatas) {
    if (datas.includes(data)) continue;
    const presas = antigas.filter((d) => semanaDe(String(d.get("date"))) === semanaDe(data));
    if (presas.length === 0) continue;
    antigas = antigas.filter((d) => !presas.includes(d));
    resultados.push({
      data,
      resultado: "conflito",
      motivo: "O novo horário desta semana já passou — o horário de antes continua.",
    });
  }
  const idsAntigos = new Set(antigas.map((d) => d.id));

  for (const data of datas) {
    const id = idDaOcorrencia(subscriptionId, versao, data);
    const antigasDoDia = antigas.filter((d) => semanaDe(String(d.get("date"))) === semanaDe(data));
    const liberando = antigasDoDia.length
      ? {
          ids: antigasDoDia.map((d) => d.id),
          campos: camposDaLiberacao("Horário fixo alterado"),
          timeZone: locale.timeZone,
        }
      : undefined;
    const ref = shopRef.collection("bookings").doc(id);
    const existente = await ref.get();
    /* O id é determinístico: tirar e recolocar o MESMO fixo cai no mesmo
     * documento, cancelado pela liberação. Antes ele contava como "já existe"
     * e a prévia dizia "já reservado" de uma semana que estava vazia. */
    const reativar = existente.exists && liberadaPeloFixo(existente.data() ?? {});
    if (existente.exists && !reativar) {
      const vale = AINDA_VALE.includes(String(existente.get("status")));
      resultados.push({ data, resultado: vale ? "ja-existe" : "desmarcada" });
      continue;
    }
    /* A versão antiga ficou viva nesta semana porque a nova não coube na troca
     * (ou ainda não coube): a semana NÃO está resolvida pelo cliente, está
     * pendente. Segue como conflito, e o aviso ao dono fica — antes a rotina
     * via a antiga confirmada, dizia "cliente já marcado" e apagava o aviso. */
    const daSemana = (doCliente?.docs ?? []).filter(
      (d) =>
        d.get("horarioFixoId") === subscriptionId &&
        d.id !== id &&
        !idsAntigos.has(d.id) &&
        semanaDe(String(d.get("date"))) === semanaDe(data) &&
        AINDA_VALE.includes(String(d.get("status"))) &&
        !foiRemarcada(d.data())
    );
    /* Só a antiga que AINDA VEM prende a semana; a que já passou (ou foi
     * feita) é a semana resolvida, e a nova não nasce por cima. */
    const antigaViva = daSemana.find((d) => liberavelNaTroca(d.data(), locale.timeZone, agora));
    if (!antigaViva && daSemana.length > 0) {
      resultados.push({ data, resultado: "cliente-ja-marcado" });
      if (!params.simular) await conflitos.doc(id).delete().catch(() => undefined);
      continue;
    }
    if (antigaViva) {
      const motivo = `Semana segue no horário antigo (${antigaViva.get("time")}) — o novo não coube.`;
      resultados.push({ data, resultado: "conflito", motivo });
      if (!params.simular) {
        await conflitos.doc(id).set(
          {
            subscriptionId,
            clientId,
            clientName: String(assinatura.clientName ?? ""),
            date: data,
            time: horario.hora,
            motivo,
            atualizadoEm: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      continue;
    }
    const jaMarcado = semanaJaResolvida(
      data,
      (doCliente?.docs ?? [])
        /* As antigas que esta gravação troca já contam como liberadas. */
        .filter((d) => !idsAntigos.has(d.id))
        .map((d) => ({
          date: d.get("date"),
          time: d.get("time"),
          status: d.get("status"),
          cancelReason: d.get("cancelReason"),
          liberadaPeloFixo: d.get("liberadaPeloFixo"),
          horarioFixoId: d.get("horarioFixoId"),
          rescheduledFrom: d.get("rescheduledFrom"),
          origemDoFixo: d.get("origemDoFixo"),
        })),
      { subscriptionId, hora: horario.hora }
    );
    if (jaMarcado) {
      resultados.push({ data, resultado: "cliente-ja-marcado" });
      /* O aviso "semana sem reserva" não tem mais o que dizer: o cliente
       * resolveu a data por outro caminho (09/10). */
      if (!params.simular) await conflitos.doc(id).delete().catch(() => undefined);
      continue;
    }

    try {
      const pedido = await validarPedido({
        shopRef,
        shop,
        locale,
        serviceIds: horario.serviceIds,
        date: data,
        time: horario.hora,
        staffId: horario.staffId,
        /* Sem antecedência mínima (é a barbearia marcando), mas DENTRO do
         * expediente e fora dos intervalos do barbeiro. */
        exigirAntecedencia: false,
        exigirExpediente: true,
      });
      if (params.simular) {
        /* A prévia confere a ocupação como a gravação confere: dizer "será
         * reservado" e dar conflito ao confirmar seria a prévia mentindo. */
        const doDia = await shopRef.collection("bookings").where("date", "==", data).get();
        const ocupadas = janelasOcupadas(
          doDia.docs
            /* A própria versão antiga sai da conta: a gravação a cancela junto. */
            .filter(
              (d) =>
                !idsAntigos.has(d.id) && d.get("staffId") === pedido.staffId && OCUPAM_SLOT.includes(d.get("status"))
            )
            .map((d) => ({ time: String(d.get("time")), durationMin: d.get("durationMin") })),
          pedido.slotMinutes
        );
        if (!horarioDisponivel({ time: horario.hora, durationMin: pedido.duracaoDaReserva, ocupadas })) {
          resultados.push({ data, resultado: "conflito", motivo: "Horário ocupado por outro atendimento." });
        } else {
          resultados.push({
            data,
            resultado: reativar ? "reativada" : "criada",
            ...(antigasDoDia.length ? { liberou: antigasDoDia.length } : {}),
          });
        }
        continue;
      }
      const documento = {
        ...documentoDaReserva({
          clientId,
          clientName: String(clienteSnap?.get("name") ?? assinatura.clientName ?? "Cliente"),
          clientWhatsapp: String(clienteSnap?.get("whatsapp") ?? ""),
          pedido,
          date: data,
          time: horario.hora,
          serviceIds: horario.serviceIds,
          origem: "fixo" as const,
        }),
        horarioFixoId: subscriptionId,
      };
      if (reativar) {
        const r = await reativarOcorrencia({
          db,
          shopRef,
          ref,
          staffId: pedido.staffId,
          date: data,
          time: horario.hora,
          duracaoDaReserva: pedido.duracaoDaReserva,
          slotMinutes: pedido.slotMinutes,
          documento,
          liberando,
        });
        resultados.push({
          data,
          resultado: r,
          ...(r === "reativada" && antigasDoDia.length ? { liberou: antigasDoDia.length } : {}),
        });
        if (r === "reativada") await conflitos.doc(id).delete().catch(() => undefined);
        continue;
      }
      await gravarComTravaDeHorario({
        db,
        shopRef,
        clientId,
        staffId: pedido.staffId,
        date: data,
        time: horario.hora,
        duracaoDaReserva: pedido.duracaoDaReserva,
        slotMinutes: pedido.slotMinutes,
        /* A reserva do fixo não conta no teto (ver `gravarComTravaDeHorario`),
         * e o teto aqui só barraria a própria rotina. */
        maxAtivas: Number.MAX_SAFE_INTEGER,
        hojeNaBarbearia: hoje,
        idDaReserva: id,
        liberando,
        documento,
      });
      resultados.push({ data, resultado: "criada", ...(antigasDoDia.length ? { liberou: antigasDoDia.length } : {}) });
      await conflitos.doc(id).delete().catch(() => undefined);
    } catch (err) {
      const motivo =
        err instanceof HttpsError
          ? err.code === "already-exists"
            ? "Horário ocupado por outro atendimento."
            : err.message
          : "Não foi possível reservar.";
      resultados.push({ data, resultado: "conflito", motivo });
      if (!params.simular) {
        await conflitos.doc(id).set(
          {
            subscriptionId,
            clientId,
            clientName: String(assinatura.clientName ?? ""),
            date: data,
            time: horario.hora,
            motivo,
            atualizadoEm: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
  }
  return resultados;
}

/**
 * Volta a valer uma ocorrência que a liberação do fixo tinha cancelado.
 *
 * Não passa por `gravarComTravaDeHorario` porque lá o documento existente é
 * "repetição da mesma tentativa" e nada é gravado. A trava, porém, é a mesma:
 * dentro da transação, a ocorrência ainda tem de estar liberada e a cadeira
 * livre na janela — nesse meio-tempo a vaga pode ter ido para um avulso, e
 * aí é conflito, não reserva por cima.
 *
 * O documento é regravado inteiro (sem `merge`): os campos do cancelamento
 * não podem sobrar numa reserva confirmada.
 */
async function reativarOcorrencia(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  ref: FirebaseFirestore.DocumentReference;
  staffId: string;
  date: string;
  time: string;
  duracaoDaReserva: number;
  slotMinutes: number;
  documento: Record<string, unknown>;
  /** Ocorrências antigas da mesma data que saem junto, na mesma transação. */
  liberando?: { ids: string[]; campos: Record<string, unknown>; timeZone: string };
}): Promise<"reativada" | "ja-existe" | "desmarcada"> {
  const { db, shopRef, ref } = params;
  return db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    /* Outra execução chegou antes (reativou, ou alguém mexeu na semana). */
    if (!atual.exists || !liberadaPeloFixo(atual.data() ?? {})) {
      return AINDA_VALE.includes(String(atual.get("status"))) ? "ja-existe" : "desmarcada";
    }
    const doDia = await tx.get(shopRef.collection("bookings").where("date", "==", params.date));
    /* Relidas na transação (podem estar em outra data da semana): só saem as
     * que continuam em aberto, não remarcadas e no futuro. */
    const relidas = params.liberando
      ? await Promise.all(params.liberando.ids.map((id) => tx.get(shopRef.collection("bookings").doc(id))))
      : [];
    const aLiberar = relidas.filter((d) => d.exists && liberavelNaTroca(d.data() ?? {}, params.liberando!.timeZone));
    const ocupadas = janelasOcupadas(
      doDia.docs
        .filter(
          (d) =>
            !aLiberar.some((l) => l.id === d.id) &&
            d.get("staffId") === params.staffId &&
            OCUPAM_SLOT.includes(d.get("status"))
        )
        .map((d) => ({ time: String(d.get("time")), durationMin: d.get("durationMin") })),
      params.slotMinutes
    );
    if (!horarioDisponivel({ time: params.time, durationMin: params.duracaoDaReserva, ocupadas })) {
      throw new HttpsError("already-exists", "Esse horário acabou de ser reservado. Escolha outro, por favor.");
    }
    for (const d of aLiberar) tx.update(d.ref, params.liberando!.campos);
    tx.set(ref, { ...params.documento, reativadaEm: FieldValue.serverTimestamp() });
    return "reativada";
  });
}

/**
 * O dono define, muda ou tira o horário fixo de um mensalista.
 *
 * Com `simular: true`, nada é gravado: devolve as datas que seriam reservadas
 * e os conflitos — é o que a tela mostra antes de confirmar.
 */
export const definirHorarioFixo = onCall<{
  barbershopId: string;
  subscriptionId: string;
  horarioFixo: HorarioFixo | null;
  simular?: boolean;
  /**
   * Repete a troca com o MESMO horário (09/10): a saída do dono para a semana
   * que ficou no horário antigo porque o novo não coube. Quando o que
   * atrapalhava saiu, a nova entra no lugar da antiga.
   */
  tentarDeNovo?: boolean;
}>(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const subscriptionId = idSeguro(request.data?.subscriptionId, "Assinatura");
  const papel = vinculosDe(request)?.[barbershopId];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia faz isso.");
  }
  await exigirEdicao(barbershopId);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const [shopSnap, subSnap] = await Promise.all([
    shopRef.get(),
    shopRef.collection("subscriptions").doc(subscriptionId).get(),
  ]);
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  if (!subSnap.exists) throw new HttpsError("not-found", "Assinatura não encontrada.");
  if (subSnap.get("status") !== "ativo") {
    throw new HttpsError("failed-precondition", "Esse mensalista não está ativo.");
  }

  const horarioPedido = request.data?.horarioFixo ?? null;
  if (horarioPedido !== null && !horarioFixoValido(horarioPedido)) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }
  const anterior = subSnap.get("horarioFixo") as HorarioFixo | undefined;
  /* "Tentar de novo" repete o horário GRAVADO, e não o que a tela mandou: se o
   * fixo mudou em outro aparelho, a tela está velha e recusa em vez de gravar
   * por cima (09/10). */
  const tentarDeNovo = request.data?.tentarDeNovo === true;
  if (tentarDeNovo) {
    if (!horarioPedido || !horarioFixoValido(anterior) || horarioFixoMudou(anterior, horarioPedido)) {
      throw new HttpsError("failed-precondition", "O horário fixo mudou em outro aparelho; recarregue.");
    }
  }
  const horario = tentarDeNovo ? (anterior as HorarioFixo) : horarioPedido;

  /* O barbeiro mexe SÓ no fixo da própria cadeira (07/10), como no balcão
   * (`createBookingAtCounter`): sem isto, um barbeiro punha o mensalista na
   * agenda de um colega, ou tirava o fixo de lá — escrevendo onde ele não lê.
   * Vale para o horário novo e para o que já estava, e também na prévia. */
  if (papel === "staff") {
    const meu = await staffIdDeQuemChamou(request, barbershopId);
    if (!meu) throw new HttpsError("permission-denied", "Sua conta não está ligada a um barbeiro desta barbearia.");
    if ((horario && horario.staffId !== meu) || (horarioFixoValido(anterior) && anterior.staffId !== meu)) {
      throw new HttpsError("permission-denied", "Você só mexe no horário fixo da sua própria agenda.");
    }
  }

  /* Horário MUDOU (outra hora, barbeiro, serviço, frequência ou fase da
   * quinzena): as semanas antigas em aberto dão lugar às novas. Sem isto, a
   * versão antiga seguia valendo nas reservas já criadas. A troca é por data,
   * dentro da transação que grava a nova (`substituir`), e a prévia usa a mesma
   * conta — ver `garantirReservasDoFixo`. */
  const mudou = horarioFixoMudou(anterior, horario) || (!!horario && tentarDeNovo);
  const assinatura = { ...subSnap.data(), horarioFixo: horario ?? undefined };
  if (request.data?.simular) {
    const ocorrencias = horario
      ? await garantirReservasDoFixo({
          db,
          shopRef,
          shop: shopSnap.data() ?? {},
          subscriptionId,
          assinatura,
          simular: true,
          substituir: mudou,
        })
      : [];
    return { ocorrencias };
  }

  await subSnap.ref.update({
    horarioFixo: horario ?? FieldValue.delete(),
    horarioFixoAtualizadoEm: FieldValue.serverTimestamp(),
  });
  const fusoDaLoja = localeDoDocumento(shopSnap.data()).timeZone;
  const hojeDaLoja = hojeNoFuso(fusoDaLoja);
  if (!horario) {
    /* Tirar o fixo libera só o que ainda não aconteceu — e deixa de pé o que o
     * cliente remarcou (decisão explícita, 09/10; o modal da tela avisa). */
    const liberadas = await liberarOcorrenciasFuturas({
      db,
      shopRef,
      subscriptionId,
      hoje: hojeDaLoja,
      timeZone: fusoDaLoja,
      motivo: "Horário fixo removido",
      preservarRemarcadas: true,
    });
    return { ocorrencias: [], liberadas };
  }
  const ocorrencias = await garantirReservasDoFixo({
    db,
    shopRef,
    shop: shopSnap.data() ?? {},
    subscriptionId,
    assinatura,
    substituir: mudou,
  });
  let liberadas = ocorrencias.reduce((n, o) => n + (o.resultado === "conflito" ? 0 : (o.liberou ?? 0)), 0);
  if (mudou) {
    /* O que sobrou da versão antiga e não tem par novo (outro dia da semana,
     * outra fase da quinzena, data que o cliente já resolveu). Fica de fora
     * tudo que é do horário novo e as datas em que a nova NÃO coube: ali a
     * antiga segue valendo, e o conflito aparece para o dono. */
    const versao = versaoDoHorario(horario);
    liberadas += await liberarOcorrenciasFuturas({
      db,
      shopRef,
      subscriptionId,
      hoje: hojeDaLoja,
      timeZone: fusoDaLoja,
      motivo: "Horário fixo alterado",
      preservarIds: new Set(
        datasDoHorarioFixo({ horario, hoje: hojeDaLoja }).map((d) => idDaOcorrencia(subscriptionId, versao, d))
      ),
      preservarSemanas: new Set(ocorrencias.filter((o) => o.resultado === "conflito").map((o) => semanaDe(o.data))),
      preservarRemarcadas: true,
    });
  }
  return { ocorrencias, liberadas };
});

/** Os campos que a liberação do fixo grava ao cancelar uma ocorrência. */
export function camposDaLiberacao(motivo: string): Record<string, unknown> {
  return {
    status: "cancelled_by_shop",
    cancelReason: motivo,
    liberadaPeloFixo: true,
    cancelledAt: FieldValue.serverTimestamp(),
  };
}

/**
 * A ocorrência ainda pode ser liberada: está em aberto e o INSTANTE dela (data
 * e hora no fuso da barbearia) ainda não chegou.
 *
 * Comparar só a data (`date >= hoje`) cancelava o atendimento de hoje que já
 * aconteceu e só não tinha sido fechado no caixa: mudar o fixo às 18h apagava
 * o corte das 10h da agenda do dia (07/10).
 */
export function ocorrenciaLiberavel(
  b: { date?: unknown; time?: unknown; status?: unknown },
  timeZone: string,
  agora: Date = new Date()
): boolean {
  if (!["confirmed", "confirmed_by_client"].includes(String(b.status ?? ""))) return false;
  if (typeof b.date !== "string" || typeof b.time !== "string") return false;
  return instanteNoFuso(b.date, b.time, timeZone).getTime() > agora.getTime();
}

/**
 * Cancela as ocorrências FUTURAS e ainda em aberto de um horário fixo — quando
 * o plano acaba ou o fixo é removido. O passado, o que já começou e o que já
 * foi concluído ficam.
 *
 * Grava `liberadaPeloFixo: true`: é por ele que a rotina distingue esta
 * liberação de um cancelamento de verdade (ver `liberadaPeloFixo`).
 */
export async function liberarOcorrenciasFuturas(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  subscriptionId: string;
  /** Hoje no fuso da loja: só um pré-filtro barato; quem decide é o instante. */
  hoje: string;
  /** Fuso da loja. Ausente, é lido do documento da barbearia. */
  timeZone?: string;
  motivo: string;
  agora?: Date;
  /** Ids que ficam (o horário novo, depois de uma mudança) — e seus conflitos. */
  preservarIds?: Set<string>;
  /** Semanas que ficam: onde o horário novo não coube e a antiga segue valendo. */
  preservarSemanas?: Set<number>;
  /**
   * Deixa de pé a ocorrência que o CLIENTE remarcou (09/10): é horário dele
   * agora, e liberar apagava o dia novo em que ele combinou de vir. Vale para
   * mudar e para tirar o fixo; plano encerrado libera tudo (não passa isto).
   */
  preservarRemarcadas?: boolean;
}): Promise<number> {
  const timeZone = params.timeZone ?? localeDoDocumento((await params.shopRef.get()).data()).timeZone;
  const agora = params.agora ?? new Date();
  const snap = await params.shopRef
    .collection("bookings")
    .where("horarioFixoId", "==", params.subscriptionId)
    .get();
  const abertas = snap.docs.filter(
    (d) =>
      String(d.get("date")) >= params.hoje &&
      !params.preservarIds?.has(d.id) &&
      !params.preservarSemanas?.has(semanaDe(String(d.get("date")))) &&
      !(params.preservarRemarcadas && foiRemarcada(d.data())) &&
      ocorrenciaLiberavel(d.data(), timeZone, agora)
  );
  for (const d of abertas) {
    await d.ref.update(camposDaLiberacao(params.motivo));
  }
  const conflitos = await params.shopRef
    .collection("conflitos_horario_fixo")
    .where("subscriptionId", "==", params.subscriptionId)
    .get();
  await Promise.all(conflitos.docs.filter((d) => !params.preservarIds?.has(d.id)).map((d) => d.ref.delete()));
  return abertas.length;
}

/**
 * A rotina segue reservando nesta barbearia?
 *
 * Encerrada, nunca. Em modo leitura (suspensa por falta de pagamento, teste
 * vencido), também não: o cliente veria reserva nova de uma loja que não está
 * operando, e a agenda dela é justamente o que está congelado. A isenta
 * (`isentoDeCobranca`) não é suspensa pelo Hub e segue normal (07/10).
 */
export function lojaRecebeReservaDoFixo(shop: FirebaseFirestore.DocumentData | undefined): boolean {
  if (shop?.status === "encerrada") return false;
  if (motivoDeLeitura(shop) && !isentoDeCobranca(shop ?? {})) return false;
  return true;
}

/**
 * Todo dia de madrugada, completa as próximas semanas de todos os fixos.
 * Idempotente: roda de novo e só cria o que falta.
 */
export const garantirHorariosFixos = onSchedule(
  { schedule: "15 3 * * *", timeZone: "America/Sao_Paulo", timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const lojas = await db.collection("barbershops").get();
    for (const loja of lojas.docs) {
      if (!lojaRecebeReservaDoFixo(loja.data())) continue;
      /* A consulta de uma loja que falha não derruba as outras. */
      let assinaturas: FirebaseFirestore.QuerySnapshot;
      try {
        assinaturas = await loja.ref.collection("subscriptions").where("status", "==", "ativo").get();
      } catch (err) {
        console.error(`[horario-fixo] ${loja.id}: leitura das assinaturas falhou`, err);
        continue;
      }
      for (const a of assinaturas.docs) {
        if (!a.get("horarioFixo")) continue;
        try {
          const r = await garantirReservasDoFixo({
            db,
            shopRef: loja.ref,
            shop: loja.data(),
            subscriptionId: a.id,
            assinatura: a.data(),
          });
          const criadas = r.filter((x) => x.resultado === "criada").length;
          const conflitos = r.filter((x) => x.resultado === "conflito").length;
          if (criadas || conflitos) {
            console.info(`[horario-fixo] ${loja.id}/${a.id}: ${criadas} criadas, ${conflitos} conflitos`);
          }
        } catch (err) {
          console.error(`[horario-fixo] ${loja.id}/${a.id} falhou`, err);
        }
      }
    }
  }
);

/**
 * Apaga UMA semana do horário fixo (30/09).
 *
 * Pedido do dono: o cliente adiantou ou adiou a semana, e a ocorrência fixa
 * daquela data sobrou na agenda. "Não é um cancelamento" — então não pode ir
 * por `cancelBooking`: cancelamento conta no relatório do mês e nos números.
 *
 * O documento NÃO é apagado de verdade: sem ele, a rotina da madrugada veria a
 * data vazia e recriaria o fixo (foi o caso do Cleiton). Ele vira
 * `status: "removido"`, que nenhuma tela mostra nem conta, e que não ocupa a
 * vaga. As outras semanas não são tocadas.
 *
 * Só ocorrência do fixo (`horarioFixoId`), só em aberto, só de hoje em diante:
 * horário avulso continua sendo cancelado do jeito de sempre.
 */
export const apagarSemanaDoFixo = onCall<{ barbershopId: string; bookingId: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const { barbershopId, bookingId } = request.data ?? {};
  if (!barbershopId || !bookingId) throw new HttpsError("invalid-argument", "Horário não informado.");
  const papel = vinculosDe(request)[String(barbershopId)];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só a barbearia apaga horário da agenda.");
  }
  await exigirEdicao(String(barbershopId));
  /* Barbeiro apaga só semana da própria cadeira (07/10), como no balcão. */
  const meuStaffId = papel === "staff" ? await staffIdDeQuemChamou(request, String(barbershopId)) : null;
  if (papel === "staff" && !meuStaffId) {
    throw new HttpsError("permission-denied", "Sua conta não está ligada a um barbeiro desta barbearia.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const ref = shopRef.collection("bookings").doc(String(bookingId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Horário não encontrado.");
    if (meuStaffId && snap.get("staffId") !== meuStaffId) {
      throw new HttpsError("permission-denied", "Você só apaga horário da sua própria agenda.");
    }
    if (!snap.get("horarioFixoId")) {
      throw new HttpsError("failed-precondition", "Só horário do fixo do mensalista pode ser apagado. Os outros se cancelam.");
    }
    if (!["confirmed", "confirmed_by_client"].includes(String(snap.get("status")))) {
      throw new HttpsError("failed-precondition", "Esse horário não está mais em aberto.");
    }
    if (String(snap.get("date")) < hoje) {
      throw new HttpsError("failed-precondition", "Horário que já passou não se apaga.");
    }
    tx.update(ref, {
      status: "removido",
      removidoEm: FieldValue.serverTimestamp(),
      removidoPor: uid,
    });
    tx.set(shopRef.collection("audit_log").doc(), {
      action: "booking.semana_do_fixo_apagada",
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { bookingId: ref.id, date: snap.get("date"), time: snap.get("time"), clientId: snap.get("clientId") ?? null },
    });
    return { bookingId: ref.id, date: String(snap.get("date")) };
  });
});
