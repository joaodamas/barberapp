import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { createHmac, timingSafeEqual } from "node:crypto";
import { motivoDeLeitura } from "../acesso";
import { EM_ABERTO } from "../anonimizacao";
import { aplicarRespostaDoEncaixe, desfechoDoCancelamento } from "../booking";
import { instanteNoFuso, localeDoDocumento } from "../locale";
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

/**
 * Status de reserva resultante de cada botão. Documenta a intenção; quem
 * grava é o caminho de cada ação em `aplicarBotao`, que confere o estado
 * atual numa transação. `null` = o botão não muda a reserva.
 */
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

/**
 * De qual barbearia é o evento que chegou.
 *
 * Com um número por barbearia, bastava o `phone_number_id`. Com um número ÚNICO
 * para toda a plataforma — que é o modelo que destrava o cadastro, porque é uma
 * verificação na Meta em vez de uma por barbearia — esse caminho aponta sempre
 * para a mesma. Cada tipo de evento passa a ter a sua origem de verdade:
 *
 * - **Botão**: a barbearia vem no payload, dentro da requisição assinada.
 * - **Entrega/leitura**: pelo id da mensagem, em `whatsapp_sent`.
 * - **Texto livre**: pela última conversa daquele telefone.
 *
 * `whatsapp_numbers` continua valendo como reserva, para quando uma barbearia
 * tiver o próprio número.
 */
async function barbeariaDoNumero(phoneNumberId: string): Promise<string | null> {
  const doc = await getFirestore().doc(`whatsapp_numbers/${phoneNumberId}`).get();
  return doc.exists ? ((doc.get("barbershopId") as string) ?? null) : null;
}

async function barbeariaDaMensagem(messageId: string) {
  const doc = await getFirestore().doc(`whatsapp_sent/${messageId}`).get();
  return doc.exists
    ? {
        barbershopId: doc.get("barbershopId") as string,
        messagePath: doc.get("messagePath") as string | undefined,
      }
    : null;
}

