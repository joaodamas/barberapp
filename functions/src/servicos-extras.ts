import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { aplicarCombos, type ServicoDoCatalogo } from "./combos";

/**
 * Serviço a mais na hora de fechar (pedido do dono, 01/10).
 *
 * O cliente marcou corte e saiu com corte e barba. Antes, o barbeiro não tinha
 * como registrar: a regra do Firestore não deixa a tela mexer em `value` nem
 * `serviceIds` (é o que impede alguém de baixar o preço por fora). Aqui o
 * servidor soma, com o preço do CATÁLOGO — nunca um valor vindo da tela —, e
 * deixa o rastro em `servicosAdicionados`.
 *
 * Só antes de concluir: o fato financeiro (pagamento, comissão) nasce na
 * conclusão, a partir de `value`. Depois de concluído, mexer no valor seria
 * reescrever dinheiro já registrado.
 */

const ABERTOS = ["confirmed", "confirmed_by_client", "pending_payment"];
const MAX_POR_VEZ = 5;

/**
 * O atendimento depois de somar os extras — com os COMBOS do catálogo
 * (01/10): marcou corte, somou barba, vira "Corte + barba" pelo preço do
 * combo. Recalcula a partir do catálogo, como a marcação faz.
 */
export function recalcularComExtras(
  reserva: { serviceIds?: unknown },
  extras: string[],
  catalogo: ServicoDoCatalogo[]
) {
  const atuais = Array.isArray(reserva.serviceIds) ? reserva.serviceIds.map(String) : [];
  const r = aplicarCombos([...atuais, ...extras], catalogo);
  const nomes = new Map(catalogo.map((s) => [s.id, String(s.name ?? "Serviço")]));
  return {
    serviceIds: r.ids,
    serviceNames: r.ids.map((id) => nomes.get(id) ?? "Serviço"),
    value: r.valor,
    durationMin: r.duracao,
    combos: r.combos,
  };
}

export const adicionarServicosAoAtendimento = onCall<{
  barbershopId: string;
  bookingId: string;
  serviceIds: string[];
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const papel = vinculosDe(request)[barbershopId];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia adiciona serviço.");
  }
  await exigirEdicao(barbershopId);

  const bookingId = idSeguro(request.data?.bookingId, "Atendimento");
  const pedidos = Array.isArray(request.data?.serviceIds) ? request.data.serviceIds : [];
  if (pedidos.length === 0 || pedidos.length > MAX_POR_VEZ) {
    throw new HttpsError("invalid-argument", "Escolha de 1 a 5 serviços.");
  }
  const ids = pedidos.map((s) => idSeguro(s, "Serviço"));

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const ref = shopRef.collection("bookings").doc(bookingId);

  const catalogoSnap = await shopRef.collection("services").get();
  const catalogo: ServicoDoCatalogo[] = catalogoSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServicoDoCatalogo, "id">) }));
  for (const id of ids) {
    const s = catalogo.find((c) => c.id === id);
    if (!s || s.active === false) throw new HttpsError("failed-precondition", "Serviço indisponível.");
  }

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Atendimento não encontrado.");
    const reserva = snap.data() ?? {};
    if (!ABERTOS.includes(String(reserva.status))) {
      throw new HttpsError(
        "failed-precondition",
        "Só dá para adicionar serviço antes de concluir. Atendimento concluído não muda de valor."
      );
    }
    const antes = Number(reserva.value) || 0;
    const novo = recalcularComExtras(reserva, ids, catalogo);
    tx.update(ref, {
      serviceIds: novo.serviceIds,
      serviceNames: novo.serviceNames,
      value: novo.value,
      durationMin: novo.durationMin,
      servicosAdicionados: FieldValue.arrayUnion({
        ids,
        valorAntes: antes,
        valorDepois: novo.value,
        combos: novo.combos,
        por: uid,
        emMs: Date.now(),
      }),
    });
    tx.set(shopRef.collection("audit_log").doc(), {
      action: "booking.servicos_adicionados",
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { bookingId, ids, valorAntes: antes, valorFinal: novo.value, combos: novo.combos },
    });
    return { value: novo.value, serviceNames: novo.serviceNames, serviceIds: novo.serviceIds, combos: novo.combos };
  });
});
