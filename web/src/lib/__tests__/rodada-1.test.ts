import { describe, expect, it } from "vitest";
import {
  composicaoDaReceita,
  HORIZONTES,
  indicadores,
  mesPeriodo,
  previsaoDoDia,
  receitaDoMes,
  resumoDeDespesas,
  resultadoDoMes,
  taxasDePagamento,
} from "@/lib/analytics";
import { isReceived, isRevenue, OCCUPIES_SLOT } from "@/lib/domain";
import {
  BOOKINGS,
  COMMISSIONS,
  COMMISSIONS_PRODUTO,
  EXPENSES,
  MES,
  MOVEMENTS,
  PAYMENTS,
  PAYMENTS_PRODUTO,
  POLICIES,
  STAFF,
  SUBSCRIBERS,
} from "./massa-conhecida";
import type { TenantPolicies } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc } from "@/lib/domain";

/**
 * Rodada 1 — as promessas falsas e os números que mentem.
 *
 * Cada bloco captura um comportamento **incorreto** observado na auditoria, com
 * o número dos dois lados. Todos falham antes da correção.
 *
 * A régua desta rodada, e o que ela proíbe: **não é "fazer o número bater"**.
 * D6 não é esconder os R$ 248 de mensalista — é colocá-los onde eles são
 * verdade. D2 não é trocar 85 por 48,75 — é corrigir o que o ticket significa.
 */

const periodo = mesPeriodo(MES);
const policies = POLICIES as unknown as TenantPolicies;

const receita = receitaDoMes({
  bookings: BOOKINGS,
  movements: MOVEMENTS,
  subscribers: SUBSCRIBERS,
  periodo,
  hoje: new Date("2026-09-30T12:00:00"),
});

const dre = resultadoDoMes({
  receita,
  expenses: EXPENSES,
  movements: MOVEMENTS,
  periodo,
  policies,
  staff: STAFF,
  bookings: BOOKINGS,
  commissions: [...COMMISSIONS, ...COMMISSIONS_PRODUTO],
  gatewayFeesTotal: taxasDePagamento([...PAYMENTS, ...PAYMENTS_PRODUTO], periodo),
});

/* ================================================================== */
/* D2 · o ticket médio precisa medir o ATENDIMENTO                    */
/* ================================================================== */

describe("D2 · ticket médio", () => {
  const kpis = indicadores({ bookings: BOOKINGS, receita, periodo, capacidade: 200 });

  it("mede o valor médio do ATENDIMENTO, não da receita total", () => {
    /* Dividia `receita.bruta` — que inclui os R$ 290 de produto — pelo número
     * de atendimentos de SERVIÇO. Dava 85,00 onde o serviço médio é 48,75.
     *
     * Não é arredondamento: é o numerador de uma grandeza sobre o denominador
     * de outra. E é o número com que o dono decide preço. */
    expect(kpis.avgTicket).toBe(49); // 390 ÷ 8 = 48,75, arredondado
  });

  it("o produto tem indicador próprio, em vez de sumir", () => {
    /* Corrigir o ticket não pode apagar a informação: quem vende bem no balcão
     * precisa enxergar isso. O valor médio por atendimento COM produto continua
     * disponível, com nome próprio. */
    expect(kpis.avgTicketComProduto).toBe(85); // 680 ÷ 8
  });

  it("sem atendimento, não inventa ticket", () => {
    const vazio = indicadores({
      bookings: [],
      receita: { ...receita, atendimentos: 0, servicos: 0, encaixes: 0, bruta: 0 },
      periodo,
      capacidade: 200,
    });
    expect(vazio.avgTicket).toBe(0);
    expect(vazio.avgTicketComProduto).toBe(0);
  });
});

/* ================================================================== */
/* D6 · mensalista sai da árvore da RECEITA REALIZADA                 */
/* ================================================================== */

describe("D6 · composição da receita", () => {
  const composicao = composicaoDaReceita(receita);

  it("os filhos somam exatamente o cabeçalho", () => {
    /* Era a quebra da invariante I4: a árvore listava mensalistas (248) sob um
     * cabeçalho de 680, e os filhos somavam 928. O dono expandia, somava na
     * mão, e não fechava. */
    const soma = composicao.reduce((s, i) => s + i.value, 0);
    expect(soma).toBe(receita.bruta);
    expect(soma).toBe(680);
  });

  it("mensalista NÃO está entre os filhos", () => {
    expect(composicao.map((i) => i.label)).not.toContain("Mensalistas");
  });

  it("mas continua exposto onde é verdade — contratado, não realizado", () => {
    /* A correção não esconde os R$ 248. Ela os coloca onde eles são verdade:
     * receita CONTRATADA, com nome próprio, fora do realizado.
     *
     * A regra, escrita: contratado projeta, realizado fatura. */
    expect(receita.mensalistas).toBe(248);
    expect(receita.bruta).not.toBe(680 + 248);
  });

  it("linha zerada não polui a árvore", () => {
    const semProduto = { ...receita, produtos: 0 };
    expect(composicaoDaReceita(semProduto).map((i) => i.label)).not.toContain(
      "Produtos (loja)"
    );
  });

  it("a mesma função serve o DRE e o Financeiro", () => {
    /* As duas telas montavam a composição por conta própria, e discordavam:
     * o Financeiro excluía mensalista, o DRE incluía. Uma fonte só impede que
     * voltem a divergir. */
    expect(composicao.length).toBeGreaterThan(0);
    for (const item of composicao) {
      expect(item.value).toBeGreaterThan(0);
      expect(typeof item.label).toBe("string");
    }
  });
});

