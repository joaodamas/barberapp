import { createHash } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { ehMensalistaAtivo, limiteDoCliente } from "./janela";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { diaDaSemanaNoFuso, hojeNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";
import { aplicarCombos, type ServicoDoCatalogo } from "./combos";
import { horarioDisponivel, janelasOcupadas, podeRemarcar } from "./agenda";
import { horariosDaJornada, jornadaDoDia } from "./jornada";
import { resolverCliente, type OrigemDoCliente } from "./clients";

/**
 * Criação de reserva.
 *
 * Precisa ser no servidor por três motivos, e nenhum deles é conveniência:
 *
 * 1. **Preço.** Se o cliente mandasse o valor, mandaria zero. O valor é somado
 *    do catálogo aqui dentro.
 * 2. **Conflito de horário.** Dois clientes tocando "confirmar" no mesmo
 *    segundo precisam de uma transação para que um só ganhe o slot. No cliente
 *    isso é impossível de garantir.
 * 3. **Status.** As regras proíbem o cliente de gravar `status` — senão dava
 *    para marcar "confirmado" sem pagar.
 */

type CriarReservaInput = {
  barbershopId: string;
  /** Qual barbeiro atende. Opcional na entrada: com um só, o servidor resolve. */
  staffId?: string;
  serviceIds: string[];
  date: string;
  time: string;
  /**
   * ONDE o pagamento acontece. O instrumento (Pix, dinheiro, débito, crédito)
   * é informado no fechamento, por quem está no balcão — o cliente não sabe
   * como vai pagar quando marca.
   */
  paymentOrigin?: "in_person";
  isFitIn?: boolean;
  /**
   * Uma chave por TENTATIVA de confirmação, gerada no app e reenviada nas
   * repetições. Ver `idDaReservaPorChave`.
   */
  chave?: string;
  clientName?: string;
  clientWhatsapp?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/* Estrito de propósito: `\d{2}:\d{2}` aceitava "99:99", que passava pela
 * validação e estourava lá dentro como INTERNAL — e "25:00" no balcão virava
 * reserva gravada num horário que não existe. */
const HORA = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Data de calendário que existe: `2026-02-31` casa o formato e não o calendário. */
export function dataValida(date: unknown): date is string {
  if (typeof date !== "string" || !ISO_DATE.test(date)) return false;
  const [a, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function horaValida(time: unknown): time is string {
  return typeof time === "string" && HORA.test(time);
}

/** Nome livre vindo do cliente: sem teto, 5.000 caracteres viravam a linha da agenda. */
export const NOME_MAX = 80;
export function nomeLimpo(nome: unknown): string {
  return String(nome ?? "").replace(/\s+/g, " ").trim().slice(0, NOME_MAX);
}

/** Status que ocupam um horário na agenda. */
export const OCUPAM_SLOT = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "completed",
  "no_show",
];

/** Status de uma reserva ainda viva, do ponto de vista do cliente. */
const EM_ABERTO = ["pending_payment", "confirmed", "confirmed_by_client", "fit_in_requested"];

/**
 * Idempotência da criação de reserva — auditoria de 23/09.
 *
 * Com rede ruim, o cliente toca "Confirmar", a resposta se perde e ele tenta
 * de novo. Se a primeira gravou, a segunda disputava o mesmo horário, perdia
 * para a própria reserva e dizia "esse horário acabou de ser reservado": o
 * cliente saía achando que NÃO tinha horário. Com a chave, a repetição cai no
 * mesmo documento e devolve sucesso.
 *
 * O id mistura o uid: a chave vem do cliente, e sem o uid uma chave copiada
 * apontaria para a reserva de outra pessoa.
 */
export function idDaReservaPorChave(uid: string, chave: unknown): string | undefined {
  if (typeof chave !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(chave)) return undefined;
  return `app_${createHash("sha256").update(`${uid}:${chave}`).digest("hex").slice(0, 32)}`;
}

/* ================================================================== */
/* Anti-abuso da agenda — auditoria de 28/09, achado M2                */
/* ================================================================== */

/**
 * Identificador estável da recusa por e-mail não confirmado. Vai em
 * `details.motivo` do erro para a tela reconhecer o caso sem depender do texto
 * da mensagem — texto muda; o identificador, não.
 */
export const MOTIVO_EMAIL_NAO_VERIFICADO = "email-nao-verificado";
export const MOTIVO_LIMITE_DIARIO = "limite-diario";

/** Horários em aberto ao mesmo tempo para conta SEM e-mail confirmado (01/10). */
export const MAX_ATIVAS_SEM_CONFIRMACAO = 1;

/** O que do token decide se a conta pode agendar. */
export type TokenDoCliente = {
  email_verified?: unknown;
  phone_number?: unknown;
  firebase?: { sign_in_provider?: unknown };
};

/**
 * A conta que agenda precisa ter provado que é de alguém.
 *
 * Até 28/09, qualquer conta de e-mail e senha agendava sem confirmar o e-mail:
 * um script criava dezenas de contas com endereços inventados, cada uma com as
 * 3 reservas do teto por cliente, e lotava a agenda de uma barbearia numa
 * tarde. O teto por cliente não protege nada quando criar cliente é de graça.
 *
 * Passa quem tem custo para multiplicar contas: e-mail confirmado, telefone
 * confirmado por SMS, ou Google (o token do Google já vem com
 * `email_verified: true`; o provedor entra também por garantia, para uma conta
 * Google antiga sem a marca não ser barrada à toa).
 *
 * Só para o CLIENTE (`createBooking`). O balcão é o dono marcando por alguém,
 * e remarcar/cancelar mexem numa reserva que já passou por aqui.
 */
export function podeAgendarComEstaConta(token: TokenDoCliente | undefined | null): boolean {
  if (!token) return false;
  if (token.email_verified === true) return true;
  if (typeof token.phone_number === "string" && token.phone_number.trim() !== "") return true;
  return token.firebase?.sign_in_provider === "google.com";
}

/**
 * Teto de reservas CRIADAS por conta por dia.
 *
 * O teto de ativas (3) sozinho não basta: criar e cancelar em laço segura os
 * melhores horários do dia sem nunca passar de 3 ao mesmo tempo. Dez é folga
 * de sobra para quem marca de verdade — ninguém cria dez reservas num dia — e
 * corta o laço cedo. Conta só o que foi GRAVADO: tentativa recusada (horário
 * tomado, teto de ativas) não pesa contra o cliente, e a repetição idempotente
 * da mesma tentativa também não.
 */
export const RESERVAS_POR_DIA = 10;

export function excedeuLimiteDiario(criadasHoje: unknown, maximo: number): boolean {
  return Number(criadasHoje ?? 0) >= maximo;
}

/**
 * O contador vive numa coleção de CONTROLE, fora da barbearia e fora do alcance
 * do app: `firestore.rules` nega `limites_de_reserva` a todo mundo (declarado
 * lá, além do fallback). Por dia no fuso da barbearia; `expiraEm` deixa pronto
 * para uma política de TTL limpar os dias velhos.
 */
export function refDoLimiteDiario(
  db: FirebaseFirestore.Firestore,
  uid: string,
  dia: string
): FirebaseFirestore.DocumentReference {
  return db.doc(`limites_de_reserva/${uid}_${dia}`);
}

export const createBooking = onCall<CriarReservaInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para agendar.");

  /* Confirmar o e-mail deixou de ser obrigatório (decisão do dono, 01/10):
   * 30% das contas novas não confirmavam — o e-mail do Firebase cai no spam —
   * e o cliente ficava sem agendar. A proteção do achado M2 continua, mais
   * leve: conta sem prova de dono agenda, mas segura UM horário por vez
   * (`MAX_ATIVAS_SEM_CONFIRMACAO`). Um script que crie contas em massa
   * consegue um horário por conta, não três, e o teto diário segue valendo.
   * Ao bater o teto, a recusa leva o motivo que a tela usa para oferecer a
   * confirmação. */
  const contaConfirmada = podeAgendarComEstaConta(request.auth?.token);
  const emailDaConta = String(request.auth?.token.email ?? "").trim();

  const { barbershopId, serviceIds, date, time, paymentOrigin, isFitIn } = request.data ?? {};

  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  idSeguro(barbershopId, "Barbearia");
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um serviço.");
  }
  /* Cada serviço vira uma leitura; sem teto, um pedido com milhares de ids era
   * custo e lentidão de graça (auditoria de 28/09, M2). Nenhum atendimento real
   * junta mais que alguns serviços. */
  if (serviceIds.length > 8 || new Set(serviceIds).size !== serviceIds.length) {
    throw new HttpsError("invalid-argument", "Escolha no máximo 8 serviços, sem repetir.");
  }
  serviceIds.forEach((id) => idSeguro(id, "Serviço"));
  if (!dataValida(date)) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!horaValida(time)) throw new HttpsError("invalid-argument", "Horário inválido.");
  /* Só existe um caminho hoje: o cliente acerta no salão. Quando o gateway
   * entrar, `online` passa a ser aceito aqui e desemboca na mesma coleção
   * `payments` — acréscimo, não reescrita. */
  if (paymentOrigin && paymentOrigin !== "in_person") {
    throw new HttpsError(
      "invalid-argument",
      "Pagamento antecipado ainda não está disponível."
    );
  }

  /* Encaixe voltou em 27/09, a pedido do dono (tinha saído em 17/08 porque o
   * caminho quebrara: a tela anunciava um pedido que nunca chegava a ninguém).
   *
   * Agora `availableSlots` devolve os horários ocupados como `encaixes`, o
   * cliente pede um deles, a reserva nasce `fit_in_requested` — SEM ocupar a
   * agenda — e o barbeiro aprova ou recusa em `responderEncaixe`. Se o horário
   * tiver vagado entre a tela e o pedido, vira reserva normal: não há por que
   * fazer o cliente esperar aprovação de um horário livre. */
  const pedeEncaixe = isFitIn === true;

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const shop = shopSnap.data() ?? {};
  const policies = shop.policies ?? {};

  /* Fuso da barbearia, não do servidor. A função roda em UTC: numa barbearia em
   * Dublin, `new Date("2026-08-04T15:00:00")` erra por uma hora e em São Paulo
   * por três — o bastante para recusar horário válido ou aceitar um que passou. */
  const locale = localeDoDocumento(shop);

  /* A janela deste cliente (28/09): avulso até a data que o barbeiro liberou,
   * mensalista pelos dias que o barbeiro definiu. */
  const limiteData = limiteDoCliente({
    hoje: hojeNoFuso(locale.timeZone),
    janela: policies.janela,
    ehMensalista: await ehMensalistaAtivo(shopRef, uid),
    horizontePadrao: policies.booking?.maxAdvanceDays,
  });

  const pedido = await validarPedido({
    shopRef,
    shop,
    locale,
    serviceIds,
    date,
    time,
    staffId: request.data?.staffId,
    exigirAntecedencia: true,
    limiteData,
  });

  const { staffId, value, durationMin, nomes, slotMinutes, duracaoDaReserva } = pedido;
  /* O status devolvido é o GRAVADO — definido a cada tentativa da transação,
   * então vale o da tentativa que efetivou (revisão do PR #60): uma primeira
   * tentativa que viu o horário ocupado não pode deixar "aguardando aprovação"
   * para uma reserva que a repetição gravou confirmada. */
  let status = "confirmed";

  /* ---- Grava checando conflito na mesma transação ---- */
  const bookingId = await gravarComTravaDeHorario({
    seOcupado: pedeEncaixe ? "pedirEncaixe" : "recusar",
    aoDefinirStatus: (gravado) => {
      status = gravado;
    },
    idDaReserva: idDaReservaPorChave(uid, request.data?.chave),
    /* Por conta, não por barbearia: quem lota a agenda de uma lota a de
     * todas. O dia é o da barbearia, como o resto da reserva. */
    limiteDiario: {
      ref: refDoLimiteDiario(db, uid, hojeNoFuso(locale.timeZone)),
      maximo: RESERVAS_POR_DIA,
    },
    db,
    shopRef,
    clientId: uid,
    staffId,
    date,
    time,
    duracaoDaReserva,
    slotMinutes,
    maxAtivas: contaConfirmada ? policies.booking?.maxActivePerClient ?? 3 : MAX_ATIVAS_SEM_CONFIRMACAO,
    recusaNoTeto: contaConfirmada
      ? undefined
      : {
          mensagem: emailDaConta
            ? `Você já tem um horário marcado. Para marcar mais de um ao mesmo tempo, confirme seu e-mail (o link vai para ${emailDaConta}).`
            : "Você já tem um horário marcado. Para marcar mais de um ao mesmo tempo, confirme seu e-mail.",
          motivo: MOTIVO_EMAIL_NAO_VERIFICADO,
        },
    hojeNaBarbearia: hojeNoFuso(locale.timeZone),
    /* G3 · o cadastro nasce com a reserva.
     *
     * `origin: "app"` porque este caminho é o do cliente autenticado — quem
     * chega no balcão entra por `createBookingAtCounter`, e a diferença entre os
     * dois é justamente o que o `origin` registra.
     *
     * O id resolvido é o próprio `uid`, então `documento.clientId` não muda de
     * valor: esta ligação acrescenta o cadastro sem redefinir nada. */
    cliente: {
      barbershopId,
      uid,
      name: nomeLimpo(request.data?.clientName ?? request.auth?.token.name) || undefined,
      whatsapp: request.data?.clientWhatsapp,
      origin: "app",
    },
    documento: {
      clientId: uid,
      staffId,
      staffName: pedido.staffName,
      clientName: nomeLimpo(request.data?.clientName ?? request.auth?.token.name) || "Cliente",
      clientWhatsapp: String(request.data?.clientWhatsapp ?? "").replace(/\D/g, ""),
      serviceIds,
      serviceNames: nomes,
      date,
      time,
      durationMin,
      value,
      paymentOrigin: "in_person",
      /* Desconhecido até o fechamento. Nulo explícito, e não campo ausente:
       * ausência é ambígua entre "não pagou" e "campo antigo". */
      paymentMethod: null,
      status,
      /* Faltava (02/10): o relatório de origens contava as reservas do
       * próprio cliente como "sem registro", e o balcão e o fixo gravavam. */
      origin: "app",
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
  });

  /* Repetição de um pedido que o barbeiro já respondeu (a resposta da
   * primeira chamada se perdeu): dizer "confirmada" seria mentir. */
  if (status !== "confirmed" && status !== "fit_in_requested") {
    throw new HttpsError(
      "failed-precondition",
      status === "expired"
        ? "Esse pedido de encaixe expirou sem resposta. Escolha outro horário."
        : "Esse pedido de encaixe já foi respondido. Veja em Reservas."
    );
  }

  return { bookingId, value, status, durationMin, staffId };
});