async function barbeariaDaConversa(telefone: string): Promise<string | null> {
  const doc = await getFirestore().doc(`whatsapp_conversations/${telefone}`).get();
  return doc.exists ? ((doc.get("barbershopId") as string) ?? null) : null;
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

    /* Processa ANTES de responder. Respondia primeiro: depois do `send` o
     * Cloud Functions pode congelar a CPU da instância, e o toque no botão
     * ficava pela metade — o cliente via "Cancelar" funcionar e a reserva
     * continuava de pé. O processamento é curto (algumas leituras e uma
     * transação), bem dentro do prazo da Meta.
     *
     * O erro nosso continua respondendo 200: a Meta reenvia o que recebe
     * erro, e cada reenvio reprocessaria o mesmo toque. A repetição é segura
     * de qualquer forma — as mudanças de status passam por transação que
     * relê o estado e não faz nada no que já mudou. */
    try {
      await processar(req.body);
    } catch (error) {
      console.error("[whatsapp] falha ao processar evento", error);
    }
    res.status(200).send("EVENT_RECEIVED");
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

      /** Barbearia dona do número, quando ela tem um só dela. */
      const doNumero = await barbeariaDoNumero(phoneNumberId);

      /* ---- Confirmações de entrega e leitura ---- */
      for (const status of (valor.statuses as Record<string, unknown>[]) ?? []) {
        const messageId = status.id as string | undefined;
        if (!messageId) continue;

        const enviada = await barbeariaDaMensagem(messageId);
        const atualizacao = {
          entrega: status.status ?? null,
          entregaEm: FieldValue.serverTimestamp(),
          ...(status.errors ? { erroEntrega: JSON.stringify(status.errors) } : {}),
        };

        // Caminho direto pelo índice — uma leitura, sem varrer coleção.
        if (enviada?.messagePath) {
          await db.doc(enviada.messagePath).update(atualizacao).catch(() => undefined);
          continue;
        }

        const shop = enviada?.barbershopId ?? doNumero;
        if (!shop) continue;
        const encontrados = await db
          .collection(`barbershops/${shop}/whatsapp_messages`)
          .where("messageId", "==", messageId)
          .limit(1)
          .get();
        if (!encontrados.empty) await encontrados.docs[0].ref.update(atualizacao);
      }

      /* ---- Mensagens recebidas ---- */
      for (const mensagem of (valor.messages as Record<string, unknown>[]) ?? []) {
        const de = String(mensagem.from ?? "");

        if (mensagem.type === "button") {
          const payload = (mensagem.button as { payload?: string })?.payload ?? "";
          const acao = parseButtonPayload(payload);
          if (!acao) {
            console.warn(`[whatsapp] payload de botão ilegível: "${payload}"`);
            continue;
          }
          /* A barbearia vem do PAYLOAD, não do número. É o que faz um número
           * único servir a plataforma inteira sem misturar agenda. */
          await aplicarBotao(acao.barbershopId, acao.action, acao.bookingId, de);
          continue;
        }

        /* Texto livre do cliente abre a janela de 24h. Guardar é o que permite
         * o dono ver que alguém respondeu — responder de verdade é outro passo,
         * ainda não construído. */
        const shop = (await barbeariaDaConversa(de)) ?? doNumero;
        if (!shop) {
          console.warn(`[whatsapp] resposta de ${de} sem conversa conhecida`);
          continue;
        }
        await db.collection(`barbershops/${shop}/whatsapp_messages`).add({
          direcao: "recebida",
          de,
          tipo: mensagem.type ?? "desconhecido",
          texto: (mensagem.text as { body?: string })?.body ?? null,
          at: FieldValue.serverTimestamp(),
        });
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

  /* ---- Quem tocou o botão tem a ver com esta reserva? ----
   *
   * O payload diz de qual reserva é o toque, mas não prova quem tocou. Faltava
   * conferir, e com um número ÚNICO para toda a plataforma isso passa a
   * importar: todos os clientes de todas as barbearias conversam com o MESMO
   * número, então uma mensagem que chegue com o payload de outra pessoa é
   * indistinguível da legítima só pelo conteúdo.
   *
   * A regra é simples: confirmar ou cancelar é do cliente da reserva; aprovar
   * ou recusar encaixe é de quem toca a barbearia. */
  const donoDaReserva = String(reserva.get("clientWhatsapp") ?? "").replace(/\D/g, "");
  const conf = await db.doc(`barbershops/${barbershopId}/private/whatsapp`).get();
  const shopDoc = await db.doc(`barbershops/${barbershopId}`).get();
  const numerosDaLoja = [conf.get("ownerWhatsapp"), shopDoc.get("contact.whatsapp")]
    .map((n) => String(n ?? "").replace(/\D/g, ""))
    .filter(Boolean);

  const ehDaLoja = numerosDaLoja.includes(de);
  const ehOCliente = !!donoDaReserva && donoDaReserva === de;
  const acaoDaLoja = action === "APPROVE_FITIN" || action === "DECLINE_FITIN";

  if (acaoDaLoja ? !ehDaLoja : !(ehOCliente || ehDaLoja)) {
    console.warn(
      `[whatsapp] ${action} de ${de} recusado: não é o cliente da reserva ${bookingId} nem a barbearia`
    );
    return;
  }

  /* Reserva já encerrada não volta atrás por toque de botão. O lembrete fica
   * no celular do cliente e ele pode tocar em "Confirmo" dias depois — sem
   * esta guarda, isso ressuscitaria uma reserva cancelada. (A guarda de
   * verdade é a transação de cada caminho abaixo, que relê o status: esta
   * leitura é de antes e só poupa trabalho.) */
  const atual = reserva.get("status");
  if (["completed", "cancelled_by_client", "cancelled_by_shop", "expired", "removido"].includes(atual)) {
    console.info(`[whatsapp] ${action} ignorado: reserva ${bookingId} está "${atual}"`);
    return;
  }

  /* Cada botão passa pela MESMA lógica do caminho do app. Era um `update`
   * direto com o status do mapa, lido antes e gravado sem transação: o
   * "Cancelar" de um atendimento que o dono concluía no mesmo instante
   * apagava a receita (o caso de `cancelBooking`), o cancelamento não
   * calculava devolução nenhuma, e "Confirmo" num pedido de encaixe o
   * virava `confirmed_by_client` — encaixe aprovado pelo próprio cliente. */
  try {
    if (action === "APPROVE_FITIN" || action === "DECLINE_FITIN") {
      if (motivoDeLeitura(shopDoc.data())) {
        console.info(`[whatsapp] ${action} ignorado: ${barbershopId} está em modo leitura`);
        return;
      }
      await aplicarRespostaDoEncaixe({
        barbershopId,
        bookingId,
        aprovar: action === "APPROVE_FITIN",
        por: `whatsapp:${de}`,
      });
    } else if (action === "CANCEL_BOOKING") {
      await cancelarPeloBotao({ barbershopId, bookingId, shop: shopDoc.data() ?? {}, peloDono: ehDaLoja && !ehOCliente });
    } else {
      await confirmarPeloBotao(ref);
    }
  } catch (e) {
    /* Status que mudou entre a leitura e a transação: não é falha, é o
     * toque chegando tarde. Fica no log como informação. */
    if (e instanceof HttpsError) {
      console.info(`[whatsapp] ${action} sem efeito na reserva ${bookingId}: ${e.message}`);
      return;
    }
    throw e;
  }
}

/** O que fica no lugar do status quando o cliente confirma presença pelo botão. */
export function confirmacaoPeloBotao(statusAtual: unknown): "confirmed_by_client" | null {
  /* Só a reserva CONFIRMADA ganha a confirmação do cliente. Pedido de
   * encaixe não (quem aprova é a barbearia), nem reserva esperando
   * pagamento (confirmar presença não paga). Já confirmada pelo cliente:
   * nada a fazer. */
  return statusAtual === "confirmed" ? "confirmed_by_client" : null;
}

async function confirmarPeloBotao(ref: FirebaseFirestore.DocumentReference) {
  await getFirestore().runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    const novo = confirmacaoPeloBotao(atual.get("status"));
    if (!novo) return;
    tx.update(ref, { status: novo, respondidoPorWhatsappEm: FieldValue.serverTimestamp() });
  });
}