/* ================================================================== */
/* D10 · a previsão do dia desconta a falta confirmada                */
/* ================================================================== */

describe("D10 · previsão do dia", () => {
  const hoje = "2026-09-18"; // o dia do no-show na massa
  const doDia = BOOKINGS.filter((b) => b.date === hoje);

  it("não conta o que já se sabe que não vem", () => {
    /* `no_show` ocupa a cadeira — corretamente, porque ela foi reservada e
     * ninguém mais pôde usá-la. Mas a PREVISÃO é sobre o que ainda pode virar
     * receita, e a falta já foi confirmada pelo dono.
     *
     * Antes: o recebido caía para zero e a previsão continuava nos R$ 50 — a
     * barra mostrava 0% de um valor que já se sabia que não viria. */
    expect(previsaoDoDia(doDia)).toBe(0);
  });

  it("conta o que ainda está em aberto", () => {
    const emAberto = BOOKINGS.filter((b) => b.date === "2026-09-03");
    expect(previsaoDoDia(emAberto)).toBe(90);
  });

  it("conta o que já foi concluído — o dinheiro entrou", () => {
    const concluido: Doc<BookingDoc>[] = [
      { ...BOOKINGS[0], status: "completed", value: 50 },
    ];
    expect(previsaoDoDia(concluido)).toBe(50);
  });

  it("não conta cancelado", () => {
    const cancelado = BOOKINGS.filter((b) => b.date === "2026-09-20");
    expect(previsaoDoDia(cancelado)).toBe(0);
  });

  it("a falta continua OCUPANDO a agenda — são perguntas diferentes", () => {
    /* A correção não pode tirar o no-show da ocupação: a cadeira foi perdida, e
     * é exatamente esse o custo da falta. O que muda é só a previsão. */
    const ocupados = doDia.filter((b) => OCCUPIES_SLOT.includes(b.status));
    expect(ocupados).toHaveLength(1);
  });
});

/* ================================================================== */
/* P1-1 · despesas são do MÊS, como o rótulo diz                      */
/* ================================================================== */

describe("P1-1 · resumo de despesas", () => {
  const resumo = resumoDeDespesas(EXPENSES, periodo);

  it("soma só o período, não o histórico", () => {
    /* A tela somava TODAS as despesas já lançadas sob o rótulo "Total no mês".
     * O erro cresce a cada mês de uso: no terceiro, mostra o triplo. */
    expect(resumo.total).toBe(2550);
    expect(resumo.lancamentos).toBe(3);
  });

  it("separa recorrente de eventual", () => {
    expect(resumo.recorrentes).toBe(2350);
  });

  it("aponta a maior categoria do período", () => {
    expect(resumo.maiorCategoria.categoria).toBe("Aluguel");
    expect(resumo.maiorCategoria.valor).toBe(2000);
  });

  it("despesa de outro mês fica de fora", () => {
    const comOutroMes = [
      ...EXPENSES,
      {
        id: "D99",
        category: "Aluguel",
        description: "Aluguel de agosto",
        supplier: "Imobiliária",
        value: 9999,
        date: "2026-08-05",
        payment: "Boleto" as const,
        recurring: true,
      },
    ];
    expect(resumoDeDespesas(comOutroMes, periodo).total).toBe(2550);
  });

  it("mês sem lançamento devolve zero, não NaN", () => {
    const vazio = resumoDeDespesas([], periodo);
    expect(vazio.total).toBe(0);
    expect(vazio.maiorCategoria.valor).toBe(0);
    expect(vazio.maiorCategoria.categoria).toBe("—");
  });
});

/* ================================================================== */
/* P1-9 · a comissão da loja é a da LOJA                              */
/* ================================================================== */

describe("P1-9 · comissão sob o faturamento da loja", () => {
  it("o número que acompanha a loja é o da loja", () => {
    /* Sob um cartão de R$ 290 de faturamento, a legenda mostrava a comissão do
     * mês inteiro, serviço incluído.
     *
     * Os dois valores mudaram na Rodada 3.2 — a comissão de loja passou a sair
     * do fato materializado, e subiu de 44 para 69,60 porque o CMV deixou de
     * estar inflado. O que este teste protege continua sendo a SEPARAÇÃO: o
     * número da loja não é o número do mês. */
    expect(dre.commissionsLoja).toBe(69.6);
    expect(dre.commissions).toBeCloseTo(248.1, 2);
    expect(dre.commissionsLoja).not.toBe(dre.commissions);
  });
});

/* ================================================================== */
/* P1-11 · a legenda do caixa descreve a regra que existe             */
/* ================================================================== */

