import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { diaDaSemanaNoFuso, hojeNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";
import { horarioDisponivel, janelasOcupadas, podeRemarcar } from "./agenda";
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
  clientName?: string;
  clientWhatsapp?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

/** Status que ocupam um horário na agenda. */
const OCUPAM_SLOT = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "completed",
  "no_show",
];

/** Status de uma reserva ainda viva, do ponto de vista do cliente. */
const EM_ABERTO = ["pending_payment", "confirmed", "confirmed_by_client", "fit_in_requested"];

export const createBooking = onCall<CriarReservaInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para agendar.");

  const { barbershopId, serviceIds, date, time, paymentOrigin, isFitIn } = request.data ?? {};

  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um serviço.");
  }
  if (!ISO_DATE.test(date ?? "")) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!HORA.test(time ?? "")) throw new HttpsError("invalid-argument", "Horário inválido.");
  /* Só existe um caminho hoje: o cliente acerta no salão. Quando o gateway
   * entrar, `online` passa a ser aceito aqui e desemboca na mesma coleção
   * `payments` — acréscimo, não reescrita. */
  if (paymentOrigin && paymentOrigin !== "in_person") {
    throw new HttpsError(
      "invalid-argument",
      "Pagamento antecipado ainda não está disponível."
    );
  }

  /* Encaixe saiu da proposta em 17/08.
   *
   * Ele existia como pedido sobre um horário ocupado, e perdeu o caminho no dia
   * em que a disponibilidade passou a vir de `availableSlots` — que devolve só
   * os horários LIVRES. A tela seguiu anunciando "peça um encaixe nos horários
   * em vermelho" para horários que nunca apareciam, o painel manteve uma seção
   * que nunca receberia nada, e o template de WhatsApp ficou esperando um
   * documento que ninguém criava.
   *
   * A decisão foi remover em vez de reativar: encaixe é conversa de WhatsApp,
   * e o dono resolve pela agenda quando quiser. O servidor recusa
   * explicitamente para que a ausência seja uma resposta, e não um silêncio —
   * e para que uma tela antiga em cache não crie reserva num estado que o
   * produto não sabe mais operar. */
  if (isFitIn) {
    throw new HttpsError(
      "invalid-argument",
      "Encaixe não é mais feito pelo app. Fale com a barbearia pelo WhatsApp."
    );
  }

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

  const pedido = await validarPedido({
    shopRef,
    shop,
    locale,
    serviceIds,
    date,
    time,
    staffId: request.data?.staffId,
    exigirAntecedencia: true,
  });

  const { staffId, value, durationMin, nomes, slotMinutes, duracaoDaReserva } = pedido;
  const status = "confirmed";

  /* ---- Grava checando conflito na mesma transação ---- */
  const bookingId = await gravarComTravaDeHorario({
    db,
    shopRef,
    clientId: uid,
    staffId,
    date,
    time,
    duracaoDaReserva,
    slotMinutes,
    maxAtivas: policies.booking?.maxActivePerClient ?? 3,
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
      name: request.data?.clientName ?? request.auth?.token.name,
      whatsapp: request.data?.clientWhatsapp,
      origin: "app",
    },
    documento: {
      clientId: uid,
      staffId,
      staffName: pedido.staffName,
      clientName: String(request.data?.clientName ?? request.auth?.token.name ?? "Cliente"),
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
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
  });

  return { bookingId, value, status, durationMin, staffId };
});

/* ================================================================== */
/* Validação compartilhada pelos dois caminhos de criação             */
/* ================================================================== */

