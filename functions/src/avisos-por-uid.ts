import { getFirestore } from "firebase-admin/firestore";

/**
 * Tira os avisos de uma conta numa barbearia (09/10).
 *
 * Quem perde o papel de DONO seguia recebendo, por dois canais, o que só o
 * dono vê: o celular continuava em `push_tokens` (papel `owner`, que recebe a
 * agenda inteira e o fechamento) e a conversa de Telegram ligada por ele
 * continuava como contato `dono`. Tirar o claim não alcança nenhum dos dois —
 * o envio lê estas coleções, não o token da conta.
 *
 * Apaga:
 * - os aparelhos da conta nesta barbearia;
 * - os contatos de Telegram do tipo `dono` que a conta ligou (`ligadoPor`) e o
 *   índice `telegram_chats` que aponta a conversa para esta barbearia.
 *
 * Contato de Telegram ligado antes de `ligadoPor` existir não tem como ser
 * atribuído a uma conta: o dono vê e desliga pela tela de Avisos.
 */
export async function limparAvisosDoUid(
  barbershopId: string,
  uid: string,
  db: FirebaseFirestore.Firestore = getFirestore()
): Promise<{ aparelhos: number; telegram: number }> {
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const aparelhos = await shopRef.collection("push_tokens").where("uid", "==", uid).get();
  const contatos = await shopRef
    .collection("telegram_contatos")
    .where("ligadoPor", "==", uid)
    .where("alvo", "==", "dono")
    .get();

  const lote = db.batch();
  for (const a of aparelhos.docs) lote.delete(a.ref);
  for (const c of contatos.docs) {
    lote.delete(c.ref);
    const indice = db.doc(`telegram_chats/${c.id}`);
    const apontaParaCa = (await indice.get()).get("barbershopId") === barbershopId;
    if (apontaParaCa) lote.delete(indice);
  }
  if (aparelhos.size + contatos.size > 0) await lote.commit();

  return { aparelhos: aparelhos.size, telegram: contatos.size };
}
