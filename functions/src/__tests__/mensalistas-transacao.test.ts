import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { emitirFaturasDaCompetencia } from "../mensalistas";
import { documentoDePagamento, idDoPagamento } from "../payments";

/**
 * G2 — a emissão de faturas, contra o emulador.
 *
 * `mensalistas.test.ts` prova as regras puras. O que só aqui se prova:
 *
 * 1. que rodar a rotina duas vezes **não cobra duas vezes**;
 * 2. que uma segunda passagem **não sobrescreve fatura já paga** — o pior
 *    resultado possível de um agendador que reexecuta;
 * 3. que assinatura cancelada para de gerar no mês seguinte, e não antes.
 *
 * Exige o emulador:  npm run test:mensalistas
 */

const PROJETO = "mensalistas-g2";
const SHOP = "barbearia-teste";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

type FaturaNoBanco = Record<string, unknown> & { id: string };

async function faturas(): Promise<FaturaNoBanco[]> {
  const s = await shopRef().collection("subscription_invoices").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as FaturaNoBanco);
}

function emitir(competencia: string) {
  return emitirFaturasDaCompetencia({ db, shopRef: shopRef(), competencia });
}

async function assinar(
  id: string,
  dados: {
    price: number;
    billingDay: number;
    startedAt: string;
    canceledAt?: string | null;
    status?: string;
  }
) {
  await shopRef()
    .collection("subscriptions")
    .doc(id)
    .set({
      clientId: `cliente-${id}`,
      clientName: `Cliente ${id}`,
      name: `Cliente ${id}`,
      planId: "plano-1",
      planName: "Ilimitado",
      status: dados.status ?? "ativo",
      canceledAt: dados.canceledAt ?? null,
      ...dados,
    });
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:mensalistas");
  }
  app = initializeApp({ projectId: PROJETO }, `mensalistas-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["subscriptions", "subscription_invoices", "payments"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({ timeZone: "America/Sao_Paulo", locale: "pt-BR" });
});

describe("G2 · emissão de faturas", () => {
  it("emite uma fatura por assinatura ativa", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await assinar("a2", { price: 99, billingDay: 20, startedAt: "2026-01-10" });

    const r = await emitir("2026-09");
    expect(r.emitidas).toBe(2);

    const fs = await faturas();
    expect(fs).toHaveLength(2);
    expect(fs.map((f) => f.dueDate).sort()).toEqual(["2026-09-05", "2026-09-20"]);
    expect(fs.every((f) => f.status === "aberta")).toBe(true);
    expect(fs.every((f) => f.paidAt === null)).toBe(true);
  });

  it("RODAR DE NOVO não cobra duas vezes", async () => {
    /* Retry de agendador é normal. Sem idempotência, o mensalista recebe duas
     * cobranças do mesmo mês e o MRR do mês dobra. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });

    const primeira = await emitir("2026-09");
    const segunda = await emitir("2026-09");

    expect(primeira.emitidas).toBe(1);
    expect(segunda.emitidas).toBe(0);
    expect(segunda.jaExistiam).toBe(1);
    expect(await faturas()).toHaveLength(1);
  });

  it("a segunda passagem NÃO apaga o pagamento de uma fatura já paga", async () => {
    /* É o pior resultado possível de uma rotina que reexecuta: `set`
     * sobrescreveria `status`, `paidAt` e `paymentMethod`, e o dono voltaria a
     * ver como aberta uma mensalidade que ele já recebeu. Por isso `create`. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");

    const [f] = await faturas();
    await shopRef()
      .collection("subscription_invoices")
      .doc(String(f.id))
      .update({ status: "paga", paidAt: "2026-09-04", paymentMethod: "pix" });

    await emitir("2026-09");

    const [depois] = await faturas();
    expect(depois.status).toBe("paga");
    expect(depois.paidAt).toBe("2026-09-04");
    expect(depois.paymentMethod).toBe("pix");
  });

  it("competências diferentes são faturas diferentes", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    await emitir("2026-10");

    const fs = await faturas();
    expect(fs).toHaveLength(2);
    expect(fs.map((f) => f.competencia).sort()).toEqual(["2026-09", "2026-10"]);
  });

  it("REAJUSTE não altera a fatura já emitida", async () => {
    /* A assinatura passa a valer 179; setembro continua 149. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    await shopRef().collection("subscriptions").doc("a1").update({ price: 179 });
    await emitir("2026-10");

    const fs = await faturas();
    const set = fs.find((f) => f.competencia === "2026-09")!;
    const out = fs.find((f) => f.competencia === "2026-10")!;
    expect(set.amount).toBe(149);
    expect(out.amount).toBe(179);
  });

  it("não emite antes de a assinatura começar", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-09-03" });
    expect((await emitir("2026-08")).emitidas).toBe(0);
    expect((await emitir("2026-09")).emitidas).toBe(1);
  });

  it("cancelada no meio do mês gera a fatura do mês, e para no seguinte", async () => {
    await assinar("a1", {
      price: 149,
      billingDay: 5,
      startedAt: "2026-01-10",
      canceledAt: "2026-09-28",
      status: "cancelado",
    });

    expect((await emitir("2026-09")).emitidas).toBe(1);
    expect((await emitir("2026-10")).emitidas).toBe(0);
  });

  it("duas emissões SIMULTÂNEAS geram uma fatura só", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });

    await Promise.allSettled([emitir("2026-09"), emitir("2026-09")]);
    expect(await faturas()).toHaveLength(1);
  });

  it("o id da fatura é derivado do fato — assinatura + competência", async () => {
    /* Idempotência por construção, e não por checagem: mesmo desenho de
     * `pagamento_{bookingId}` em `materializeFinancialsOnCompletion`. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    const [f] = await faturas();
    expect(f.id).toBe("fatura_a1_2026-09");
  });
});

/* ================================================================== */
/* G1.6 · o pagamento da mensalidade vira fato financeiro completo      */
/* ================================================================== */

const TAXAS = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

async function pagamentos() {
  const s = await shopRef().collection("payments").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

/**
 * Marca a fatura como paga pela MESMA rota do handler.
 *
 * O handler é um `onCall`, então a transação é replicada aqui — mas só a
 * sequência, e o que ela grava é verificado contra o mesmo `documentoDePagamento`
 * que a produção usa. O caminho completo passa pela tela, na verificação.
 */
async function receber(invoiceId: string, metodo: "pix" | "cash" | "debit" | "credit") {
  const ref = shopRef().collection("subscription_invoices").doc(invoiceId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get("status") === "paga") return { repetida: true };

    tx.update(ref, { status: "paga", paidAt: "2026-09-04", paymentMethod: metodo });
    tx.set(
      shopRef().collection("payments").doc(idDoPagamento({ origem: "mensalidade", invoiceId })),
      documentoDePagamento({
        ref: { origem: "mensalidade", invoiceId },
        clientId: (snap.get("clientId") as string | null) ?? null,
        date: "2026-09-04",
        bruto: Number(snap.get("amount")) || 0,
        metodo,
        fees: TAXAS,
      })
    );
    return { repetida: false };
  });
}

describe("G1.6 · pagamento da mensalidade", () => {
  it("gera pagamento com a taxa do método", async () => {
    /* Era D7/D21: a mensalidade guardava `paymentMethod` na fatura e não
     * gerava `payments`, então R$ 149 no crédito não debitava taxa nenhuma. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    const [f] = await faturas();

    await receber(String(f.id), "credit");

    const ps = await pagamentos();
    expect(ps).toHaveLength(1);
    expect(ps[0].origin).toBe("mensalidade");
    expect(ps[0].grossAmount).toBe(149);
    expect(ps[0].feePct).toBe(3.49);
    expect(ps[0].feeAmount).toBe(5.2);
  });

  it("o id deriva da fatura", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    const [f] = await faturas();
    await receber(String(f.id), "pix");

    const [p] = await pagamentos();
    expect(p.id).toBe(`pagamento_fatura_${f.id}`);
    expect(p.invoiceId).toBe(f.id);
  });

  it("RECEBER DE NOVO não cria segundo pagamento nem cobra a taxa duas vezes", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    const [f] = await faturas();

    await receber(String(f.id), "credit");
    const segunda = await receber(String(f.id), "credit");

    expect(segunda.repetida).toBe(true);
    const ps = await pagamentos();
    expect(ps).toHaveLength(1);
    expect(Number(ps[0].feeAmount)).toBe(5.2);
  });

  it("carrega o cliente da fatura", async () => {
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    const [f] = await faturas();
    await receber(String(f.id), "pix");

    const [p] = await pagamentos();
    expect(p.clientId).toBe("cliente-a1");
  });

  it("fatura não paga não deixa pagamento", async () => {
    /* Emitir é cobrança, não recebimento. O fato financeiro nasce no pagamento
     * — é a regra que separa contratado, faturado e recebido. */
    await assinar("a1", { price: 149, billingDay: 5, startedAt: "2026-01-10" });
    await emitir("2026-09");
    expect(await pagamentos()).toHaveLength(0);
  });
});
