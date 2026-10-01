import { defineSecret } from "firebase-functions/params";

/**
 * Bot de avisos do Topete no Telegram (01/10/2026).
 *
 * Um bot só para a plataforma inteira. Ele fala com a EQUIPE da barbearia —
 * dono e barbeiros —, nunca com o cliente: o cliente brasileiro está no
 * WhatsApp, e é por lá que ele continua sendo avisado.
 *
 * Grátis: a API de bots do Telegram não cobra por mensagem nem pede
 * verificação de empresa. O token nasce no @BotFather e mora no Secret Manager.
 * Enquanto o segredo valer `pendente`, tudo aqui fica desligado sem erro.
 */
export const TELEGRAM_BOT_TOKEN = defineSecret("TELEGRAM_BOT_TOKEN");
/** Conferido no cabeçalho `X-Telegram-Bot-Api-Secret-Token` de cada chamada do webhook. */
export const TELEGRAM_WEBHOOK_SECRET = defineSecret("TELEGRAM_WEBHOOK_SECRET");

const TEMPO_LIMITE_MS = 8_000;

export function tokenDoBot(): string | null {
  const t = TELEGRAM_BOT_TOKEN.value().trim();
  return /^\d+:[A-Za-z0-9_-]{20,}$/.test(t) ? t : null;
}

export type Botao = { texto: string; dado: string };

export type ResultadoDoEnvio = { ok: true; messageId: number } | { ok: false; bloqueado: boolean; erro: string };

async function chamar(metodo: string, corpo: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const token = tokenDoBot();
  if (!token) return { status: 503, json: { ok: false, description: "bot não configurado" } };
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  const json = ((await r.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  return { status: r.status, json };
}

function teclado(botoes?: Botao[][]) {
  return botoes?.length
    ? { reply_markup: { inline_keyboard: botoes.map((linha) => linha.map((b) => ({ text: b.texto, callback_data: b.dado }))) } }
    : {};
}

/** Nunca lança: aviso que não saiu não pode derrubar o gatilho de uma reserva. */
export async function enviar(chatId: string | number, html: string, botoes?: Botao[][]): Promise<ResultadoDoEnvio> {
  try {
    const r = await chamar("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...teclado(botoes),
    });
    if (r.json.ok === true) {
      return { ok: true, messageId: Number((r.json.result as { message_id?: number })?.message_id) || 0 };
    }
    /* 403: a pessoa bloqueou o bot ou apagou a conversa. Não adianta insistir. */
    return { ok: false, bloqueado: r.status === 403, erro: String(r.json.description ?? r.status) };
  } catch (e) {
    return { ok: false, bloqueado: false, erro: e instanceof Error ? e.message : String(e) };
  }
}

export async function editar(chatId: string | number, messageId: number, html: string): Promise<void> {
  await chamar("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }).catch(() => undefined);
}

export async function responderToque(callbackId: string, texto: string): Promise<void> {
  await chamar("answerCallbackQuery", { callback_query_id: callbackId, text: texto.slice(0, 190) }).catch(() => undefined);
}

let nomeDoBot: string | null = null;

/** `@TopeteAvisosBot` → `TopeteAvisosBot`. Lido uma vez por instância. */
export async function usuarioDoBot(): Promise<string | null> {
  if (nomeDoBot) return nomeDoBot;
  const r = await chamar("getMe", {}).catch(() => null);
  const u = (r?.json.result as { username?: string } | undefined)?.username;
  nomeDoBot = typeof u === "string" && u ? u : null;
  return nomeDoBot;
}
