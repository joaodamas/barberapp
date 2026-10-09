import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarAjusteDeEstoque, type MotivoDeAjuste, type PedidoDeAjuste } from "../ajuste-de-estoque";

/**
 * Ajustar o estoque, contra o emulador.
 *
 * `ajuste-de-estoque.test.ts` prova as regras puras. O que só aqui se prova:
 *
 * 1. saldo e movimento nascem JUNTOS — ou os dois, ou nenhum;
 * 2. o saldo nunca fica negativo, nem sob concorrência (duas saídas de 2 sobre
 *    um estoque de 3: uma passa, a outra é recusada);
 * 3. a mesma chave de repetição não ajusta duas vezes — e não vira erro;
 * 4. o custo é CONGELADO no movimento: mudar o cadastro depois não reescreve a
 *    perda;
 * 5. ajuste não é venda: não cria pagamento, comissão nem devolução.
 *
 * Exige o emulador:  npm run test:ajuste
 */

const PROJETO = "ajuste-estoque";
const SHOP = "barbearia-teste";
const HOJE = "2026-10-09";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

function ajustar(params: {
  productId?: string;
  pedido: PedidoDeAjuste;
  reason?: MotivoDeAjuste;
  reasonText?: string | null;
  chave?: string;
}) {
  return gravarAjusteDeEstoque({
    db,
    shopRef: shopRef(),
    productId: params.productId ?? "pomada",
    pedido: params.pedido,
    reason: params.reason ?? (params.pedido.modo === "contagem" ? "contagem" : "perda"),
    reasonText: params.reasonText ?? null,
    date: HOJE,
    chave: params.chave ?? "k1",
    extras: { registradoPor: "dono-1" },
  });
}

const estoqueDe = async (id = "pomada") =>
  Number((await shopRef().collection("products").doc(id).get()).get("stock"));

