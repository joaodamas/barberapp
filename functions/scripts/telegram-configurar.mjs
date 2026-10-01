/**
 * Liga o bot do Telegram ao Topete (01/10): registra o webhook, os comandos e
 * a descrição. Rode DEPOIS de gravar o token do @BotFather no Secret Manager.
 *
 *   node scripts/telegram-configurar.mjs [--projeto axon-barber]
 *
 * Lê TELEGRAM_BOT_TOKEN e TELEGRAM_WEBHOOK_SECRET do Secret Manager pelo
 * gcloud — nenhum dos dois aparece na tela. Um bot tem UM webhook: o bot de
 * produção aponta para o axon-barber. Para testar no DEV, use outro bot.
 */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const projeto = args.includes("--projeto") ? args[args.indexOf("--projeto") + 1] : "axon-barber";
const segredo = (nome) =>
  execFileSync("gcloud", ["secrets", "versions", "access", "latest", `--secret=${nome}`, `--project=${projeto}`], {
    encoding: "utf8",
  }).trim();

const token = segredo("TELEGRAM_BOT_TOKEN");
if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  console.error(`O TELEGRAM_BOT_TOKEN de ${projeto} ainda não é um token do @BotFather (está "${token.slice(0, 8)}…").`);
  process.exit(1);
}
const webhookSecret = segredo("TELEGRAM_WEBHOOK_SECRET");
const api = async (metodo, corpo = {}) => {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`${metodo}: ${j.description}`);
  return j.result;
};

const eu = await api("getMe");
console.log(`Bot: @${eu.username} (${eu.first_name}) → projeto ${projeto}`);

const url = `https://southamerica-east1-${projeto}.cloudfunctions.net/telegramWebhook`;
await api("setWebhook", {
  url,
  secret_token: webhookSecret,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await api("setMyCommands", { commands: [{ command: "parar", description: "Pausar os avisos" }] });
await api("setMyDescription", {
  description:
    "Avisos da sua barbearia no Topete: pedidos de encaixe com botão de aprovar, cancelamentos, novos agendamentos e a agenda do dia.",
});
await api("setMyShortDescription", { short_description: "Avisos da barbearia, do Topete." });

const info = await api("getWebhookInfo");
console.log(`Webhook: ${info.url}`);
console.log(`Pendentes: ${info.pending_update_count} · último erro: ${info.last_error_message ?? "nenhum"}`);
