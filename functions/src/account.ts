import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";

/**
 * Troca obrigatória da senha no primeiro acesso.
 *
 * Quando a conta do dono é criada por nós, a senha provisória viaja por
 * WhatsApp — ou seja, ela existe em pelo menos duas caixas de mensagem antes de
 * ser usada. O claim `mustChangePassword` prende a conta na tela de troca até
 * que essa senha morra.
 *
 * A troca acontece AQUI, e não com `updatePassword` no cliente, por um motivo
 * só: o mesmo passo precisa apagar o claim. Fossem duas operações, a segunda
 * poderia falhar e deixar o dono trancado numa tela de troca que ele já
 * cumpriu — ou, pior, uma função "limpa o claim" chamável sozinha, que
 * transformaria a trava em decoração.
 */

/** Regras mínimas — ditas em português na tela, não escondidas num regex. */
export function validatePassword(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/^\d+$/.test(senha)) return "Não use só números — misture letras.";
  if (/^(.)\1+$/.test(senha)) return "Essa senha é só um caractere repetido.";
  return null;
}

/**
 * Hash da senha provisória.
 *
 * Guardado no provisionamento para que a troca possa RECUSAR a mesma senha de
 * volta. Sem isso, "trocar a senha" seria satisfeito digitando de novo o que
 * chegou pelo WhatsApp, e a trava não protegeria nada.
 *
 * É sha256 sem salt de propósito: o segredo é descartável por construção — só
 * serve para comparar contra si mesmo, some no instante da troca, e o
 * documento vive numa coleção que as regras negam para todo mundo.
 */
export function hashInitialPassword(senha: string): string {
  return createHash("sha256").update(`barberapp:${senha}`).digest("hex");
}

export const changeInitialPassword = onCall<{ newPassword: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const nova = String(request.data?.newPassword ?? "");
  const problema = validatePassword(nova);
  if (problema) throw new HttpsError("invalid-argument", problema);

  const db = getFirestore();
  const perfilRef = db.doc(`platform_users/${uid}`);
  const perfil = await perfilRef.get();

  if (perfil.get("initialPasswordHash") === hashInitialPassword(nova)) {
    throw new HttpsError(
      "failed-precondition",
      "Escolha uma senha diferente da que enviamos para você."
    );
  }

  const auth = getAuth();
  await auth.updateUser(uid, { password: nova });

  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  delete claims.mustChangePassword;
  await auth.setCustomUserClaims(uid, claims);

  /* Derruba as sessões abertas com a senha antiga. Quem a tiver recebido junto
   * não continua dentro. O cliente entra de novo logo em seguida, com a senha
   * nova — o token novo nasce depois da revogação e não é atingido. */
  await auth.revokeRefreshTokens(uid);

  await perfilRef.set(
    {
      initialPasswordHash: FieldValue.delete(),
      passwordChangedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return { ok: true };
});