async function movimentos() {
  const s = await shopRef().collection("inventory_movements").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:ajuste");
  }
  app = initializeApp({ projectId: PROJETO }, `ajuste-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["inventory_movements", "products", "payments", "commissions", "refunds"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({ timeZone: "America/Sao_Paulo", locale: "pt-BR" });
  await shopRef()
    .collection("products")
    .doc("pomada")
    .set({ name: "Pomada", cost: 18, price: 45, stock: 10, minStock: 3 });
  await shopRef()
    .collection("products")
    .doc("rara")
    .set({ name: "Rara", cost: 22, price: 55, stock: 3, minStock: 0 });
});

describe("saída sem venda", () => {
  it("baixa o saldo e grava UM movimento de ajuste, assinado, com o custo congelado", async () => {
    const r = await ajustar({ pedido: { modo: "saida", quantidade: 2 }, reason: "perda" });

    expect(r).toMatchObject({ delta: -2, estoqueDepois: 8, custo: 36, repetida: false });
    expect(await estoqueDe()).toBe(8);

    const ms = await movimentos();
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({
      productId: "pomada",
      kind: "ajuste",
      quantity: -2,
      unitCost: 18,
      unitPrice: 0,
      value: 36,
      reason: "perda",
      date: HOJE,
      registradoPor: "dono-1",
    });
    expect(ms[0]).not.toHaveProperty("refundOf");
  });

  it('"outro" guarda o texto; os demais não', async () => {
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, reason: "outro", reasonText: "amostra para cliente", chave: "k-outro" });
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, reason: "uso_interno", chave: "k-uso" });
    const ms = await movimentos();
    expect(ms.find((m) => m.reason === "outro")?.reasonText).toBe("amostra para cliente");
    expect(ms.find((m) => m.reason === "uso_interno")?.reasonText).toBeNull();
  });

  it("🔒 saída maior que o saldo é recusada e NÃO deixa rastro", async () => {
    await expect(ajustar({ productId: "rara", pedido: { modo: "saida", quantidade: 4 } })).rejects.toThrow(
      /só há 3 un\./
    );
    expect(await estoqueDe("rara")).toBe(3);
    expect(await movimentos()).toHaveLength(0);
  });

  it("🔒 sob concorrência o saldo nunca fica negativo: 3 chamadas de 2 sobre 3 unidades", async () => {
    const resultados = await Promise.allSettled(
      ["a", "b", "c"].map((chave) =>
        ajustar({ productId: "rara", pedido: { modo: "saida", quantidade: 2 }, chave })
      )
    );

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(resultados.filter((r) => r.status === "rejected")).toHaveLength(2);
    expect(await estoqueDe("rara")).toBe(1);
    expect(await movimentos()).toHaveLength(1);
  });

  it("produto inexistente não grava nada", async () => {
    await expect(ajustar({ productId: "fantasma", pedido: { modo: "saida", quantidade: 1 } })).rejects.toThrow(
      /não está mais cadastrado/
    );
    expect(await movimentos()).toHaveLength(0);
  });
});

describe("contagem (define o saldo)", () => {
  it("contou a menos: vira saída, com custo", async () => {
    const r = await ajustar({ pedido: { modo: "contagem", contado: 7 } });
    expect(r).toMatchObject({ delta: -3, estoqueDepois: 7, custo: 54 });
    const [m] = await movimentos();
    expect(m).toMatchObject({ quantity: -3, reason: "contagem", unitCost: 18 });
  });

  it("🔒 contou a MAIS: corrige a quantidade e NÃO gera custo, receita, pagamento nem comissão", async () => {
    const r = await ajustar({ pedido: { modo: "contagem", contado: 12 } });
    expect(r).toMatchObject({ delta: 2, estoqueDepois: 12, custo: 0 });
    expect(await estoqueDe()).toBe(12);

    const [m] = await movimentos();
    expect(m).toMatchObject({ kind: "ajuste", quantity: 2, reason: "contagem" });
    expect(m).not.toHaveProperty("refundOf");

    for (const col of ["payments", "commissions", "refunds"]) {
      expect((await shopRef().collection(col).get()).size, col).toBe(0);
    }
  });

  it("o custo médio do cadastro não se move (não houve compra para ponderar)", async () => {
    await ajustar({ pedido: { modo: "contagem", contado: 20 } });
    const p = await shopRef().collection("products").doc("pomada").get();
    expect(p.get("cost")).toBe(18);
  });

  it("contagem igual ao saldo é recusada e não deixa movimento", async () => {
    await expect(ajustar({ pedido: { modo: "contagem", contado: 10 } })).rejects.toThrow(/nada a ajustar/);
    expect(await movimentos()).toHaveLength(0);
  });
});

describe("idempotência", () => {
  it("a mesma chave não ajusta duas vezes e devolve o mesmo resultado", async () => {
    const pedido: PedidoDeAjuste = { modo: "saida", quantidade: 2 };
    const a = await ajustar({ pedido });
    const b = await ajustar({ pedido });

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(b).toMatchObject({ movementId: a.movementId, delta: -2 });
    expect(await estoqueDe()).toBe(8);
    expect(await movimentos()).toHaveLength(1);
  });

  it("repetir uma CONTAGEM não cai em 'nada a ajustar'", async () => {
    /* Depois do primeiro ajuste o saldo já é o contado; sem checar a chave
     * antes do cálculo, o retry viraria erro sobre algo que deu certo. */
    const pedido: PedidoDeAjuste = { modo: "contagem", contado: 6 };
    await ajustar({ pedido });
    const de_novo = await ajustar({ pedido });
    expect(de_novo.repetida).toBe(true);
    expect(await estoqueDe()).toBe(6);
  });

  it("🔒 a mesma chave com OUTRO pedido é recusada", async () => {
    await ajustar({ pedido: { modo: "saida", quantidade: 2 } });
    await expect(ajustar({ pedido: { modo: "saida", quantidade: 5 } })).rejects.toThrow(/outros dados/);
    await expect(
      ajustar({ pedido: { modo: "saida", quantidade: 2 }, reason: "vencido" })
    ).rejects.toThrow(/outros dados/);
    expect(await estoqueDe()).toBe(8);
  });

  it("chaves diferentes são ajustes diferentes", async () => {
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, chave: "k1" });
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, chave: "k2" });
    expect(await estoqueDe()).toBe(8);
    expect(await movimentos()).toHaveLength(2);
  });
});

describe("o custo é congelado", () => {
  it("mudar o custo do cadastro depois NÃO reescreve a perda de antes", async () => {
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, chave: "antes" });
    await shopRef().collection("products").doc("pomada").update({ cost: 40 });
    await ajustar({ pedido: { modo: "saida", quantidade: 1 }, chave: "depois" });

    const ms = await movimentos();
    expect(ms.map((m) => m.unitCost).sort()).toEqual([18, 40]);
  });
});
