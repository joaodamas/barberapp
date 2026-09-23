import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * A sessão atravessa do domínio da plataforma para o da barbearia.
 *
 * A sessão do Firebase é por ORIGEM: quem criava a barbearia em
 * `cortehub.com.br/criar-conta` era mandado para `navalha.cortehub.com.br` e
 * caía numa tela de login — no minuto de maior intenção do cadastro inteiro
 * (rodada E2E de 23/09). O comentário da tela dizia que ele "entrava já como
 * dono", e não entrava.
 *
 * O código é de uso ÚNICO, vale 2 minutos, vive numa coleção que as regras
 * negam a todo mundo e viaja no fragmento da URL (`#entrada=`), que o
 * navegador não envia a servidor nenhum. Trocado, vira um custom token.
 *
 * ⚠️ Em produção, `createCustomToken` exige que a conta de serviço das
 * functions tenha `roles/iam.serviceAccountTokenCreator` sobre si mesma. Sem
 * isso a troca falha — e a tela cai no login, que é o comportamento anterior.
 * Nada fica pior; só não fica melhor até o papel ser concedido.
 */
const VALIDADE_MS = 2 * 60_000;

export async function criarCodigoDeEntrada(uid: string, slug: string): Promise<string> {
  const codigo = randomBytes(24).toString("hex");
  await getFirestore()
    .doc(`entradas/${codigo}`)
    .set({ uid, slug, expiraEmMs: Date.now() + VALIDADE_MS, usado: false, criadoEm: FieldValue.serverTimestamp() });
  return codigo;
}

export const trocarCodigoDeEntrada = onCall<{ codigo: string; slug: string }>(async (request) => {
  const codigo = String(request.data?.codigo ?? "");
  const slug = String(request.data?.slug ?? "");
  if (!/^[0-9a-f]{48}$/.test(codigo)) throw new HttpsError("invalid-argument", "Código inválido.");

  const db = getFirestore();
  const ref = db.doc(`entradas/${codigo}`);

  const uid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data();
    /* A mesma resposta para "não existe", "já usado", "vencido" e "outra
     * barbearia": quem tenta adivinhar não aprende nada com o erro. */
    if (!snap.exists || !d || d.usado || Number(d.expiraEmMs) < Date.now() || d.slug !== slug) {
      throw new HttpsError("permission-denied", "Este link de entrada não vale mais. Entre com sua senha.");
    }
    tx.update(ref, { usado: true, usadoEm: FieldValue.serverTimestamp() });
    return String(d.uid);
  });

  return { token: await getAuth().createCustomToken(uid) };
});
