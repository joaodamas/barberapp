import { onRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { timingSafeEqual } from "node:crypto";
import { motivoDeLeitura } from "../acesso";
import { aplicarRespostaDoEncaixe } from "../booking";
import { editar, enviar, responderToque, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } from "./api";
import { AVISOS_PADRAO, contatosRef, lojaDaConversa, type Contato } from "./contatos";
import { lerDadoDoBotao, textoDoEncaixeRespondido, esc } from "./mensagens";

/**
 * O que o Telegram manda para o Topete: mensagens para o bot e toques nos
 * botões.
 *
 * Só aceita chamada com o cabeçalho secreto que o próprio Topete registrou no
 * `setWebhook` (`scripts/telegram-configurar.mjs`). Sem ele, qualquer um
 * poderia fingir ser o Telegram e aprovar encaixe.
 *
 * Responde 200 sempre que o pedido é legítimo, mesmo quando a ação não deu
 * certo: o Telegram reenvia o que recebeu erro, e um toque repetido não pode
 * virar duas respostas.
 */

function segredoConfere(recebido: unknown): boolean {
  const esperado = TELEGRAM_WEBHOOK_SECRET.value().trim();
  const r = typeof recebido === "string" ? recebido : "";
  if (!esperado || esperado === "pendente" || r.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(r), Buffer.from(esperado));
}

type Atualizacao = {
  message?: { chat?: { id?: number }; text?: string; from?: { first_name?: string } };
  callback_query?: {
    id: string;
    data?: string;
    from?: { first_name?: string };
    message?: { message_id?: number; chat?: { id?: number } };
  };
};

export const telegramWebhook = onRequest(
  { secrets: [TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET], region: "southamerica-east1" },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("use POST");
      return;
    }
    if (!segredoConfere(req.get("X-Telegram-Bot-Api-Secret-Token"))) {
      res.status(401).send("nao autorizado");
      return;
    }
    const u = (req.body ?? {}) as Atualizacao;
    try {
      if (u.callback_query) await tratarToque(u.callback_query);
      else if (u.message?.chat?.id && typeof u.message.text === "string") await tratarMensagem(u.message);
    } catch (e) {
      console.error("[telegram] webhook", e);
    }
    res.status(200).send("ok");
  }
);

async function tratarMensagem(m: NonNullable<Atualizacao["message"]>) {
  const chatId = String(m.chat!.id);
  const texto = m.text!.trim();

  if (texto === "/parar") {
    const idx = await lojaDaConversa(chatId).get();
    const loja = idx.get("barbershopId");
    if (loja) await contatosRef(getFirestore().doc(`barbershops/${loja}`)).doc(chatId).set({ ativo: false }, { merge: true });
    await enviar(chatId, "🔕 Avisos pausados. Para voltar, gere um novo convite no painel do Topete.");
    return;
  }

  const codigo = /^\/start\s+([A-Za-z0-9_-]{10,64})$/.exec(texto)?.[1];
  if (!codigo) {
    await enviar(
      chatId,
      "Oi! Eu sou o bot de avisos do <b>Topete</b>.\n\nPara conectar, o dono da barbearia abre o painel → <b>Ajustes → Avisos</b> e manda o convite para você."
    );
    return;
  }

  const db = getFirestore();
  const conviteRef = db.doc(`telegram_convites/${codigo}`);
  const ligado = await db.runTransaction(async (tx) => {
    const c = await tx.get(conviteRef);
    if (!c.exists || c.get("usadoEm") || Number(c.get("expiraEmMs")) < Date.now()) return null;
    const barbershopId = String(c.get("barbershopId"));
    const idxRef = lojaDaConversa(chatId);
    const idx = await tx.get(idxRef);
    const anterior = idx.get("barbershopId");
    const shopRef = db.doc(`barbershops/${barbershopId}`);
    const shop = await tx.get(shopRef);

    /* Uma conversa, uma barbearia: ligar de novo em outra desliga a antiga. */
    if (anterior && anterior !== barbershopId) {
      tx.delete(contatosRef(db.doc(`barbershops/${anterior}`)).doc(chatId));
    }
    const contato: Contato & Record<string, unknown> = {
      chatId,
      alvo: c.get("alvo") === "barbeiro" ? "barbeiro" : "dono",
      staffId: c.get("staffId") ?? null,
      nome: String(c.get("nome") ?? "Equipe"),
      ativo: true,
      avisos: AVISOS_PADRAO,
      ligadoEm: FieldValue.serverTimestamp(),
      ligadoPor: c.get("criadoPor") ?? null,
    };
    tx.set(contatosRef(shopRef).doc(chatId), contato);
    tx.set(idxRef, { barbershopId });
    tx.update(conviteRef, { usadoEm: FieldValue.serverTimestamp(), chatId });
    return { contato, loja: String(shop.get("brand.name") ?? "sua barbearia") };
  });

  if (!ligado) {
    await enviar(chatId, "Esse convite expirou ou já foi usado. Peça um novo no painel do Topete (vale 15 minutos).");
    return;
  }
  const doQue =
    ligado.contato.alvo === "dono"
      ? "pedidos de encaixe (com botão para aprovar), cancelamentos, novos agendamentos, a agenda do dia às 7h e o fechamento às 21h"
      : "os pedidos de encaixe da sua cadeira (com botão para aprovar), cancelamentos, novos agendamentos e a sua agenda do dia às 7h";
  await enviar(
    chatId,
    `✅ Pronto, ${esc(ligado.contato.nome)}! Este Telegram está ligado à <b>${esc(ligado.loja)}</b>.\n\nVocê vai receber aqui ${doQue}.\n\nPara pausar, mande /parar.`
  );
}

