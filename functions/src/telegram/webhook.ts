import { onRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { timingSafeEqual } from "node:crypto";
import { motivoDeLeitura } from "../acesso";
import { aplicarRespostaDoEncaixe } from "../booking";
import { editar, enviar, responderToque, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } from "./api";
import { AVISOS_PADRAO, contatosRef, lojaDaConversa, type Contato } from "./contatos";
import {
  avisoDoToque,
  desfechoPeloStatusAtual,
  lerDadoDoBotao,
  textoDaConexao,
  textoDoEncaixeRespondido,
  type DesfechoDoToque,
} from "./mensagens";

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
    const trocouDeLoja = !!anterior && anterior !== barbershopId;
    const lojaAnteriorRef = trocouDeLoja ? db.doc(`barbershops/${anterior}`) : null;
    /* Leitura antes de qualquer escrita (regra da transação): o nome entra
     * na confirmação para a pessoa saber de ONDE saiu. */
    const lojaAnterior = lojaAnteriorRef ? await tx.get(lojaAnteriorRef) : null;

    /* Uma conversa, uma barbearia: ligar de novo em outra desliga a antiga.
     *
     * Era um `delete` calado: o dono da loja antiga perdia os avisos daquele
     * barbeiro e nada dizia por quê. Agora o contato fica DESLIGADO com o
     * motivo (a tela de Avisos lê esta coleção) e o fato vai para o
     * `audit_log` da loja antiga, que o dono também lê. */
    if (lojaAnteriorRef) {
      tx.set(
        contatosRef(lojaAnteriorRef).doc(chatId),
        {
          ativo: false,
          desligadoPor: "ligado em outra barbearia",
          desligadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(lojaAnteriorRef.collection("audit_log").doc(), {
        action: "telegram.desligado_por_outra_loja",
        by: `telegram:${chatId}`,
        at: FieldValue.serverTimestamp(),
        /* O id da outra loja não entra: é de outro controlador. */
        detail: { chatId, nome: String(c.get("nome") ?? "Equipe") },
      });
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
    return {
      contato,
      loja: String(shop.get("brand.name") ?? "sua barbearia"),
      lojaDesligada: lojaAnterior ? String(lojaAnterior.get("brand.name") ?? "outra barbearia") : null,
    };
  });

  if (!ligado) {
    await enviar(chatId, "Esse convite expirou ou já foi usado. Peça um novo no painel do Topete (vale 15 minutos).");
    return;
  }
  const doQue =
    ligado.contato.alvo === "dono"
      ? "pedidos de encaixe (com botão para aprovar), cancelamentos, novos agendamentos, a agenda do dia às 7h e o fechamento às 21h"
      : "os pedidos de encaixe da sua cadeira (com botão para aprovar), cancelamentos, novos agendamentos e a sua agenda do dia às 7h";
  await enviar(chatId, textoDaConexao({ ...ligado, doQue }));
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
  /* A cadeira do barbeiro ainda existe e está atendendo? (08/10) Remover ou
   * desligar o barbeiro desliga também o Telegram dele, mas a mensagem com o
   * botão continua na conversa — e o toque aprovaria um encaixe em nome de
   * quem já saiu. */
  if (contato.alvo !== "dono") {
    const cadeira = contato.staffId ? await shopRef.collection("staff").doc(String(contato.staffId)).get() : null;
    if (!cadeira?.exists || cadeira.get("active") === false) {
      await responderToque(cq.id, "Este Telegram não responde mais pela barbearia. Fale com o dono.");
      return;
    }
  }
  if (motivoDeLeitura(shopSnap.data())) {
    await responderToque(cq.id, "A barbearia está em modo leitura. Responda pelo painel.");
    return;
  }

  /* `responderToque` num `finally`: sem resposta, o Telegram deixa o botão
   * girando por segundos e o barbeiro toca de novo. Se algo abaixo lançar, a
   * resposta é a genérica — e o erro segue para o log do webhook. */
  let aviso = "Não consegui registrar agora. Responda pelo painel.";
  try {
    let desfecho: DesfechoDoToque;
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
      if (!(e instanceof HttpsError)) throw e;
      /* O pedido não estava mais aberto. Relê para dizer POR QUÊ: "já tinha
       * sido respondido" num pedido que o cliente cancelou ou que venceu
       * deixava o barbeiro achando que um colega já tinha falado com ele. */
      const agora = await shopRef.collection("bookings").doc(pedido.bookingId).get();
      desfecho = desfechoPeloStatusAtual(agora.get("status"));
    }
    aviso = avisoDoToque(desfecho);

    const loja = String(shopSnap.get("brand.name") ?? "Barbearia");
    if (cq.message?.message_id) {
      await editar(chatId, cq.message.message_id, textoDoEncaixeRespondido(reserva as never, loja, desfecho, contato.nome));
    }
  } finally {
    await responderToque(cq.id, aviso);
  }
}
