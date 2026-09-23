import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { decidirEfeito, estadoAindaVale } from "./financial-events";
import { featuresFor, toPlanId } from "./plans";

/**
 * O programa existe quando o DONO o ligou e o plano dele inclui fidelidade.
 *
 * Antes, bastava a barbearia existir: o app do cliente mostrava "faltam 10
 * para 1 corte grátis" com a política padrão da plataforma, sem o dono ter
 * decidido nada — a plataforma prometia um corte grátis em nome dele. E o
 * resgate funcionava até no plano sem fidelidade (rodada E2E de 23/09).
 *
 * `features` gravado vence o derivado do plano, como no resto do produto.
 */
export function fidelidadeAtiva(shop: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!shop) return false;
  const doPlano = shop.features?.loyalty ?? featuresFor(toPlanId(shop.plan)).loyalty;
  return doPlano === true && shop.policies?.loyalty?.enabled === true;
}

/** Meta de carimbos com piso: `stampsForReward: 0` liberava resgates sem fim. */
export function metaDeCarimbos(shop: FirebaseFirestore.DocumentData | undefined): number {
  const meta = Math.floor(Number(shop?.policies?.loyalty?.stampsForReward));
  return Number.isFinite(meta) && meta >= 1 ? meta : 10;
}

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

    if (efeito === "nada") return;
    const reservaRef = db.doc(`barbershops/${barbershopId}/bookings/${bookingId}`);

    if (efeito === "materializar") {
      /* Carimbo só com o programa ligado: ligar depois não pode transformar
       * o histórico inteiro em recompensas que o dono não planejou dar. */
      const shop = (await db.doc(`barbershops/${barbershopId}`).get()).data();
      if (!fidelidadeAtiva(shop)) return;
      /* Mesma guarda do gatilho financeiro: evento velho não age. Num
       * "concluir → desfazer" rápido, o crédito chegava depois do estorno e o
       * carimbo ficava para um atendimento desfeito. Quem decide é o estado
       * ATUAL da reserva, lido na transação que grava. */
      await db.runTransaction(async (tx) => {
        const atual = await tx.get(reservaRef);
        if (!estadoAindaVale("materializar", atual.get("status"))) return;
        tx.set(ref, {
          clientId: atual.get("clientId") ?? depois.clientId,
          kind: "credito" satisfies LoyaltyKind,
          stamps: 1,
          bookingId,
          at: FieldValue.serverTimestamp(),
        });
      });
      return;
    }

    /* Conclusão desfeita por correção do dono devolve o carimbo. Sem isso,
     * marcar como concluído por engano dá fidelidade de graça e não há como
     * desfazer. Cancelamento de atendimento realizado NÃO chega aqui — ver
     * `decidirEfeito`. */
    if (efeito === "reverter") {
      await db.runTransaction(async (tx) => {
        const atual = await tx.get(reservaRef);
        if (!estadoAindaVale("reverter", atual.get("status"))) return;
        tx.delete(ref);
      });
    }
  }
);

/**
 * Resgata a recompensa.
 *
 * A transação lê o saldo e grava o resgate junto: dois toques simultâneos no
 * botão não podem resgatar duas vezes com um saldo só.
 */
/**
 * O resgate é registrado por quem ENTREGA o corte grátis.
 *
 * Era o cliente quem apertava "resgatar" no app: a transação zerava os
 * carimbos dele e nada chegava ao dono — nenhum aviso, nenhuma marca na
 * agenda. O cliente perdia o saldo e pagava o corte inteiro no balcão. Um
 * resgate que só um dos dois lados enxerga não aconteceu.
 *
 * Agora o app do cliente diz "mostre no balcão", e o dono (ou a equipe)
 * registra aqui no momento em que entrega. Vale também para o cliente de
 * balcão, que não tem conta e nunca conseguia resgatar.
 */
export const redeemLoyaltyReward = onCall<{ barbershopId: string; clientId: string }>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const barbershopId = request.data?.barbershopId;
    const clientId = String(request.data?.clientId ?? "").trim();
    if (!barbershopId || !clientId) {
      throw new HttpsError("invalid-argument", "Informe a barbearia e o cliente.");
    }

    const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
      barbershopId
    ];
    if (papel !== "owner" && papel !== "staff") {
      throw new HttpsError(
        "permission-denied",
        "O resgate é registrado no balcão, por quem entrega a recompensa."
      );
    }

    const db = getFirestore();
    const shopRef = db.doc(`barbershops/${barbershopId}`);
    const txRef = shopRef.collection("loyalty_transactions");

    return db.runTransaction(async (tx) => {
      const shop = await tx.get(shopRef);
      if (!shop.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
      if (!fidelidadeAtiva(shop.data())) {
        throw new HttpsError("failed-precondition", "O programa de fidelidade está desligado.");
      }

      const meta = metaDeCarimbos(shop.data());
      const recompensa: string = shop.data()?.policies?.loyalty?.reward || "1 corte grátis";

      const snapshot = await tx.get(txRef.where("clientId", "==", clientId));
      const saldo = snapshot.docs.reduce((total, d) => total + (d.data().stamps ?? 0), 0);

      if (saldo < meta) {
        throw new HttpsError(
          "failed-precondition",
          `Faltam ${meta - saldo} carimbo(s) para resgatar.`
        );
      }

      tx.set(txRef.doc(), {
        clientId,
        kind: "resgate" satisfies LoyaltyKind,
        // Negativo: o saldo é a soma, então resgate subtrai.
        stamps: -meta,
        rewardLabel: recompensa,
        registradoPor: uid,
        at: FieldValue.serverTimestamp(),
      });

      return { saldoAnterior: saldo, saldoAtual: saldo - meta, recompensa };
    });
  }
);
