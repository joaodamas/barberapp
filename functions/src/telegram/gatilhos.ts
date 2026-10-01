import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "../locale";
import { TELEGRAM_BOT_TOKEN, tokenDoBot } from "./api";
import { avisar, contatosDaLoja, recebe, type Contato } from "./contatos";
import {
  dadoDoBotao,
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

export const telegramAoMudarReserva = onDocumentUpdated(
  { document: DOC, secrets: [TELEGRAM_BOT_TOKEN], region: "southamerica-east1" },
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois || !tokenDoBot()) return;
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

/** Barbearias com alguém ligado e que estão funcionando. */
async function lojasComContatos(): Promise<Array<{ shopRef: DocumentReference; contatos: Contato[] }>> {
  const db = getFirestore();
  const lojas = await db.collection("barbershops").get();
  const out: Array<{ shopRef: DocumentReference; contatos: Contato[] }> = [];
  for (const l of lojas.docs) {
    if (["encerrada", "suspenso"].includes(String(l.get("status")))) continue;
    const contatos = await contatosDaLoja(l.ref);
    if (contatos.length) out.push({ shopRef: l.ref, contatos });
  }
  return out;
}

export const telegramAgendaDoDia = onSchedule(
  {
    schedule: "0 7 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [TELEGRAM_BOT_TOKEN],
  },
  async () => {
    if (!tokenDoBot()) return;
    for (const { shopRef, contatos } of await lojasComContatos()) {
      const { nome, dados } = await nomeDaLoja(shopRef);
      const hoje = hojeNoFuso(localeDoDocumento(dados).timeZone);
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

      for (const c of contatos.filter((x) => x.ativo && x.avisos?.agenda !== false)) {
        const minhas = c.alvo === "dono" ? doDia : doDia.filter((r) => r.staffId === c.staffId);
        await enviar(
          c.chatId,
          textoDaAgendaDoDia({ loja: nome, data: hoje, reservas: minhas, deQuem: c.alvo === "dono" ? null : c.nome })
        );
      }
    }
  }
);

export const telegramFechamentoDoDia = onSchedule(
  {
    schedule: "0 21 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [TELEGRAM_BOT_TOKEN],
  },
  async () => {
    if (!tokenDoBot()) return;
    for (const { shopRef, contatos } of await lojasComContatos()) {
      const donos = contatos.filter((c) => recebe(c, "fechamento", null));
      if (!donos.length) continue;
      const { nome, dados } = await nomeDaLoja(shopRef);
      const hoje = hojeNoFuso(localeDoDocumento(dados).timeZone);
      const [reservasSnap, pagamentosSnap] = await Promise.all([
        shopRef.collection("bookings").where("date", "==", hoje).get(),
        shopRef.collection("payments").where("date", "==", hoje).get(),
      ]);
      const status = reservasSnap.docs.map((d) => String(d.get("status")));
      const html = textoDoFechamento({
        loja: nome,
        data: hoje,
        concluidos: status.filter((s) => s === "completed").length,
        faltas: status.filter((s) => s === "no_show").length,
        emAberto: status.filter((s) => ABERTOS.includes(s)).length,
        recebido: pagamentosSnap.docs.reduce((t, d) => t + (Number(d.get("grossAmount")) || 0), 0),
      });
      await avisar({ shopRef, contatos: donos, tipo: "fechamento", html });
    }
  }
);
