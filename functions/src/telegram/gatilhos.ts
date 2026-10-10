import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "../locale";
import { TELEGRAM_BOT_TOKEN, tokenDoBot } from "./api";
import { avisar, contatosDaLoja, desligarPorBloqueio, recebe, type Contato } from "./contatos";
import {
  dadoDoBotao,
  diaCurto,
  esc,
  textoDaAgendaDoDia,
  textoDoCancelamento,
  textoDoEncaixe,
  textoDoFechamento,
  textoDoNovoAgendamento,
  type ReservaResumo,
} from "./mensagens";
import { enviar } from "./api";

/**
 * Quando avisar. Cada gatilho sai cedo se o bot não está configurado ou se a
 * barbearia não tem ninguém ligado — o custo de uma barbearia sem Telegram é
 * uma leitura.
 */

const DOC = "barbershops/{barbershopId}/bookings/{bookingId}";
const ABERTOS = ["confirmed", "confirmed_by_client", "pending_payment"];

async function nomeDaLoja(shopRef: DocumentReference) {
  const s = await shopRef.get();
  return { nome: String(s.get("brand.name") ?? "Barbearia"), dados: s.data() ?? {} };
}

/** O que a reserva recém-criada pede de aviso. Puro, para teste. */
export function avisoDaCriacao(r: { status?: unknown; origin?: unknown; horarioFixoId?: unknown }): "encaixe" | "novo" | null {
  if (r.status === "fit_in_requested") return "encaixe";
  /* Só o que o CLIENTE marcou: o que o dono lançou no balcão ele já sabe, e
   * as 8 semanas do horário fixo virariam 8 avisos de uma vez. */
  if (ABERTOS.includes(String(r.status)) && r.origin === "app" && !r.horarioFixoId) return "novo";
  return null;
}

export const telegramAoCriarReserva = onDocumentCreated(
  { document: DOC, secrets: [TELEGRAM_BOT_TOKEN], region: "southamerica-east1" },
  async (event) => {
    const r = event.data?.data();
    if (!r || !tokenDoBot()) return;
    const tipo = avisoDaCriacao(r);
    if (!tipo) return;
    const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
    const contatos = await contatosDaLoja(shopRef);
    if (!contatos.some((c) => recebe(c, tipo, r.staffId))) return;
    const { nome } = await nomeDaLoja(shopRef);
    if (tipo === "encaixe") {
      await avisar({
        shopRef,
        contatos,
        tipo,
        staffId: r.staffId,
        html: textoDoEncaixe(r as ReservaResumo, nome),
        botoes: [
          [
            { texto: "✅ Aprovar", dado: dadoDoBotao("a", event.params.bookingId) },
            { texto: "✖️ Recusar", dado: dadoDoBotao("r", event.params.bookingId) },
          ],
        ],
      });
    } else {
      await avisar({ shopRef, contatos, tipo, staffId: r.staffId, html: textoDoNovoAgendamento(r as ReservaResumo, nome) });
    }
  }
);

/**
 * O CLIENTE remarcou o próprio horário (09/10): data ou hora mudaram e quem
 * gravou foi ele (`rescheduledBy`, gravado por `rescheduleBooking`). Remarcação
 * feita pelo painel a equipe já sabe; sem este aviso, o horário que o cliente
 * deixou livre e o que passou a ocupar só apareciam se alguém abrisse a agenda.
 */
export function remarcadaPeloCliente(
  antes: { date?: unknown; time?: unknown },
  depois: { date?: unknown; time?: unknown; status?: unknown; clientId?: unknown; rescheduledBy?: unknown }
): boolean {
  if (!depois.rescheduledBy || depois.rescheduledBy !== depois.clientId) return false;
  if (!ABERTOS.includes(String(depois.status))) return false;
  return antes.date !== depois.date || antes.time !== depois.time;
}

export function textoDaRemarcacao(
  antes: { date: string; time: string },
  r: ReservaResumo,
  loja: string
): string {
  return [
    `🔄 <b>Cliente remarcou</b> · ${esc(loja)}`,
    `${esc(r.clientName ?? "Cliente")}`,
    `De ${diaCurto(antes.date)} às ${esc(antes.time)}`,
    `Para ${diaCurto(r.date)} às ${esc(r.time)}${r.staffName ? ` · com ${esc(r.staffName)}` : ""}`,
    "",
    "O horário antigo ficou livre na agenda.",
  ].join("\n");
}

