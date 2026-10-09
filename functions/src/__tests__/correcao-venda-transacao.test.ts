import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarCorrecaoDeVenda } from "../correcao-de-pagamento";
import { gravarVendaComTravaDeEstoque } from "../inventory";
import { gravarEstorno } from "../refunds";
import { valoresDoPagamento } from "../payments";
import type { PaymentFees, PaymentMethod } from "../financial-events";
import type { FormaDePagamento } from "../formas-de-pagamento";

/**
 * Corrigir a forma de pagamento de uma VENDA da Loja, contra o emulador.
 *
 * O que `correcao-de-pagamento.test.ts` prova nas regras puras (a janela, a
 * ordem das recusas) não prova o que ACONTECE com os documentos. Aqui:
 *
 *  1. pagamento e movimento terminam iguais no meio — nunca divergentes;
 *  2. o pagamento é o MESMO documento (`createdAt`, `grossAmount` e `date`
 *     parados), e só os campos da correção mudam;
 *  3. a taxa nova é a da forma escolhida, congelada, pela MESMA conta do resto
 *     do produto (`valoresDoPagamento`);
 *  4. preço, custo, quantidade, estoque e comissão NÃO mudam;
 *  5. venda devolvida (total ou parcial) não se corrige — e não deixa log;
 *  6. a janela é o mês corrente;
 *  7. idempotência: a mesma chave, um só `audit_log`, e o retry não vira erro.
 *
 * Exige o emulador:  npm run test:correcao-venda
 */

const PROJETO = "correcao-venda";
const SHOP = "barbearia-teste";
const HOJE = "2026-10-09";
const DIA_DA_VENDA = "2026-10-05";

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

const FORMAS: FormaDePagamento[] = [
  { id: "pix", label: "Pix", base: "pix", feePct: 0.99, active: true },
  { id: "cash", label: "Dinheiro", base: "cash", feePct: 0, active: true },
  { id: "credit_ap", label: "Crédito aproximação", base: "credit", feePct: 3.49, active: true },
  { id: "credit_chip", label: "Crédito chip", base: "credit", feePct: 4.19, active: true },
];

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

async function venderPomada(params: {
  metodo?: PaymentMethod;
  formaId?: string | null;
  date?: string;
  chave?: string;
  vendedor?: boolean;
}) {
  const r = await gravarVendaComTravaDeEstoque({
    db,
    shopRef: shopRef(),
    itens: [{ productId: "pomada", quantity: 2 }],
    paymentMethod: params.metodo ?? "pix",
    clientId: "c1",
    bookingId: null,
    date: params.date ?? DIA_DA_VENDA,
    chave: params.chave ?? "venda1",
    fees: TAXAS,
    formas: FORMAS,
    formaId: params.formaId === undefined ? "pix" : params.formaId,
    vendedor: params.vendedor
      ? { staffId: "s1", uid: null, staffName: "Léo", commissionPct: 40 }
      : undefined,
    extras: { registradoPor: "dono-1", createdAt: FieldValue.serverTimestamp() },
  });
  return r.movementIds[0];
}

function corrigir(params: {
  movementId: string | string[];
  metodo: PaymentMethod;
  formaId?: string | null;
  chave?: string;
  hoje?: string;
}) {
  return gravarCorrecaoDeVenda({
    db,
    shopRef: shopRef(),
    movementIds: Array.isArray(params.movementId) ? params.movementId : [params.movementId],
    metodo: params.metodo,
    fees: TAXAS,
    formas: FORMAS,
    formaId: params.formaId ?? null,
    hoje: params.hoje ?? HOJE,
    fuso: "America/Sao_Paulo",
    chave: params.chave ?? "k1",
    autor: "dono-1",
  });
}

const pagamentoRef = (movementId: string) =>
  shopRef().collection("payments").doc(`pagamento_venda_${movementId}`);
const movimentoRef = (movementId: string) => shopRef().collection("inventory_movements").doc(movementId);

