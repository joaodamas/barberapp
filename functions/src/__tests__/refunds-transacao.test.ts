import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarVendaComTravaDeEstoque } from "../inventory";
import { gravarEstorno } from "../refunds";
import { documentoDePagamento } from "../payments";
import type { PaymentFees, PaymentMethod } from "../financial-events";

/**
 * D22 / D23 — o estorno contra o emulador.
 *
 * `refunds.test.ts` prova as regras puras. O que só aqui pode ser provado é a
 * régua inteira do estorno, que é sobre o que ACONTECE com os outros documentos:
 *
 *  1. o fato original continua intacto;
 *  2. o `PaymentDoc` original continua intacto;
 *  3. o estorno aponta a origem correta;
 *  4. o estorno não cria receita;
 *  5. o estorno não duplica taxa;
 *  6. venda estornada devolve estoque;
 *  7. estorno parcial não devolve mais do que foi vendido;
 *  8. reexecução é idempotente;
 *  9. dois estornos concorrentes não estouram o saldo;
 * 10. nada é implementado como `delete`.
 *
 * Exige o emulador:  npm run test:estornos
 */

const PROJETO = "estornos-d22";
const SHOP = "barbearia-teste";
const VENDA_EM = "2026-09-14";
const ESTORNO_EM = "2026-09-20";

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 };

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

/** Chama a MESMA transação da function, não uma cópia da sequência. */
function estornar(params: {
  ref: Parameters<typeof gravarEstorno>[0]["ref"];
  chave: string;
  reason?: string;
  valorPedido?: number | null;
  quantidadePedida?: number | null;
}) {
  return gravarEstorno({
    db,
    shopRef: shopRef(),
    ref: params.ref,
    chave: params.chave,
    reason: params.reason ?? "Cliente devolveu o produto",
    valorPedido: params.valorPedido ?? null,
    quantidadePedida: params.quantidadePedida ?? null,
    date: ESTORNO_EM,
  });
}

function vender(params: {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  chave: string;
  vendedor?: { staffId: string; uid: string | null; staffName: string | null; commissionPct: number };
}) {
  return gravarVendaComTravaDeEstoque({
    db,
    shopRef: shopRef(),
    itens: [{ productId: params.productId, quantity: params.quantity }],
    paymentMethod: params.paymentMethod,
    clientId: "c1",
    bookingId: null,
    date: VENDA_EM,
    chave: params.chave,
    fees: TAXAS,
    vendedor: params.vendedor,
  });
}

const doc = (col: string, id: string) => shopRef().collection(col).doc(id).get();