export const telegramAoMudarReserva = onDocumentUpdated(
  { document: DOC, secrets: [TELEGRAM_BOT_TOKEN], region: "southamerica-east1" },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois || !tokenDoBot()) return;
    if (remarcadaPeloCliente(antes, depois)) {
      const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
      const contatos = await contatosDaLoja(shopRef);
      /* Mesma preferência do cancelamento: é o outro aviso de "mexeram no horário". */
      if (!contatos.some((c) => recebe(c, "cancelamento", depois.staffId))) return;
      const { nome } = await nomeDaLoja(shopRef);
      await avisar({
        shopRef,
        contatos,
        tipo: "cancelamento",
        staffId: depois.staffId,
        html: textoDaRemarcacao(antes as { date: string; time: string }, depois as ReservaResumo, nome),
      });
      return;
    }
    /* Só o cancelamento do CLIENTE: o da loja foi a própria equipe que fez. */
    if (antes.status === depois.status || depois.status !== "cancelled_by_client") return;
    /* Pedido de encaixe desistido não é horário que ficou livre. */
    if (antes.status === "fit_in_requested") return;
    const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
    const contatos = await contatosDaLoja(shopRef);
    if (!contatos.some((c) => recebe(c, "cancelamento", depois.staffId))) return;
    const { nome } = await nomeDaLoja(shopRef);
    await avisar({
      shopRef,
      contatos,
      tipo: "cancelamento",
      staffId: depois.staffId,
      html: textoDoCancelamento(depois as ReservaResumo, nome),
    });
  }
);

/** Quantas lojas (ou conversas) andam juntas nas rotinas agendadas. */
export const TAMANHO_DO_LOTE = 10;

/**
 * Roda `fn` em lotes de `tamanho`, cada lote em paralelo, e nunca lança.
 *
 * As rotinas das 7h e das 21h eram um `for` com `await` em cada loja e em
 * cada conversa: com algumas dezenas de barbearias e o tempo-limite de 8 s
 * por envio do Telegram, o padrão de 60 s da função acabava no meio da lista
 * — e as últimas lojas nunca recebiam a agenda. Em lotes, o tempo cresce com
 * o número de LOTES, não de envios; `allSettled` faz um item que falha não
 * levar o lote junto. Lote, e não tudo de uma vez, para não abrir centenas de
 * conexões com o Telegram (que limita ~30 mensagens por segundo) e com o
 * Firestore ao mesmo tempo.
 */
export async function emLotes<T>(
  itens: readonly T[],
  tamanho: number,
  fn: (item: T) => Promise<unknown>
): Promise<PromiseSettledResult<unknown>[]> {
  const resultados: PromiseSettledResult<unknown>[] = [];
  const passo = Math.max(1, Math.floor(tamanho));
  for (let i = 0; i < itens.length; i += passo) {
    resultados.push(...(await Promise.allSettled(itens.slice(i, i + passo).map((x) => fn(x)))));
  }
  return resultados;
}

/**
 * Isola uma loja: o erro dela vai para o log com o id e não interrompe as
 * outras. Antes, uma reserva sem `time`, um fuso torto ou um Firestore lento
 * numa loja derrubava a rotina inteira, e todas as lojas DEPOIS dela ficavam
 * sem agenda e sem fechamento naquele dia — sem ninguém saber.
 */
async function porLoja(rotina: string, shopRef: DocumentReference, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    logger.error(`[telegram] ${rotina} falhou numa loja; as demais seguem`, {
      barbershopId: shopRef.id,
      rotina,
      erro: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Roda `fn` até `tentativas` vezes, esperando `esperaMs` entre elas, e lança o
 * último erro se todas falharem (aí a function falha e o log vira alerta).
 */
export async function comNovasTentativas<T>(fn: () => Promise<T>, tentativas: number, esperaMs: number): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tentativas) throw e;
      logger.warn(`[telegram] leitura inicial falhou (tentativa ${i} de ${tentativas}); tentando de novo`, {
        erro: e instanceof Error ? e.message : String(e),
      });
      await new Promise((ok) => setTimeout(ok, esperaMs));
    }
  }
}

/** Barbearias com alguém ligado e que estão funcionando. */
async function lojasComContatos(): Promise<Array<{ shopRef: DocumentReference; contatos: Contato[] }>> {
  const db = getFirestore();
  /* Esta leitura é o ponto único de falha da rodada (às 7h e às 21h): se ela
   * cai, nenhuma loja recebe nada. Um solavanco do Firestore se resolve em
   * segundos, então tenta de novo na própria rodada antes de desistir. */
  const lojas = await comNovasTentativas(() => db.collection("barbershops").get(), 3, 2_000);
  const out: Array<{ shopRef: DocumentReference; contatos: Contato[] }> = [];
  const abertas = lojas.docs.filter((l) => !["encerrada", "suspenso"].includes(String(l.get("status"))));
  await emLotes(abertas, TAMANHO_DO_LOTE, (l) =>
    porLoja("leitura dos contatos", l.ref, async () => {
      const contatos = await contatosDaLoja(l.ref);
      if (contatos.length) out.push({ shopRef: l.ref, contatos });
    })
  );
  return out;
}

