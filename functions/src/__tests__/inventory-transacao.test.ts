import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  gravarCompraComEntradaDeEstoque,
  gravarVendaComTravaDeEstoque,
} from "../inventory";
import type { PaymentMethod } from "../financial-events";

/**
 * G1 — a venda de produto, contra o emulador.
 *
 * `inventory.test.ts` prova as regras puras. Nada ali consegue afirmar o que
 * este arquivo afirma:
 *
 * 1. que a venda e a baixa de estoque são **atômicas** — meia venda gravada é
 *    pior que nenhuma, porque o estoque some sem faturamento ou o faturamento
 *    aparece sem estoque sair;
 * 2. que duas vendas simultâneas **não consomem a mesma unidade**;
 * 3. que a mesma chave de idempotência não vende duas vezes;
 * 4. que o custo congelado **não muda** quando o cadastro do produto muda.
 *
 * A transação aqui é a mesma de `registrarVendaDeProduto`, extraída para poder
 * ser exercida sem o wrapper `onCall` — mesmo desenho de
 * `gravarComTravaDeHorario`, pelo mesmo motivo: dentro do `onCall` ela exigiria
 * autenticação e nunca seria testada sob concorrência.
 *
 * Exige o emulador:  npm run test:estoque
 */

const PROJETO = "estoque-g1";
const SHOP = "barbearia-teste";
const HOJE = "2026-09-14";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

/**
 * Chama a MESMA transação que a function usa.
 *
 * Não é uma cópia da sequência. Uma cópia continuaria verde no dia em que a
 * function mudasse a ordem de leitura e escrita — o teste passaria a atestar um
 * código que ninguém executa, que é a pior forma de suíte verde.
 */
function vender(params: {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  clientId?: string | null;
  bookingId?: string | null;
  chave?: string;
}) {
  return gravarVendaComTravaDeEstoque({
    db,
    shopRef: shopRef(),
    itens: [{ productId: params.productId, quantity: params.quantity }],
    paymentMethod: params.paymentMethod,
    clientId: params.clientId ?? null,
    bookingId: params.bookingId ?? null,
    date: HOJE,
    chave: params.chave,
  });
}

async function estoqueDe(id: string) {
  const s = await shopRef().collection("products").doc(id).get();
  return Number(s.get("stock"));
}

type MovimentoNoBanco = Record<string, unknown> & { id: string };

