import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { decidirEfeito } from "./financial-events";

/**
 * Fidelidade por transação, não por contagem.
 *
 * O saldo era calculado como `atendimentos % 10` na tela. Funciona até o
 * primeiro resgate: depois dele a conta continua subindo com o histórico e o
 * cliente "reganha" o prêmio sozinho. Também não sobrevive a estorno — o PRD
 * §9 exige que cancelamento remova os pontos correspondentes.
 *
 * Agora cada crédito e cada resgate é um documento. O saldo é a soma, e o
 * extrato existe de graça.
 */

export type LoyaltyKind = "credito" | "resgate" | "estorno";

/**
 * Credita um carimbo quando o atendimento é concluído.
 *
 * O id do documento é derivado da reserva (`credito_<bookingId>`), então
 * reprocessar o gatilho — que o Firestore faz em caso de retry — não credita
 * duas vezes. Idempotência por construção, não por checagem.
 */
export const creditLoyaltyOnCompletion = onDocumentUpdated(
  "barbershops/{barbershopId}/bookings/{bookingId}",
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    const { barbershopId, bookingId } = event.params;
    const db = getFirestore();
    const ref = db.doc(
      `barbershops/${barbershopId}/loyalty_transactions/credito_${bookingId}`
    );

    /* A MESMA regra do fato financeiro, e de propósito: o carimbo é a
     * contrapartida de um atendimento, então ele nasce e morre com o mesmo
     * critério. Duas regras diferentes para o mesmo fato divergem — e a
     * divergência apareceria como cliente sem carimbo de um corte que ele
     * fez, ou com carimbo de um que não fez. */
    const efeito = decidirEfeito(antes.status, depois.status);

    if (efeito === "materializar") {
      await ref.set({
        clientId: depois.clientId,
        kind: "credito" satisfies LoyaltyKind,
        stamps: 1,
        bookingId,
        at: FieldValue.serverTimestamp(),
      });
      return;
    }

    /* Conclusão desfeita por correção do dono devolve o carimbo. Sem isso,
     * marcar como concluído por engano dá fidelidade de graça e não há como
     * desfazer. Cancelamento de atendimento realizado NÃO chega aqui — ver
     * `decidirEfeito`. */
    if (efeito === "reverter") {
      await ref.delete().catch(() => undefined);
    }
  }
);

/**
 * Resgata a recompensa.
 *
 * A transação lê o saldo e grava o resgate junto: dois toques simultâneos no
 * botão não podem resgatar duas vezes com um saldo só.
 */
export const redeemLoyaltyReward = onCall<{ barbershopId: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const barbershopId = request.data?.barbershopId;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Informe a barbearia.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const txRef = shopRef.collection("loyalty_transactions");

  return db.runTransaction(async (tx) => {
    const shop = await tx.get(shopRef);
    if (!shop.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

    const policy = shop.data()?.policies?.loyalty ?? {};
    const meta: number = policy.stampsForReward ?? 10;
    const recompensa: string = policy.reward ?? "1 corte grátis";

    const snapshot = await tx.get(txRef.where("clientId", "==", uid));
    const saldo = snapshot.docs.reduce((total, d) => total + (d.data().stamps ?? 0), 0);

    if (saldo < meta) {
      throw new HttpsError(
        "failed-precondition",
        `Faltam ${meta - saldo} carimbo(s) para resgatar.`
      );
    }

    tx.set(txRef.doc(), {
      clientId: uid,
      kind: "resgate" satisfies LoyaltyKind,
      // Negativo: o saldo é a soma, então resgate subtrai.
      stamps: -meta,
      rewardLabel: recompensa,
      at: FieldValue.serverTimestamp(),
    });

    return { saldoAnterior: saldo, saldoAtual: saldo - meta, recompensa };
  });
});