/* ================================================================== */
/* Validação compartilhada pelos dois caminhos de criação             */
/* ================================================================== */

/**
 * A jornada que vale para UM barbeiro numa data: a dele quando ele tem uma,
 * senão a da loja — e a grade que acompanha.
 *
 * Existia só dentro de `validarPedido`. O reagendamento remontava a conta à
 * mão, só com a jornada da LOJA e sem conferir a hora: aceitava 23:00, o meio
 * do almoço e o dia de folga do barbeiro. Duas fontes para a mesma pergunta,
 * a correção aplicada só numa — o padrão que esta função existe para impedir.
 */
export function jornadaDoBarbeiro(params: {
  barbeiro: Pick<FirebaseFirestore.DocumentSnapshot, "get">;
  shop: FirebaseFirestore.DocumentData;
  date: string;
  timeZone: string;
}) {
  const schedule = params.shop.schedule ?? {};
  const policies = params.shop.policies ?? {};
  const jornadaDele = params.barbeiro.get("schedule");
  const doDia = jornadaDoDia({
    schedule: {
      weekdays: jornadaDele?.weekdays ?? policies.openWeekdays ?? schedule.weekdays,
      opensAt: jornadaDele?.opensAt ?? schedule.opensAt,
      closesAt: jornadaDele?.closesAt ?? schedule.closesAt,
      breaks: jornadaDele?.breaks ?? schedule.breaks,
      perDay: jornadaDele?.perDay ?? schedule.perDay,
      exceptions: jornadaDele?.exceptions ?? schedule.exceptions,
    },
    weekday: diaDaSemanaNoFuso(params.date, params.timeZone),
    date: params.date,
  });
  const slotMinutes: number =
    Number(jornadaDele?.slotMinutes) || Number(schedule.slotMinutes) || 30;
  return { doDia, slotMinutes, temJornadaPropria: Boolean(jornadaDele) };
}

