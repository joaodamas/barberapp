import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";

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

export type Extra = { id: string; nome: string; preco: number; duracao: number };

/** O que muda na reserva. Puro, para teste. */
export function somarExtras(
  reserva: { value?: unknown; durationMin?: unknown; serviceIds?: unknown; serviceNames?: unknown },
  extras: Extra[]
) {
  const ids = Array.isArray(reserva.serviceIds) ? reserva.serviceIds.map(String) : [];
  const nomes = Array.isArray(reserva.serviceNames) ? reserva.serviceNames.map(String) : [];
  const valorExtra = extras.reduce((t, e) => t + e.preco, 0);
  return {
    serviceIds: [...ids, ...extras.map((e) => e.id)],
    serviceNames: [...nomes, ...extras.map((e) => e.nome)],
    value: Math.round(((Number(reserva.value) || 0) + valorExtra) * 100) / 100,
    durationMin: (Number(reserva.durationMin) || 0) + extras.reduce((t, e) => t + e.duracao, 0),
    valorExtra,
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

  const extras: Extra[] = [];
  for (const id of ids) {
    const s = await shopRef.collection("services").doc(id).get();
    if (!s.exists || s.get("active") === false) throw new HttpsError("failed-precondition", "Serviço indisponível.");
    extras.push({
      id,
      nome: String(s.get("name") ?? "Serviço"),
      preco: Number(s.get("price")) || 0,
      duracao: Number(s.get("durationMin")) || 0,
    });
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
    const novo = somarExtras(reserva, extras);
    tx.update(ref, {
      serviceIds: novo.serviceIds,
      serviceNames: novo.serviceNames,
      value: novo.value,
      durationMin: novo.durationMin,
      servicosAdicionados: FieldValue.arrayUnion({
        ids,
        nomes: extras.map((e) => e.nome),
        valor: novo.valorExtra,
        por: uid,
        emMs: Date.now(),
      }),
    });
    tx.set(shopRef.collection("audit_log").doc(), {
      action: "booking.servicos_adicionados",
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { bookingId, ids, valorExtra: novo.valorExtra, valorFinal: novo.value },
    });
    return { value: novo.value, serviceNames: novo.serviceNames, serviceIds: novo.serviceIds };
  });
});
