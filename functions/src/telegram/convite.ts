import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { randomBytes } from "node:crypto";
import { exigirEdicao, idSeguro, vinculosDe } from "../acesso";
import { enviar, TELEGRAM_BOT_TOKEN, tokenDoBot, usuarioDoBot } from "./api";
import { AVISOS_PADRAO, contatosRef, lojaDaConversa, type TipoDeAviso } from "./contatos";

/**
 * O dono liga o Telegram dele, ou o de um barbeiro, à barbearia.
 *
 * Gera um convite de uso único (15 min) e devolve o link
 * `t.me/{bot}?start={codigo}`. Quem abre o link e toca em "Iniciar" manda o
 * código ao bot, e o webhook amarra aquela conversa à barbearia. O código não
 * é segredo de longa vida: vale uma vez e expira.
 */

const VALIDADE_MS = 15 * 60_000;

function exigirDono(request: { auth?: { uid: string } | null }, papel: string | undefined) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (papel !== "owner") throw new HttpsError("permission-denied", "Só o dono liga avisos no Telegram.");
}

export const criarConviteTelegram = onCall<{ barbershopId: string; alvo: "dono" | "barbeiro"; staffId?: string }>(
  { secrets: [TELEGRAM_BOT_TOKEN] },
  async (request) => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    exigirDono(request, vinculosDe(request)[barbershopId]);
    await exigirEdicao(barbershopId);

    if (!tokenDoBot()) return { configurado: false as const };
    const bot = await usuarioDoBot();
    if (!bot) return { configurado: false as const };

    const alvo = request.data?.alvo === "barbeiro" ? "barbeiro" : "dono";
    const db = getFirestore();
    let staffId: string | null = null;
    let nome = String(request.auth?.token?.name ?? "Dono");
    if (alvo === "barbeiro") {
      staffId = idSeguro(request.data?.staffId, "Barbeiro");
      const s = await db.doc(`barbershops/${barbershopId}/staff/${staffId}`).get();
      if (!s.exists || s.get("active") === false) throw new HttpsError("not-found", "Barbeiro não encontrado.");
      nome = String(s.get("name") ?? "Barbeiro");
    }

    const codigo = randomBytes(18).toString("base64url");
    await db.doc(`telegram_convites/${codigo}`).set({
      barbershopId,
      alvo,
      staffId,
      nome,
      criadoPor: request.auth!.uid,
      criadoEm: FieldValue.serverTimestamp(),
      expiraEmMs: Date.now() + VALIDADE_MS,
    });
    return { configurado: true as const, link: `https://t.me/${bot}?start=${codigo}`, nome };
  }
);

export const desligarTelegram = onCall<{ barbershopId: string; chatId: string }>(
  { secrets: [TELEGRAM_BOT_TOKEN] },
  async (request) => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    exigirDono(request, vinculosDe(request)[barbershopId]);
    const chatId = String(request.data?.chatId ?? "");
    if (!/^-?\d{1,20}$/.test(chatId)) throw new HttpsError("invalid-argument", "Conversa inválida.");

    const shopRef = getFirestore().doc(`barbershops/${barbershopId}`);
    await contatosRef(shopRef).doc(chatId).delete();
    const idx = await lojaDaConversa(chatId).get();
    if (idx.get("barbershopId") === barbershopId) await idx.ref.delete();
    if (tokenDoBot()) await enviar(chatId, "🔕 Este Telegram foi desconectado da barbearia. Você não recebe mais avisos.");
    return { ok: true };
  }
);

export const ajustarAvisosTelegram = onCall<{
  barbershopId: string;
  chatId: string;
  avisos: Partial<Record<TipoDeAviso, boolean>>;
}>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  exigirDono(request, vinculosDe(request)[barbershopId]);
  const chatId = String(request.data?.chatId ?? "");
  if (!/^-?\d{1,20}$/.test(chatId)) throw new HttpsError("invalid-argument", "Conversa inválida.");
  const avisos: Partial<Record<TipoDeAviso, boolean>> = {};
  for (const k of Object.keys(AVISOS_PADRAO) as TipoDeAviso[]) {
    const v = request.data?.avisos?.[k];
    if (typeof v === "boolean") avisos[k] = v;
  }
  const ref = contatosRef(getFirestore().doc(`barbershops/${barbershopId}`)).doc(chatId);
  if (!(await ref.get()).exists) throw new HttpsError("not-found", "Conversa não encontrada.");
  await ref.set({ avisos }, { merge: true });
  return { ok: true };
});
