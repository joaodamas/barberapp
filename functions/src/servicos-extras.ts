import { staffIdDeQuemChamou } from "./convite-equipe";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { aplicarCombosComCongelados, type ServicoDoCatalogo } from "./combos";

/**
 * Serviço a mais na hora de fechar (pedido do dono, 01/10).
 *
 * O cliente marcou corte e saiu com corte e barba. Antes, o barbeiro não tinha
 * como registrar: a regra do Firestore não deixa a tela mexer em `value` nem
 * `serviceIds` (é o que impede alguém de baixar o preço por fora). Aqui o
 * servidor soma, com o preço do CATÁLOGO para o extra — nunca um valor vindo
 * da tela —, e deixa o rastro em `servicosAdicionados`.
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
 * combo.
 *
 * O que JÁ estava na reserva fica com o preço gravado nela (revisão de 08/10):
 * recalcular tudo pelo catálogo de hoje subia o corte reajustado depois da
 * marcação e zerava o serviço que saiu do catálogo. A conta mora em
 * `aplicarCombosComCongelados`, a mesma que a tela usa para dizer "Fica R$ X".
 */
export function recalcularComExtras(
  reserva: { serviceIds?: unknown; serviceNames?: unknown; value?: unknown; durationMin?: unknown },
  extras: string[],
  catalogo: ServicoDoCatalogo[]
) {
  const r = aplicarCombosComCongelados(reserva, extras, catalogo);
  return {
    serviceIds: r.ids,
    serviceNames: r.nomes,
    value: r.valor,
    durationMin: r.duracao,
    combos: r.combos,
  };
}

/**
 * A transação, separada da porta de entrada para o teste de emulador provar o
 * que acontece com o DOCUMENTO (`servicos-extras-transacao.test.ts`).
 */
export async function gravarServicosAdicionados(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  bookingId: string;
  ids: string[];
  catalogo: ServicoDoCatalogo[];
  papel: "owner" | "staff";
  meuStaffId: string | null;
  uid: string;
}) {
  const { db, shopRef, bookingId, ids, catalogo, papel, meuStaffId, uid } = params;
  const ref = shopRef.collection("bookings").doc(bookingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Atendimento não encontrado.");
    const reserva = snap.data() ?? {};
    if (papel === "staff" && (!meuStaffId || reserva.staffId !== meuStaffId)) {
      throw new HttpsError("permission-denied", "Este atendimento é da agenda de outro barbeiro.");
    }
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
  const meuStaffId = papel === "staff" ? await staffIdDeQuemChamou(request, barbershopId) : null;

  const bookingId = idSeguro(request.data?.bookingId, "Atendimento");
  const pedidos = Array.isArray(request.data?.serviceIds) ? request.data.serviceIds : [];
  if (pedidos.length === 0 || pedidos.length > MAX_POR_VEZ) {
    throw new HttpsError("invalid-argument", "Escolha de 1 a 5 serviços.");
  }
  const ids = pedidos.map((s) => idSeguro(s, "Serviço"));

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const catalogoSnap = await shopRef.collection("services").get();
  const catalogo: ServicoDoCatalogo[] = catalogoSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServicoDoCatalogo, "id">) }));
  for (const id of ids) {
    const s = catalogo.find((c) => c.id === id);
    if (!s || s.active === false) throw new HttpsError("failed-precondition", "Serviço indisponível.");
  }

  return gravarServicosAdicionados({ db, shopRef, bookingId, ids, catalogo, papel, meuStaffId, uid });
});