/** Por que o dia está fechado, na frase que o cliente merece ler. */
function motivoDeDiaFechado(
  doDia: ReturnType<typeof jornadaDoDia>,
  barbeiro: Pick<FirebaseFirestore.DocumentSnapshot, "get">,
  temJornadaPropria: boolean
) {
  /* A exceção diz mais do que o dia da semana: quem tenta marcar num feriado
   * merece ler "fechado neste dia", e não uma frase que sugere que a
   * barbearia nunca abre às quintas. */
  if (doDia.origem === "excecao") {
    return `A barbearia não atende neste dia${doDia.nota ? ` — ${doDia.nota}` : ""}.`;
  }
  return temJornadaPropria
    ? `${barbeiro.get("name")} não atende neste dia.`
    : "A barbearia não abre neste dia.";
}

/** "2026-10-13" → "13/10", para a mensagem ao cliente. */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Horizonte padrão para o cliente — o mesmo `maxAdvanceDays` da tela. */
const HORIZONTE_CLIENTE_DIAS = 60;
/** O balcão marca retorno e pacote com folga, mas não em 2028. */
const HORIZONTE_BALCAO_DIAS = 365;

function alemDoHorizonte(date: string, timeZone: string, dias: number) {
  const [a, m, d] = hojeNoFuso(timeZone).split("-").map(Number);
  const limite = new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
  return date > limite;
}

export type PedidoValidado = {
  /** Os serviços como ficam gravados — já com combos aplicados (`aplicarCombos`). */
  serviceIds: string[];
  staffId: string;
  staffName: string;
  value: number;
  durationMin: number;
  nomes: string[];
  slotMinutes: number;
  duracaoDaReserva: number;
};

/**
 * Tudo que precisa ser verdade antes de disputar um horário.
 *
 * Extraída quando D13 acrescentou o segundo caminho de criação. Duplicá-la lá
 * teria recriado o padrão que esta auditoria mais encontrou — **duas fontes
 * para a mesma pergunta, e a correção aplicada só numa delas**: foi assim que
 * `slotsForDate` e `availableSlots` divergiram, e que a política de cancelamento
 * ficou cravada numa tela e configurável na outra.
 *
 * Nada aqui mudou de comportamento. O único parâmetro novo é
 * `exigirAntecedencia`, e ele existe porque a regra tem um destinatário: ela
 * impede o CLIENTE de marcar às 14:55 um horário de 15:00 que o barbeiro não
 * veria a tempo. No balcão, quem marca é quem vai atender.
 */
export async function validarPedido(params: {
  shopRef: FirebaseFirestore.DocumentReference;
  shop: FirebaseFirestore.DocumentData;
  locale: { timeZone: string };
  serviceIds: string[];
  date: string;
  time: string;
  staffId?: string;
  exigirAntecedencia: boolean;
  /**
   * Última data que ESTE cliente pode marcar (`limiteDoCliente`). Presente,
   * substitui o horizonte fixo — o barbeiro libera a agenda por período, e o
   * mensalista enxerga mais à frente.
   */
  limiteData?: string;
  /**
   * Confere se o horário cabe no expediente e nos intervalos do barbeiro mesmo
   * sem `exigirAntecedencia`. O horário FIXO do mensalista (29/09) precisa disso:
   * ele é marcado para o futuro, então a exceção do balcão ("o atendimento já
   * aconteceu fora do expediente") não se aplica a ele.
   */
  exigirExpediente?: boolean;
}): Promise<PedidoValidado> {
  const { shopRef, shop, locale, serviceIds, date, time } = params;
  const policies = shop.policies ?? {};

  /* Formato aqui, e não só no handler: o balcão não validava nada, e "25:00"
   * chegava à agenda. */
  if (!dataValida(date)) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!horaValida(time)) throw new HttpsError("invalid-argument", "Horário inválido.");

  if (params.exigirAntecedencia && params.limiteData) {
    if (date > params.limiteData) {
      throw new HttpsError(
        "failed-precondition",
        `A agenda está aberta até ${diaMes(params.limiteData)}. As próximas datas são liberadas pela barbearia.`
      );
    }
  }
  const horizonte = params.exigirAntecedencia
    ? Number(policies.booking?.maxAdvanceDays) || HORIZONTE_CLIENTE_DIAS
    : HORIZONTE_BALCAO_DIAS;
  if (!(params.exigirAntecedencia && params.limiteData) && alemDoHorizonte(date, locale.timeZone, horizonte)) {
    throw new HttpsError(
      "failed-precondition",
      `Dá para marcar com até ${horizonte} dias de antecedência.`
    );
  }

  /* ---- Qual barbeiro ----
   *
   * A barbearia SEMPRE tem ao menos um (criado no cadastro), então com uma
   * cadeira só o cliente não escolhe nada e o servidor preenche. É o caso mais
   * comum da base: obrigar o dono de uma barbearia solo a escolher a si mesmo
   * seria atrito puro.
   *
   * Com dois ou mais, escolher deixa de ser opcional — reserva sem dono some do
   * cálculo de comissão e não bate com capacidade nenhuma. */
  const equipe = await shopRef.collection("staff").where("active", "==", true).get();
  if (equipe.empty) {
    throw new HttpsError(
      "failed-precondition",
      "Esta barbearia ainda não tem barbeiro cadastrado."
    );
  }

  let staffId = String(params.staffId ?? "");
  if (!staffId) {
    if (equipe.size > 1) {
      throw new HttpsError("invalid-argument", "Escolha com qual barbeiro você quer cortar.");
    }
    staffId = equipe.docs[0].id;
  }

  const barbeiro = equipe.docs.find((d) => d.id === staffId);
  if (!barbeiro) {
    throw new HttpsError("failed-precondition", "Esse barbeiro não está disponível.");
  }

  /* Lista vazia significa TODOS os serviços, não nenhum — senão um barbeiro
   * recém-cadastrado, sem serviços marcados, não atenderia ninguém e o dono
   * acharia que o sistema quebrou. */
  const fazTudo = !(barbeiro.get("serviceIds")?.length > 0);
  const atende: string[] = fazTudo ? [] : barbeiro.get("serviceIds");
  if (!fazTudo && !serviceIds.every((id) => atende.includes(String(id)))) {
    throw new HttpsError(
      "failed-precondition",
      `${barbeiro.get("name")} não faz um dos serviços escolhidos.`
    );
  }

  /* ---- A barbearia abre nesse dia? ---- */
  const { doDia, slotMinutes, temJornadaPropria } = jornadaDoBarbeiro({
    barbeiro,
    shop,
    date,
    timeZone: locale.timeZone,
  });
  if (!doDia.aberto) {
    throw new HttpsError("failed-precondition", motivoDeDiaFechado(doDia, barbeiro, temJornadaPropria));
  }

  /* ---- Antecedência ---- */
  const inicio = instanteNoFuso(date, time, locale.timeZone);
  if (params.exigirAntecedencia) {
    const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;
    if (inicio.getTime() - Date.now() < minutosMinimos * 60_000) {
      throw new HttpsError(
        "failed-precondition",
        `Reservas precisam de ao menos ${minutosMinimos} minutos de antecedência.`
      );
    }
  } else if (date < hojeNoFuso(locale.timeZone)) {
    /* Sem antecedência mínima o balcão pode marcar "agora" e um horário mais
     * cedo do MESMO dia — o atendimento que já começou, ou o que o dono está
     * lançando no fim do expediente.
     *
     * Dia anterior continua barrado: lançar atendimento de ontem move receita
     * entre competências, e o fato financeiro é congelado na conclusão. Isso é
     * decisão de modelo, e o modelo não muda nesta rodada. */
    throw new HttpsError(
      "failed-precondition",
      "Não dá para marcar em um dia que já passou."
    );
  }

  /* ---- Preço e duração vêm do catálogo, nunca do cliente ---- */
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um serviço.");
  }

  /* O catálogo inteiro, e não só os escolhidos: os combos (01/10) precisam
   * saber quais existem para trocar "Corte + Barba" pelo combo. */
  const catalogoSnap = await shopRef.collection("services").get();
  const catalogo = new Map(catalogoSnap.docs.map((d) => [d.id, d]));
  const servicos = serviceIds.map((id) => catalogo.get(String(id)));

  for (const snap of servicos) {
    if (!snap?.exists) throw new HttpsError("failed-precondition", "Serviço indisponível.");
    const s = snap.data() ?? {};
    if (s.active === false) throw new HttpsError("failed-precondition", `"${s.name}" não está disponível.`);
    /* O cadastro semeia quatro serviços ATIVOS a R$ 0,00 e o onboarding exige
     * preço em um só: o cliente agendava "Barba" por zero, a confirmação dizia
     * R$ 0,00 e o DRE registrava receita e comissão zeradas (rodada E2E de
     * 23/09). Serviço sem preço não está pronto para o cliente. O balcão
     * continua podendo — cortesia é decisão de quem está na cadeira. */
    if (params.exigirAntecedencia && !(Number(s.price) > 0)) {
      throw new HttpsError(
        "failed-precondition",
        `"${s.name}" ainda não tem preço definido. Fale com a barbearia.`
      );
    }
  }

  /* Preço e duração com os combos do catálogo — a mesma conta da tela. */
  const comCombos = aplicarCombos(
    serviceIds.map(String),
    catalogoSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServicoDoCatalogo, "id">) }))
  );
  const value = comCombos.valor;
  const durationMin = comCombos.duracao;
  const nomes = comCombos.ids.map((id) => String(catalogo.get(id)?.get("name") ?? ""));

  /* Serviço cadastrado sem duração ocuparia ZERO minuto e não bloquearia nada —
   * a janela seria vazia e toda reserva seguinte caberia dentro dela. A grade é
   * o mínimo defensável. */
  const duracaoDaReserva = durationMin > 0 ? durationMin : slotMinutes;

  /* ---- O horário cabe dentro do expediente daquele dia? ----
   *
   * Buraco que a jornada por dia tornou visível: a validação conferia o DIA da
   * semana e nunca a HORA. `availableSlots` só oferece horário de dentro do
   * expediente, então pela tela ninguém alcançava isto — mas a callable é
   * pública, e um POST direto marcava 23:00 numa barbearia que fecha às 19:00.
   * Com horário por dia e exceções, "dentro do expediente" passa a variar por
   * data, e a checagem deixa de ser opcional.
   *
   * ⚠️ Vale só para o CLIENTE (`exigirAntecedencia`). O balcão precisa poder
   * lançar o atendimento que passou das 19:30 e o que aconteceu no meio do
   * almoço — recusar isso seria o produto discordando do que já aconteceu na
   * cadeira, e o dono voltaria ao caderno para não perder o registro.
   */
  if (params.exigirAntecedencia || params.exigirExpediente) {
    const cabe = horariosDaJornada({
      jornada: doDia,
      slotMinutes,
      duracao: duracaoDaReserva,
    }).includes(time);
    if (!cabe) {
      throw new HttpsError(
        "failed-precondition",
        "Esse horário não está no expediente deste dia."
      );
    }
  }

  return {
    serviceIds: comCombos.ids,
    staffId,
    staffName: String(barbeiro.get("name") ?? ""),
    value,
    durationMin,
    nomes,
    slotMinutes,
    duracaoDaReserva,
  };
}

