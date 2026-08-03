import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseButtonPayload, type ButtonAction } from "./templates";

/**
 * Webhook da Cloud API.
 *
 * É o outro lado dos botões. Sem ele, "Confirmo que vou" é um botão que o
 * cliente toca e nada acontece — o que é pior do que não ter botão nenhum,
 * porque ele acredita que avisou.
 *
 * Endpoint PÚBLICO: a Meta chama de fora, sem autenticação nossa. Por isso a
 * assinatura é conferida em toda requisição. Sem essa checagem, qualquer um
 * que descubra a URL cancela reserva de qualquer barbearia mandando um JSON.
 */

const VERIFY_TOKEN = defineSecret("WHATSAPP_VERIFY_TOKEN");
const APP_SECRET = defineSecret("WHATSAPP_APP_SECRET");

/**
 * Segredo sem espaço em volta.
 *
 * Segredo entra no Secret Manager por arquivo ou por colagem, e os dois trazem
 * `\n` no fim sem pedir licença. O valor guardado passa a ser "abc\n", a
 * comparação com o que a Meta manda falha, e o sintoma é um 403 na verificação
 * do webhook que parece problema DELES. Foi exatamente o que aconteceu aqui.
 */
function segredo(param: { value(): string }): string {
  return (param.value() ?? "").trim();
}

/** Status de reserva resultante de cada botão. */
const EFEITO: Record<ButtonAction, string | null> = {
  CONFIRM_BOOKING: "confirmed_by_client",
  CANCEL_BOOKING: "cancelled_by_client",
  APPROVE_FITIN: "confirmed",
  DECLINE_FITIN: "cancelled_by_shop",
  // Reagendar acontece no app: aqui só registramos que ele pediu.
  RESCHEDULE: null,
};

/**
 * Confere a assinatura `X-Hub-Signature-256` contra o corpo CRU.
 *
 * Tem que ser o corpo cru: reserializar o JSON muda espaços e ordem, e o hash
 * deixa de bater mesmo com a requisição legítima.
 */
