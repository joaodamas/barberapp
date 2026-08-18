import { describe, expect, it } from "vitest";
import { custoDoVendido, detalheDoCustoDoVendido } from "../fontes-financeiras";
import { mesPeriodo } from "../analytics-periodo";
import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc } from "@/lib/domain";

/**
 * FIN-02 · o detalhamento do CMV fecha com o cabeçalho.
 *
 * ## Por que este arquivo existe
 *
 * O defeito auditado não foi de aritmética. O total do CMV estava certo, e o
 * detalhamento embaixo dele mostrava outro número — R$ 18,00 no cabeçalho,
 * R$ 180,00 no filho. **Nenhum teste pegou, e nenhum pegaria**: a conta do
 * filho vivia dentro de uma IIFE no `page.tsx`, inalcançável sem renderizar o
 * componente.
 *
 * Ou seja: a linha do DRE tinha DUAS contas para o mesmo número, em módulos
 * diferentes, e só uma delas sob teste. Este arquivo prova a propriedade que
 * torna a divergência impossível:
 *
 * > a soma assinada dos filhos é IGUAL ao total do cabeçalho, sempre.
 *
 * "Sempre" inclui os casos de borda que a tela não sabia tratar: devolução,
 * devolução que zera o produto, venda anterior a G1 sem custo congelado, custo
 * unitário quebrado que não cai em centavo redondo, e mês vazio.
 */

const P = mesPeriodo("2026-09");

const mv = (id: string, over: Partial<InventoryMovementDoc> = {}): Doc<InventoryMovementDoc> =>
  ({
    id,
    kind: "venda",
    productId: "pomada",
    quantity: 2,
    unitPrice: 45,
    unitCost: 18,
    value: 90,
    date: "2026-09-14",
    paymentMethod: "credit",
    staffId: "leo",
    ...over,
  }) as Doc<InventoryMovementDoc>;

/** A soma que o dono faria na calculadora, olhando a tela. */
function somaDosFilhos(movements: Doc<InventoryMovementDoc>[]) {
  const d = detalheDoCustoDoVendido({ movements, periodo: P });
  return d.linhas.reduce((s, l) => s + l.custoVendido - l.custoDevolvido, 0);
}

/**
 * A prova central, aplicada a um cenário qualquer.
 *
 * Confere contra `custoDoVendido` — a função que o `analytics.ts` chama para
 * publicar `dre.cmv` — e não contra um valor recopiado no teste. Um número
 * escrito à mão aqui provaria que o teste sabe somar, não que a tela fecha.
 */
function fecha(movements: Doc<InventoryMovementDoc>[]) {
  const cabecalho = custoDoVendido({ movements, periodo: P }).total;
  expect(somaDosFilhos(movements)).toBeCloseTo(cabecalho, 10);
  return cabecalho;
}