export type PedidoValidado = {
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
}): Promise<PedidoValidado> {
  const { shopRef, shop, locale, serviceIds, date, time } = params;
  const schedule = shop.schedule ?? {};
  const policies = shop.policies ?? {};

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
  const diaSemana = diaDaSemanaNoFuso(date, locale.timeZone);
  /* Jornada do BARBEIRO quando ele tem uma; senão a da loja. Folga na segunda
   * e entrada às 10h são o normal de uma equipe. */
  const jornadaDele = barbeiro.get("schedule");
  const abre: number[] =
    jornadaDele?.weekdays ?? policies.openWeekdays ?? schedule.weekdays ?? [1, 2, 3, 4, 5, 6];
  if (!abre.includes(diaSemana)) {
    throw new HttpsError(
      "failed-precondition",
      jornadaDele
        ? `${barbeiro.get("name")} não atende neste dia.`
        : "A barbearia não abre neste dia."
    );
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

  const servicos = await Promise.all(
    serviceIds.map((id) => shopRef.collection("services").doc(String(id)).get())
  );

  let value = 0;
  let durationMin = 0;
  const nomes: string[] = [];

  for (const snap of servicos) {
    if (!snap.exists) throw new HttpsError("failed-precondition", "Serviço indisponível.");
    const s = snap.data() ?? {};
    if (s.active === false) throw new HttpsError("failed-precondition", `"${s.name}" não está disponível.`);
    value += Number(s.price) || 0;
    durationMin += Number(s.durationMin) || 0;
    nomes.push(String(s.name ?? ""));
  }

  /* Grade da jornada: do barbeiro quando ele tem uma, senão da loja. É a
   * duração assumida para reserva antiga, gravada antes de `durationMin`
   * existir. */
  const slotMinutes: number =
    Number(jornadaDele?.slotMinutes) || Number(schedule.slotMinutes) || 30;

  /* Serviço cadastrado sem duração ocuparia ZERO minuto e não bloquearia nada —
   * a janela seria vazia e toda reserva seguinte caberia dentro dela. A grade é
   * o mínimo defensável. */
  const duracaoDaReserva = durationMin > 0 ? durationMin : slotMinutes;

  return {
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
  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError(
      "permission-denied",
      "Só quem trabalha na barbearia marca pelo balcão."
    );
  }

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

  const nome = String(request.data?.clientName ?? "").trim();
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

/** O documento da reserva, montado igual nos dois caminhos. */
function documentoDaReserva(params: {
  clientId: string;
  clientName: string;
  clientWhatsapp: string;
  pedido: PedidoValidado;
  date: string;
  time: string;
  serviceIds: string[];
  origem: "app" | "balcao";
}): Record<string, unknown> {
  return {
    clientId: params.clientId,
    staffId: params.pedido.staffId,
    staffName: params.pedido.staffName,
    clientName: params.clientName || "Cliente",
    clientWhatsapp: params.clientWhatsapp,
    serviceIds: params.serviceIds,
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
}): Promise<string> {
  const { db, shopRef, date, time, staffId } = params;
  const bookingRef = shopRef.collection("bookings").doc();

  await db.runTransaction(async (tx) => {
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
    const ativas = minhas.docs.filter((d) => {
      const b = d.data();
      return EM_ABERTO.includes(b.status) && String(b.date) >= hojeNaBarbearia;
    }).length;

    if (ativas >= maxAtivas) {
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
        throw new HttpsError(
          "already-exists",
          "Esse horário acabou de ser reservado. Escolha outro, por favor."
        );
      }
    }

    /* ---- FASE DE ESCRITA ---- */
    cadastro?.gravar(tx);
    tx.set(bookingRef, { ...params.documento, clientId: cadastro?.id ?? params.clientId });
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
  if (!ISO_DATE.test(date ?? "")) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!HORA.test(time ?? "")) throw new HttpsError("invalid-argument", "Horário inválido.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const bookingRef = shopRef.collection("bookings").doc(bookingId);

  const [shopSnap, bookingSnap] = await Promise.all([shopRef.get(), bookingRef.get()]);
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  if (!bookingSnap.exists) throw new HttpsError("not-found", "Reserva não encontrada.");

  const booking = bookingSnap.data() ?? {};
  const ehDono =
    (request.auth?.token.barbershops as Record<string, string> | undefined)?.[barbershopId] ===
    "owner";
  if (booking.clientId !== uid && !ehDono) {
    throw new HttpsError("permission-denied", "Essa reserva não é sua.");
  }
  if (!EM_ABERTO.includes(booking.status)) {
    throw new HttpsError("failed-precondition", "Essa reserva não está mais aberta.");
  }

  const shop = shopSnap.data() ?? {};
  const policies = shop.policies ?? {};
  const schedule = shop.schedule ?? {};

  const locale = localeDoDocumento(shop);
  const diaSemana = diaDaSemanaNoFuso(date, locale.timeZone);
  const abre: number[] = policies.openWeekdays ?? schedule.weekdays ?? [1, 2, 3, 4, 5, 6];
  if (!abre.includes(diaSemana)) {
    throw new HttpsError("failed-precondition", "A barbearia não abre neste dia.");
  }

  const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;
  if (instanteNoFuso(date, time, locale.timeZone).getTime() - Date.now() < minutosMinimos * 60_000) {
    throw new HttpsError(
      "failed-precondition",
      `Reservas precisam de ao menos ${minutosMinimos} minutos de antecedência.`
    );
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
  const slotMinutes: number = Number(schedule.slotMinutes) || 30;
  const duracaoDaReserva = Number(booking.durationMin) || slotMinutes;

  await db.runTransaction(async (tx) => {
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
      (request.auth?.token.barbershops as Record<string, string> | undefined)?.[barbershopId] ===
      "owner";

    if (booking.clientId !== uid && !ehDono) {
      throw new HttpsError("permission-denied", "Essa reserva não é sua.");
    }

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

    await bookingRef.update({
      status,
      cancelledAt: FieldValue.serverTimestamp(),
      refundedAmount: refund,
    });

    return { refund, horasAteOAtendimento: Math.round(horas) };
  }
);
