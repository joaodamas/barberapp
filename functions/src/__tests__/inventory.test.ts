import { describe, expect, it } from "vitest";
import {
  custoMedioPonderado,
  estoqueSuficiente,
  movimentoDeCompra,
  metodoValido,
  movimentoDeVenda,
  quantidadeValida,
  valorDaVenda,
} from "../inventory";

/**
 * G1 — as decisões puras da venda de produto.
 *
 * O comportamento transacional (atomicidade, concorrência, idempotência) é
 * exercido contra o emulador em `inventory-transacao.test.ts`. Aqui ficam as
 * regras que precisam valer antes de qualquer escrita.
 */

describe("G1 · quantidade", () => {
  it("aceita inteiro positivo", () => {
    expect(quantidadeValida(1)).toBe(true);
    expect(quantidadeValida(3)).toBe(true);
  });

  it("recusa zero e negativo", () => {
    /* Quantidade zero é uma venda que some do faturamento; negativa DEVOLVE
     * estoque e some com receita — vira um estorno disfarçado de venda, sem
     * nenhum registro de que houve estorno. */
    expect(quantidadeValida(0)).toBe(false);
    expect(quantidadeValida(-2)).toBe(false);
  });

  it("recusa fração", () => {
    /* `stock` é contado em unidades. Meia pomada não existe no cadastro, e
     * aceitar 0,5 deixaria o estoque num número que nenhuma contagem física
     * confirma. */
    expect(quantidadeValida(1.5)).toBe(false);
  });

  it("recusa o que não é número", () => {
    expect(quantidadeValida("2")).toBe(false);
    expect(quantidadeValida(null)).toBe(false);
    expect(quantidadeValida(undefined)).toBe(false);
    expect(quantidadeValida(NaN)).toBe(false);
    expect(quantidadeValida(Infinity)).toBe(false);
  });
});

describe("G1 · estoque", () => {
  it("cobre quando há o suficiente", () => {
    expect(estoqueSuficiente(10, 3)).toBe(true);
    expect(estoqueSuficiente(3, 3)).toBe(true);
  });

  it("não cobre quando falta", () => {
    expect(estoqueSuficiente(2, 3)).toBe(false);
    expect(estoqueSuficiente(0, 1)).toBe(false);
  });

  it("estoque ausente vale ZERO, não infinito", () => {
    /* Produto sem o campo nunca teve entrada registrada. Tratar a ausência como
     * "pode vender" deixaria vender o que não existe — e o estoque ficaria
     * negativo sem ninguém ter errado a conta. */
    expect(estoqueSuficiente(undefined, 1)).toBe(false);
    expect(estoqueSuficiente(null, 1)).toBe(false);
    expect(estoqueSuficiente("dez", 1)).toBe(false);
  });

  it("estoque negativo herdado não vira crédito", () => {
    expect(estoqueSuficiente(-5, 1)).toBe(false);
  });
});

describe("G1 · meio de pagamento", () => {
  it("aceita os quatro que o produto conhece", () => {
    for (const m of ["pix", "cash", "debit", "credit"]) {
      expect(metodoValido(m), m).toBe(true);
    }
  });

  it("recusa ausente e desconhecido", () => {
    /* O meio nasce NO FATO. Aceitar venda sem ele obrigaria a inferir depois, e
     * inferir meio de pagamento é exatamente o que a premissa N12 recusa —
     * o caixa por meio nunca fecharia com a realidade. */
    expect(metodoValido(undefined)).toBe(false);
    expect(metodoValido(null)).toBe(false);
    expect(metodoValido("")).toBe(false);
    expect(metodoValido("boleto")).toBe(false);
    expect(metodoValido("cartao")).toBe(false); // o antigo, que misturava débito e crédito
  });
});

describe("G1 · valor da linha", () => {
  it("multiplica preço por quantidade", () => {
    expect(valorDaVenda(45, 2)).toBe(90);
    expect(valorDaVenda(55, 1)).toBe(55);
  });

  it("arredonda ao CENTAVO, não ao real", () => {
    /* Arredondar ao real aqui criaria um D1/D5 novo dentro de um fato que
     * acabou de nascer — e o fato é justamente o que a Rodada 3 vai usar como
     * fonte confiável. */
    expect(valorDaVenda(19.9, 3)).toBe(59.7);
    expect(valorDaVenda(0.1, 3)).toBe(0.3);
  });
});