describe("detalhe do CMV · a soma dos filhos fecha com o cabeçalho", () => {
  it("mês sem movimento nenhum", () => {
    expect(fecha([])).toBe(0);
    expect(detalheDoCustoDoVendido({ movements: [], periodo: P }).linhas).toEqual([]);
  });

  it("uma venda só", () => {
    expect(fecha([mv("mv1", { unitCost: 18, quantity: 1 })])).toBe(18);
  });

  it("vários produtos", () => {
    expect(
      fecha([
        mv("mv1", { productId: "pomada", unitCost: 18, quantity: 1 }),
        mv("mv2", { productId: "shampoo", unitCost: 7.5, quantity: 3 }),
        mv("mv3", { productId: "cera", unitCost: 22, quantity: 2 }),
      ])
    ).toBe(84.5);
  });

  it("venda parcialmente devolvida — o cenário da verificação em tela", () => {
    /* Vendeu 3, devolveu 1. O agregado dizia "2 un. vendidas" e a devolução
     * sumia da tela: o número parava de bater com a Loja, que mostra as 3
     * vendas. Agora são duas linhas, e as duas somam o cabeçalho. */
    const movs = [
      mv("mv1", { unitCost: 12, quantity: 3 }),
      mv("aj1", { kind: "ajuste", refundOf: "mv1", unitCost: 12, quantity: 1 }),
    ];
    expect(fecha(movs)).toBe(24);

    const [venda, devolucao] = detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas.flatMap(
      (l) => [l.custoVendido, l.custoDevolvido]
    );
    expect(venda).toBe(36);
    expect(devolucao).toBe(12);
  });

  it("a devolução continua VISÍVEL quando zera a quantidade do produto", () => {
    /* O filtro anterior (`unidades !== 0`) apagava a linha inteira: o produto
     * sumia do detalhamento e o dono não tinha como saber que houve venda e
     * devolução no mesmo mês. Custo zero é verdade; produto invisível não é. */
    const movs = [
      mv("mv1", { unitCost: 18, quantity: 2 }),
      mv("aj1", { kind: "ajuste", refundOf: "mv1", unitCost: 18, quantity: 2 }),
    ];
    expect(fecha(movs)).toBe(0);

    const d = detalheDoCustoDoVendido({ movements: movs, periodo: P });
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0]).toMatchObject({
      productId: "pomada",
      custoVendido: 36,
      custoDevolvido: 36,
      unidadesVendidas: 2,
      unidadesDevolvidas: 2,
    });
  });

  it("venda sem custo congelado: soma zero, some do total e NÃO some da tela", () => {
    /* Anterior a G1. Contribui R$ 0,00 — ler `products.cost` reintroduziria o
     * defeito que o D3 existe para matar. Mas se a linha simplesmente
     * desaparecer, o dono vê um total menor sem explicação e conclui que o
     * sistema perdeu a venda. */
    const movs = [
      mv("antigo", { productId: "cera", unitCost: undefined, quantity: 4 }),
      mv("mv1", { productId: "pomada", unitCost: 18, quantity: 2 }),
    ];
    expect(fecha(movs)).toBe(36);

    const d = detalheDoCustoDoVendido({ movements: movs, periodo: P });
    expect(d.semCustoCongelado).toBe(1);
    expect(d.unidadesSemCusto).toBe(4);

    const cera = d.linhas.find((l) => l.productId === "cera");
    expect(cera).toMatchObject({
      custoVendido: 0,
      unidadesVendidas: 0,
      vendasSemCusto: 1,
      unidadesSemCusto: 4,
    });
  });

  it("produto com venda com e sem custo na mesma linha", () => {
    const movs = [
      mv("antigo", { unitCost: undefined, quantity: 5 }),
      mv("mv1", { unitCost: 18, quantity: 2 }),
    ];
    expect(fecha(movs)).toBe(36);

    const [l] = detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas;
    /* A legenda precisa dos dois números: 2 un. custaram, 5 un. não entraram. */
    expect(l).toMatchObject({ unidadesVendidas: 2, unidadesSemCusto: 5, custoUnitario: 18 });
  });

  it("custo unitário quebrado — caixa de 12 por R$ 100,00", () => {
    /* R$ 8,3333… a unidade. A tela arredondava CADA filho e o motor arredondava
     * só o total: `Σ round(xᵢ) ≠ round(Σ xᵢ)`, e o detalhamento fugia do
     * cabeçalho por centavos. É o caso comum de quem compra por caixa. */
    const unitario = 100 / 12;
    const movs = [
      mv("mv1", { productId: "pomada", unitCost: unitario, quantity: 1 }),
      mv("mv2", { productId: "shampoo", unitCost: unitario, quantity: 1 }),
      mv("mv3", { productId: "cera", unitCost: unitario, quantity: 1 }),
    ];
    const cabecalho = fecha(movs);
    expect(cabecalho).toBe(25);

    /* E o que o dono soma na tela são valores em centavos inteiros — não um
     * arredondamento que a formatação faz por cima de fração. */
    for (const l of detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas) {
      expect(Number.isInteger(Math.round(l.custoVendido * 100))).toBe(true);
      expect(l.custoVendido * 100).toBeCloseTo(Math.round(l.custoVendido * 100), 9);
    }
  });

  it("`ajuste` sem `refundOf` não vira linha nem mexe no total", () => {
    /* Quebra, vencimento e recontagem são outra coisa, e mexem no resultado em
     * direção diferente de uma devolução. */
    const movs = [
      mv("mv1", { unitCost: 18, quantity: 2 }),
      mv("aj1", { kind: "ajuste", unitCost: 18, quantity: 5, refundOf: undefined }),
    ];
    expect(fecha(movs)).toBe(36);
    expect(detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas[0].unidadesDevolvidas).toBe(0);
  });

  it("compra do mês NÃO aparece no detalhamento — foi o defeito original", () => {
    /* O cabeçalho de R$ 18,00 com um filho de R$ 180,00: o detalhamento listava
     * `kind === "compra"`. Comprar estoque é saída de CAIXA, não custo do
     * período — D3. */
    const movs = [
      mv("mv1", { unitCost: 18, quantity: 1 }),
      mv("compra1", { kind: "compra", quantity: 10, value: 180, unitCost: 18 }),
    ];
    expect(fecha(movs)).toBe(18);

    const d = detalheDoCustoDoVendido({ movements: movs, periodo: P });
    expect(d.linhas).toHaveLength(1);
    expect(d.linhas[0].custoVendido).toBe(18);
    expect(d.linhas.some((l) => l.custoVendido === 180)).toBe(false);
  });

  it("movimento fora do período não entra em nenhum dos dois", () => {
    /* A tela filtrava com `date.startsWith(mes)` enquanto o motor usava
     * `dentroDoPeriodo`. Dois recortes escritos em lugares diferentes divergem
     * na borda, e a divergência aparece como um filho a mais sob um total que
     * não mudou. */
    expect(fecha([mv("mv1"), mv("mv2", { date: "2026-08-31" }), mv("mv3", { date: "2026-10-01" })])).toBe(36);
  });

  it("custo unitário diferente no mesmo mês não anuncia um `× R$ X` falso", () => {
    /* Duas reposições a preços diferentes na mesma prateleira é o caso normal —
     * é para isso que o custo é congelado por movimento. Uma legenda
     * "3 un. × R$ 9,00" aqui pediria uma multiplicação que não fecha. */
    const movs = [
      mv("mv1", { unitCost: 9, quantity: 1 }),
      mv("mv2", { unitCost: 12, quantity: 2 }),
    ];
    expect(fecha(movs)).toBe(33);
    expect(detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas[0].custoUnitario).toBeNull();
  });

  it("custo unitário igual em vendas separadas ainda permite o `× R$ X`", () => {
    const movs = [mv("mv1", { unitCost: 9, quantity: 1 }), mv("mv2", { unitCost: 9, quantity: 2 })];
    expect(fecha(movs)).toBe(27);
    expect(detalheDoCustoDoVendido({ movements: movs, periodo: P }).linhas[0].custoUnitario).toBe(9);
  });

  it("mês inteiramente devolvido não publica um CMV de −R$ 0,00", () => {
    /* Achado pelo cenário aleatório. Com custo quebrado, o acumulador termina
     * um fio abaixo de zero e `Math.round` devolve `-0`: o cabeçalho saía como
     * "−R$ 0,00", um custo negativo, que não existe. */
    const unitCost = 100 / 3;
    const total = detalheDoCustoDoVendido({
      movements: [
        mv("mv1", { unitCost, quantity: 3 }),
        mv("aj1", { kind: "ajuste", refundOf: "mv1", unitCost, quantity: 3 }),
      ],
      periodo: P,
    }).total;

    expect(total).toBe(0);
    expect(Object.is(total, -0)).toBe(false);
  });
});

