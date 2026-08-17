import { describe, expect, it } from "vitest";
import {
  caixaDiario,
  comissoesDeServico,
  indicadores,
  mesPeriodo,
  receitaDoMes,
  resultadoDoMes,
  taxasDePagamento,
} from "@/lib/analytics";
import {
  BOOKINGS,
  COMMISSIONS,
  ESTOQUE_INICIAL,
  EXPENSES,
  MEIO_DA_VENDA,
  MES,
  MOVEMENTS,
  PAYMENTS,
  POLICIES,
  STAFF,
  SUBSCRIBERS,
} from "./massa-conhecida";
import type { TenantPolicies } from "@/lib/tenant";

/**
 * Reconciliação da massa conhecida — Fase 2.
 *
 * **Os valores esperados foram calculados à mão em `LEDGER-DE-VALIDACAO.md`,
 * antes de este arquivo existir e antes de qualquer execução.** Eles estão
 * abaixo como literais, e nenhum é derivado da massa ou do sistema: derivar
 * seria conferir o produto contra a própria regra que ele implementa, que é o
 * formato de teste que este projeto já viu passar afirmando o comportamento
 * errado.
 *
 * Onde o sistema diverge do ledger, o teste **documenta a divergência com o
 * número dos dois lados** em vez de falhar. Estamos em auditoria, não em
 * correção: a falha viraria pressão para "fazer o número bater", e o que
 * queremos é saber exatamente onde ele não bate e por quê.
 *
 * Os `it` que começam com "DIVERGE" são achados confirmados. Cada um vira
 * decisão no próximo gate.
 */

/* ---- O LEDGER, calculado à mão. Não tocar sem refazer a conta no doc. ---- */
const LEDGER = {
  receita: {
    servicos: 390.0,
    produtos: 290.0,
    realizada: 680.0,
    foraDaReceita: { noShow: 50.0, cancelado: 50.0, mensalistas: 248.0 },
  },
  comissao: {
    rafael: 66.0,
    leo: 112.5,
    servico: 178.5,
    loja: 69.6,
    total: 248.1,
  },
  cmv: 116.0,
  taxas: { servicos: 4.14, produtos: 3.71, total: 7.85 },
  dre: {
    custoVariavel: 371.95,
    margemContribuicao: 308.05,
    custoFixo: 2550.0,
    imposto: 40.8,
    resultado: -2282.75,
  },
  caixa: {
    pix: 300.0,
    cartao: 285.0,
    dinheiro: 95.0,
    recebido: 680.0,
    saidas: 3026.75,
    fluxo: -2346.75,
  },
  estoqueQueFicou: 64.0,
  indicadores: {
    atendimentos: 8,
    reservas: 10,
    faltas: 1,
    noShowPct: 10.0,
    cancelamentos: 1,
    ticketDeServico: 48.75,
    ocupados: 9,
  },
} as const;

const periodo = mesPeriodo(MES);
const policies = POLICIES as unknown as TenantPolicies;

/** O que o sistema calcula, uma vez, para todas as visões. */
const receita = receitaDoMes({
  bookings: BOOKINGS,
  movements: MOVEMENTS,
  subscribers: SUBSCRIBERS,
  periodo,
  hoje: new Date("2026-09-30T12:00:00"),
});

const gatewayFeesTotal = taxasDePagamento(PAYMENTS, periodo);

const dre = resultadoDoMes({
  receita,
  expenses: EXPENSES,
  movements: MOVEMENTS,
  periodo,
  policies,
  staff: STAFF,
  bookings: BOOKINGS,
  commissions: COMMISSIONS,
  gatewayFeesTotal,
});

const caixa = caixaDiario({ bookings: BOOKINGS, movements: MOVEMENTS, periodo });
const totalCaixa = caixa.reduce(
  (acc, d) => ({
    pix: acc.pix + d.pix,
    cartao: acc.cartao + d.cartao,
    dinheiro: acc.dinheiro + d.dinheiro,
    total: acc.total + d.total,
  }),
  { pix: 0, cartao: 0, dinheiro: 0, total: 0 }
);

const kpis = indicadores({
  bookings: BOOKINGS,
  receita,
  periodo,
  capacidade: 200,
});

const comissoes = comissoesDeServico({
  bookings: BOOKINGS,
  staff: STAFF,
  periodo,
  policies,
  commissions: COMMISSIONS,
});