export const telegramAgendaDoDia = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [TELEGRAM_BOT_TOKEN],
    /* O padrão (60 s) não cobre dezenas de lojas com envio de até 8 s cada. */
    timeoutSeconds: 540,
  },
  async () => {
    if (!tokenDoBot()) return;
    await emLotes(await lojasComContatos(), TAMANHO_DO_LOTE, ({ shopRef, contatos }) =>
      porLoja("agenda do dia", shopRef, async () => {
        const { nome, dados } = await nomeDaLoja(shopRef);
        const hoje = hojeNoFuso(localeDoDocumento(dados, shopRef.id).timeZone);
        const [reservasSnap, assinaturas] = await Promise.all([
          shopRef.collection("bookings").where("date", "==", hoje).get(),
          shopRef.collection("subscriptions").where("status", "==", "ativo").get(),
        ]);
        const mensalistas = new Set(assinaturas.docs.map((d) => d.get("clientId")));
        const doDia = reservasSnap.docs
          .map((d) => d.data())
          .filter((r) => ABERTOS.includes(String(r.status)))
          .sort((a, b) => String(a.time).localeCompare(String(b.time)))
          .map((r) => ({ ...(r as ReservaResumo), staffId: r.staffId, mensalista: mensalistas.has(r.clientId) }));

        /* Cada conversa recebe um texto próprio (o barbeiro só vê a cadeira
         * dele), por isso não dá para usar `avisar`, que manda o MESMO texto
         * a todos. Mas o tratamento de quem bloqueou o bot é o mesmo: antes,
         * a agenda ignorava o 403 e tentava de novo todo dia, para sempre. */
        await emLotes(
          contatos.filter((x) => x.ativo && x.avisos?.agenda !== false),
          TAMANHO_DO_LOTE,
          async (c) => {
            const minhas = c.alvo === "dono" ? doDia : doDia.filter((r) => r.staffId === c.staffId);
            const r = await enviar(
              c.chatId,
              textoDaAgendaDoDia({ loja: nome, data: hoje, reservas: minhas, deQuem: c.alvo === "dono" ? null : c.nome })
            );
            if (r.ok) return;
            if (r.bloqueado) await desligarPorBloqueio(shopRef, c.chatId);
            else logger.warn("[telegram] agenda do dia não saiu", { barbershopId: shopRef.id, chatId: c.chatId, erro: r.erro });
          }
        );
      })
    );
  }
);

/**
 * O total do fechamento: pagamentos com a data do ATENDIMENTO de hoje menos
 * os estornos lançados hoje. Puro, para teste.
 *
 * Sem o desconto do estorno, o dono que devolveu R$ 50 de manhã lia à noite
 * um total maior do que o caixa — e o caixa é o que ele confere na gaveta.
 */
export function totalDoFechamento(
  pagamentos: Array<{ grossAmount?: unknown; origin?: unknown }>,
  estornos: Array<{ grossAmount?: unknown }>
): { recebido: number; estornado: number; caixinha: number } {
  const soma = (xs: Array<{ grossAmount?: unknown }>) =>
    Math.round(xs.reduce((t, x) => t + (Number(x.grossAmount) || 0), 0) * 100) / 100;
  const estornado = soma(estornos);
  return {
    /* A caixinha ENTRA no recebido: é dinheiro que passou pela gaveta. */
    recebido: Math.round((soma(pagamentos) - estornado) * 100) / 100,
    estornado,
    /* E sai destacada, para o dono saber quanto dele é repasse ao barbeiro. */
    caixinha: soma(pagamentos.filter((p) => p.origin === "caixinha")),
  };
}

export const telegramFechamentoDoDia = onSchedule(
  {
    schedule: "0 21 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [TELEGRAM_BOT_TOKEN],
    timeoutSeconds: 540,
  },
  async () => {
    if (!tokenDoBot()) return;
    await emLotes(await lojasComContatos(), TAMANHO_DO_LOTE, ({ shopRef, contatos }) =>
      porLoja("fechamento do dia", shopRef, async () => {
        const donos = contatos.filter((c) => recebe(c, "fechamento", null));
        if (!donos.length) return;
        const { nome, dados } = await nomeDaLoja(shopRef);
        const hoje = hojeNoFuso(localeDoDocumento(dados, shopRef.id).timeZone);
        const [reservasSnap, pagamentosSnap, estornosSnap] = await Promise.all([
          shopRef.collection("bookings").where("date", "==", hoje).get(),
          shopRef.collection("payments").where("date", "==", hoje).get(),
          /* `refunds.date` é o dia em que o estorno foi feito. */
          shopRef.collection("refunds").where("date", "==", hoje).get(),
        ]);
        const status = reservasSnap.docs.map((d) => String(d.get("status")));
        const { recebido, estornado, caixinha } = totalDoFechamento(
          pagamentosSnap.docs.map((d) => d.data()),
          estornosSnap.docs.map((d) => d.data())
        );
        const html = textoDoFechamento({
          loja: nome,
          data: hoje,
          concluidos: status.filter((s) => s === "completed").length,
          faltas: status.filter((s) => s === "no_show").length,
          emAberto: status.filter((s) => ABERTOS.includes(s)).length,
          recebido,
          estornado,
          caixinha,
        });
        await avisar({ shopRef, contatos: donos, tipo: "fechamento", html });
      })
    );
  }
);