/* ================================================================== */
/* D13 · a reserva que nasce no BALCÃO                                */
/* ================================================================== */

type ReservaNoBalcaoInput = {
  barbershopId: string;
  staffId?: string;
  serviceIds: string[];
  date: string;
  time: string;
  /** Cadastro existente escolhido pelo dono. Quando vem, manda sobre o resto. */
  clientId?: string;
  clientName?: string;
  clientWhatsapp?: string;
  /**
   * Encaixe do balcão (01/10): o barbeiro marca POR CIMA de um horário
   * ocupado. É ele mesmo decidindo que cabe, então já nasce confirmado, com
   * `isFitIn` — diferente do pedido de encaixe do cliente, que espera aprovação.
   */
  encaixe?: boolean;
};

/**
 * O dono marca um atendimento para quem chegou no balcão ou ligou.
 *
 * ## Por que precisa existir
 *
 * O produto tinha **um único caminho de criação de reserva**: o app do cliente
 * autenticado. Uma barbearia recebe a maior parte dos horários por telefone e
 * por quem entra pela porta — e para essas pessoas não havia como marcar. O
 * blueprint prevê o cliente sem conta (`uid: null`) e nunca descreveu por onde a
 * reserva dele nasceria. Era a diferença entre uma agenda self-service e uma
 * plataforma de gestão.
 *
 * ## O que ela NÃO duplica
 *
 * Tudo que protege a agenda continua vindo do mesmo lugar: `validarPedido` é a
 * mesma checagem de barbeiro, serviço, jornada e catálogo do `createBooking`, e
 * a gravação passa por `gravarComTravaDeHorario` — a mesma transação, a mesma
 * janela de ocupação, a mesma trava de concorrência exercida por
 * `booking-concorrencia.test.ts`.
 *
 * Duplicar a validação aqui recriaria o padrão que esta auditoria mais
 * encontrou: **duas fontes para a mesma pergunta, e a correção aplicada só numa
 * delas.**
 *
 * ## As duas diferenças deliberadas
 *
 * 1. **Quem chama** é `owner` ou `staff` daquela barbearia, não um cliente
 *    qualquer. É o que permite gravar reserva em nome de outra pessoa sem
 *    reabrir o buraco que `createBooking` fecha ao usar sempre o próprio uid.
 * 2. **Não há antecedência mínima.** A regra existe para o cliente não marcar
 *    às 14:55 um horário de 15:00 que o barbeiro não veria a tempo. No balcão
 *    quem marca é justamente quem vai atender, e recusar "agora" tornaria o
 *    caminho inútil no caso mais comum: a pessoa já está na cadeira.
 *
 * ## O que ela deliberadamente não faz
 *
 * **Não recebe pagamento.** O fluxo termina em reserva confirmada; o pagamento
 * acontece na conclusão, como em qualquer outra. Pagamento antecipado saiu do
 * produto por decisão de 17/08, e reintroduzi-lo aqui de carona seria trazer de
 * volta pela porta lateral o que D14 acabou de tirar da frente.
 */
export const createBookingAtCounter = onCall<ReservaNoBalcaoInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, serviceIds, date, time } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  /* A guarda que separa este caminho do `createBooking`: só quem toca a loja
   * marca em nome de outra pessoa. Sem ela, qualquer autenticado criaria reserva
   * com o nome que quisesse — e o teto por cliente deixaria de significar algo,
   * porque bastaria inventar um cadastro novo a cada vez. */
  const papel = vinculosDe(request)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError(
      "permission-denied",
      "Só quem trabalha na barbearia marca pelo balcão."
    );
  }
  await exigirEdicao(barbershopId);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const shop = shopSnap.data() ?? {};
  const locale = localeDoDocumento(shop);
  const policies = shop.policies ?? {};

  const pedido = await validarPedido({
    shopRef,
    shop,
    locale,
    serviceIds,
    date,
    time,
    staffId: request.data?.staffId,
    /* A única validação dispensada, e o porquê está no cabeçalho. O passado
     * continua barrado: `validarPedido` recusa data anterior a hoje. */
    exigirAntecedencia: false,
  });

  const encaixe = request.data?.encaixe === true;
  const nome = nomeLimpo(request.data?.clientName);
  const whatsapp = String(request.data?.clientWhatsapp ?? "").replace(/\D/g, "");
  const escolhido = String(request.data?.clientId ?? "").trim();

  /* Cliente novo precisa de nome. Sem ele a agenda mostra "Cliente" em todas as
   * linhas e o dono não sabe quem é quem — que é o problema que D13 resolve. */
  if (!escolhido && !nome) {
    throw new HttpsError("invalid-argument", "Informe o nome de quem vai ser atendido.");
  }

  /* ---- Cadastro escolhido na lista: usa o que existe, não cria outro ---- */
  if (escolhido) {
    const clienteSnap = await shopRef.collection("clients").doc(escolhido).get();
    if (!clienteSnap.exists) {
      throw new HttpsError("not-found", "Esse cliente não está mais cadastrado.");
    }
    if (clienteSnap.get("active") === false) {
      /* Cadastro fundido: marcar nele criaria histórico num registro que já foi
       * substituído, e a reserva sumiria da ficha para onde a pessoa migrou. */
      throw new HttpsError("failed-precondition", "Esse cadastro foi substituído por outro.");
    }

    const bookingId = await gravarComTravaDeHorario({
      db,
      shopRef,
      clientId: escolhido,
      staffId: pedido.staffId,
      date,
      time,
      duracaoDaReserva: pedido.duracaoDaReserva,
      slotMinutes: pedido.slotMinutes,
      maxAtivas: policies.booking?.maxActivePerClient ?? 3,
      hojeNaBarbearia: hojeNoFuso(locale.timeZone),
      seOcupado: encaixe ? "encaixar" : "recusar",
      documento: documentoDaReserva({
        clientId: escolhido,
        clientName: String(clienteSnap.get("name") ?? nome ?? "Cliente"),
        clientWhatsapp: String(clienteSnap.get("whatsapp") ?? whatsapp),
        pedido,
        date,
        time,
        serviceIds,
        origem: "balcao",
      }),
    });

    return {
      bookingId,
      clientId: escolhido,
      value: pedido.value,
      status: "confirmed",
      durationMin: pedido.durationMin,
      staffId: pedido.staffId,
    };
  }

  /* ---- Cliente novo, ou reuso pelo WhatsApp ---- */
  let clientIdFinal = "";
  const bookingId = await gravarComTravaDeHorario({
    db,
    shopRef,
    /* Placeholder: `gravarComTravaDeHorario` substitui pelo id que
     * `resolverCliente` devolver, dentro da transação. */
    clientId: "",
    staffId: pedido.staffId,
    date,
    time,
    duracaoDaReserva: pedido.duracaoDaReserva,
    slotMinutes: pedido.slotMinutes,
    maxAtivas: policies.booking?.maxActivePerClient ?? 3,
    hojeNaBarbearia: hojeNoFuso(locale.timeZone),
    seOcupado: encaixe ? "encaixar" : "recusar",
    cliente: {
      barbershopId,
      uid: null,
      name: nome,
      whatsapp,
      origin: "balcao",
    },
    aoResolverCliente: (id) => {
      clientIdFinal = id;
    },
    documento: documentoDaReserva({
      clientId: "",
      clientName: nome,
      clientWhatsapp: whatsapp,
      pedido,
      date,
      time,
      serviceIds,
      origem: "balcao",
    }),
  });

  return {
    bookingId,
    clientId: clientIdFinal,
    value: pedido.value,
    status: "confirmed",
    durationMin: pedido.durationMin,
    staffId: pedido.staffId,
  };
});

