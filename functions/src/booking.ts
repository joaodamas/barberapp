import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { diaDaSemanaNoFuso, hojeNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";

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

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const shop = shopSnap.data() ?? {};
  const schedule = shop.schedule ?? {};
  const policies = shop.policies ?? {};

  /* Fuso da barbearia, não do servidor. A função roda em UTC: numa barbearia em
   * Dublin, `new Date("2026-08-04T15:00:00")` erra por uma hora e em São Paulo
   * por três — o bastante para recusar horário válido ou aceitar um que passou. */
  const locale = localeDoDocumento(shop);

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

  let staffId = String(request.data?.staffId ?? "");
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

  /* ---- Antecedência mínima ---- */
  const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;
  const inicio = instanteNoFuso(date, time, locale.timeZone);
  if (inicio.getTime() - Date.now() < minutosMinimos * 60_000) {
    throw new HttpsError(
      "failed-precondition",
      `Reservas precisam de ao menos ${minutosMinimos} minutos de antecedência.`
    );
  }

  /* ---- Preço e duração vêm do catálogo, nunca do cliente ---- */
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

  const status = isFitIn ? "fit_in_requested" : "confirmed";

  /* ---- Grava checando conflito na mesma transação ---- */
  const bookingRef = shopRef.collection("bookings").doc();

  await db.runTransaction(async (tx) => {
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
    const maxAtivas: number = policies.booking?.maxActivePerClient ?? 3;
    const hoje = hojeNoFuso(locale.timeZone);
    const minhas = await tx.get(shopRef.collection("bookings").where("clientId", "==", uid));
    const ativas = minhas.docs.filter((d) => {
      const b = d.data();
      return EM_ABERTO.includes(b.status) && String(b.date) >= hoje;
    }).length;

    if (ativas >= maxAtivas) {
      throw new HttpsError(
        "resource-exhausted",
        `Você já tem ${ativas} horário(s) marcado(s). Cancele um antes de marcar outro.`
      );
    }

    /* Encaixe não disputa slot: ele existe justamente para pedir um horário
     * já ocupado. Reserva normal, sim. */
    if (!isFitIn) {
      /* Conflito é por CADEIRA, não pela barbearia.
       *
       * Antes bastava `date + time`: três barbeiros às 15h viravam conflito e
       * dois terços da agenda sumiam. O filtro por `staffId` é em memória e não
       * na query de propósito — três cláusulas de igualdade exigiriam índice
       * composto, e índice faltando derruba a criação de reserva em produção. */
      const conflitos = await tx.get(
        shopRef
          .collection("bookings")
          .where("date", "==", date)
          .where("time", "==", time)
      );

      const ocupado = conflitos.docs.some(
        (d) => d.data().staffId === staffId && OCUPAM_SLOT.includes(d.data().status)
      );
      if (ocupado) {
        throw new HttpsError(
          "already-exists",
          "Esse horário acabou de ser reservado. Escolha outro, por favor."
        );
      }
    }

    tx.set(bookingRef, {
      clientId: uid,
      staffId,
      staffName: String(barbeiro.get("name") ?? ""),
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
      isFitIn: !!isFitIn,
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { bookingId: bookingRef.id, value, status, durationMin, staffId };
});

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

  await db.runTransaction(async (tx) => {
    const conflitos = await tx.get(
      shopRef.collection("bookings").where("date", "==", date).where("time", "==", time)
    );
    const ocupado = conflitos.docs.some(
      (d) =>
        d.id !== bookingId &&
        d.data().staffId === booking.staffId &&
        OCUPAM_SLOT.includes(d.data().status)
    );
    if (ocupado) {
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
    });
  });

  return { date, time };
});

/**
 * Cancelamento pelo cliente.
 *
 * A devolução é calculada aqui, com a política da barbearia — o cliente não
 * pode nem escolher a faixa nem gravar o status.
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

    const politica = (shopSnap.data()?.policies ?? {}).cancellation ?? {};
    const janelaIntegral: number = politica.fullRefundHours ?? 24;
    const janelaParcial: number = politica.partialRefundHours ?? 6;
    const taxaPct: number = politica.cancellationFeePct ?? 25;

    const { timeZone } = localeDoDocumento(shopSnap.data());
    const horas =
      (instanteNoFuso(booking.date, booking.time, timeZone).getTime() - Date.now()) / 3_600_000;

    let refund = 0;
    // Sem método gravado, o dinheiro nunca entrou — não há o que devolver.
    if (booking.paymentMethod) {
      if (horas >= janelaIntegral) refund = booking.value;
      else if (horas >= janelaParcial) {
        refund = Math.round(booking.value * (1 - taxaPct / 100) * 100) / 100;
      }
    }

    await bookingRef.update({
      status: ehDono && booking.clientId !== uid ? "cancelled_by_shop" : "cancelled_by_client",
      cancelledAt: FieldValue.serverTimestamp(),
      refundedAmount: refund,
    });

    return { refund, horasAteOAtendimento: Math.round(horas) };
  }
);