async function todos(col: string) {
  const s = await shopRef().collection(col).get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

async function estoqueDe(id: string) {
  return Number((await doc("products", id)).get("stock"));
}

/** Um pagamento de serviço semeado à mão, para exercer a origem `servico`. */
async function semearPagamentoDeServico(bookingId: string, bruto: number, metodo: PaymentMethod) {
  await shopRef()
    .collection("payments")
    .doc(`pagamento_${bookingId}`)
    .set(
      documentoDePagamento({
        ref: { origem: "servico", bookingId },
        clientId: "c1",
        date: VENDA_EM,
        bruto,
        metodo,
        fees: TAXAS,
      })
    );
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:estornos");
  }
  app = initializeApp({ projectId: PROJETO }, `estornos-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of [
    "inventory_movements",
    "products",
    "payments",
    "commissions",
    "refunds",
    "subscription_invoices",
  ]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({ timeZone: "America/Sao_Paulo", locale: "pt-BR" });
  await shopRef()
    .collection("products")
    .doc("pomada")
    .set({ name: "Pomada", cost: 18, price: 45, stock: 10, minStock: 3 });
});

/* ================================================================== */
/* 1 e 2 · o original fica intacto                                    */
/* ================================================================== */

describe("D22 · o fato original sobrevive ao estorno", () => {
  it("o movimento de venda continua lá, sem uma vírgula alterada", async () => {
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "credit", chave: "k1" });
    const mvId = v.movementIds[0];
    const antes = (await doc("inventory_movements", mvId)).data();

    await estornar({ ref: { origem: "produto", movementId: mvId }, chave: "e1" });

    const depois = (await doc("inventory_movements", mvId)).data();
    expect(depois).toEqual(antes);
    expect(depois?.kind).toBe("venda");
    expect(depois?.quantity).toBe(2);
  });

  it("o PaymentDoc original continua lá, com a taxa que congelou", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "credit", chave: "k1" });
    const mvId = v.movementIds[0];
    const pagId = `pagamento_venda_${mvId}`;
    const antes = (await doc("payments", pagId)).data();

    await estornar({ ref: { origem: "produto", movementId: mvId }, chave: "e1" });

    const depois = (await doc("payments", pagId)).data();
    expect(depois).toEqual(antes);
    expect(depois?.grossAmount).toBe(45);
    expect(depois?.feeAmount).toBe(1.57);
  });

  it("a comissão original continua lá — a reversão é uma linha NOVA", async () => {
    const v = await vender({
      productId: "pomada",
      quantity: 1,
      paymentMethod: "credit",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });
    const mvId = v.movementIds[0];

    await estornar({ ref: { origem: "produto", movementId: mvId }, chave: "e1" });

    const original = await doc("commissions", `comissao_venda_${mvId}`);
    expect(original.exists).toBe(true);
    expect(original.get("commissionAmount")).toBe(13.5);

    const reversao = await doc("commissions", `comissao_estorno_venda_${mvId}_e1`);
    expect(reversao.exists).toBe(true);
    expect(reversao.get("commissionAmount")).toBe(-13.5);
  });

  it("NADA é apagado: a contagem de documentos só CRESCE", async () => {
    /* O teste mais direto da régua. Se algum dia alguém "simplificar" o estorno
     * para um delete, esta contagem cai e o teste fecha a porta. */
    const v = await vender({
      productId: "pomada",
      quantity: 1,
      paymentMethod: "credit",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });

    const antes = {
      movimentos: (await todos("inventory_movements")).length,
      pagamentos: (await todos("payments")).length,
      comissoes: (await todos("commissions")).length,
    };

    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    expect((await todos("inventory_movements")).length).toBe(antes.movimentos + 1);
    expect((await todos("payments")).length).toBe(antes.pagamentos);
    expect((await todos("commissions")).length).toBe(antes.comissoes + 1);
    expect((await todos("refunds")).length).toBe(1);
  });
});

/* ================================================================== */
/* 3, 4 e 5 · o que o estorno afirma                                  */
/* ================================================================== */

describe("D22 · o estorno aponta a origem e não inventa dinheiro", () => {
  it("aponta o pagamento e o fato corretos", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "k1" });
    const mvId = v.movementIds[0];

    const r = await estornar({ ref: { origem: "produto", movementId: mvId }, chave: "e1" });

    const est = (await doc("refunds", r.refundId)).data();
    expect(est?.paymentId).toBe(`pagamento_venda_${mvId}`);
    expect(est?.movementId).toBe(mvId);
    expect(est?.origin).toBe("produto");
    expect(est?.bookingId).toBeUndefined();
  });

  it("NÃO cria receita: o estorno nunca vira PaymentDoc", async () => {
    /* Se o estorno gravasse em `payments`, `gatewayFeesTotal` e a receita
     * realizada o somariam como entrada — devolver dinheiro AUMENTARIA o
     * faturamento do mês. */
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "credit", chave: "k1" });
    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const pagamentos = await todos("payments");
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].id).toBe(`pagamento_venda_${v.movementIds[0]}`);
  });

  it("NÃO duplica taxa — e a perda da maquininha emerge da soma", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "credit", chave: "k1" });
    const r = await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const est = (await doc("refunds", r.refundId)).data();
    expect(est?.feeAmount).toBe(0);

    const pag = (await doc("payments", `pagamento_venda_${v.movementIds[0]}`)).data();
    const saldo =
      Math.round(((Number(pag?.netAmount) || 0) - (Number(est?.netAmount) || 0)) * 100) / 100;
    expect(saldo).toBe(-1.57);
    expect(saldo).toBe(-(Number(pag?.feeAmount) || 0));
  });

  it("preserva o meio de pagamento da entrada (N12)", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "debit", chave: "k1" });
    const r = await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });
    expect((await doc("refunds", r.refundId)).get("paymentMethod")).toBe("debit");
  });

  it("guarda a data do estorno E a do fato original", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "k1" });
    const r = await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const est = (await doc("refunds", r.refundId)).data();
    expect(est?.date).toBe(ESTORNO_EM);
    expect(est?.originalDate).toBe(VENDA_EM);
  });
});

/* ================================================================== */
/* 6 e 7 · o estoque                                                  */
/* ================================================================== */

describe("D23 · a mercadoria volta para a prateleira", () => {
  it("estorno total devolve todas as unidades", async () => {
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "cash", chave: "k1" });
    expect(await estoqueDe("pomada")).toBe(8);

    const r = await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    expect(r.quantidade).toBe(2);
    expect(await estoqueDe("pomada")).toBe(10);
  });

  it("grava um movimento de AJUSTE apontando a venda desfeita", async () => {
    /* Sem `refundOf`, uma devolução é indistinguível de recontagem ou quebra —
     * e as duas mexem no resultado em direções opostas. */
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "cash", chave: "k1" });
    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const ajuste = (await todos("inventory_movements")).find((m) => m.kind === "ajuste");
    expect(ajuste).toBeDefined();
    expect(ajuste?.quantity).toBe(2);
    expect(ajuste?.refundOf).toBe(v.movementIds[0]);
    expect(ajuste?.unitCost).toBe(18);
    expect(ajuste?.value).toBe(90);
  });

  it("o custo que volta é o CONGELADO da venda, não o do cadastro de hoje", async () => {
    /* Reposição mais cara entre a venda e o estorno não pode inflar o custo da
     * unidade que está voltando: o CMV subtrairia mais do que somou. */
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash", chave: "k1" });
    await shopRef().collection("products").doc("pomada").update({ cost: 30 });

    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const ajuste = (await todos("inventory_movements")).find((m) => m.kind === "ajuste");
    expect(ajuste?.unitCost).toBe(18);
  });

  it("estorno PARCIAL devolve só as unidades pedidas", async () => {
    const v = await vender({ productId: "pomada", quantity: 3, paymentMethod: "cash", chave: "k1" });
    expect(await estoqueDe("pomada")).toBe(7);

    const r = await estornar({
      ref: { origem: "produto", movementId: v.movementIds[0] },
      chave: "e1",
      quantidadePedida: 1,
    });

    expect(r.quantidade).toBe(1);
    expect(r.valor).toBe(45);
    expect(r.parcial).toBe(true);
    expect(await estoqueDe("pomada")).toBe(8);
  });

  it("NÃO devolve mais unidades do que foram vendidas", async () => {
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "cash", chave: "k1" });

    await expect(
      estornar({
        ref: { origem: "produto", movementId: v.movementIds[0] },
        chave: "e1",
        quantidadePedida: 3,
      })
    ).rejects.toThrow(/mais unidades do que foram vendidas/);

    expect(await estoqueDe("pomada")).toBe(8);
    expect(await todos("refunds")).toHaveLength(0);
  });

  it("a SOMA dos parciais não passa do vendido", async () => {
    const v = await vender({ productId: "pomada", quantity: 3, paymentMethod: "cash", chave: "k1" });
    const mv = { origem: "produto" as const, movementId: v.movementIds[0] };

    await estornar({ ref: mv, chave: "e1", quantidadePedida: 2 });
    await expect(estornar({ ref: mv, chave: "e2", quantidadePedida: 2 })).rejects.toThrow(
      /mais unidades do que foram vendidas/
    );

    expect(await estoqueDe("pomada")).toBe(9);
  });

  it("depois de devolver tudo, não devolve de novo", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash", chave: "k1" });
    const mv = { origem: "produto" as const, movementId: v.movementIds[0] };

    await estornar({ ref: mv, chave: "e1" });
    await expect(estornar({ ref: mv, chave: "e2" })).rejects.toThrow(/já voltaram para o estoque/);

    expect(await estoqueDe("pomada")).toBe(10);
  });

  it("o valor devolvido deriva da QUANTIDADE, e nunca é digitado", async () => {
    /* Se o valor fosse aceito da tela, daria para devolver R$ 90 por uma
     * unidade de R$ 45 — o estoque contaria uma história e o caixa outra. */
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "cash", chave: "k1" });

    const r = await gravarEstorno({
      db,
      shopRef: shopRef(),
      ref: { origem: "produto", movementId: v.movementIds[0] },
      chave: "e1",
      reason: "Devolveu uma",
      valorPedido: 90, // ignorado de propósito
      quantidadePedida: 1,
      date: ESTORNO_EM,
    });

    expect(r.valor).toBe(45);
  });
});

/* ================================================================== */
/* Comissão                                                           */
/* ================================================================== */

describe("D23 · a comissão volta somando", () => {
  it("o acerto do mês fecha em zero depois do estorno total", async () => {
    const v = await vender({
      productId: "pomada",
      quantity: 2,
      paymentMethod: "cash",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });

    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const soma = (await todos("commissions")).reduce(
      (s, c) => s + (Number(c.commissionAmount) || 0),
      0
    );
    expect(soma).toBe(0);
  });

  it("estorno parcial reverte só a parte devolvida", async () => {
    const v = await vender({
      productId: "pomada",
      quantity: 3,
      paymentMethod: "cash",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });

    const r = await estornar({
      ref: { origem: "produto", movementId: v.movementIds[0] },
      chave: "e1",
      quantidadePedida: 1,
    });

    expect(r.comissaoRevertida).toBe(-13.5);
    const soma = (await todos("commissions")).reduce(
      (s, c) => s + (Number(c.commissionAmount) || 0),
      0
    );
    expect(soma).toBe(27);
  });

  it("usa o percentual congelado NO DOCUMENTO, não o cadastro de hoje", async () => {
    /* O barbeiro mudou de 50% para 30% depois da venda. Reverter a 30% deixaria
     * saldo a pagar de uma venda que não existe mais. */
    const v = await vender({
      productId: "pomada",
      quantity: 1,
      paymentMethod: "cash",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });
    await shopRef().collection("staff").doc("leo").set({ name: "Léo", commissionPct: 30 });

    await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    const reversao = await doc("commissions", `comissao_estorno_venda_${v.movementIds[0]}_e1`);
    expect(reversao.get("commissionPct")).toBe(50);
    const soma = (await todos("commissions")).reduce(
      (s, c) => s + (Number(c.commissionAmount) || 0),
      0
    );
    expect(soma).toBe(0);
  });

  it("venda SEM vendedor não gera comissão negativa órfã", async () => {
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash", chave: "k1" });
    const r = await estornar({ ref: { origem: "produto", movementId: v.movementIds[0] }, chave: "e1" });

    expect(r.comissaoRevertida).toBe(0);
    expect(await todos("commissions")).toHaveLength(0);
  });
});

/* ================================================================== */
/* 8 e 9 · idempotência e concorrência                                */
/* ================================================================== */

describe("D22 · reexecutar não devolve duas vezes", () => {
  it("a mesma chave devolve o mesmo estorno, sem mexer no estoque", async () => {
    const v = await vender({ productId: "pomada", quantity: 2, paymentMethod: "credit", chave: "k1" });
    const mv = { origem: "produto" as const, movementId: v.movementIds[0] };

    const a = await estornar({ ref: mv, chave: "e1" });
    const b = await estornar({ ref: mv, chave: "e1" });

    expect(b.repetida).toBe(true);
    expect(b.refundId).toBe(a.refundId);
    expect(b.valor).toBe(a.valor);
    expect(await estoqueDe("pomada")).toBe(10);
    expect(await todos("refunds")).toHaveLength(1);
  });

  it("o retry NÃO grava uma segunda comissão negativa", async () => {
    const v = await vender({
      productId: "pomada",
      quantity: 1,
      paymentMethod: "cash",
      chave: "k1",
      vendedor: { staffId: "leo", uid: null, staffName: "Léo", commissionPct: 50 },
    });
    const mv = { origem: "produto" as const, movementId: v.movementIds[0] };

    await estornar({ ref: mv, chave: "e1" });
    await estornar({ ref: mv, chave: "e1" });

    expect(await todos("commissions")).toHaveLength(2);
    const soma = (await todos("commissions")).reduce(
      (s, c) => s + (Number(c.commissionAmount) || 0),
      0
    );
    expect(soma).toBe(0);
  });

  it("dois estornos CONCORRENTES não estouram o saldo", async () => {
    /* A query dos estornos anteriores roda dentro da transação, então ela entra
     * no conjunto de leitura e a segunda tentativa é serializada. Sem isso as
     * duas leriam "nada estornado" e devolveriam R$ 90 de uma venda de R$ 45. */
    const v = await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash", chave: "k1" });
    const mv = { origem: "produto" as const, movementId: v.movementIds[0] };

    const r = await Promise.allSettled([
      estornar({ ref: mv, chave: "e1" }),
      estornar({ ref: mv, chave: "e2" }),
    ]);

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(await estoqueDe("pomada")).toBe(10);

    const devolvido = (await todos("refunds")).reduce(
      (s, d) => s + (Number(d.grossAmount) || 0),
      0
    );
    expect(devolvido).toBe(45);
  });
});

/* ================================================================== */
/* As outras duas origens                                             */
/* ================================================================== */

describe("D22 · serviço e mensalidade", () => {
  it("estorna atendimento concluído sem tocar no pagamento dele", async () => {
    await semearPagamentoDeServico("bk1", 50, "pix");
    const antes = (await doc("payments", "pagamento_bk1")).data();

    const r = await estornar({
      ref: { origem: "servico", bookingId: "bk1" },
      chave: "e1",
      reason: "Cliente reclamou do corte",
    });

    expect(r.valor).toBe(50);
    expect((await doc("payments", "pagamento_bk1")).data()).toEqual(antes);

    const est = (await doc("refunds", r.refundId)).data();
    expect(est?.origin).toBe("servico");
    expect(est?.bookingId).toBe("bk1");
    expect(est?.movementId).toBeUndefined();
  });

  it("estorno PARCIAL de serviço deixa saldo para o restante", async () => {
    await semearPagamentoDeServico("bk1", 50, "pix");
    const bk = { origem: "servico" as const, bookingId: "bk1" };

    const a = await estornar({ ref: bk, chave: "e1", valorPedido: 20 });
    expect(a.restaDepois).toBe(30);

    const b = await estornar({ ref: bk, chave: "e2" });
    expect(b.valor).toBe(30);

    await expect(estornar({ ref: bk, chave: "e3" })).rejects.toThrow(/já foi totalmente devolvido/);
  });

  it("estorno de serviço NÃO mexe em comissão", async () => {
    /* O atendimento aconteceu e o barbeiro trabalhou. Devolver ao cliente é
     * decisão comercial da barbearia e não desfaz o serviço prestado — ao
     * contrário do produto, que volta para a prateleira. */
    await semearPagamentoDeServico("bk1", 50, "pix");
    await shopRef()
      .collection("commissions")
      .doc("comissao_bk1")
      .set({ origin: "servico", bookingId: "bk1", staffId: "leo", commissionAmount: 20 });

    await estornar({ ref: { origem: "servico", bookingId: "bk1" }, chave: "e1" });

    const comissoes = await todos("commissions");
    expect(comissoes).toHaveLength(1);
    expect(comissoes[0].commissionAmount).toBe(20);
  });

  it("estorna mensalidade paga sem reabrir a fatura", async () => {
    /* A fatura continua `paga`: ela FOI paga. O estorno é outro fato, e mudar o
     * status apagaria a informação de que houve pagamento. */
    await shopRef()
      .collection("subscription_invoices")
      .doc("f1")
      .set({ status: "paga", amount: 149, paidAt: VENDA_EM, paymentMethod: "credit" });
    await shopRef()
      .collection("payments")
      .doc("pagamento_fatura_f1")
      .set(
        documentoDePagamento({
          ref: { origem: "mensalidade", invoiceId: "f1" },
          clientId: "c1",
          date: VENDA_EM,
          bruto: 149,
          metodo: "credit",
          fees: TAXAS,
        })
      );

    const r = await estornar({
      ref: { origem: "mensalidade", invoiceId: "f1" },
      chave: "e1",
      reason: "Cancelou no meio do mês",
    });

    expect(r.valor).toBe(149);
    expect((await doc("subscription_invoices", "f1")).get("status")).toBe("paga");
    expect((await doc("refunds", r.refundId)).get("invoiceId")).toBe("f1");
  });
});

/* ================================================================== */
/* Recusas                                                            */
/* ================================================================== */

describe("D22 · o que o estorno recusa", () => {
  it("sem pagamento registrado, não há o que devolver", async () => {
    /* Atendimento nunca concluído e fatura ainda aberta caem aqui: o caminho é
     * cancelar, não estornar dinheiro que não entrou. */
    await expect(
      estornar({ ref: { origem: "servico", bookingId: "inexistente" }, chave: "e1" })
    ).rejects.toThrow(/Não há pagamento registrado/);

    expect(await todos("refunds")).toHaveLength(0);
  });

  it("recusa estornar um movimento que não é venda", async () => {
    await shopRef()
      .collection("inventory_movements")
      .doc("mv-compra")
      .set({ kind: "compra", productId: "pomada", quantity: 5, unitCost: 18, unitPrice: 0 });
    await shopRef()
      .collection("payments")
      .doc("pagamento_venda_mv-compra")
      .set(
        documentoDePagamento({
          ref: { origem: "produto", movementId: "mv-compra" },
          clientId: null,
          date: VENDA_EM,
          bruto: 90,
          metodo: "cash",
          fees: TAXAS,
        })
      );

    await expect(
      estornar({ ref: { origem: "produto", movementId: "mv-compra" }, chave: "e1" })
    ).rejects.toThrow(/não é uma venda/);
  });

  it("recusa venda que não existe", async () => {
    await expect(
      estornar({ ref: { origem: "produto", movementId: "fantasma" }, chave: "e1" })
    ).rejects.toThrow(/Não há pagamento registrado/);
  });
});