/** O documento da reserva, montado igual nos três caminhos (app, balcão e horário fixo). */
export function documentoDaReserva(params: {
  clientId: string;
  clientName: string;
  clientWhatsapp: string;
  pedido: PedidoValidado;
  date: string;
  time: string;
  serviceIds: string[];
  origem: "app" | "balcao" | "fixo";
}): Record<string, unknown> {
  return {
    clientId: params.clientId,
    staffId: params.pedido.staffId,
    staffName: params.pedido.staffName,
    clientName: params.clientName || "Cliente",
    clientWhatsapp: params.clientWhatsapp,
    /* O pedido validado manda: com combo, "corte" + "barba" vira "Corte + barba". */
    serviceIds: params.pedido.serviceIds ?? params.serviceIds,
    serviceNames: params.pedido.nomes,
    date: params.date,
    time: params.time,
    durationMin: params.pedido.durationMin,
    value: params.pedido.value,
    paymentOrigin: "in_person",
    paymentMethod: null,
    status: "confirmed",
    /**
     * De onde a reserva veio. O blueprint já previa `origin` no cliente; aqui
     * ele fica também na reserva porque `bookings` é o registro histórico: saber
     * que um atendimento nasceu no balcão precisa sobreviver a uma fusão de
     * cadastro, que muda o cliente e não pode mudar o fato.
     */
    origin: params.origem,
    requestedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
}

/**
 * A parte da criação que **precisa** de transação: contar as reservas ativas do
 * cliente, travar o horário e gravar — as três na mesma leitura consistente.
 *
 * Extraída do `onCall` pelo motivo de sempre neste projeto: dentro dele, isto
 * só se exercia com emulador, autenticação e reserva semeada, e por isso a
 * trava que impede dois clientes na mesma cadeira nunca tinha sido exercida
 * sob concorrência real. Aqui ela é uma função com `db` injetável, e
 * `__tests__/booking-concorrencia.test.ts` dispara N chamadas simultâneas
 * contra o emulador.
 */
export async function gravarComTravaDeHorario(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  clientId: string;
  staffId: string;
  date: string;
  time: string;
  duracaoDaReserva: number;
  slotMinutes: number;
  maxAtivas: number;
  /** Mensagem e motivo próprios quando o teto de ativas recusa (conta sem e-mail confirmado). */
  recusaNoTeto?: { mensagem: string; motivo: string };
  /** Hoje no fuso da barbearia — decide o que ainda conta como reserva ativa. */
  hojeNaBarbearia: string;
  documento: Record<string, unknown>;
  /**
   * Cadastro do cliente — G3.
   *
   * Resolvido DENTRO desta transação, e não antes dela: o cadastro e o
   * atendimento nascem juntos ou não nascem. Um cliente gravado sem a reserva
   * é cadastro fantasma; uma reserva apontando para cliente que não existe é
   * pior — é referência quebrada num documento que o financeiro vai ler.
   *
   * Quando presente, o `clientId` do documento vem daqui, e não de `params`.
   */
  cliente?: {
    uid: string | null;
    name: unknown;
    whatsapp: unknown;
    origin: OrigemDoCliente;
    barbershopId: string;
  };
  /**
   * Recebe o id do cadastro assim que ele é resolvido, ainda dentro da
   * transação. Quem chama precisa dele para devolver à tela — sem isso o painel
   * não sabe qual cliente acabou de nascer, e uma segunda consulta por WhatsApp
   * traria o cadastro errado quando dois homônimos compartilham número.
   */
  aoResolverCliente?: (clientId: string) => void;
  /** Id derivado da chave de idempotência; ausente, o Firestore gera um. */
  idDaReserva?: string;
  /**
   * O que fazer se o horário estiver ocupado. `recusar` (padrão) é a reserva
   * normal. `pedirEncaixe` grava o pedido como `fit_in_requested`, que não
   * ocupa a agenda e espera o barbeiro — ver `responderEncaixe`.
   * `encaixar` é o balcão: grava confirmado, com `isFitIn`, por cima do que
   * já está lá — quem decide que cabe é quem está na cadeira.
   */
  seOcupado?: "recusar" | "pedirEncaixe" | "encaixar";
  /**
   * Recebe o status gravado, a cada tentativa da transação — a última chamada
   * é a da tentativa que efetivou. Numa repetição idempotente, é o status do
   * documento que já existia.
   */
  aoDefinirStatus?: (status: string) => void;
  /**
   * Teto de criações por conta por dia (ver `RESERVAS_POR_DIA`). Só o
   * `createBooking` passa: o balcão é o dono marcando, e não tem por que
   * esbarrar num limite feito contra conta descartável.
   *
   * Lido e incrementado DENTRO da transação: fora dela, dez pedidos
   * simultâneos leriam o mesmo "9" e passariam todos.
   */
  limiteDiario?: { ref: FirebaseFirestore.DocumentReference; maximo: number };
}): Promise<string> {
  const { db, shopRef, date, time, staffId } = params;
  const bookingRef = params.idDaReserva
    ? shopRef.collection("bookings").doc(params.idDaReserva)
    : shopRef.collection("bookings").doc();

  await db.runTransaction(async (tx) => {
    /* Reiniciado a cada tentativa: a transação pode rodar mais de uma vez. */
    let virouEncaixe = false;
    let encaixadoNoBalcao = false;
    /* Repetição da MESMA tentativa: a reserva já existe, e o pedido já foi
     * atendido. Devolver o id em vez de disputar o horário de novo — senão a
     * segunda chamada perdia para a primeira e respondia "esse horário acabou
     * de ser reservado" a quem acabou de reservá-lo. */
    if (params.idDaReserva) {
      const existente = await tx.get(bookingRef);
      if (existente.exists) {
        /* A resposta da repetição tem de dizer o que foi GRAVADO: se a
         * primeira virou pedido de encaixe, "confirmado" seria mentira. */
        params.aoDefinirStatus?.(String(existente.get("status")));
        return;
      }
    }

    /* ---- Teto diário da conta (auditoria de 28/09, M2) ----
     *
     * Depois da repetição idempotente, que não cria nada e por isso não conta;
     * antes de qualquer escrita, pela regra de leituras-primeiro. */
    const limite = params.limiteDiario;
    if (limite) {
      const contador = await tx.get(limite.ref);
      if (excedeuLimiteDiario(contador.get("criadas"), limite.maximo)) {
        throw new HttpsError(
          "resource-exhausted",
          "Muitas tentativas hoje. Tente amanhã ou fale com a barbearia.",
          { motivo: MOTIVO_LIMITE_DIARIO }
        );
      }
    }

    /* ---- G3: o cliente, ainda na fase de LEITURA da transação ----
     *
     * Antes de qualquer outra leitura por comodidade de ordem, mas o que manda
     * é a regra do Firestore: nenhuma leitura depois da primeira escrita. Por
     * isso `resolverCliente` devolve o id e uma escrita pendente, que só roda
     * lá embaixo junto com o `tx.set` da reserva. */
    const cadastro = params.cliente
      ? await resolverCliente({ tx, db, ...params.cliente })
      : null;
    if (cadastro) params.aoResolverCliente?.(cadastro.id);
    /* ---- Quantas este cliente já tem em aberto ----
     *
     * Sem teto, uma conta só ocupa a agenda inteira: são 60 dias de horizonte
     * e nada impedia um laço de criar reserva em todos os horários. Não é
     * roubo de dado, é sequestro de agenda — e para uma barbearia dá no mesmo,
     * porque ninguém mais consegue marcar.
     *
     * O filtro de status e data é em memória, e não na query, de propósito:
     * `where('clientId').where('date','>=')` exigiria índice composto, e um
     * índice faltando derruba a criação de reserva em produção. A quantidade
     * por cliente é pequena por natureza. */
    const { maxAtivas, hojeNaBarbearia } = params;
    const clientId = cadastro?.id ?? params.clientId;
    const minhas = await tx.get(
      shopRef.collection("bookings").where("clientId", "==", clientId)
    );
    /* Reservas do HORÁRIO FIXO do mensalista (29/09) não entram na conta: são
     * a barbearia guardando a vaga dele, não ele ocupando a agenda. Contá-las
     * travaria o mensalista de marcar um corte extra — com 8 semanas guardadas,
     * o teto de 3 estaria estourado para sempre. */
    const ativas = minhas.docs.filter((d) => {
      const b = d.data();
      return EM_ABERTO.includes(b.status) && String(b.date) >= hojeNaBarbearia && !b.horarioFixoId;
    }).length;

    if (ativas >= maxAtivas) {
      if (params.recusaNoTeto) {
        throw new HttpsError("resource-exhausted", params.recusaNoTeto.mensagem, {
          motivo: params.recusaNoTeto.motivo,
        });
      }
      throw new HttpsError(
        "resource-exhausted",
        `Você já tem ${ativas} horário(s) marcado(s). Cancele um antes de marcar outro.`
      );
    }

    {
      /* Conflito é por CADEIRA e por JANELA.
       *
       * Por cadeira, porque antes bastava `date + time`: três barbeiros às 15h
       * viravam conflito e dois terços da agenda sumiam. O filtro por `staffId`
       * é em memória e não na query de propósito — três cláusulas de igualdade
       * exigiriam índice composto, e índice faltando derruba a criação de
       * reserva em produção.
       *
       * Por janela, porque `where("time","==",time)` só via o INSTANTE inicial:
       * um atendimento das 15:00 às 16:00 não impedia outro às 15:30, e a
       * transação que existe justamente para barrar isso não via conflito
       * nenhum. A query passa a trazer o dia e a conta é a de `agenda.ts` — a
       * mesma que o motor de horários usa, para as duas pontas não poderem
       * discordar. */
      const doDia = await tx.get(shopRef.collection("bookings").where("date", "==", date));

      const ocupadas = janelasOcupadas(
        doDia.docs
          .filter((d) => d.data().staffId === staffId && OCUPAM_SLOT.includes(d.data().status))
          .map((d) => ({ time: String(d.data().time), durationMin: d.data().durationMin })),
        params.slotMinutes
      );

      if (
        !horarioDisponivel({
          time,
          durationMin: params.duracaoDaReserva,
          ocupadas,
        })
      ) {
        if (params.seOcupado === "encaixar") {
          encaixadoNoBalcao = true;
        } else if (params.seOcupado !== "pedirEncaixe") {
          throw new HttpsError(
            "already-exists",
            "Esse horário acabou de ser reservado. Escolha outro, por favor."
          );
        } else {
          virouEncaixe = true;
        }
      }
    }

    /* ---- FASE DE ESCRITA ---- */
    cadastro?.gravar(tx);
    if (limite) {
      tx.set(
        limite.ref,
        {
          criadas: FieldValue.increment(1),
          atualizadoEm: FieldValue.serverTimestamp(),
          /* Dois dias de folga sobre o dia contado: o documento só serve
           * enquanto o dia dele é "hoje" em algum fuso. */
          expiraEm: Timestamp.fromMillis(Date.now() + 2 * 24 * 60 * 60 * 1000),
        },
        { merge: true }
      );
    }
    tx.set(bookingRef, {
      ...params.documento,
      ...(virouEncaixe ? { status: "fit_in_requested", isFitIn: true } : {}),
      ...(encaixadoNoBalcao ? { isFitIn: true } : {}),
      clientId: cadastro?.id ?? params.clientId,
    });
    params.aoDefinirStatus?.(
      virouEncaixe ? "fit_in_requested" : String(params.documento.status ?? "confirmed")
    );
  });

  return bookingRef.id;
}