/* ================================================================== */
/* NÍVEL 1 — operacional                                              */
/* ================================================================== */

describe("nível 1 · operacional", () => {
  it("os 10 atendimentos estão na massa, com 8 concluídos", () => {
    expect(BOOKINGS).toHaveLength(LEDGER.indicadores.reservas);
    expect(BOOKINGS.filter((b) => b.status === "completed")).toHaveLength(
      LEDGER.indicadores.atendimentos
    );
  });

  it("o combo dura 60 min e vale 90", () => {
    const combo = BOOKINGS.find((b) => b.serviceIds.length > 1)!;
    expect(combo.durationMin).toBe(60);
    expect(combo.value).toBe(90);
  });

  it("a falta OCUPA o horário e o cancelamento LIBERA", () => {
    /* A falta custou a cadeira: ela foi reservada e ninguém mais pôde usá-la. */
    expect(kpis.totalBookings).toBe(LEDGER.indicadores.reservas);
    expect(kpis.noShowCount).toBe(LEDGER.indicadores.faltas);
    expect(kpis.lateCancelCount).toBe(LEDGER.indicadores.cancelamentos);
  });

  it("cada barbeiro atendeu o que a massa diz", () => {
    const porBarbeiro = (id: string) =>
      BOOKINGS.filter((b) => b.staffId === id && b.status === "completed").length;
    expect(porBarbeiro("b-rafael")).toBe(4);
    expect(porBarbeiro("b-leo")).toBe(4);
  });
});

/* ================================================================== */
/* NÍVEL 2 — financeiro                                               */
/* ================================================================== */

describe("bloco 1 · receita realizada", () => {
  it("serviços somam o do ledger", () => {
    expect(receita.servicos).toBe(LEDGER.receita.servicos);
  });

  it("produtos somam o do ledger", () => {
    expect(receita.produtos).toBe(LEDGER.receita.produtos);
  });

  it("a receita realizada é 680,00", () => {
    expect(receita.bruta).toBe(LEDGER.receita.realizada);
  });

  /* --- e agora a metade que mais importa: o que NÃO entrou --- */

  it("I5 · mensalista ativo NÃO é receita realizada", () => {
    /* A invariante permanente. Foi o defeito do PR #18: R$ 248 de contrato
     * viravam recebimento porque alguém deixou o status como "ativo". */
    // O valor é conhecido e exposto...
    expect(receita.mensalistas).toBe(LEDGER.receita.foraDaReceita.mensalistas);
    // ...e NÃO compõe a receita bruta.
    expect(receita.bruta).toBe(LEDGER.receita.realizada);
    expect(receita.bruta).toBe(receita.servicos + receita.encaixes + receita.produtos);
    // A prova pelo contrário: se entrasse, a bruta seria 928.
    expect(receita.bruta).not.toBe(LEDGER.receita.realizada + receita.mensalistas);
    // E o imposto não incide sobre ele.
    expect(dre.tax).toBeLessThan(((680 + 248) * 6) / 100);
  });

  it("I6 · no-show não vira receita", () => {
    const semNoShow = LEDGER.receita.realizada;
    expect(receita.bruta).toBe(semNoShow);
    // O valor existe na reserva e não no faturamento.
    expect(BOOKINGS.find((b) => b.status === "no_show")!.value).toBe(
      LEDGER.receita.foraDaReceita.noShow
    );
  });

  it("I6 · cancelamento não vira receita", () => {
    expect(BOOKINGS.find((b) => b.status === "cancelled_by_client")!.value).toBe(
      LEDGER.receita.foraDaReceita.cancelado
    );
    expect(receita.atendimentos).toBe(LEDGER.indicadores.atendimentos);
  });

  it("os R$ 348 de fora somam o esperado", () => {
    const { noShow, cancelado, mensalistas } = LEDGER.receita.foraDaReceita;
    expect(noShow + cancelado + mensalistas).toBe(348);
  });
});

