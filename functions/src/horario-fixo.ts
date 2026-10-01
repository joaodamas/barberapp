import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { createHash } from "node:crypto";
import { OCUPAM_SLOT, documentoDaReserva, gravarComTravaDeHorario, validarPedido } from "./booking";
import { horarioDisponivel, janelasOcupadas } from "./agenda";
import { hojeNoFuso, localeDoDocumento } from "./locale";

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
 *   aberto são liberadas e as novas nascem com o horário novo.
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

export type ResultadoDaOcorrencia =
  | { data: string; resultado: "criada" | "ja-existe" | "cliente-ja-marcado" }
  | { data: string; resultado: "conflito"; motivo: string };

/**
 * Garante as reservas de UMA assinatura. Com `simular`, só diz o que faria.
 *
 * Nada aqui apaga: ocorrência cancelada continua cancelada, e conflito vira
 * registro para o dono, não reserva por cima de ninguém.
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
 */
export function semanaJaResolvida(
  data: string,
  reservas: Array<{ date?: unknown; status?: unknown; rescheduledFrom?: { date?: unknown } | null }>
): boolean {
  return reservas.some((r) => {
    if (r.rescheduledFrom && r.rescheduledFrom.date === data) return true;
    if (r.date !== data) return false;
    const status = String(r.status ?? "");
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
}): Promise<ResultadoDaOcorrencia[]> {
  const { db, shopRef, shop, subscriptionId, assinatura } = params;
  const horario = assinatura.horarioFixo as HorarioFixo | undefined;
  if (!horarioFixoValido(horario) || assinatura.status !== "ativo") return [];

  const locale = localeDoDocumento(shop);
  const hoje = hojeNoFuso(locale.timeZone);
  const datas = datasDoHorarioFixo({ horario, hoje });
  const clientId = String(assinatura.clientId ?? "");
  const clienteSnap = clientId ? await shopRef.collection("clients").doc(clientId).get() : null;
  const doCliente = clientId
    ? await shopRef.collection("bookings").where("clientId", "==", clientId).get()
    : null;
  const conflitos = shopRef.collection("conflitos_horario_fixo");
  const versao = versaoDoHorario(horario);
  const resultados: ResultadoDaOcorrencia[] = [];

  for (const data of datas) {
    const id = idDaOcorrencia(subscriptionId, versao, data);
    const ref = shopRef.collection("bookings").doc(id);
    if ((await ref.get()).exists) {
      resultados.push({ data, resultado: "ja-existe" });
      continue;
    }
    const jaMarcado = semanaJaResolvida(
      data,
      (doCliente?.docs ?? []).map((d) => ({
        date: d.get("date"),
        status: d.get("status"),
        rescheduledFrom: d.get("rescheduledFrom"),
      }))
    );
    if (jaMarcado) {
      resultados.push({ data, resultado: "cliente-ja-marcado" });
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
            .filter((d) => d.get("staffId") === pedido.staffId && OCUPAM_SLOT.includes(d.get("status")))
            .map((d) => ({ time: String(d.get("time")), durationMin: d.get("durationMin") })),
          pedido.slotMinutes
        );
        if (!horarioDisponivel({ time: horario.hora, durationMin: pedido.duracaoDaReserva, ocupadas })) {
          resultados.push({ data, resultado: "conflito", motivo: "Horário ocupado por outro atendimento." });
        } else {
          resultados.push({ data, resultado: "criada" });
        }
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
        documento: {
          ...documentoDaReserva({
            clientId,
            clientName: String(clienteSnap?.get("name") ?? assinatura.clientName ?? "Cliente"),
            clientWhatsapp: String(clienteSnap?.get("whatsapp") ?? ""),
            pedido,
            date: data,
            time: horario.hora,
            serviceIds: horario.serviceIds,
            origem: "fixo",
          }),
          horarioFixoId: subscriptionId,
        },
      });
      resultados.push({ data, resultado: "criada" });
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

  const horario = request.data?.horarioFixo ?? null;
  if (horario !== null && !horarioFixoValido(horario)) {
    throw new HttpsError("invalid-argument", "Horário fixo inválido.");
  }

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
        })
      : [];
    return { ocorrencias };
  }

  /* Horário MUDOU: libera as semanas antigas em aberto antes de reservar as
   * novas. Sem isto, a versão antiga seguia valendo nas reservas já criadas. */
  const anterior = subSnap.get("horarioFixo") as HorarioFixo | undefined;
  const mudou =
    !!horario && horarioFixoValido(anterior) && versaoDoHorario(anterior) !== versaoDoHorario(horario);
  await subSnap.ref.update({
    horarioFixo: horario ?? FieldValue.delete(),
    horarioFixoAtualizadoEm: FieldValue.serverTimestamp(),
  });
  const hojeDaLoja = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const liberadasNaMudanca = mudou
    ? await liberarOcorrenciasFuturas({
        db,
        shopRef,
        subscriptionId,
        hoje: hojeDaLoja,
        motivo: "Horário fixo alterado",
      })
    : 0;
  if (!horario) {
    /* Tirar o fixo libera só o que ainda não aconteceu. */
    const liberadas = await liberarOcorrenciasFuturas({
      db,
      shopRef,
      subscriptionId,
      hoje: hojeDaLoja,
      motivo: "Horário fixo removido",
    });
    return { ocorrencias: [], liberadas };
  }
  const ocorrencias = await garantirReservasDoFixo({
    db,
    shopRef,
    shop: shopSnap.data() ?? {},
    subscriptionId,
    assinatura,
  });
  return { ocorrencias, liberadas: liberadasNaMudanca };
});

/**
 * Cancela as ocorrências FUTURAS e ainda em aberto de um horário fixo — quando
 * o plano acaba ou o fixo é removido. O passado e o que já foi concluído ficam.
 */
export async function liberarOcorrenciasFuturas(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  subscriptionId: string;
  hoje: string;
  motivo: string;
}): Promise<number> {
  const snap = await params.shopRef
    .collection("bookings")
    .where("horarioFixoId", "==", params.subscriptionId)
    .get();
  const abertas = snap.docs.filter(
    (d) => String(d.get("date")) >= params.hoje && ["confirmed", "confirmed_by_client"].includes(String(d.get("status")))
  );
  for (const d of abertas) {
    await d.ref.update({
      status: "cancelled_by_shop",
      cancelReason: params.motivo,
      cancelledAt: FieldValue.serverTimestamp(),
    });
  }
  const conflitos = await params.shopRef
    .collection("conflitos_horario_fixo")
    .where("subscriptionId", "==", params.subscriptionId)
    .get();
  await Promise.all(conflitos.docs.map((d) => d.ref.delete()));
  return abertas.length;
}

/**
 * Todo dia de madrugada, completa as próximas semanas de todos os fixos.
 * Idempotente: roda de novo e só cria o que falta.
 */
export const garantirHorariosFixos = onSchedule(
  { schedule: "15 3 * * *", timeZone: "America/Sao_Paulo" },
  async () => {
    const db = getFirestore();
    const lojas = await db.collection("barbershops").get();
    for (const loja of lojas.docs) {
      const assinaturas = await loja.ref.collection("subscriptions").where("status", "==", "ativo").get();
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

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const ref = shopRef.collection("bookings").doc(String(bookingId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Horário não encontrado.");
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