/**
 * Reagendamento pelo cliente.
 *
 * A tela fazia isso escrevendo direto no Firestore — e as regras negam, porque
 * o cliente não pode gravar `status`. O `catch` só chamava `console.error`: o
 * modal fechava, o cliente via a tela dizer que remarcou, e a agenda do
 * barbeiro continuava com o horário antigo. Falha silenciosa dos dois lados.
 *
 * Aqui o novo horário disputa slot na mesma transação, igual a uma reserva
 * nova — senão remarcar seria a porta dos fundos para furar a fila.
 */
export const rescheduleBooking = onCall<{
  barbershopId: string;
  bookingId: string;
  date: string;
  time: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, bookingId, date, time } = request.data ?? {};
  if (!barbershopId || !bookingId) {
    throw new HttpsError("invalid-argument", "Reserva não informada.");
  }
  if (!dataValida(date)) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!horaValida(time)) throw new HttpsError("invalid-argument", "Horário inválido.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const bookingRef = shopRef.collection("bookings").doc(bookingId);

  const [shopSnap, bookingSnap] = await Promise.all([shopRef.get(), bookingRef.get()]);
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");

  const booking = bookingSnap.data() ?? {};
  const ehDono =
    vinculosDe(request)?.[barbershopId] ===
    "owner";
  if (booking.clientId !== uid && !ehDono) {
    throw new HttpsError("permission-denied", "Essa reserva não é sua.");
  }
  /* Remarcar pelo painel é edição — mesma regra do cancelamento. */
  if (ehDono && booking.clientId !== uid) await exigirEdicao(barbershopId);

  /* Pedido de encaixe ainda não é horário: é uma pergunta ao barbeiro sobre
   * UM horário específico. Reagendá-lo mudaria a pergunta sem ninguém ter
   * respondido a primeira. */
  if (booking.status === "fit_in_requested") {
    throw new HttpsError(
      "failed-precondition",
      "Pedido de encaixe não se reagenda: cancele o pedido e escolha outro horário."
    );
  }
  if (!EM_ABERTO.includes(booking.status)) {
    throw new HttpsError("failed-precondition", "Essa reserva não está mais aberta.");
  }

  const shop = shopSnap.data() ?? {};
  const policies = shop.policies ?? {};
  const locale = localeDoDocumento(shop);

  /* A mesma régua da criação — `jornadaDoBarbeiro` e `horariosDaJornada`.
   * Antes, aqui havia uma cópia que olhava só a jornada da LOJA e nunca a
   * hora: remarcar para 23:00, para o meio do almoço ou para a folga do
   * barbeiro passava, e era a porta dos fundos da validação que a criação
   * fecha. */
  const staffRef = booking.staffId ? shopRef.collection("staff").doc(String(booking.staffId)) : null;
  const barbeiroSnap = staffRef ? await staffRef.get() : null;
  if (barbeiroSnap && (!barbeiroSnap.exists || barbeiroSnap.get("active") === false)) {
    throw new HttpsError("failed-precondition", "Esse barbeiro não está disponível. Fale com a barbearia.");
  }
  /* Reserva antiga, sem `staffId`: vale a jornada da loja. */
  const barbeiro = barbeiroSnap ?? { get: () => undefined };

  if (ehDono) {
    if (alemDoHorizonte(date, locale.timeZone, HORIZONTE_BALCAO_DIAS)) {
      throw new HttpsError("failed-precondition", "Essa data está longe demais para remarcar.");
    }
  } else {
    /* O cliente remarcando segue a MESMA janela de quando marca — senão
     * remarcar seria a porta para a data que o barbeiro ainda não liberou. */
    const limite = limiteDoCliente({
      hoje: hojeNoFuso(locale.timeZone),
      janela: policies.janela,
      ehMensalista: await ehMensalistaAtivo(shopRef, uid),
      horizontePadrao: policies.booking?.maxAdvanceDays,
    });
    if (date > limite) {
      throw new HttpsError(
        "failed-precondition",
        `A agenda está aberta até ${diaMes(limite)}. As próximas datas são liberadas pela barbearia.`
      );
    }
  }

  const { doDia, slotMinutes, temJornadaPropria } = jornadaDoBarbeiro({
    barbeiro,
    shop,
    date,
    timeZone: locale.timeZone,
  });
  if (!doDia.aberto) {
    throw new HttpsError("failed-precondition", motivoDeDiaFechado(doDia, barbeiro, temJornadaPropria));
  }

  const duracaoDaReserva = Number(booking.durationMin) || slotMinutes;

  if (!ehDono) {
    const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;
    if (instanteNoFuso(date, time, locale.timeZone).getTime() - Date.now() < minutosMinimos * 60_000) {
      throw new HttpsError(
        "failed-precondition",
        `Reservas precisam de ao menos ${minutosMinimos} minutos de antecedência.`
      );
    }
    if (!horariosDaJornada({ jornada: doDia, slotMinutes, duracao: duracaoDaReserva }).includes(time)) {
      throw new HttpsError("failed-precondition", "Esse horário não está no expediente deste dia.");
    }
  } else if (date < hojeNoFuso(locale.timeZone)) {
    /* O dono segue a régua do balcão: pode lançar fora do expediente, nunca
     * num dia que já passou. */
    throw new HttpsError("failed-precondition", "Não dá para remarcar para um dia que já passou.");
  }

  /* Janela de remarcação: depois dela o horário já está reservado perto demais
   * para a barbearia recolocar outra pessoa. */
  const horasMinimas: number = policies.reschedule?.minHoursBefore ?? 6;
  const horasAteOAtual =
    (instanteNoFuso(booking.date, booking.time, locale.timeZone).getTime() - Date.now()) /
    3_600_000;
  if (!ehDono && horasAteOAtual < horasMinimas) {
    throw new HttpsError(
      "failed-precondition",
      `Remarcação só até ${horasMinimas}h antes do horário. Fale com a barbearia.`
    );
  }

  /* Teto de remarcações — P1-13.
   *
   * A tela do cliente anunciava "limite de 2 por reserva" a partir de um
   * `useState` que zerava com F5, e o servidor nunca soube da regra. Bastava
   * recarregar a página. A contagem passa a viver no documento, gravada dentro
   * da mesma transação que move o horário: contar fora dela permitiria duas
   * remarcações simultâneas passarem pelo mesmo teto. */
  const limiteDeRemarcacoes: number = policies.reschedule?.maxPerBooking ?? 2;
  if (!podeRemarcar({ contagem: booking.rescheduleCount, limite: limiteDeRemarcacoes, ehDono })) {
    throw new HttpsError(
      "failed-precondition",
      `Esta reserva já foi remarcada ${limiteDeRemarcacoes} vezes. Fale com a barbearia.`
    );
  }

  /* Mesma conta de janela do `createBooking` — remarcar não pode ser a porta
   * dos fundos para a sobreposição que a criação passou a barrar. */
  await db.runTransaction(async (tx) => {
    /* O status lido lá em cima é de antes da transação. Se o dono concluiu ou
     * cancelou nesse meio-tempo, remarcar forçaria `confirmed` e ressuscitaria
     * um atendimento já fechado — apagando o pagamento que ele registrou. */
    const atual = await tx.get(bookingRef);
    if (!EM_ABERTO.includes(atual.get("status"))) {
      throw new HttpsError("failed-precondition", "Essa reserva não está mais aberta.");
    }
    const doDia = await tx.get(shopRef.collection("bookings").where("date", "==", date));

    const ocupadas = janelasOcupadas(
      doDia.docs
        /* A própria reserva sai da conta: ela é quem está se movendo, e
         * compará-la consigo mesma recusaria toda remarcação para um horário
         * que se sobreponha ao atual — inclusive adiantar em 15 minutos. */
        .filter(
          (d) =>
            d.id !== bookingId &&
            d.data().staffId === booking.staffId &&
            OCUPAM_SLOT.includes(d.data().status)
        )
        .map((d) => ({ time: String(d.data().time), durationMin: d.data().durationMin })),
      slotMinutes
    );

    if (!horarioDisponivel({ time, durationMin: duracaoDaReserva, ocupadas })) {
      throw new HttpsError(
        "already-exists",
        "Esse horário acabou de ser reservado. Escolha outro, por favor."
      );
    }

    tx.update(bookingRef, {
      date,
      time,
      status: "confirmed",
      rescheduledFrom: { date: booking.date, time: booking.time },
      rescheduledAt: FieldValue.serverTimestamp(),
      /* `increment` e não `contagem + 1`: o valor lido veio de antes da
       * transação, e duas remarcações concorrentes gravariam o mesmo número.
       * O contador é o que sustenta o limite — se ele erra, o limite não
       * existe. */
      rescheduleCount: FieldValue.increment(1),
    });
  });

  return { date, time };
});