describe("bloco 2 · resultado", () => {
  it("I3 · comissão por barbeiro bate com o congelado", () => {
    const porNome = (n: string) =>
      comissoes.porBarbeiro.find((b) => b.nome === n)!;
    expect(porNome("Rafael").valor).toBe(LEDGER.comissao.rafael);
    expect(porNome("Léo").valor).toBe(LEDGER.comissao.leo);
  });

  it("I3 · a soma por barbeiro é a comissão de serviço do DRE", () => {
    expect(comissoes.total).toBe(LEDGER.comissao.servico);
    expect(dre.commissionsServico).toBe(LEDGER.comissao.servico);
  });

  it("o percentual exibido é recalculado do que foi somado", () => {
    const porNome = (n: string) =>
      comissoes.porBarbeiro.find((b) => b.nome === n)!;
    expect(porNome("Rafael").pct).toBe(40);
    expect(porNome("Léo").pct).toBe(50);
  });

  it("I2 · a identidade receita − custo = resultado vale", () => {
    expect(dre.grossRevenue - dre.totalCost).toBeCloseTo(dre.result, 2);
  });

  it("custo fixo é o do ledger", () => {
    expect(dre.fixedCost).toBe(LEDGER.dre.custoFixo);
    expect(dre.fixedExpenses).toBe(2350);
    expect(dre.variableOperatingExpenses).toBe(200);
  });
});

/* ================================================================== */
/* DIVERGÊNCIAS — achados confirmados                                 */
/* ================================================================== */

describe("DIVERGE · D3 · CMV soma as compras, não o custo do vendido", () => {
  it("o sistema debita 180 onde o ledger diz 116", () => {
    /* Premissa N11: compra de estoque não é automaticamente CMV.
     * Foram vendidas 4 pomadas (72) e 2 shampoos (44) = 116. O sistema soma a
     * compra do período — 10 pomadas, 180 — e o lucro da loja aparece 64 menor
     * num mês de reposição. */
    expect(dre.cmv).toBe(180);
    expect(LEDGER.cmv).toBe(116);
    expect(dre.cmv - LEDGER.cmv).toBe(LEDGER.estoqueQueFicou);
  });

  it("e a comissão de produto herda o erro", () => {
    // lucro do sistema: 290 − 180 = 110 → 44. Ledger: 290 − 116 = 174 → 69,60.
    expect(dre.commissionsLoja).toBe(44);
    expect(LEDGER.comissao.loja).toBe(69.6);
  });
});

describe("DIVERGE · D7 · venda de produto não gera taxa de maquininha", () => {
  it("o sistema cobra taxa só dos serviços", () => {
    /* Premissa N12: a venda carrega o meio de pagamento. V03 (crédito) e V04
     * (débito) pagam maquininha — 3,71 no ledger. O sistema não gera `payment`
     * para venda de produto, então a taxa não existe. */
    expect(gatewayFeesTotal).toBe(Math.round(LEDGER.taxas.servicos));
    expect(LEDGER.taxas.total).toBe(7.85);
  });
});

describe("DIVERGE · D1/D5 · arredondamento para real inteiro", () => {
  it("a soma das taxas perde os centavos", () => {
    // 4,14 → 4. Sistemático, e sempre a favor do lucro aparente.
    expect(gatewayFeesTotal).toBe(4);
    expect(LEDGER.taxas.servicos).toBe(4.14);
  });

  it("o imposto também", () => {
    // 40,80 → 41.
    expect(dre.tax).toBe(41);
    expect(LEDGER.dre.imposto).toBe(40.8);
  });
});

describe("CONVERGE · D2 · o ticket médio mede o atendimento", () => {
  it("divide a receita de SERVIÇO pelos atendimentos de serviço", () => {
    /* Divergência fechada na Rodada 1.
     *
     * Dividia 680 (com os R$ 290 de produto) por 8 atendimentos e dava 85 — o
     * numerador de uma grandeza sobre o denominador de outra, 74% acima do real.
     * É o número com que o dono decide preço.
     *
     * Sobra 0,25 contra o ledger, e ela NÃO é de D2: `indicadores` arredonda ao
     * real, não ao centavo. Isso é D1/D5, aberto e registrado abaixo — a
     * correção de um achado não pode ser usada para varrer outro. */
    expect(kpis.avgTicket).toBe(49);
    expect(LEDGER.indicadores.ticketDeServico).toBe(48.75);
    expect(kpis.avgTicket - LEDGER.indicadores.ticketDeServico).toBeCloseTo(0.25, 2);
  });

  it("o produto continua medido, com nome próprio", () => {
    /* A correção não podia apagar a informação: quem vende bem no balcão precisa
     * enxergar isso. Os 85 antigos viraram um indicador legítimo — só deixaram
     * de se chamar "ticket médio". */
    expect(kpis.avgTicketComProduto).toBe(85);
    expect(kpis.avgTicketComProduto).toBe(
      Math.round(LEDGER.receita.realizada / LEDGER.indicadores.atendimentos)
    );
  });
});

