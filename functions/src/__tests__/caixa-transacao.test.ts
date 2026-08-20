import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  documentoDeCaixa,
  gravarLancamentoDeCaixa,
  saldoDeCaixa,
  type TipoDeCaixa,
} from "../caixa";
import type { PaymentMethod } from "../financial-events";

/**
 * D25 · o livro caixa, contra o emulador.
 *
 * `caixa.test.ts` prova as regras puras. O que só aqui pode ser provado é a
 * invariante que o item exige em primeiro lugar: **reexecutar a mesma operação
 * não cria uma segunda saída de caixa**. Dois toques no botão de sangria não
 * podem tirar R$ 400 da gaveta.
 *
 * Exige o emulador:  npm run test:caixa
 */

const PROJETO = "caixa-d25";
const SHOP = "barbearia-teste";
const HOJE = "2026-09-20";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

function lancar(params: {
  kind: TipoDeCaixa;
  valor: number;
  chave: string;
  direcao?: "entrada" | "saida";
  reason?: string;
  metodo?: PaymentMethod;
  staffId?: string | null;
}) {
  return gravarLancamentoDeCaixa({
    db,
    shopRef: shopRef(),
    chave: params.chave,
    documento: documentoDeCaixa({
      kind: params.kind,
      valor: params.valor,
      direcao: params.direcao,
      date: HOJE,
      reason: params.reason ?? "Movimento de teste",
      paymentMethod: params.metodo ?? "cash",
      staffId: params.staffId ?? null,
    }),
  });
}

type LancamentoNoBanco = {
  id: string;
  amount: number;
  kind?: string;
  direction?: string;
  reason?: string;
  date?: string;
  paymentMethod?: string;
  staffId?: string | null;
};

async function entradas(): Promise<LancamentoNoBanco[]> {
  const s = await shopRef().collection("cash_entries").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as LancamentoNoBanco);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:caixa");
  }
  app = initializeApp({ projectId: PROJETO }, `caixa-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  const snap = await db.collection(`barbershops/${SHOP}/cash_entries`).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  await shopRef().set({ timeZone: "America/Sao_Paulo", locale: "pt-BR" });
});

describe("D25 · IDEMPOTÊNCIA — o botão apertado duas vezes", () => {
  it("a mesma chave não tira dinheiro duas vezes", async () => {
    const a = await lancar({ kind: "sangria", valor: 200, chave: "k1" });
    const b = await lancar({ kind: "sangria", valor: 200, chave: "k1" });

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(b.entryId).toBe(a.entryId);
    expect(await entradas()).toHaveLength(1);
    expect(saldoDeCaixa(await entradas())).toBe(-200);
  });

  it("chaves diferentes SÃO dois lançamentos — duas sangrias iguais acontecem", async () => {
    /* Derivar o id do valor e da data fundiria duas retiradas legítimas de
     * R$ 200 no mesmo dia. A chave é o que separa repetição de recorrência. */
    await lancar({ kind: "sangria", valor: 200, chave: "k1" });
    await lancar({ kind: "sangria", valor: 200, chave: "k2" });

    expect(await entradas()).toHaveLength(2);
    expect(saldoDeCaixa(await entradas())).toBe(-400);
  });

  it("o retry NÃO reescreve o valor congelado", async () => {
    /* Valor congelado que aceita ser sobrescrito pela própria repetição não é
     * congelado. O segundo lançamento chega com outro valor de propósito. */
    await lancar({ kind: "sangria", valor: 200, chave: "k1", reason: "Depósito" });
    const b = await lancar({ kind: "sangria", valor: 999, chave: "k1", reason: "Outro motivo" });

    expect(b.repetida).toBe(true);
    expect(b.amount).toBe(-200);

    const [gravado] = await entradas();
    expect(gravado.amount).toBe(-200);
    expect(gravado.reason).toBe("Depósito");
  });

  it("dois lançamentos CONCORRENTES com a mesma chave viram um só", async () => {
    const r = await Promise.allSettled([
      lancar({ kind: "sangria", valor: 200, chave: "k1" }),
      lancar({ kind: "sangria", valor: 200, chave: "k1" }),
    ]);

    /* Um pode falhar no `create` e o outro sucedeu — o que não pode é a gaveta
     * perder R$ 400. */
    expect(r.filter((x) => x.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
    expect(await entradas()).toHaveLength(1);
    expect(saldoDeCaixa(await entradas())).toBe(-200);
  });
});

describe("D25 · o que fica gravado", () => {
  it("a sangria sai com sinal negativo e motivo", async () => {
    await lancar({ kind: "sangria", valor: 250, chave: "k1", reason: "Depósito no banco" });

    const [e] = await entradas();
    expect(e.kind).toBe("sangria");
    expect(e.direction).toBe("saida");
    expect(e.amount).toBe(-250);
    expect(e.reason).toBe("Depósito no banco");
    expect(e.date).toBe(HOJE);
  });

  it("o aporte entra com sinal positivo e preserva o meio", async () => {
    await lancar({
      kind: "aporte",
      valor: 1000,
      chave: "k1",
      reason: "Capital de giro",
      metodo: "pix",
    });

    const [e] = await entradas();
    expect(e.direction).toBe("entrada");
    expect(e.amount).toBe(1000);
    expect(e.paymentMethod).toBe("pix");
  });

  it("o pagamento de comissão guarda o beneficiário", async () => {
    await lancar({
      kind: "pagamento_comissao",
      valor: 180,
      chave: "k1",
      reason: "Acerto de setembro",
      metodo: "pix",
      staffId: "leo",
    });

    const [e] = await entradas();
    expect(e.staffId).toBe("leo");
    expect(e.amount).toBe(-180);
  });

  it("um dia inteiro fecha somando, sem consultar tipo nenhum", async () => {
    /* O teste de que o sinal mora no fato: nenhuma linha abaixo precisa saber
     * o que é sangria ou aporte para chegar no saldo. */
    await lancar({ kind: "troco_inicial", valor: 100, chave: "k1", reason: "Abertura" });
    await lancar({ kind: "aporte", valor: 500, chave: "k2", reason: "Do dono", metodo: "pix" });
    await lancar({ kind: "sangria", valor: 250, chave: "k3", reason: "Banco" });
    await lancar({
      kind: "pagamento_comissao",
      valor: 180,
      chave: "k4",
      reason: "Acerto",
      metodo: "pix",
      staffId: "leo",
    });
    await lancar({
      kind: "ajuste",
      valor: 5,
      direcao: "saida",
      chave: "k5",
      reason: "Falta na contagem",
    });

    expect(saldoDeCaixa(await entradas())).toBe(165);
  });
});

describe("D25 · EXCLUSIVIDADE em runtime", () => {
  it("a coleção só recebe os cinco tipos sem fato próprio", async () => {
    /* Complementa a prova de tipo em `caixa.test.ts`: aqui olha-se o que
     * REALMENTE foi parar no banco. Se algum caminho novo escrever uma venda
     * aqui, este teste vê. */
    await lancar({ kind: "sangria", valor: 100, chave: "k1" });
    await lancar({ kind: "aporte", valor: 100, chave: "k2" });
    await lancar({ kind: "troco_inicial", valor: 100, chave: "k3" });

    const proibidos = ["venda", "produto", "servico", "atendimento", "mensalidade", "compra", "despesa"];
    for (const e of await entradas()) {
      expect(proibidos).not.toContain(e.kind);
    }
  });
});
