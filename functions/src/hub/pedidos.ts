import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { idSeguro, vinculosDe } from "../acesso";
import { toPlanId, type PlanId } from "../plans";
import { montarEvento, type CorpoDoEvento } from "./contrato";
import { enfileirarSeNovo } from "./saida";

/**
 * O dono escolhe o plano ou pede para encerrar — e o Hub fica sabendo.
 *
 * Nenhuma das duas muda nada na barbearia. Quem manda no dinheiro é o Hub
 * (boleto do Inter): "escolheu o plano X" e "pediu para cancelar" viram
 * PENDÊNCIA no Command Center, e o operador aplica — o plano com
 * `definirPlano`, o cancelamento mudando o status no Hub, que volta para cá
 * por `/plataforma/status`. Se esta função mudasse `plan` sozinha, o Topete
 * seria um segundo caminho do dinheiro, e o cliente pagaria um valor por um
 * plano e usaria outro.
 *
 * O pedido fica em `barbershops/{id}/pedidos_plataforma/{eventoId}` (o dono
 * lê, para a tela dizer "pedido enviado"), e o aviso na caixa de saída, na
 * mesma transação. A tela que chama ainda não existe (29/09).
 */

async function registrarPedido(
  barbershopId: string,
  uid: string,
  montar: (shop: { slug: string; nome: string }) => CorpoDoEvento,
  exigirAberta: boolean
) {
  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  return db.runTransaction(async (tx) => {
    const shop = await tx.get(shopRef);
    if (!shop.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
    if (exigirAberta && shop.get("status") === "encerrada") {
      throw new HttpsError(
        "failed-precondition",
        "Esta conta foi encerrada. Reabra a conta antes de escolher um plano."
      );
    }

    const corpo = montar({
      slug: String(shop.get("slug") ?? ""),
      nome: String(shop.get("brand.name") ?? shop.get("slug") ?? ""),
    });
    const pedidoRef = shopRef.collection("pedidos_plataforma").doc(corpo.eventoId);
    const aviso = await enfileirarSeNovo(tx, db, corpo, { agoraMs: Date.now() });

    /* O mesmo pedido no mesmo dia (toque duplo, tela recarregada) é o mesmo
     * evento: não gera segunda pendência no Hub. */
    if (!aviso.novo) return { registrado: false, eventoId: corpo.eventoId };

    tx.set(pedidoRef, {
      tipo: corpo.evento,
      plano: corpo.plano ?? null,
      valor: corpo.valor ?? null,
      ciclo: corpo.ciclo ?? null,
      motivo: corpo.motivo ?? null,
      eventoId: corpo.eventoId,
      por: uid,
      em: FieldValue.serverTimestamp(),
    });
    aviso.gravar();
    tx.set(shopRef.collection("audit_log").doc(), {
      action: `barbershop.${corpo.evento}`,
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { plano: corpo.plano ?? null, valor: corpo.valor ?? null, motivo: corpo.motivo ?? null },
    });
    return { registrado: true, eventoId: corpo.eventoId };
  });
}

/** O dono escolhe o plano ao fim do teste. Vira `plano_escolhido` no Hub. */
export const escolherPlano = onCall<{ barbershopId: string; plano: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (vinculosDe(request)[barbershopId] !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia faz isso.");
  }

  /* Plano desconhecido para aqui, pela mesma razão de `definirPlano`: cair no
   * plano de entrada em silêncio mandaria ao Hub um pedido que o dono não fez. */
  const bruto = String(request.data?.plano ?? "");
  const plano: PlanId = toPlanId(bruto);
  if (plano !== bruto) {
    throw new HttpsError("invalid-argument", `Plano "${bruto}" não existe. Use: agenda, crescimento ou gestao.`);
  }

  const agora = new Date();
  const r = await registrarPedido(
    barbershopId,
    uid,
    (shop) =>
      montarEvento({ evento: "plano_escolhido", barbershopId, ...shop, ocorridoEm: agora, plano }),
    true
  );
  return { ok: true, plano, ...r };
});

/** O dono pede para encerrar. Vira `pediu_cancelamento` no Hub; nada é encerrado aqui. */
export const pedirCancelamento = onCall<{ barbershopId: string; motivo?: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (vinculosDe(request)[barbershopId] !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia faz isso.");
  }
  const motivo = String(request.data?.motivo ?? "").trim().slice(0, 300) || null;

  const agora = new Date();
  const r = await registrarPedido(
    barbershopId,
    uid,
    (shop) =>
      montarEvento({ evento: "pediu_cancelamento", barbershopId, ...shop, ocorridoEm: agora, motivo }),
    false
  );
  return { ok: true, ...r };
});
