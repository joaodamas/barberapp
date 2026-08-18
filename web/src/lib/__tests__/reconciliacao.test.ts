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
import { movimentosDeCaixa, resumoDoFluxo } from "@/lib/fluxo-de-caixa";
import {
  BOOKINGS,
  COMMISSIONS,
  COMMISSIONS_PRODUTO,
  EXPENSES,
  MEIO_DA_VENDA,
  MES,
  MOVEMENTS,
  PAYMENTS,
  PAYMENTS_PRODUTO,
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

const gatewayFeesTotal = taxasDePagamento([...PAYMENTS, ...PAYMENTS_PRODUTO], periodo);

const dre = resultadoDoMes({
  receita,
  expenses: EXPENSES,
  movements: MOVEMENTS,
  periodo,
  policies,
  staff: STAFF,
  bookings: BOOKINGS,
  commissions: [...COMMISSIONS, ...COMMISSIONS_PRODUTO],
  gatewayFeesTotal,
});

const caixa = caixaDiario({ payments: [...PAYMENTS, ...PAYMENTS_PRODUTO], periodo });
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
  commissions: [...COMMISSIONS, ...COMMISSIONS_PRODUTO],
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

describe("CONVERGE · D3 · CMV é o custo do VENDIDO", () => {
  it("o sistema debita 116, exatamente o ledger", () => {
    /* Divergência fechada na Rodada 3.2.
     *
     * Somava a compra do período — 10 pomadas, 180 — e o lucro da loja aparecia
     * 64 menor num mês de reposição. Agora sai do `unitCost` congelado em cada
     * venda: 4 pomadas (72) + 2 shampoos (44) = 116.
     *
     * Premissa N11 satisfeita: compra de estoque não é automaticamente CMV. Ela
     * vira saída de CAIXA, na 3.3. */
    expect(dre.cmv).toBe(116);
    expect(dre.cmv).toBe(LEDGER.cmv);
  });

  it("o estoque que ficou é a diferença entre o comprado e o vendido", () => {
    const compras = MOVEMENTS.filter((m) => m.kind === "compra").reduce((s, m) => s + m.value, 0);
    expect(compras - dre.cmv).toBe(LEDGER.estoqueQueFicou);
  });

  it("e a comissão de produto para de herdar o erro", () => {
    /* Era 40% sobre o lucro CALCULADO com o CMV errado — 44 em vez de 69,60. E
     * mesmo com o CMV certo continuaria errada por outro motivo: relia a
     * política de hoje (P1-7). Agora sai do fato materializado por venda. */
    expect(dre.commissionsLoja).toBe(69.6);
    expect(dre.commissionsLoja).toBe(LEDGER.comissao.loja);
  });
});

describe("CONVERGE · D7 · venda de produto gera taxa de maquininha", () => {
  it("a taxa cobre serviço E produto", () => {
    /* Premissa N12: a venda carrega o meio de pagamento. V03 (crédito, 55) e
     * V04 (débito, 90) pagam maquininha — 1,92 + 1,79 = 3,71. Antes de G1.6 a
     * venda não gerava `payment`, e a taxa simplesmente não existia. */
    expect(gatewayFeesTotal).toBe(7.85);
    expect(gatewayFeesTotal).toBe(LEDGER.taxas.total);
    expect(gatewayFeesTotal - LEDGER.taxas.servicos).toBeCloseTo(LEDGER.taxas.produtos, 2);
  });
});

describe("CONVERGE · D1/D5 · arredondamento ao centavo", () => {
  it("a soma das taxas mantém os centavos", () => {
    /* 7,85 arredondava para 8,00. Pequeno, sistemático, e some exatamente onde
     * seria conferido: o extrato da maquininha. */
    expect(gatewayFeesTotal).toBe(7.85);
    expect(gatewayFeesTotal).not.toBe(8);
  });

  it("o imposto também", () => {
    // 40,80 arredondava para 41,00 — e a guia que o dono paga diz 40,80.
    expect(dre.tax).toBe(40.8);
    expect(dre.tax).toBe(LEDGER.dre.imposto);
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

describe("CONVERGE · D4 · o caixa preserva o meio de pagamento da venda", () => {
  it("cada venda cai na coluna do instrumento que a pagou", () => {
    /* Premissa N12. Jogava os R$ 290 de produto todo em dinheiro, mesmo com o
     * meio gravado no movimento desde G1: pix 200 · cartão 140 · dinheiro 340.
     *
     * Os valores agora são LÍQUIDOS — a maquininha deposita já descontada, e é
     * contra o extrato que o dono confere. Por isso a coluna cartão fica abaixo
     * do bruto do ledger, e exatamente pela taxa. */
    expect(totalCaixa.pix).toBe(LEDGER.caixa.pix);
    expect(totalCaixa.dinheiro).toBe(LEDGER.caixa.dinheiro);
    expect(LEDGER.caixa.cartao - totalCaixa.cartao).toBeCloseTo(LEDGER.taxas.total, 2);
  });

  it("o total é o bruto do ledger menos as taxas", () => {
    expect(totalCaixa.total).toBeCloseTo(LEDGER.caixa.recebido - LEDGER.taxas.total, 2);
  });

  it("o modelo de estoque JÁ guarda o meio", () => {
    /* Era a prova da lacuna: o meio de cada venda vivia fora do documento
     * porque `InventoryMovementDoc` não tinha o campo. G1 o criou, e G1.6 fez a
     * venda gerar `PaymentDoc` — que é de onde o caixa lê agora. */
    const pagamento = PAYMENTS_PRODUTO.find((p) => p.movementId === "V03")!;
    expect(pagamento.paymentMethod).toBe("credit");
    expect(pagamento.paymentMethod).toBe(MEIO_DA_VENDA.V03);
  });
});

describe("CONVERGE · D8/D11 · existe caixa separado do resultado", () => {
  const fluxo = resumoDoFluxo(
    movimentosDeCaixa({
      payments: [...PAYMENTS, ...PAYMENTS_PRODUTO],
      refunds: [],
      expenses: EXPENSES,
      movements: MOVEMENTS,
      cashEntries: [],
      periodo,
    })
  );

  it("o fluxo tem SAÍDAS — deixou de ser faturamento com outro nome", () => {
    /* Era o D8/D11: `caixaDiario` só somava entradas, e não existia em lugar
     * nenhum um número que respondesse "quanto sobrou no caixa". */
    expect(fluxo.saidas).toBeGreaterThan(0);
    expect(fluxo.porOrigem.despesa).toBe(-2550);
    expect(fluxo.porOrigem.compra).toBe(-180);
  });

  it("CAIXA ≠ RESULTADO, e a diferença é o estoque que ficou", () => {
    /* A distinção que o D8 pedia. O DRE debita 116 de CMV; o caixa desembolsou
     * 180 na compra. Os 64 de diferença são mercadoria na prateleira — dinheiro
     * que saiu e ainda não virou custo. */
    expect(dre.cmv).toBe(116);
    expect(-fluxo.porOrigem.compra - dre.cmv).toBe(LEDGER.estoqueQueFicou);
  });

  it("a diferença para o ledger é EXPLICÁVEL, item a item", () => {
    /* O ledger humano assumiu que comissão e imposto saíram do caixa no mês. O
     * modelo não assume: comissão DEVIDA não é comissão PAGA — ela só vira
     * saída quando o dono registra o acerto em `cash_entries` (D25). O mesmo
     * vale para a guia do Simples, que é uma despesa quando lançada.
     *
     * Não é divergência a corrigir: é a diferença entre um ledger de papel, que
     * projeta o desembolso, e um sistema que só afirma o que aconteceu. A massa
     * não tem nenhum dos dois registros, então nenhum dos dois sai. */
    const diferenca = fluxo.saldo - LEDGER.caixa.fluxo;
    expect(diferenca).toBeCloseTo(LEDGER.comissao.total + LEDGER.dre.imposto, 2);
    expect(diferenca).toBeCloseTo(288.9, 2);
  });

  it("a taxa não é saída — ela nunca entrou", () => {
    /* O ledger soma 680 de entrada e 7,85 de saída; o modelo entra com 672,15.
     * Mesmo saldo, e o segundo é o que o extrato mostra. */
    expect(fluxo.entradas).toBeCloseTo(LEDGER.caixa.recebido - LEDGER.taxas.total, 2);
  });
});

/* ================================================================== */
/* O efeito das divergências no resultado final                       */
/* ================================================================== */

describe("o resultado do sistema BATE com o ledger", () => {
  it("a divergência é ZERO", () => {
    /* O marco da Rodada 3.2.
     *
     * Antes dela o sistema dizia −2.317,50 e o ledger −2.282,75: R$ 34,75 de
     * diferença, decomposta em quatro achados. Agora os dois números são o
     * mesmo, e nenhum foi ajustado para bater — cada linha passou a ler o fato
     * que a Rodada 3.1 criou.
     *
     * A conta que fechou:
     *
     *   CMV .............. −64,00 → 0   (D3: 116 em vez de 180)
     *   comissão de loja . +25,60 → 0   (D3+P1-7: fato, não derivação)
     *   taxa de serviço .. +0,14  → 0   (D1: centavo)
     *   taxa de produto .. +3,71  → 0   (D7: venda gera pagamento)
     *   imposto .......... −0,20  → 0   (D5: centavo)
     *   ─────────────────────────────
     *                      −34,75 → 0 */
    expect(LEDGER.dre.resultado).toBe(-2282.75);
    expect(dre.result).toBeCloseTo(LEDGER.dre.resultado, 2);
    expect(dre.result - LEDGER.dre.resultado).toBeCloseTo(0, 2);
  });

  it("cada linha do DRE bate, e não só o total", () => {
    /* Um total certo pode esconder dois erros que se cancelam. A régua da
     * rodada é linha a linha. */
    expect(dre.grossRevenue).toBeCloseTo(LEDGER.receita.realizada, 2);
    expect(dre.cmv).toBeCloseTo(LEDGER.cmv, 2);
    expect(dre.gatewayFees).toBeCloseTo(LEDGER.taxas.total, 2);
    expect(dre.commissionsServico).toBeCloseTo(LEDGER.comissao.servico, 2);
    expect(dre.commissionsLoja).toBeCloseTo(LEDGER.comissao.loja, 2);
    expect(dre.commissions).toBeCloseTo(LEDGER.comissao.total, 2);
    expect(dre.variableCost).toBeCloseTo(LEDGER.dre.custoVariavel, 2);
    expect(dre.contributionMargin).toBeCloseTo(LEDGER.dre.margemContribuicao, 2);
    expect(dre.tax).toBeCloseTo(LEDGER.dre.imposto, 2);
  });
});