async function movimentos(): Promise<MovimentoNoBanco[]> {
  const s = await shopRef().collection("inventory_movements").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as MovimentoNoBanco);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:estoque");
  }
  app = initializeApp({ projectId: PROJETO }, `estoque-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["inventory_movements", "products", "payments"]) {
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
    .doc("ultima")
    .set({ name: "Última unidade", cost: 22, price: 55, stock: 1, minStock: 0 });
});

/* ================================================================== */
/* Atomicidade                                                        */
/* ================================================================== */

describe("G1 · venda e baixa de estoque são atômicas", () => {
  it("a venda grava o movimento E baixa o estoque", async () => {
    const r = await vender({ productId: "pomada", quantity: 2, paymentMethod: "credit" });

    expect(r.value).toBe(90);
    expect(await estoqueDe("pomada")).toBe(8);

    const [m] = await movimentos();
    expect(m.kind).toBe("venda");
    expect(m.quantity).toBe(2);
    expect(m.value).toBe(90);
  });

  it("estoque insuficiente NÃO grava movimento nem mexe no estoque", async () => {
    /* Meia venda é pior que nenhuma: o estoque sumiria sem faturamento, ou o
     * faturamento apareceria sem produto ter saído. */
    /* A mensagem diz QUAL produto acabou. Com carrinho de três itens, um
     * "estoque insuficiente" sem nome obriga o dono a tentar de novo item a
     * item para descobrir onde travou. */
    await expect(vender({ productId: "ultima", quantity: 2, paymentMethod: "cash" })).rejects.toThrow(
      /Última unidade: estoque insuficiente/
    );

    expect(await estoqueDe("ultima")).toBe(1);
    expect(await movimentos()).toHaveLength(0);
  });

  it("produto inexistente não grava nada", async () => {
    await expect(vender({ productId: "fantasma", quantity: 1, paymentMethod: "pix" })).rejects.toThrow(
      /não está mais cadastrado/
    );
    expect(await movimentos()).toHaveLength(0);
  });

  it("vender a última unidade zera o estoque, e a próxima falha", async () => {
    await vender({ productId: "ultima", quantity: 1, paymentMethod: "pix" });
    expect(await estoqueDe("ultima")).toBe(0);

    await expect(vender({ productId: "ultima", quantity: 1, paymentMethod: "pix" })).rejects.toThrow(
      /estoque insuficiente, restam 0/
    );
    expect(await estoqueDe("ultima")).toBe(0);
  });
});

/* ================================================================== */
/* O custo congelado — o que sustenta D3 depois                       */
/* ================================================================== */

describe("G1 · o custo é congelado no instante da venda", () => {
  it("grava o custo e o preço do momento", async () => {
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash" });
    const [m] = await movimentos();
    expect(m.unitCost).toBe(18);
    expect(m.unitPrice).toBe(45);
  });

  it("REPOSIÇÃO MAIS CARA não altera a venda anterior", async () => {
    /* É a razão de o campo existir. Enquanto o custo vier de `products.cost`, a
     * pomada subir em outubro reescreve o lucro de setembro — um mês fechado
     * muda sozinho. Com o custo no fato, cada venda carrega o custo que teve. */
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash" });
    await shopRef().collection("products").doc("pomada").update({ cost: 30, price: 70 });
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix" });

    const ms = await movimentos();
    expect(ms.map((m) => m.unitCost).sort()).toEqual([18, 30]);
    expect(ms.map((m) => m.unitPrice).sort((a, b) => Number(a) - Number(b))).toEqual([45, 70]);
  });

  it("produto sem custo cadastrado vale zero, e não quebra", async () => {
    await shopRef()
      .collection("products")
      .doc("semcusto")
      .set({ name: "Brinde", price: 10, stock: 5 });
    await vender({ productId: "semcusto", quantity: 1, paymentMethod: "cash" });
    const m = (await movimentos()).find((x) => x.productId === "semcusto")!;
    expect(m.unitCost).toBe(0);
  });
});

/* ================================================================== */
/* O meio de pagamento nasce no fato                                  */
/* ================================================================== */

describe("G1 · meio de pagamento, cliente e atendimento", () => {
  it("o meio fica no documento — não precisa mais ser inferido", async () => {
    /* Era a premissa N12 como dívida: a massa de teste tinha um mapa paralelo
     * (`MEIO_DA_VENDA`) porque o modelo não sabia guardar isto. */
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "debit" });
    const [m] = await movimentos();
    expect(m.paymentMethod).toBe("debit");
  });

  it("carrega cliente e atendimento quando a venda é casada", async () => {
    await vender({
      productId: "pomada",
      quantity: 1,
      paymentMethod: "pix",
      clientId: "cliente-do-ze",
      bookingId: "reserva-42",
    });
    const [m] = await movimentos();
    expect(m.clientId).toBe("cliente-do-ze");
    expect(m.bookingId).toBe("reserva-42");
  });

  it("venda avulsa grava NULO explícito, não campo ausente", async () => {
    /* Ausência é ambígua entre "não teve cliente" e "documento antigo". O nulo
     * explícito responde a pergunta sem depender da data do registro. */
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "cash" });
    const [m] = await movimentos();
    expect(m.clientId).toBeNull();
    expect(m.bookingId).toBeNull();
    expect(m).toHaveProperty("clientId");
  });
});

/* ================================================================== */
/* Concorrência — a invariante que só o emulador prova                */
/* ================================================================== */

describe("G1 · concorrência", () => {
  it("duas vendas da ÚLTIMA unidade: uma só passa", async () => {
    const r = await Promise.allSettled([
      vender({ productId: "ultima", quantity: 1, paymentMethod: "pix" }),
      vender({ productId: "ultima", quantity: 1, paymentMethod: "cash" }),
    ]);

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await estoqueDe("ultima")).toBe(0);
    expect(await movimentos()).toHaveLength(1);
  });

  it("dez vendas simultâneas de 1 em estoque 10: todas passam e o estoque zera", async () => {
    const r = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        vender({ productId: "pomada", quantity: 1, paymentMethod: "cash" })
      )
    );

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(await estoqueDe("pomada")).toBe(0);
    expect(await movimentos()).toHaveLength(10);
  });

  it("quinze tentativas para estoque 10: exatamente 10 passam, e o estoque NUNCA fica negativo", async () => {
    /* A invariante central. Sem a transação, as leituras concorrentes veriam
     * "tem 10" e as quinze gravariam — estoque em −5 e cinco vendas de produto
     * que não existe, faturadas. */
    const r = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        vender({ productId: "pomada", quantity: 1, paymentMethod: "pix" })
      )
    );

    const passaram = r.filter((x) => x.status === "fulfilled").length;
    expect(passaram).toBe(10);
    expect(await estoqueDe("pomada")).toBe(0);
    expect(await estoqueDe("pomada")).toBeGreaterThanOrEqual(0);
    expect(await movimentos()).toHaveLength(10);
  });

  it("a soma do que saiu bate com o que o estoque baixou", async () => {
    /* Conservação: nenhum caminho pode gravar venda sem baixar, nem baixar sem
     * gravar. É a checagem que pegaria uma escrita fora da transação. */
    const antes = await estoqueDe("pomada");
    await Promise.allSettled([
      vender({ productId: "pomada", quantity: 2, paymentMethod: "pix" }),
      vender({ productId: "pomada", quantity: 3, paymentMethod: "cash" }),
      vender({ productId: "pomada", quantity: 1, paymentMethod: "debit" }),
    ]);

    const ms = await movimentos();
    const vendido = ms.reduce((s, m) => s + Number(m.quantity), 0);
    expect(await estoqueDe("pomada")).toBe(antes - vendido);
  });
});

/* ================================================================== */
/* Idempotência                                                       */
/* ================================================================== */

describe("G1 · idempotência", () => {
  it("a mesma chave não vende duas vezes", async () => {
    /* Toque duplo no botão ou retry de rede. Sem chave, não há como distinguir
     * isso de duas vendas legítimas do mesmo produto no mesmo minuto — que
     * acontecem, e por isso a chave vem da tela e não é deduzida. */
    const a = await vender({ productId: "pomada", quantity: 2, paymentMethod: "pix", chave: "abc123" });
    const b = await vender({ productId: "pomada", quantity: 2, paymentMethod: "pix", chave: "abc123" });

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(b.movementIds).toEqual(a.movementIds);
    expect(await estoqueDe("pomada")).toBe(8);
    expect(await movimentos()).toHaveLength(1);
  });

  it("o retry devolve o valor da venda original, não zero", async () => {
    /* Um retry precisa ser indistinguível de sucesso do lado de quem chamou,
     * senão a tela mostra erro sobre uma venda que deu certo — e o dono
     * registra de novo. */
    await vender({ productId: "pomada", quantity: 2, paymentMethod: "pix", chave: "k1" });
    const b = await vender({ productId: "pomada", quantity: 2, paymentMethod: "pix", chave: "k1" });
    expect(b.value).toBe(90);
  });

  it("chaves diferentes são vendas diferentes", async () => {
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "k1" });
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "k2" });
    expect(await movimentos()).toHaveLength(2);
    expect(await estoqueDe("pomada")).toBe(8);
  });

  it("duas chamadas SIMULTÂNEAS com a mesma chave gravam uma venda só", async () => {
    const r = await Promise.allSettled([
      vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "dobro" }),
      vender({ productId: "pomada", quantity: 1, paymentMethod: "pix", chave: "dobro" }),
    ]);
    /* Uma das duas pode falhar por contenção da transação — o que não pode é
     * gravar duas vezes. */
    expect(await movimentos()).toHaveLength(1);
    expect(await estoqueDe("pomada")).toBe(9);
    expect(r.some((x) => x.status === "fulfilled")).toBe(true);
  });
});

/* ================================================================== */
/* Carrinho — a venda é atômica ENTRE as linhas                       */
/* ================================================================== */

function venderCarrinho(itens: Array<{ productId: string; quantity: number }>, chave?: string) {
  return gravarVendaComTravaDeEstoque({
    db,
    shopRef: shopRef(),
    itens,
    paymentMethod: "pix",
    clientId: null,
    bookingId: null,
    date: HOJE,
    chave,
  });
}

describe("G1 · carrinho", () => {
  it("dois produtos numa venda: um movimento por produto, valor somado", async () => {
    /* O movimento continua sendo POR PRODUTO — é o que o CMV precisa, porque
     * cada linha carrega o próprio `unitCost`. O que é único é a venda. */
    const r = await venderCarrinho([
      { productId: "pomada", quantity: 2 },
      { productId: "ultima", quantity: 1 },
    ]);

    expect(r.value).toBe(90 + 55);
    expect(r.movementIds).toHaveLength(2);
    expect(await estoqueDe("pomada")).toBe(8);
    expect(await estoqueDe("ultima")).toBe(0);
    expect(await movimentos()).toHaveLength(2);
  });

  it("se UMA linha não tem estoque, NENHUMA é gravada", async () => {
    /* A invariante do carrinho. Validar e gravar linha a linha deixaria a
     * pomada baixar e o segundo item falhar — venda pela metade, com o dono
     * achando que registrou tudo e o estoque da pomada errado. */
    await expect(
      venderCarrinho([
        { productId: "pomada", quantity: 2 },
        { productId: "ultima", quantity: 5 },
      ])
    ).rejects.toThrow(/estoque insuficiente/);

    expect(await estoqueDe("pomada")).toBe(10);
    expect(await estoqueDe("ultima")).toBe(1);
    expect(await movimentos()).toHaveLength(0);
  });

  it("produto inexistente no meio do carrinho derruba a venda inteira", async () => {
    await expect(
      venderCarrinho([
        { productId: "pomada", quantity: 1 },
        { productId: "fantasma", quantity: 1 },
      ])
    ).rejects.toThrow(/não está mais cadastrado/);

    expect(await estoqueDe("pomada")).toBe(10);
    expect(await movimentos()).toHaveLength(0);
  });

  it("o MESMO produto duas vezes é recusado — some na quantidade", async () => {
    /* Duas linhas do mesmo produto seriam duas leituras do mesmo documento e
     * duas subtrações a partir do mesmo saldo: a segunda apagaria a primeira, e
     * o estoque baixaria uma vez para duas unidades vendidas. */
    await expect(
      venderCarrinho([
        { productId: "pomada", quantity: 1 },
        { productId: "pomada", quantity: 1 },
      ])
    ).rejects.toThrow(/aparece duas vezes/);

    expect(await estoqueDe("pomada")).toBe(10);
    expect(await movimentos()).toHaveLength(0);
  });

  it("idempotência vale para o carrinho inteiro", async () => {
    const a = await venderCarrinho(
      [{ productId: "pomada", quantity: 1 }, { productId: "ultima", quantity: 1 }],
      "carrinho-1"
    );
    const b = await venderCarrinho(
      [{ productId: "pomada", quantity: 1 }, { productId: "ultima", quantity: 1 }],
      "carrinho-1"
    );

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(b.value).toBe(a.value);
    expect(await movimentos()).toHaveLength(2);
    expect(await estoqueDe("pomada")).toBe(9);
    expect(await estoqueDe("ultima")).toBe(0);
  });

  it("dois carrinhos disputando a última unidade: um só passa, e por inteiro", async () => {
    const r = await Promise.allSettled([
      venderCarrinho([{ productId: "pomada", quantity: 1 }, { productId: "ultima", quantity: 1 }]),
      venderCarrinho([{ productId: "pomada", quantity: 1 }, { productId: "ultima", quantity: 1 }]),
    ]);

    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await estoqueDe("ultima")).toBe(0);
    /* O que perdeu não pode ter baixado a pomada: a venda é atômica, e perder o
     * segundo item significa não ter vendido o primeiro. */
    expect(await estoqueDe("pomada")).toBe(9);
    expect(await movimentos()).toHaveLength(2);
  });
});

/* ================================================================== */
/* G1.5 · a entrada de estoque, contra o emulador                      */
/* ================================================================== */

function comprar(params: {
  productId: string;
  quantity: number;
  unitCost: number;
  paymentMethod?: PaymentMethod | null;
  supplier?: string | null;
  chave?: string;
}) {
  return gravarCompraComEntradaDeEstoque({
    db,
    shopRef: shopRef(),
    productId: params.productId,
    quantity: params.quantity,
    unitCost: params.unitCost,
    paymentMethod: params.paymentMethod ?? null,
    supplier: params.supplier ?? null,
    date: HOJE,
    chave: params.chave,
  });
}

async function custoDe(id: string) {
  const s = await shopRef().collection("products").doc(id).get();
  return Number(s.get("cost"));
}

describe("G1.5 · a entrada sobe o estoque e registra o fato", () => {
  it("grava movimento de COMPRA e soma no estoque", async () => {
    /* Era o fato que não existia: `kind: "compra"` aparecia em quatro lugares e
     * os quatro eram leitura. O CMV somava sobre conjunto vazio. */
    const r = await comprar({ productId: "pomada", quantity: 10, unitCost: 18 });

    expect(r.value).toBe(180);
    expect(await estoqueDe("pomada")).toBe(20);

    const ms = await movimentos();
    expect(ms).toHaveLength(1);
    expect(ms[0].kind).toBe("compra");
    expect(ms[0].unitCost).toBe(18);
  });

  it("o CMV deixa de ser conjunto vazio", async () => {
    /* A verificação direta do achado D19: antes desta função, filtrar por
     * `kind === "compra"` devolvia zero documentos em qualquer base real. */
    await comprar({ productId: "pomada", quantity: 10, unitCost: 18 });
    const compras = (await movimentos()).filter((m) => m.kind === "compra");
    expect(compras.length).toBeGreaterThan(0);
  });

  it("atualiza o custo pelo MÉDIO PONDERADO", async () => {
    /* Estoque nasce 10 a 18. Comprar 10 a 30 leva o médio a 24 — e não a 30,
     * que é o que o último custo faria. */
    await comprar({ productId: "pomada", quantity: 10, unitCost: 30 });
    expect(await custoDe("pomada")).toBe(24);
    expect(await estoqueDe("pomada")).toBe(20);
  });

  it("a venda seguinte congela o custo NOVO", async () => {
    await comprar({ productId: "pomada", quantity: 10, unitCost: 30 });
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix" });

    const venda = (await movimentos()).find((m) => m.kind === "venda")!;
    expect(venda.unitCost).toBe(24);
  });

  it("a venda ANTERIOR não é reescrita pela compra", async () => {
    /* É o ponto do congelamento. Comprar mais caro em outubro não pode alterar
     * o custo da venda de setembro. */
    await vender({ productId: "pomada", quantity: 1, paymentMethod: "pix" });
    await comprar({ productId: "pomada", quantity: 10, unitCost: 30 });

    const venda = (await movimentos()).find((m) => m.kind === "venda")!;
    expect(venda.unitCost).toBe(18);
  });

  it("produto inexistente não grava nada", async () => {
    await expect(comprar({ productId: "fantasma", quantity: 1, unitCost: 10 })).rejects.toThrow(
      /não está mais cadastrado/
    );
    expect(await movimentos()).toHaveLength(0);
  });

  it("guarda fornecedor e meio de pagamento quando informados", async () => {
    await comprar({
      productId: "pomada",
      quantity: 5,
      unitCost: 20,
      paymentMethod: "pix",
      supplier: "Distribuidora X",
    });
    const [m] = await movimentos();
    expect(m.supplier).toBe("Distribuidora X");
    expect(m.paymentMethod).toBe("pix");
  });

  it("a mesma chave não dá entrada duas vezes", async () => {
    const a = await comprar({ productId: "pomada", quantity: 10, unitCost: 18, chave: "nf-123" });
    const b = await comprar({ productId: "pomada", quantity: 10, unitCost: 18, chave: "nf-123" });

    expect(a.repetida).toBe(false);
    expect(b.repetida).toBe(true);
    expect(await estoqueDe("pomada")).toBe(20);
    expect(await movimentos()).toHaveLength(1);
  });

  it("duas entradas SIMULTÂNEAS da mesma nota não dobram o estoque", async () => {
    await Promise.allSettled([
      comprar({ productId: "pomada", quantity: 10, unitCost: 18, chave: "nf-9" }),
      comprar({ productId: "pomada", quantity: 10, unitCost: 18, chave: "nf-9" }),
    ]);
    expect(await estoqueDe("pomada")).toBe(20);
    expect(await movimentos()).toHaveLength(1);
  });

  it("entradas concorrentes SEM chave somam todas, sem perder nenhuma", async () => {
    /* Duas notas diferentes chegando junto. Fora da transação, as duas leriam
     * o mesmo estoque e a segunda apagaria a primeira. */
    await Promise.allSettled([
      comprar({ productId: "pomada", quantity: 5, unitCost: 18 }),
      comprar({ productId: "pomada", quantity: 3, unitCost: 18 }),
    ]);
    expect(await estoqueDe("pomada")).toBe(18);
    expect(await movimentos()).toHaveLength(2);
  });

  it("comprar e vender em sequência mantém o estoque coerente", async () => {
    await comprar({ productId: "pomada", quantity: 10, unitCost: 18 });
    await vender({ productId: "pomada", quantity: 3, paymentMethod: "cash" });
    expect(await estoqueDe("pomada")).toBe(17);

    const ms = await movimentos();
    const entrou = ms.filter((m) => m.kind === "compra").reduce((s, m) => s + Number(m.quantity), 0);
    const saiu = ms.filter((m) => m.kind === "venda").reduce((s, m) => s + Number(m.quantity), 0);
    expect(10 + entrou - saiu).toBe(17);
  });
});

/* ================================================================== */
/* G1.6 · a venda gera PAGAMENTO com a taxa congelada                  */
/* ================================================================== */

const TAXAS = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

function venderComTaxa(params: {
  productId: string;
  quantity: number;
  paymentMethod: PaymentMethod;
  chave?: string;
}) {
  return gravarVendaComTravaDeEstoque({
    db,
    shopRef: shopRef(),
    itens: [{ productId: params.productId, quantity: params.quantity }],
    paymentMethod: params.paymentMethod,
    clientId: null,
    bookingId: null,
    date: HOJE,
    chave: params.chave,
    fees: TAXAS,
  });
}

async function pagamentos() {
  const s = await shopRef().collection("payments").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

describe("G1.6 · o pagamento nasce com a venda", () => {
  it("uma venda gera um pagamento, na mesma transação", async () => {
    /* Não é o botão que cria o pagamento — é o fato econômico. Escrevê-lo fora
     * da transação abriria o estado em que a venda existe e o dinheiro dela
     * não, que é o que `payments` serve para impedir. */
    await venderComTaxa({ productId: "pomada", quantity: 2, paymentMethod: "credit" });

    const ps = await pagamentos();
    expect(ps).toHaveLength(1);
    expect(ps[0].origin).toBe("produto");
    expect(ps[0].grossAmount).toBe(90);
  });

  it("a taxa é a do MÉTODO, congelada no documento", async () => {
    /* Era D7/D21: a venda registrava `paymentMethod` e não gerava pagamento,
     * então `gatewayFeesTotal` não via taxa nenhuma de produto. */
    await venderComTaxa({ productId: "pomada", quantity: 2, paymentMethod: "credit" });
    const [p] = await pagamentos();
    expect(p.feePct).toBe(3.49);
    expect(p.feeAmount).toBe(3.14);
    expect(p.netAmount).toBe(86.86);
  });

  it("débito paga taxa de débito, não de crédito", async () => {
    await venderComTaxa({ productId: "pomada", quantity: 2, paymentMethod: "debit" });
    const [p] = await pagamentos();
    expect(p.feePct).toBe(1.99);
  });

  it("o id do pagamento deriva do movimento", async () => {
    const r = await venderComTaxa({ productId: "pomada", quantity: 1, paymentMethod: "pix" });
    const [p] = await pagamentos();
    expect(p.id).toBe(`pagamento_venda_${r.movementIds[0]}`);
    expect(p.movementId).toBe(r.movementIds[0]);
  });

  it("REEXECUTAR não cria segundo pagamento nem cobra a taxa duas vezes", async () => {
    /* A garantia central de G1.6. Toque duplo ou retry de rede não pode dobrar
     * o custo de adquirência do mês. */
    await venderComTaxa({ productId: "pomada", quantity: 2, paymentMethod: "credit", chave: "k1" });
    await venderComTaxa({ productId: "pomada", quantity: 2, paymentMethod: "credit", chave: "k1" });

    const ps = await pagamentos();
    expect(ps).toHaveLength(1);
    expect(ps.reduce((s, p) => s + Number(p.feeAmount), 0)).toBe(3.14);
    expect(await estoqueDe("pomada")).toBe(8);
  });

  it("carrinho de dois produtos gera DOIS pagamentos, um por linha", async () => {
    /* Um por movimento, porque o id deriva do movimento — e é o que permite
     * rastrear a taxa até o produto que a gerou. */
    await gravarVendaComTravaDeEstoque({
      db,
      shopRef: shopRef(),
      itens: [
        { productId: "pomada", quantity: 1 },
        { productId: "ultima", quantity: 1 },
      ],
      paymentMethod: "credit",
      clientId: null,
      bookingId: null,
      date: HOJE,
      fees: TAXAS,
    });

    const ps = await pagamentos();
    expect(ps).toHaveLength(2);
    expect(ps.reduce((s, p) => s + Number(p.grossAmount), 0)).toBe(100);
  });

  it("venda que FALHA por estoque não deixa pagamento órfão", async () => {
    await expect(
      venderComTaxa({ productId: "ultima", quantity: 5, paymentMethod: "pix" })
    ).rejects.toThrow(/estoque insuficiente/);
    expect(await pagamentos()).toHaveLength(0);
  });

  it("sem taxas cadastradas, o pagamento existe e não inventa custo", async () => {
    await gravarVendaComTravaDeEstoque({
      db,
      shopRef: shopRef(),
      itens: [{ productId: "pomada", quantity: 1 }],
      paymentMethod: "credit",
      clientId: null,
      bookingId: null,
      date: HOJE,
    });
    const [p] = await pagamentos();
    expect(p.feeAmount).toBe(0);
    expect(p.grossAmount).toBe(45);
  });
});