function assinaturaConfere(rawBody: Buffer, cabecalho: string | undefined, segredo: string) {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const esperado = createHmac("sha256", segredo).update(rawBody).digest("hex");
  const recebido = cabecalho.slice("sha256=".length);
  const a = Buffer.from(esperado, "utf8");
  const b = Buffer.from(recebido, "utf8");
  // `timingSafeEqual` exige mesmo tamanho — comparar antes evita a exceção.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** De qual barbearia é o número que recebeu a mensagem. */
async function barbeariaDoNumero(phoneNumberId: string): Promise<string | null> {
  const doc = await getFirestore().doc(`whatsapp_numbers/${phoneNumberId}`).get();
  return doc.exists ? (doc.get("barbershopId") as string) : null;
}

export const whatsappWebhook = onRequest(
  { secrets: [VERIFY_TOKEN, APP_SECRET], cors: false },
  async (req, res) => {
    /* ---- Verificação de posse da URL (a Meta chama uma vez, no cadastro) ---- */
    if (req.method === "GET") {
      const modo = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const desafio = req.query["hub.challenge"];
      if (modo === "subscribe" && token === segredo(VERIFY_TOKEN)) {
        res.status(200).send(String(desafio ?? ""));
        return;
      }
      res.status(403).send("Forbidden");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    if (!assinaturaConfere(req.rawBody, req.get("x-hub-signature-256"), segredo(APP_SECRET))) {
      console.warn("[whatsapp] assinatura inválida — requisição descartada");
      res.status(401).send("Unauthorized");
      return;
    }

    /* A Meta reenvia o evento se não receber 200 rápido. Reconhecer primeiro e
     * processar depois evita que um erro nosso vire uma enxurrada de retries —
     * e cada retry reprocessaria o mesmo toque de botão. */
    res.status(200).send("EVENT_RECEIVED");

    try {
      await processar(req.body);
    } catch (error) {
      console.error("[whatsapp] falha ao processar evento", error);
    }
  }
);

async function processar(corpo: unknown) {
  const db = getFirestore();
  const entradas = (corpo as { entry?: unknown[] })?.entry ?? [];

  for (const entrada of entradas) {
    const mudancas = (entrada as { changes?: unknown[] })?.changes ?? [];
    for (const mudanca of mudancas) {
      const valor = (mudanca as { value?: Record<string, unknown> })?.value ?? {};
      const phoneNumberId = (valor.metadata as { phone_number_id?: string })?.phone_number_id;
      if (!phoneNumberId) continue;

      const barbershopId = await barbeariaDoNumero(phoneNumberId);
      if (!barbershopId) {
        console.warn(`[whatsapp] número ${phoneNumberId} não pertence a nenhuma barbearia`);
        continue;
      }

      /* ---- Confirmações de entrega e leitura ---- */
      for (const status of (valor.statuses as Record<string, unknown>[]) ?? []) {
        const messageId = status.id as string | undefined;
        if (!messageId) continue;
        const encontrados = await db
          .collection(`barbershops/${barbershopId}/whatsapp_messages`)
          .where("messageId", "==", messageId)
          .limit(1)
          .get();
        if (encontrados.empty) continue;
        await encontrados.docs[0].ref.update({
          entrega: status.status ?? null,
          entregaEm: FieldValue.serverTimestamp(),
          ...(status.errors ? { erroEntrega: JSON.stringify(status.errors) } : {}),
        });
      }

      /* ---- Mensagens recebidas ---- */
      for (const mensagem of (valor.messages as Record<string, unknown>[]) ?? []) {
        const de = String(mensagem.from ?? "");

        if (mensagem.type !== "button") {
          /* Texto livre do cliente abre a janela de 24h. Guardar é o que
           * permite o dono ver que alguém respondeu — responder de verdade é
           * outro passo, ainda não construído. */
          await db.collection(`barbershops/${barbershopId}/whatsapp_messages`).add({
            direcao: "recebida",
            de,
            tipo: mensagem.type ?? "desconhecido",
            texto: (mensagem.text as { body?: string })?.body ?? null,
            at: FieldValue.serverTimestamp(),
          });
          continue;
        }

        const payload = (mensagem.button as { payload?: string })?.payload ?? "";
        const acao = parseButtonPayload(payload);
        if (!acao) {
          console.warn(`[whatsapp] payload de botão ilegível: "${payload}"`);
          continue;
        }

        await aplicarBotao(barbershopId, acao.action, acao.refId, de);
      }
    }
  }
}

async function aplicarBotao(
  barbershopId: string,
  action: ButtonAction,
  bookingId: string,
  de: string
) {
  const db = getFirestore();
  const novoStatus = EFEITO[action];

  await db.collection(`barbershops/${barbershopId}/whatsapp_messages`).add({
    direcao: "recebida",
    tipo: "botao",
    de,
    acao: action,
    refId: bookingId,
    at: FieldValue.serverTimestamp(),
  });

  if (!novoStatus) return;

  const ref = db.doc(`barbershops/${barbershopId}/bookings/${bookingId}`);
  const reserva = await ref.get();
  if (!reserva.exists) {
    console.warn(`[whatsapp] botão ${action} para reserva inexistente ${bookingId}`);
    return;
  }

  /* Reserva já encerrada não volta atrás por toque de botão. O lembrete fica
   * no celular do cliente e ele pode tocar em "Confirmo" dias depois — sem
   * esta guarda, isso ressuscitaria uma reserva cancelada. */
  const atual = reserva.get("status");
  if (["completed", "cancelled_by_client", "cancelled_by_shop", "expired"].includes(atual)) {
    console.info(`[whatsapp] ${action} ignorado: reserva ${bookingId} está "${atual}"`);
    return;
  }

  await ref.update({
    status: novoStatus,
    respondidoPorWhatsappEm: FieldValue.serverTimestamp(),
  });
}