async function tratarToque(cq: NonNullable<Atualizacao["callback_query"]>) {
  const chatId = cq.message?.chat?.id ? String(cq.message.chat.id) : null;
  const pedido = lerDadoDoBotao(cq.data);
  if (!chatId || !pedido) {
    await responderToque(cq.id, "Botão inválido.");
    return;
  }
  const db = getFirestore();
  const barbershopId = (await lojaDaConversa(chatId).get()).get("barbershopId");
  if (!barbershopId) {
    await responderToque(cq.id, "Este Telegram não está mais ligado à barbearia.");
    return;
  }
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const [contatoSnap, reservaSnap, shopSnap] = await Promise.all([
    contatosRef(shopRef).doc(chatId).get(),
    shopRef.collection("bookings").doc(pedido.bookingId).get(),
    shopRef.get(),
  ]);
  const contato = contatoSnap.data() as Contato | undefined;
  if (!contato?.ativo || !reservaSnap.exists) {
    await responderToque(cq.id, "Não encontrei esse pedido.");
    return;
  }
  const reserva = reservaSnap.data()!;
  /* Barbeiro só responde o encaixe da própria cadeira. */
  if (contato.alvo !== "dono" && reserva.staffId !== contato.staffId) {
    await responderToque(cq.id, "Esse encaixe é de outro barbeiro.");
    return;
  }
  if (motivoDeLeitura(shopSnap.data())) {
    await responderToque(cq.id, "A barbearia está em modo leitura. Responda pelo painel.");
    return;
  }

  let desfecho: "confirmed" | "cancelled_by_shop" | "expired" | "ja_respondido";
  try {
    desfecho = (
      await aplicarRespostaDoEncaixe({
        barbershopId,
        bookingId: pedido.bookingId,
        aprovar: pedido.aprovar,
        por: `telegram:${chatId}`,
      })
    ).status;
  } catch (e) {
    if (e instanceof HttpsError) desfecho = "ja_respondido";
    else throw e;
  }

  const loja = String(shopSnap.get("brand.name") ?? "Barbearia");
  if (cq.message?.message_id) {
    await editar(chatId, cq.message.message_id, textoDoEncaixeRespondido(reserva as never, loja, desfecho, contato.nome));
  }
  await responderToque(
    cq.id,
    desfecho === "confirmed" ? "Encaixe aprovado." : desfecho === "cancelled_by_shop" ? "Encaixe recusado." : "Esse pedido não está mais aberto."
  );
}
