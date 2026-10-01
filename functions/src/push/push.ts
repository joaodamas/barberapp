import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { createHash } from "node:crypto";
import { idSeguro, vinculosDe } from "../acesso";

/**
 * Notificação no celular, pelo app instalado (PWA) — 01/10/2026.
 *
 * Mesmos momentos do Telegram (encaixe, cliente cancelou, novo agendamento),
 * para quem não usa Telegram. Grátis: Firebase Cloud Messaging.
 *
 * `barbershops/{id}/push_tokens/{sha1(token)}` — um aparelho por documento,
 * gravado só por `registrarPush`, de quem é dono ou equipe DESTA barbearia.
 * O token não sai daqui: as regras fecham a coleção para leitura.
 *
 * iPhone só recebe com o app na tela de início (iOS 16.4+) — a tela explica.
 */

const idDoAparelho = (token: string) => createHash("sha1").update(token).digest("hex");

function exigirEquipe(request: { auth?: { uid: string } | null }, papel: string | undefined) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só a equipe da barbearia recebe avisos.");
  }
}

function tokenValido(t: unknown): string {
  const token = String(t ?? "");
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new HttpsError("invalid-argument", "Aparelho inválido.");
  }
  return token;
}

export const registrarPush = onCall<{ barbershopId: string; token: string; plataforma?: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const papel = vinculosDe(request)[barbershopId];
  exigirEquipe(request, papel);
  const token = tokenValido(request.data?.token);
  await getFirestore()
    .doc(`barbershops/${barbershopId}/push_tokens/${idDoAparelho(token)}`)
    .set({
      token,
      uid: request.auth!.uid,
      papel,
      plataforma: String(request.data?.plataforma ?? "").slice(0, 60),
      atualizadoEm: FieldValue.serverTimestamp(),
    });
  return { ok: true };
});

export const removerPush = onCall<{ barbershopId: string; token: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  exigirEquipe(request, vinculosDe(request)[barbershopId]);
  const token = tokenValido(request.data?.token);
  await getFirestore().doc(`barbershops/${barbershopId}/push_tokens/${idDoAparelho(token)}`).delete();
  return { ok: true };
});

/** Erros do FCM que querem dizer "esse aparelho não existe mais". */
const APARELHO_SUMIU = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Manda para todos os aparelhos da equipe. Nunca lança: o aviso não pode
 * derrubar o gatilho da reserva. Aparelho que sumiu é apagado.
 *
 * Só `data`, sem `notification`: quem desenha a notificação é o nosso
 * service worker (`public/sw.js`), o mesmo que já controla o app — assim não
 * precisa do service worker padrão do Firebase.
 */
export async function notificarEquipe(
  shopRef: DocumentReference,
  aviso: { titulo: string; corpo: string; url: string; tag?: string }
): Promise<number> {
  try {
    const snap = await shopRef.collection("push_tokens").get();
    if (snap.empty) return 0;
    const docs = snap.docs;
    const r = await getMessaging().sendEach(
      docs.map((d) => ({
        token: String(d.get("token")),
        data: { titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url, tag: aviso.tag ?? "" },
        webpush: { headers: { Urgency: "high", TTL: "3600" } },
      }))
    );
    await Promise.all(
      r.responses.map((resp, i) =>
        !resp.success && resp.error && APARELHO_SUMIU.has(resp.error.code) ? docs[i].ref.delete() : null
      )
    );
    return r.successCount;
  } catch (e) {
    console.warn("[push] falhou", e instanceof Error ? e.message : e);
    return 0;
  }
}
