import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

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
  serviceIds: string[];
  date: string;
  time: string;
  paymentMethod: "pix" | "cartao" | "local";
  isFitIn?: boolean;
  clientName?: string;
  clientWhatsapp?: string;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export const createBooking = onCall<CriarReservaInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para agendar.");

  const { barbershopId, serviceIds, date, time, paymentMethod, isFitIn } = request.data ?? {};

  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um serviço.");
  }
  if (!ISO_DATE.test(date ?? "")) throw new HttpsError("invalid-argument", "Data inválida.");
  if (!HORA.test(time ?? "")) throw new HttpsError("invalid-argument", "Horário inválido.");
  if (!["pix", "cartao", "local"].includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const shop = shopSnap.data() ?? {};
  const schedule = shop.schedule ?? {};
  const policies = shop.policies ?? {};

  /* ---- A barbearia abre nesse dia? ---- */
  const diaSemana = new Date(`${date}T12:00:00`).getDay();
  const abre: number[] = policies.openWeekdays ?? schedule.weekdays ?? [1, 2, 3, 4, 5, 6];
  if (!abre.includes(diaSemana)) {
    throw new HttpsError("failed-precondition", "A barbearia não abre neste dia.");
  }

  /* ---- Antecedência mínima ---- */
  const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;
  const inicio = new Date(`${date}T${time}:00`);
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

  /* ---- Pagamento antecipado ainda não existe ---- */
  if (paymentMethod !== "local") {
    throw new HttpsError(
      "failed-precondition",
      "Pagamento antecipado ainda não está disponível. Escolha pagar no salão."
    );
  }

  const status = isFitIn ? "fit_in_requested" : "confirmed";

  /* ---- Grava checando conflito na mesma transação ---- */
  const bookingRef = shopRef.collection("bookings").doc();

  await db.runTransaction(async (tx) => {
    /* Encaixe não disputa slot: ele existe justamente para pedir um horário
     * já ocupado. Reserva normal, sim. */
    if (!isFitIn) {
      const conflitos = await tx.get(
        shopRef
          .collection("bookings")
          .where("date", "==", date)
          .where("time", "==", time)
      );

      const ocupado = conflitos.docs.some((d) =>
        ["pending_payment", "confirmed", "confirmed_by_client", "completed", "no_show"].includes(
          d.data().status
        )
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
      clientName: String(request.data?.clientName ?? request.auth?.token.name ?? "Cliente"),
      clientWhatsapp: String(request.data?.clientWhatsapp ?? "").replace(/\D/g, ""),
      serviceIds,
      serviceNames: nomes,
      date,
      time,
      durationMin,
      value,
      paymentMethod,
      status,
      isFitIn: !!isFitIn,
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { bookingId: bookingRef.id, value, status, durationMin };
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

    const horas =
      (new Date(`${booking.date}T${booking.time}:00`).getTime() - Date.now()) / 3_600_000;

    let refund = 0;
    if (booking.paymentMethod !== "local") {
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