describe("detalhe do CMV · a propriedade vale para cenário aleatório", () => {
  /**
   * O teste de exemplo prova os casos que alguém imaginou. Este prova a
   * propriedade.
   *
   * Gerador determinístico de propósito: um cenário que quebre precisa quebrar
   * de novo na próxima execução, senão o defeito vira folclore.
   */
  function aleatorio(seed: number) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
  }

  it("500 cenários: Σ filhos === cabeçalho, no centavo", () => {
    const produtos = ["pomada", "shampoo", "cera", "navalha", "oleo"];

    for (let cenario = 0; cenario < 500; cenario++) {
      const rnd = aleatorio(cenario + 1);
      const movements: Doc<InventoryMovementDoc>[] = [];
      const vendas: { id: string; productId: string; unitCost: number; quantity: number }[] = [];

      const n = 1 + Math.floor(rnd() * 12);
      for (let i = 0; i < n; i++) {
        const productId = produtos[Math.floor(rnd() * produtos.length)];
        const quantity = 1 + Math.floor(rnd() * 6);
        /* Custos quebrados de propósito: compra por caixa, rateio por unidade.
         * Custo redondo esconderia justamente o defeito de arredondamento. */
        const unitCost = Math.round(rnd() * 10000) / 300;
        /* Uma parte das vendas é anterior a G1 e não tem custo congelado. */
        const semCusto = rnd() < 0.2;

        movements.push(
          mv(`mv${cenario}-${i}`, {
            productId,
            quantity,
            unitCost: semCusto ? undefined : unitCost,
            date: `2026-09-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
          })
        );
        if (!semCusto) vendas.push({ id: `mv${cenario}-${i}`, productId, unitCost, quantity });

        /* Ruído que não pode entrar no CMV: compra de estoque e ajuste de
         * inventário sem `refundOf`. */
        if (rnd() < 0.3) {
          movements.push(
            mv(`cp${cenario}-${i}`, { kind: "compra", productId, quantity: 10, unitCost, value: 10 * unitCost })
          );
        }
        if (rnd() < 0.2) {
          movements.push(
            mv(`qb${cenario}-${i}`, { kind: "ajuste", productId, quantity: 2, unitCost, refundOf: undefined })
          );
        }
        /* Movimento fora do mês. */
        if (rnd() < 0.2) {
          movements.push(mv(`fora${cenario}-${i}`, { productId, quantity, unitCost, date: "2026-08-20" }));
        }
      }

      /* Devoluções: o servidor copia `unitCost` e `productId` do original, e a
       * quantidade devolvida nunca passa da vendida. */
      for (const v of vendas) {
        if (rnd() < 0.35) {
          movements.push(
            mv(`aj-${v.id}`, {
              kind: "ajuste",
              refundOf: v.id,
              productId: v.productId,
              unitCost: v.unitCost,
              quantity: 1 + Math.floor(rnd() * v.quantity),
            })
          );
        }
      }

      const cabecalho = custoDoVendido({ movements, periodo: P }).total;
      const filhos = somaDosFilhos(movements);

      /* Em centavos inteiros: é o que a tela mostra e o que o dono soma. */
      expect(Math.round(filhos * 100)).toBe(Math.round(cabecalho * 100));
    }
  });
});