/**
 * Quanto volta para o cliente, e sob que rótulo o cancelamento é gravado.
 *
 * Separado do handler porque o caminho do DONO deixou de ser exceção: desde que
 * o painel ganhou o botão de cancelar, é por aqui que passa o cancelamento que
 * mais acontece na vida real — o cliente que avisa no balcão. Dentro do `onCall`
 * isto só se exercia com emulador, autenticação e reserva semeada, e por isso
 * nunca se exerceu.
 *
 * `refund` é decidido AQUI e não no cliente: quem tem o botão não pode escolher
 * a própria faixa de devolução.
 */
export function desfechoDoCancelamento(params: {
  value: number;
  /** Sem método gravado, o dinheiro nunca entrou — não há o que devolver. */
  paymentMethod: string | null | undefined;
  horasAteOAtendimento: number;
  politica: {
    fullRefundHours?: number;
    partialRefundHours?: number;
    cancellationFeePct?: number;
  };
  /** O dono cancelando reserva de OUTRA pessoa. */
  peloDono: boolean;
}) {
  const janelaIntegral = params.politica.fullRefundHours ?? 24;
  const janelaParcial = params.politica.partialRefundHours ?? 6;
  const taxaPct = params.politica.cancellationFeePct ?? 25;
  const horas = params.horasAteOAtendimento;

  let refund = 0;
  if (params.paymentMethod) {
    if (horas >= janelaIntegral) refund = params.value;
    else if (horas >= janelaParcial) {
      refund = Math.round(params.value * (1 - taxaPct / 100) * 100) / 100;
    }
  }

  /* Os dois rótulos existem porque alimentam contas diferentes: falta e
   * desistência do cliente entram na régua dele, e o que a barbearia desmarca
   * não pode contar contra quem não desmarcou nada. */
  return {
    refund,
    status: params.peloDono ? "cancelled_by_shop" : "cancelled_by_client",
  } as const;
}

/**
 * Cancelamento pelo cliente ou pelo dono.
 *
 * A devolução é calculada aqui, com a política da barbearia — nem o cliente nem
 * o dono escolhem a faixa ou gravam o status.
 */