describe("P1-11 · a regra do recebido", () => {
  /* A legenda ensinava que "Pix e cartão contam assim que confirmados". Ela
   * descrevia o comportamento ANTERIOR — o produto passou a ter um marco só.
   *
   * Corrigir a frase sem prender a invariante deixaria o mesmo defeito voltar
   * na próxima edição de texto. Estes testes são o que a frase promete, dito
   * em código: nenhum meio de pagamento antecipa o recebimento. */
  const meios = ["pix", "cash", "debit", "credit"] as const;
  const antesDaConclusao = [
    "pending_payment",
    "confirmed",
    "confirmed_by_client",
    "fit_in_requested",
  ] as const;

  it("nenhum meio de pagamento entra antes da conclusão", () => {
    for (const status of antesDaConclusao) {
      expect(isReceived({ status }), `${status} não pode contar como recebido`).toBe(false);
    }
  });

  it("concluído entra, em qualquer meio", () => {
    /* `isReceived` olha o status, não o meio — e é justamente isso que a
     * legenda passou a dizer: "em qualquer forma de pagamento". */
    expect(isReceived({ status: "completed" })).toBe(true);
    for (const metodo of meios) {
      const b: Doc<BookingDoc> = { ...BOOKINGS[0], status: "completed", paymentMethod: metodo };
      expect(isReceived(b), `${metodo} concluído deve contar`).toBe(true);
    }
  });

  it("falta e cancelamento não entram", () => {
    expect(isReceived({ status: "no_show" })).toBe(false);
    expect(isReceived({ status: "cancelled_by_client" })).toBe(false);
    expect(isReceived({ status: "cancelled_by_shop" })).toBe(false);
  });

  it("receita e caixa usam o MESMO marco — é o que torna a frase única", () => {
    for (const status of [...antesDaConclusao, "completed", "no_show"] as const) {
      expect(isRevenue({ status })).toBe(isReceived({ status }));
    }
  });
});

/* ================================================================== */
/* D9 · o KPI de custo diz o que mostra                               */
/* ================================================================== */

describe("D9 · custo total não é despesa", () => {
  it("o número do cartão é o custo TOTAL, não as despesas", () => {
    /* O rótulo dizia "Despesas" sobre `dre.totalCost`. O dono pensa em aluguel
     * e luz — 2.550 na massa — e lia 2.997,50. O número sempre esteve certo
     * para o que é; o rótulo é que descrevia outra grandeza.
     *
     * A distância entre os dois é exatamente o que o rótulo novo enumera. */
    const despesasDoPeriodo = resumoDeDespesas(EXPENSES, periodo).total;
    expect(despesasDoPeriodo).toBe(2550);
    /* 2.997,50 → 2.962,75 com as correções da 3.2. O achado nunca foi o valor:
     * é o rótulo chamar de "despesas" um total que inclui CMV, taxas,
     * comissões e imposto. */
    expect(dre.totalCost).toBeCloseTo(2962.75, 2);
    expect(dre.totalCost).not.toBe(despesasDoPeriodo);
  });

  it("as SEIS parcelas do rótulo fecham o total, sem sobra", () => {
    /* "comissões, folha, taxas, produto, despesas e imposto". Se a soma dessas
     * parcelas não fechasse com o total, o rótulo novo seria tão falso quanto o
     * antigo, só que em outra direção — e foi assim que a folha apareceu: a
     * primeira versão da legenda citava cinco parcelas, e `payroll` entra em
     * produção por `folhaMensal(staff)`. Este teste é o que impede uma
     * enumeração incompleta de passar por completa. */
    const despesas = dre.fixedExpenses + dre.variableOperatingExpenses;
    const soma =
      dre.commissions + dre.payroll + dre.gatewayFees + dre.cmv + despesas + dre.tax;
    expect(soma).toBeCloseTo(dre.totalCost, 2);
  });

  it("o bloco 'despesas' do rótulo é o mesmo da tela de Despesas", () => {
    /* As duas telas precisam concordar sobre o que é despesa, ou o dono soma a
     * de lá com o custo de cá e encontra um número que não existe. */
    expect(dre.fixedExpenses + dre.variableOperatingExpenses).toBeCloseTo(
      resumoDeDespesas(EXPENSES, periodo).total,
      2
    );
  });
});

/* ================================================================== */
/* P1-14 · a projeção diz o horizonte que está selecionado            */
/* ================================================================== */

describe("P1-14 · o rótulo do horizonte", () => {
  it("os quatro horizontes têm durações diferentes", () => {
    /* A legenda era "acumulado nos 30 dias" fixa, com um seletor de quatro
     * opções em cima. Em três das quatro ela estava errada — e o erro crescia
     * com o horizonte: no anual, descrevia 8% do período que somava. */
    const dias = Object.values(HORIZONTES).map((h) => h.dias);
    expect(dias).toEqual([30, 91, 182, 365]);
    expect(new Set(dias).size).toBe(4);
  });

  it("só um dos quatro casaria com o rótulo antigo", () => {
    const casamComTrinta = Object.values(HORIZONTES).filter((h) => h.dias === 30);
    expect(casamComTrinta).toHaveLength(1);
  });
});