async function logs() {
  const s = await shopRef().collection("audit_log").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:correcao-venda");
  }
  app = initializeApp({ projectId: PROJETO }, `correcao-venda-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["inventory_movements", "products", "payments", "commissions", "refunds", "audit_log"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({ locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" } });
  await shopRef()
    .collection("products")
    .doc("pomada")
    .set({ name: "Pomada", cost: 18, price: 45, stock: 10, minStock: 3 });
});

describe("corrige Pix → crédito numa venda", () => {
  it("pagamento e movimento terminam IGUAIS no meio", async () => {
    const mov = await venderPomada({});
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" });

    const p = (await pagamentoRef(mov).get()).data()!;
    const m = (await movimentoRef(mov).get()).data()!;
    expect(p.paymentMethod).toBe("credit");
    expect(m.paymentMethod).toBe("credit");
    expect(p.paymentFormId).toBe("credit_ap");
    expect(p.paymentFormLabel).toBe("Crédito aproximação");
  });

  it("a taxa é a da forma escolhida, pela mesma conta, e fica congelada", async () => {
    const mov = await venderPomada({});
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_chip" });

    const esperado = valoresDoPagamento({
      bruto: 90,
      metodo: "credit",
      fees: TAXAS,
      formas: FORMAS,
      formaId: "credit_chip",
    });
    const p = (await pagamentoRef(mov).get()).data()!;
    expect(p.feePct).toBe(4.19);
    expect(p.feeAmount).toBe(esperado.feeAmount);
    expect(p.netAmount).toBe(esperado.netAmount);
    expect(typeof p.netAmount).toBe("number");
  });

  it("é o MESMO documento: identidade, data e bruto parados", async () => {
    const mov = await venderPomada({});
    const antes = (await pagamentoRef(mov).get()).data()!;

    await corrigir({ movementId: mov, metodo: "cash", formaId: "cash" });

    const depois = (await pagamentoRef(mov).get()).data()!;
    expect(depois.createdAt).toEqual(antes.createdAt);
    expect(depois.grossAmount).toBe(antes.grossAmount);
    expect(depois.date).toBe(antes.date);
    expect(depois.origin).toBe("produto");
    expect(depois.movementId).toBe(mov);
    expect((await shopRef().collection("payments").get()).size).toBe(1);
  });

  it("🔒 preço, custo, quantidade, estoque e comissão NÃO mudam", async () => {
    const mov = await venderPomada({ vendedor: true });
    const mAntes = (await movimentoRef(mov).get()).data()!;
    const comissoesAntes = (await shopRef().collection("commissions").get()).docs.map((d) => d.data());

    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" });

    const mDepois = (await movimentoRef(mov).get()).data()!;
    for (const campo of ["unitPrice", "unitCost", "quantity", "value", "date", "staffId", "productId"]) {
      expect(mDepois[campo], campo).toEqual(mAntes[campo]);
    }
    expect((await shopRef().collection("products").doc("pomada").get()).get("stock")).toBe(8);
    const comissoesDepois = (await shopRef().collection("commissions").get()).docs.map((d) => d.data());
    expect(comissoesDepois).toEqual(comissoesAntes);
  });

  it("grava UM audit_log com o antes e o depois", async () => {
    const mov = await venderPomada({});
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" });

    const ls = await logs();
    expect(ls).toHaveLength(1);
    expect(ls[0].action).toBe("payment.corrigido");
    expect(ls[0].by).toBe("dono-1");
    const detail = ls[0].detail as { de: Record<string, unknown>; para: Record<string, unknown> };
    expect(detail.de.paymentMethod).toBe("pix");
    expect(detail.para.paymentMethod).toBe("credit");
    expect(detail.para.paymentFormId).toBe("credit_ap");
  });

  it("mesmo meio, forma diferente, é correção legítima (taxa muda)", async () => {
    const mov = await venderPomada({ metodo: "credit", formaId: "credit_ap" });
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_chip" });
    expect((await pagamentoRef(mov).get()).get("feePct")).toBe(4.19);
  });
});

describe("o que a correção recusa", () => {
  it("🔒 a mesma forma já registrada: nada a corrigir, e sem log", async () => {
    const mov = await venderPomada({});
    await expect(corrigir({ movementId: mov, metodo: "pix", formaId: "pix" })).rejects.toThrow(
      /já é a forma de pagamento registrada/
    );
    await expect(corrigir({ movementId: mov, metodo: "pix", formaId: null })).rejects.toThrow(
      /já é a forma de pagamento registrada/
    );
    expect(await logs()).toHaveLength(0);
  });

  it("🔒 venda devolvida por INTEIRO não se corrige", async () => {
    const mov = await venderPomada({});
    await gravarEstorno({
      db,
      shopRef: shopRef(),
      ref: { origem: "produto", movementId: mov },
      chave: "dev1",
      reason: "Correção de venda",
      date: HOJE,
    });

    await expect(corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" })).rejects.toThrow(
      /já teve devolução/
    );
    expect(await logs()).toHaveLength(0);
    expect((await pagamentoRef(mov).get()).get("paymentMethod")).toBe("pix");
  });

  it("🔒 venda devolvida em PARTE também não — o estorno guardou o meio antigo", async () => {
    const mov = await venderPomada({});
    await gravarEstorno({
      db,
      shopRef: shopRef(),
      ref: { origem: "produto", movementId: mov },
      chave: "dev1",
      reason: "Cliente devolveu uma",
      quantidadePedida: 1,
      date: HOJE,
    });

    await expect(corrigir({ movementId: mov, metodo: "cash", formaId: "cash" })).rejects.toThrow(
      /já teve devolução/
    );
    expect(await logs()).toHaveLength(0);
  });

  it("🔒 a janela é o mês corrente", async () => {
    const mov = await venderPomada({ date: "2026-08-10", chave: "antiga" });
    await expect(corrigir({ movementId: mov, metodo: "cash", formaId: "cash" })).rejects.toThrow(
      /outro mês/
    );
    expect(await logs()).toHaveLength(0);
  });

  it("venda inexistente e movimento que não é venda", async () => {
    await expect(corrigir({ movementId: "fantasma", metodo: "cash", formaId: "cash" })).rejects.toThrow(
      /não está mais registrada/
    );

    await shopRef()
      .collection("inventory_movements")
      .doc("compra1")
      .set({ productId: "pomada", kind: "compra", quantity: 5, unitCost: 18, date: DIA_DA_VENDA });
    await expect(corrigir({ movementId: "compra1", metodo: "cash", formaId: "cash" })).rejects.toThrow(
      /não é uma venda/
    );
    expect(await logs()).toHaveLength(0);
  });

  it("venda anterior ao registro de pagamentos não tem o que corrigir", async () => {
    await shopRef()
      .collection("inventory_movements")
      .doc("antiga")
      .set({ productId: "pomada", kind: "venda", quantity: 1, unitPrice: 45, value: 45, date: DIA_DA_VENDA });
    await expect(corrigir({ movementId: "antiga", metodo: "cash", formaId: "cash" })).rejects.toThrow(
      /anterior ao registro de pagamentos/
    );
  });
});

describe("idempotência", () => {
  it("a mesma chave corrige uma vez só, e o retry NÃO vira erro", async () => {
    const mov = await venderPomada({});
    const a = await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" });
    const b = await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap" });

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(b.para).toEqual(a.para);
    expect(await logs()).toHaveLength(1);
  });

  it("uma segunda correção, com outra chave, vale (credit_ap → credit_chip)", async () => {
    const mov = await venderPomada({});
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_ap", chave: "k1" });
    await corrigir({ movementId: mov, metodo: "credit", formaId: "credit_chip", chave: "k2" });

    expect((await pagamentoRef(mov).get()).get("feePct")).toBe(4.19);
    expect(await logs()).toHaveLength(2);
  });
});

describe("venda com vários produtos (carrinho)", () => {
  async function venderCarrinho() {
    await shopRef()
      .collection("products")
      .doc("cera")
      .set({ name: "Cera", cost: 10, price: 30, stock: 5, minStock: 1 });
    const r = await gravarVendaComTravaDeEstoque({
      db,
      shopRef: shopRef(),
      itens: [
        { productId: "pomada", quantity: 1 },
        { productId: "cera", quantity: 2 },
      ],
      paymentMethod: "pix",
      clientId: null,
      bookingId: null,
      date: DIA_DA_VENDA,
      chave: "carrinho1",
      fees: TAXAS,
      formas: FORMAS,
      formaId: "pix",
      extras: { createdAt: FieldValue.serverTimestamp() },
    });
    return r.movementIds;
  }

  it("corrige TODAS as linhas na mesma transação, com um log por linha", async () => {
    const ids = await venderCarrinho();
    const r = await corrigir({ movementId: ids, metodo: "credit", formaId: "credit_ap" });

    expect(r.itens).toHaveLength(2);
    for (const id of ids) {
      expect((await pagamentoRef(id).get()).get("paymentMethod")).toBe("credit");
      expect((await movimentoRef(id).get()).get("paymentMethod")).toBe("credit");
    }
    expect(await logs()).toHaveLength(2);
  });

  it("se UMA linha não pode ser corrigida, nenhuma é", async () => {
    const ids = await venderCarrinho();
    await gravarEstorno({
      db,
      shopRef: shopRef(),
      ref: { origem: "produto", movementId: ids[1] },
      chave: "dev1",
      reason: "Cliente devolveu",
      date: HOJE,
    });

    await expect(corrigir({ movementId: ids, metodo: "credit", formaId: "credit_ap" })).rejects.toThrow(
      /já teve devolução/
    );
    expect((await pagamentoRef(ids[0]).get()).get("paymentMethod")).toBe("pix");
    expect(await logs()).toHaveLength(0);
  });

  it("o retry do carrinho inteiro é idempotente", async () => {
    const ids = await venderCarrinho();
    await corrigir({ movementId: ids, metodo: "credit", formaId: "credit_ap" });
    const b = await corrigir({ movementId: ids, metodo: "credit", formaId: "credit_ap" });
    expect(b.repetida).toBe(true);
    expect(await logs()).toHaveLength(2);
  });
});