/**
 * O cancelamento pelo botão, com a mesma conta e a mesma guarda de
 * `cancelBooking`: devolução pela política da barbearia
 * (`desfechoDoCancelamento`) e transação que relê o status e recusa o que
 * não está mais aberto.
 */
async function cancelarPeloBotao(p: {
  barbershopId: string;
  bookingId: string;
  shop: FirebaseFirestore.DocumentData;
  peloDono: boolean;
}) {
  const db = getFirestore();
  const ref = db.doc(`barbershops/${p.barbershopId}/bookings/${p.bookingId}`);
  const { timeZone } = localeDoDocumento(p.shop, p.barbershopId);
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    const status = atual.get("status");
    if (!(EM_ABERTO as readonly string[]).includes(status)) {
      throw new HttpsError("failed-precondition", `reserva está "${status}"`);
    }
    const horas =
      (instanteNoFuso(String(atual.get("date")), String(atual.get("time")), timeZone).getTime() - Date.now()) /
      3_600_000;
    const { refund, status: novo } = desfechoDoCancelamento({
      value: Number(atual.get("value")) || 0,
      paymentMethod: atual.get("paymentMethod"),
      horasAteOAtendimento: horas,
      politica: (p.shop.policies ?? {}).cancellation ?? {},
      peloDono: p.peloDono,
    });
    tx.update(ref, {
      status: novo,
      cancelledAt: FieldValue.serverTimestamp(),
      refundedAmount: refund,
      respondidoPorWhatsappEm: FieldValue.serverTimestamp(),
    });
  });
}