describe("DIVERGE · D4 · o caixa não preserva o meio de pagamento da venda", () => {
  it("joga os R$ 290 de produto todo em dinheiro", () => {
    /* Premissa N12. O ledger espera pix 300 · cartão 285 · dinheiro 95. */
    expect(totalCaixa.pix).toBe(200);
    expect(totalCaixa.cartao).toBe(140);
    expect(totalCaixa.dinheiro).toBe(340);

    expect(LEDGER.caixa.pix).toBe(300);
    expect(LEDGER.caixa.cartao).toBe(285);
    expect(LEDGER.caixa.dinheiro).toBe(95);
  });

  it("o total ainda fecha — o erro está na distribuição, não na soma", () => {
    expect(totalCaixa.total).toBe(LEDGER.caixa.recebido);
  });

  it("o modelo de estoque não tem onde guardar o meio", () => {
    /* A prova da lacuna: o meio de cada venda vive fora do documento, porque
     * `InventoryMovementDoc` não tem o campo. */
    const venda = MOVEMENTS.find((m) => m.id === "V03")!;
    expect(venda).not.toHaveProperty("paymentMethod");
    expect(MEIO_DA_VENDA.V03).toBe("credit");
  });
});

describe("DIVERGE · D8 · não existe bloco de caixa separado do resultado", () => {
  it("o sistema não distingue saída de estoque de custo do vendido", () => {
    /* O ledger separa:
     *   resultado  −2.282,75   (econômico, com CMV de 116)
     *   caixa      −2.346,75   (financeiro, com saída de 180)
     *   diferença      64,00   = o estoque que ficou na prateleira
     *
     * O sistema tem uma visão só. `caixaDiario` é relatório de ENTRADA — não
     * subtrai compra, despesa, comissão nem imposto —, então não há como
     * responder "quanto sobrou no caixa". */
    const entradasDoSistema = totalCaixa.total;
    expect(entradasDoSistema).toBe(680);

    // O fluxo de caixa do ledger não tem correspondente no produto.
    expect(LEDGER.caixa.fluxo).toBe(-2346.75);
    expect(LEDGER.dre.resultado).toBe(-2282.75);
    expect(LEDGER.dre.resultado - LEDGER.caixa.fluxo).toBe(LEDGER.estoqueQueFicou);
  });

  it("o estoque que ficou é rastreável na massa", () => {
    const compras = MOVEMENTS.filter((m) => m.kind === "compra").reduce((s, m) => s + m.value, 0);
    expect(compras - LEDGER.cmv).toBe(LEDGER.estoqueQueFicou);
    // inicial 110 + compras 180 − CMV 116 = 174
    expect(ESTOQUE_INICIAL + compras - LEDGER.cmv).toBe(174);
  });
});

/* ================================================================== */
/* O efeito das divergências no resultado final                       */
/* ================================================================== */

describe("quanto as divergências custam no resultado", () => {
  it("o resultado do sistema difere do ledger", () => {
    /* Não é falha: é a soma de D1, D3, D5 e D7 aparecendo no número que o dono
     * usa para decidir. O teste registra os dois lados. */
    expect(LEDGER.dre.resultado).toBe(-2282.75);
    expect(dre.result).toBeCloseTo(-2317.5, 2);
  });

  it("a diferença é explicável, item a item", () => {
    /* CMV a mais ......... −64,00  (D3: 180 em vez de 116)
     * comissão de loja ... +25,60  (D3: 44 em vez de 69,60)
     * taxa de serviço .... +0,14   (D1: 4 em vez de 4,14)
     * taxa de produto .... +3,71   (D7: não cobrada)
     * imposto ............ −0,20   (D5: 41 em vez de 40,80)
     *                      ───────
     *                      −34,75  */
    const diferenca = dre.result - LEDGER.dre.resultado;
    expect(diferenca).toBeCloseTo(-34.75, 2);

    const explicacao = -64.0 + 25.6 + 0.14 + 3.71 - 0.2;
    expect(explicacao).toBeCloseTo(diferenca, 2);
  });
});