describe("G1 · o movimento congela o que precisa ser congelado", () => {
  const venda = movimentoDeVenda({
    productId: "pomada",
    quantidade: 2,
    unitPrice: 45,
    unitCost: 18,
    paymentMethod: "credit",
    clientId: "cliente-1",
    bookingId: "reserva-1",
    date: "2026-09-14",
  });

  it("guarda preço e custo UNITÁRIOS, além do total", () => {
    /* Só o total não basta: com `value: 90` não dá para saber se foram duas
     * unidades a 45 ou uma a 90, e o CMV precisa do custo por unidade vendida. */
    expect(venda.unitPrice).toBe(45);
    expect(venda.unitCost).toBe(18);
    expect(venda.quantity).toBe(2);
    expect(venda.value).toBe(90);
  });

  it("o custo do movimento NÃO é o custo total — é o unitário", () => {
    /* Confusão fácil e cara: gravar 36 aqui faria o CMV dobrar quando alguém
     * multiplicasse por `quantity` de novo. */
    expect(venda.unitCost).not.toBe(36);
    expect(venda.unitCost * venda.quantity).toBe(36);
  });

  it("carrega o meio de pagamento no próprio fato", () => {
    expect(venda.paymentMethod).toBe("credit");
  });

  it("carrega cliente e atendimento quando existem", () => {
    expect(venda.clientId).toBe("cliente-1");
    expect(venda.bookingId).toBe("reserva-1");
  });

  it("aceita venda avulsa, sem cliente e sem atendimento", () => {
    /* Quem compra pomada no balcão sem cortar o cabelo pode não ter cadastro.
     * Exigir nome para vender R$ 45 é o atrito que faz o dono não registrar a
     * venda — e venda não registrada é pior que venda sem cliente. */
    const avulsa = movimentoDeVenda({
      productId: "shampoo",
      quantidade: 1,
      unitPrice: 55,
      unitCost: 22,
      paymentMethod: "cash",
      clientId: null,
      bookingId: null,
      date: "2026-09-19",
    });
    expect(avulsa.clientId).toBeNull();
    expect(avulsa.bookingId).toBeNull();
    expect(avulsa.value).toBe(55);
  });

  it("é sempre `venda` — o tipo não vem de fora", () => {
    /* `kind` decide se o movimento entra na receita ou no CMV. Recebê-lo do
     * chamador deixaria registrar uma compra como venda e faturar estoque que
     * entrou. */
    expect(venda.kind).toBe("venda");
  });
});

/* ================================================================== */
/* G1.5 · a entrada de estoque — o fato que não existia (D19)          */
/* ================================================================== */

describe("G1.5 · custo médio ponderado", () => {
  it("mistura o estoque antigo com a compra nova", () => {
    /* 8 a R$ 18 + 2 a R$ 30 = (144 + 60) ÷ 10 = 20,40 */
    expect(
      custoMedioPonderado({ estoqueAtual: 8, custoAtual: 18, quantidade: 2, custoDaCompra: 30 })
    ).toBe(20.4);
  });

  it("NÃO adota o último custo — é a decisão que este arquivo recusa", () => {
    /* Com último custo, as 8 unidades antigas passariam a valer R$ 30 e o CMV
     * do mês seguinte estouraria sem nada ter acontecido na loja. */
    const medio = custoMedioPonderado({
      estoqueAtual: 8,
      custoAtual: 18,
      quantidade: 2,
      custoDaCompra: 30,
    });
    expect(medio).not.toBe(30);
    expect(medio).toBeGreaterThan(18);
    expect(medio).toBeLessThan(30);
  });

  it("estoque zerado adota o custo da compra", () => {
    /* Não há média a fazer, e dividir por zero gravaria NaN no documento. */
    expect(
      custoMedioPonderado({ estoqueAtual: 0, custoAtual: 18, quantidade: 5, custoDaCompra: 25 })
    ).toBe(25);
  });

  it("estoque negativo herdado não distorce a média", () => {
    expect(
      custoMedioPonderado({ estoqueAtual: -3, custoAtual: 18, quantidade: 5, custoDaCompra: 25 })
    ).toBe(25);
  });

  it("comprar ao mesmo preço não move o custo", () => {
    expect(
      custoMedioPonderado({ estoqueAtual: 10, custoAtual: 18, quantidade: 10, custoDaCompra: 18 })
    ).toBe(18);
  });

  it("arredonda ao centavo", () => {
    /* (1 × 10 + 2 × 11) ÷ 3 = 10,666… → 10,67 */
    expect(
      custoMedioPonderado({ estoqueAtual: 1, custoAtual: 10, quantidade: 2, custoDaCompra: 11 })
    ).toBe(10.67);
  });
});

describe("G1.5 · o movimento de compra", () => {
  const compra = movimentoDeCompra({
    productId: "pomada",
    quantidade: 10,
    unitCost: 18,
    paymentMethod: "pix",
    supplier: "Distribuidora X",
    date: "2026-09-01",
  });

  it("é do tipo COMPRA — é o que faltava para o CMV existir", () => {
    /* `kind: "compra"` aparecia em quatro lugares do produto e os quatro eram
     * LEITURA. O filtro do CMV somava sobre conjunto vazio. */
    expect(compra.kind).toBe("compra");
  });

  it("o valor é custo × quantidade", () => {
    expect(compra.value).toBe(180);
  });

  it("não tem preço de venda — o produto entrou, não saiu", () => {
    expect(compra.unitPrice).toBe(0);
  });

  it("guarda o custo unitário da compra, não o do cadastro", () => {
    expect(compra.unitCost).toBe(18);
  });

  it("carrega o meio de pagamento, mesmo sem ninguém lê-lo ainda", () => {
    /* A saída de caixa é real e vai aparecer quando o Fluxo tiver saídas
     * (D8/D11). Descobrir o meio depois é o que a premissa N12 recusa. */
    expect(compra.paymentMethod).toBe("pix");
  });

  it("aceita compra sem meio e sem fornecedor", () => {
    const simples = movimentoDeCompra({
      productId: "pomada",
      quantidade: 5,
      unitCost: 20,
      paymentMethod: null,
      supplier: null,
      date: "2026-09-01",
    });
    expect(simples.paymentMethod).toBeNull();
    expect(simples.supplier).toBeNull();
  });

  it("não carrega cliente nem atendimento", () => {
    expect(compra.clientId).toBeNull();
    expect(compra.bookingId).toBeNull();
  });
});