export const cancelBooking = onCall<{ barbershopId: string; bookingId: string }>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const { barbershopId, bookingId } = request.data ?? {};
    if (!barbershopId || !bookingId) {
      throw new HttpsError("invalid-argument", "Reserva não informada.");
    }

    const db = getFirestore();
    const shopRef = db.doc(`barbershops/${barbershopId}`);
    const bookingRef = shopRef.collection("bookings").doc(bookingId);

    const [shopSnap, bookingSnap] = await Promise.all([shopRef.get(), bookingRef.get()]);
    if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");

    const booking = bookingSnap.data() ?? {};
    const ehDono =
      vinculosDe(request)?.[barbershopId] ===
      "owner";

    if (booking.clientId !== uid && !ehDono) {
      throw new HttpsError("permission-denied", "Essa reserva não é sua.");
    }
    /* O dono mexendo na agenda é edição — em modo leitura, não (auditoria de
     * 28/09, B10). O cliente cancelar a PRÓPRIA reserva continua valendo: a
     * agenda dele não pode ficar presa por causa do plano da barbearia. */
    if (ehDono && booking.clientId !== uid) await exigirEdicao(barbershopId);

    /* Só cancela o que ainda está aberto.
     *
     * Esta guarda existia no `rescheduleBooking` e faltava aqui, e a diferença
     * não era cosmética: cancelar uma reserva CONCLUÍDA a tira de `completed`,
     * e o gatilho financeiro lê isso como conclusão desfeita — apagando
     * `payments/pagamento_<id>` e `commissions/comissao_<id>`. O atendimento
     * aconteceu, o dinheiro entrou na gaveta, e a receita sumia do DRE, do
     * fluxo de caixa e do acerto do barbeiro. O carimbo de fidelidade ia junto.
     *
     * Quem podia disparar era o próprio cliente, com o id de uma reserva dele
     * já atendida. A interface do painel só oferece o botão em reserva aberta —
     * mas interface não é guarda.
     *
     * Desfazer uma conclusão é outro caminho (o dono reabre pelo painel), e
     * devolver dinheiro de atendimento realizado é estorno, não cancelamento. */
    if (!EM_ABERTO.includes(booking.status)) {
      throw new HttpsError(
        "failed-precondition",
        booking.status === "completed"
          ? "Esse atendimento já foi concluído e não pode ser cancelado. Fale com a barbearia."
          : "Essa reserva não está mais aberta."
      );
    }

    const { timeZone } = localeDoDocumento(shopSnap.data());
    const horas =
      (instanteNoFuso(booking.date, booking.time, timeZone).getTime() - Date.now()) / 3_600_000;

    const { refund, status } = desfechoDoCancelamento({
      value: booking.value,
      paymentMethod: booking.paymentMethod,
      horasAteOAtendimento: horas,
      politica: (shopSnap.data()?.policies ?? {}).cancellation ?? {},
      peloDono: ehDono && booking.clientId !== uid,
    });

    /* O status lido lá em cima é de antes da gravação. Se o dono concluiu o
     * atendimento nesse meio-tempo, `update` direto passava por cima: o
     * atendimento pago virava "cancelado", o caixa ficava com o dinheiro e o
     * DRE perdia a receita (auditoria de 23/09). A transação relê e recusa. */
    await db.runTransaction(async (tx) => {
      const atual = await tx.get(bookingRef);
      if (!EM_ABERTO.includes(atual.get("status"))) {
        throw new HttpsError(
          "failed-precondition",
          atual.get("status") === "completed"
            ? "Esse atendimento acabou de ser concluído e não pode ser cancelado. Fale com a barbearia."
            : "Essa reserva não está mais aberta."
        );
      }
      tx.update(bookingRef, {
        status,
        cancelledAt: FieldValue.serverTimestamp(),
        refundedAmount: refund,
      });
    });

    return { refund, horasAteOAtendimento: Math.round(horas) };
  }
);

/* ================================================================== */
/* Encaixe · a resposta do barbeiro                                    */
/* ================================================================== */

/**
 * Aprova ou recusa um pedido de encaixe.
 *
 * O pedido nasce em `createBooking` como `fit_in_requested` e não ocupa a
 * agenda. Quem decide se cabe é quem está na cadeira — por isso a guarda é o
 * papel na barbearia, e nunca o cliente.
 *
 * - Aprovar: vira `confirmed` com `isFitIn`, e passa a ocupar a agenda mesmo
 *   sobrepondo outra reserva: é exatamente o que "encaixe" quer dizer, e o
 *   barbeiro acabou de dizer que dá.
 * - Recusar: vira `cancelled_by_shop`, com o motivo registrado.
 * - Horário já passado sem resposta: vira `expired`. Aprovar um encaixe das
 *   10:00 às 11:00 seria marcar um cliente para um horário que ninguém cumpriu.
 *
 * Tudo numa transação: o cliente pode cancelar o pedido no mesmo instante, e
 * aprovar por cima de um cancelamento ressuscitaria a reserva.
 */
export const responderEncaixe = onCall<{
  barbershopId: string;
  bookingId: string;
  aprovar: boolean;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, bookingId, aprovar } = request.data ?? {};
  if (!barbershopId || !bookingId || typeof aprovar !== "boolean") {
    throw new HttpsError("invalid-argument", "Pedido de encaixe não informado.");
  }

  const papel = vinculosDe(request)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia responde encaixe.");
  }
  await exigirEdicao(barbershopId);

  return aplicarRespostaDoEncaixe({ barbershopId, bookingId, aprovar, por: uid });
});

/**
 * A decisão do encaixe, sem a casca da callable — a mesma transação para o
 * painel (`responderEncaixe`) e para o botão do Telegram (`telegram/`).
 * Quem chama já conferiu que a pessoa pode responder.
 *
 * `por` é o uid de quem respondeu, ou `telegram:{chatId}` quando veio do bot.
 */
export async function aplicarRespostaDoEncaixe(params: {
  barbershopId: string;
  bookingId: string;
  aprovar: boolean;
  por: string;
}): Promise<{ status: "confirmed" | "cancelled_by_shop" | "expired" }> {
  const db = getFirestore();
  const { barbershopId, bookingId, aprovar, por } = params;
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const bookingRef = shopRef.collection("bookings").doc(bookingId);
  const { timeZone } = localeDoDocumento((await shopRef.get()).data());

  let resultado: "confirmed" | "cancelled_by_shop" | "expired" = "confirmed";

  await db.runTransaction(async (tx) => {
    const atual = await tx.get(bookingRef);
    if (!atual.exists) throw new HttpsError("not-found", "Pedido não encontrado.");

    const status = atual.get("status");
    if (status !== "fit_in_requested") {
      throw new HttpsError(
        "failed-precondition",
        status === "confirmed"
          ? "Esse encaixe já foi aprovado."
          : "Esse pedido não está mais aberto — o cliente pode ter cancelado."
      );
    }

    const inicio = instanteNoFuso(String(atual.get("date")), String(atual.get("time")), timeZone);
    if (inicio.getTime() <= Date.now()) {
      resultado = "expired";
      tx.update(bookingRef, {
        status: "expired",
        respondidoEm: FieldValue.serverTimestamp(),
      });
      return;
    }

    resultado = aprovar ? "confirmed" : "cancelled_by_shop";
    tx.update(bookingRef, {
      status: resultado,
      isFitIn: true,
      respondidoEm: FieldValue.serverTimestamp(),
      respondidoPor: por,
      ...(aprovar
        ? {}
        : {
            cancelledAt: FieldValue.serverTimestamp(),
            motivoCancelamento: "encaixe_recusado",
            refundedAmount: 0,
          }),
    });
  });

  return { status: resultado };
}

/**
 * Pedido de encaixe que ninguém respondeu até a hora vira `expired`.
 *
 * Sem isto ele ficava `fit_in_requested` para sempre (revisão do PR #60):
 * saía da lista do barbeiro, continuava contando como reserva ativa do
 * cliente, e nunca chegava à tela dele o "sem resposta" que a tela promete.
 *
 * A cada 15 minutos, e não por minuto: o cliente vê "sem resposta" no máximo
 * um quarto de hora depois — e a tela dele já trata o pedido vencido como tal
 * nesse intervalo. Consulta por barbearia, com UMA igualdade: índice de
 * campo único, que existe sem declarar; uma consulta de grupo de coleções
 * exigiria índice novo.
 */
export const expirarEncaixes = onSchedule(
  { schedule: "every 15 minutes", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const agora = Date.now();
    const barbearias = await db.collection("barbershops").get();
    for (const shop of barbearias.docs) {
      const pedidos = await shop.ref
        .collection("bookings")
        .where("status", "==", "fit_in_requested")
        .get();
      if (pedidos.empty) continue;
      const { timeZone } = localeDoDocumento(shop.data());
      for (const d of pedidos.docs) {
        const inicio = instanteNoFuso(String(d.get("date")), String(d.get("time")), timeZone);
        if (inicio.getTime() > agora) continue;
        /* Transação: o barbeiro pode estar aprovando neste instante, e
         * aprovado não volta a expirado. */
        await db.runTransaction(async (tx) => {
          const atual = await tx.get(d.ref);
          if (atual.get("status") !== "fit_in_requested") return;
          tx.update(d.ref, { status: "expired", expiradoEm: FieldValue.serverTimestamp() });
        });
      }
    }
  }
);
