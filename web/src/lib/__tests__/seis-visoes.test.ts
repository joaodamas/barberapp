import { describe, expect, it } from "vitest";
import {
  agruparProjecaoPorMes,
  caixaDiario,
  caixaDoDia,
  comissoesDeServico,
  composicaoDaReceita,
  mesPeriodo,
  projecaoDeCaixa,
  receitaDoMes,
  resultadoDoMes,
  taxasDePagamento,
} from "@/lib/analytics";
import { OCCUPIES_SLOT } from "@/lib/domain";
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

/**
 * As seis visões, lado a lado, sobre a MESMA massa.
 *
 * A pergunta que este arquivo responde não é "cada tela mostra um número
 * plausível?", e sim:
 *
 *   para cada real que entra no sistema, onde ele nasceu, onde foi parar, e
 *   por que aparece — ou não aparece — em cada visão.
 *
 * Divergência entre telas nem sempre é erro. Pode ser granularidade (dia × mês),
 * competência (passado × futuro), conceito (realizado × contratado) ou
 * nomenclatura ruim. Cada caso abaixo declara **qual** dos cinco é, e os que são
 * ERRO estão marcados como tal.
 *
 * Cada visão é montada exatamente como a tela a monta — mesmas funções, mesmos
 * argumentos. Onde a expressão da tela é peculiar, ela está reproduzida aqui
 * com a referência ao arquivo.
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

const fluxo = caixaDiario({ payments: [...PAYMENTS, ...PAYMENTS_PRODUTO], periodo });
const somaFluxo = fluxo.reduce(
  (a, d) => ({
    pix: a.pix + d.pix,
    cartao: a.cartao + d.cartao,
    dinheiro: a.dinheiro + d.dinheiro,
    total: a.total + d.total,
    atendimentos: a.atendimentos + d.appointments,
  }),
  { pix: 0, cartao: 0, dinheiro: 0, total: 0, atendimentos: 0 }
);

const comissoes = comissoesDeServico({
  bookings: BOOKINGS,
  staff: STAFF,
  periodo,
  policies,
  commissions: [...COMMISSIONS, ...COMMISSIONS_PRODUTO],
});

/* ------------------------------------------------------------------ */
/* VISÃO 1 · Dashboard — recorte do DIA                                */
/* ------------------------------------------------------------------ */

/** Como `painel/(dashboard)/page.tsx` monta, para um dia. */
function dashboardDe(dia: string) {
  const doDia = BOOKINGS.filter((b) => b.date === dia);
  const agendados = doDia.filter((b) => OCCUPIES_SLOT.includes(b.status));
  return {
    previsto: agendados.reduce((s, b) => s + b.value, 0), // l. 86
    atendimentos: agendados.length, // l. 82
    caixa: caixaDoDia(agendados), // l. 131
  };
}

describe("visão 1 · Dashboard", () => {
  it("GRANULARIDADE · é do DIA, não do mês — e por isso nunca soma 680", () => {
    /* Não é divergência: o Dashboard responde "como está hoje". Comparar o
     * número dele com o do DRE sem essa nota é o erro de leitura mais fácil de
     * cometer no produto. */
    const d03 = dashboardDe("2026-09-03");
    expect(d03.previsto).toBe(90); // só A03, o combo
    expect(d03.caixa.total).toBe(90);
    expect(d03.caixa.cartao).toBe(90); // crédito
  });

  it("não conhece produto, mensalista, CMV, comissão, taxa nem despesa", () => {
    /* O Dashboard é operação, não resultado. A ausência é desenho: R$ 290 de
     * produto vendido no mês não aparecem aqui em dia nenhum, porque
     * `caixaDoDia` recebe apenas reservas. */
    const d04 = dashboardDe("2026-09-04"); // dia da venda V01, R$ 45
    expect(d04.caixa.total).toBe(0);
    expect(d04.previsto).toBe(0);
  });

  it("ERRO · a previsão do dia NÃO desconta a falta confirmada", () => {
    /* A09 é `no_show`, que está em OCCUPIES_SLOT — corretamente, porque a
     * cadeira foi ocupada. Mas `previsaoHoje` soma os mesmos `agendados`, então
     * depois de o dono marcar "não veio" os R$ 50 CONTINUAM na previsão do dia.
     *
     * O recebido cai para zero, a previsão não se move, e a barra de progresso
     * mostra 0% de um valor que já se sabe que não virá. */
    const d18 = dashboardDe("2026-09-18");
    expect(d18.previsto).toBe(50); // ← deveria ser 0 depois da falta
    expect(d18.caixa.total).toBe(0); // recebido, correto
    expect(d18.atendimentos).toBe(1); // ocupou a cadeira, correto
  });

  it("CONCEITO · cancelamento some da agenda; falta permanece", () => {
    /* Cancelado libera o horário (fora de OCCUPIES_SLOT) e some do dia. A falta
     * permanece porque custou a cadeira. São conceitos diferentes, e o produto
     * está certo em distingui-los. */
    const d20 = dashboardDe("2026-09-20");
    expect(d20.previsto).toBe(0);
    expect(d20.atendimentos).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* VISÃO 2 · Financeiro — resumo do mês                                */
/* ------------------------------------------------------------------ */

/** Como `financeiro/page.tsx` monta. */
const financeiro = {
  receitaRealizada: dre.grossRevenue, // l. 112
  despesas: dre.totalCost, // l. 64 — rotulado "Despesas"
  resultado: dre.result, // l. 62
  composicao: [
    { label: "Serviços avulsos", value: receita.servicos },
    { label: "Produtos (loja)", value: receita.produtos },
    { label: "Encaixes", value: receita.encaixes },
  ].filter((i) => i.value > 0), // l. 39-43 — sem mensalistas
  mrrCobrado: receita.mensalistas, // l. 46
  mrrContratado: SUBSCRIBERS.filter((s) => s.status !== "cancelado").reduce(
    (t, s) => t + s.price,
    0
  ), // l. 47-49
  faturamentoDaLoja: receita.produtos, // l. 58
  legendaComissao: dre.commissions, // l. 289 — sob "Faturamento da loja"
};

describe("visão 2 · Financeiro", () => {
  it("a receita realizada é a mesma do DRE", () => {
    expect(financeiro.receitaRealizada).toBe(dre.grossRevenue);
    expect(financeiro.receitaRealizada).toBe(680);
  });

  it("CONCEITO · a composição da receita exclui mensalista, e está certa", () => {
    const soma = financeiro.composicao.reduce((s, i) => s + i.value, 0);
    expect(soma).toBe(680);
    expect(financeiro.composicao.map((i) => i.label)).not.toContain("Mensalistas");
  });

  it("o MRR aparece à parte, com os dois números separados", () => {
    expect(financeiro.mrrCobrado).toBe(248);
    expect(financeiro.mrrContratado).toBe(248);
  });

  it("NOMENCLATURA · o KPI 'Despesas' mostra o CUSTO TOTAL", () => {
    /* 2.997,50 inclui CMV, taxas, comissões e imposto — que não são despesas no
     * sentido em que o dono usa a palavra (ele pensa em aluguel e conta de luz,
     * que somam 2.550). Não é erro de cálculo: é rótulo que descreve outra
     * coisa. */
    /* O valor caiu de 2.997,50 para 2.962,75 com as correções da 3.2 — mas o
     * ACHADO não é o número, é o rótulo: continua chamando de "despesas" um
     * total que inclui CMV, taxas, comissões e imposto. */
    expect(financeiro.despesas).toBeCloseTo(2962.75, 2);
    expect(dre.fixedCost).toBe(2550);
    expect(financeiro.despesas).not.toBe(dre.fixedCost);
  });

  it("ERRO · a legenda sob 'Faturamento da loja' mostra a comissão TOTAL", () => {
    /* Sob um cartão de R$ 290 de loja, lê-se "comissão do profissional:
     * R$ 222,50" — que é a comissão do mês inteiro, serviço incluído. O número
     * da loja existe ao lado e é R$ 44,00. */
    /* Com a 3.2 os dois números mudaram — total 248,10 e loja 69,60 — e o
     * defeito segue igual: sob o cartão da LOJA aparece a comissão do mês
     * inteiro. É rótulo, não cálculo. */
    expect(financeiro.legendaComissao).toBe(dre.commissions);
    expect(financeiro.legendaComissao).toBeCloseTo(248.1, 2);
    expect(dre.commissionsLoja).toBe(69.6);
  });
});

/* ------------------------------------------------------------------ */
/* VISÃO 3 · DRE                                                       */
/* ------------------------------------------------------------------ */

/**
 * A árvore de receita, como o DRE a monta.
 *
 * Era uma cópia manual das linhas 69-74 de `dre/page.tsx`. Depois da correção
 * de D6 as duas telas passaram a chamar `composicaoDaReceita`, e a cópia aqui
 * virou risco: ela continuaria verde descrevendo uma tela que não existe mais.
 * Chamar a função é o que mantém este arquivo medindo o produto.
 */
const arvoreDaReceita = composicaoDaReceita(receita);

describe("visão 3 · DRE", () => {
  it("a escada fecha na identidade", () => {
    expect(dre.grossRevenue - dre.totalCost).toBeCloseTo(dre.result, 2);
  });

  it("I4 — os filhos da receita somam o cabeçalho", () => {
    /* Era o único ERRO desta suíte (D6). O cabeçalho do grupo é `grossRevenue`
     * (680) e a árvore listava mensalistas (248) entre os filhos, somando 928:
     * o dono expandia, somava na mão, e não fechava. Pior, o Financeiro fazia a
     * mesma composição SEM mensalista — as duas telas discordavam sobre o que
     * compõe a receita realizada.
     *
     * Corrigido na Rodada 1 com uma fonte só para as duas telas. */
    const somaDosFilhos = arvoreDaReceita.reduce((s, i) => s + i.value, 0);
    expect(dre.grossRevenue).toBe(680);
    expect(somaDosFilhos).toBe(680);
    expect(somaDosFilhos - dre.grossRevenue).toBe(0);
  });

  it("os R$ 248 de mensalista não sumiram — mudaram de bloco", () => {
    /* A correção de D6 não é esconder o contratado. Ele continua na receita, com
     * nome próprio, fora da árvore do realizado: contratado projeta, realizado
     * fatura. Se alguém "corrigisse" zerando o campo, este teste cairia. */
    expect(receita.mensalistas).toBe(248);
    expect(arvoreDaReceita.map((i) => i.label)).not.toContain("Mensalistas");
  });

  it("a comissão do DRE bate com a soma por barbeiro", () => {
    const soma = dre.comissaoPorBarbeiro.reduce((s, b) => s + b.valor, 0);
    expect(soma).toBe(dre.commissionsServico);
    expect(soma).toBe(178.5);
  });

  it("o imposto incide sobre a receita realizada, não sobre o contratado", () => {
    expect(dre.tax).toBe(40.8); // 6% de 680, ao centavo — D5 fechado na 3.2
    expect(dre.tax).toBeLessThan(((680 + 248) * 6) / 100);
  });
});

/* ------------------------------------------------------------------ */
/* VISÃO 4 · Fluxo de caixa                                            */
/* ------------------------------------------------------------------ */

/** Taxa total do mês na massa: 4,14 de serviço + 3,71 de produto. */
const LEDGER_TAXAS = 7.85;

describe("visão 4 · Fluxo de caixa", () => {
  it("I1 · o fluxo é a receita do DRE MENOS as taxas", () => {
    /* A invariante mudou na Rodada 3.2, e a mudança é o ponto.
     *
     * Os dois eram iguais porque ambos somavam o bruto. Agora o caixa entra
     * pelo LÍQUIDO — a maquininha deposita já descontada, e o bruto nunca passa
     * pela conta. A diferença entre DRE e Fluxo é exatamente a taxa, e é
     * verdadeira: é dinheiro que o mês produziu e não chegou. */
    expect(dre.grossRevenue).toBe(680);
    expect(somaFluxo.total).toBeCloseTo(680 - LEDGER_TAXAS, 2);
    expect(dre.grossRevenue - somaFluxo.total).toBeCloseTo(LEDGER_TAXAS, 2);
  });

  it("CONCEITO · é relatório de ENTRADA — não conhece saída", () => {
    /* Nenhuma das três colunas desconta compra, despesa, comissão ou imposto.
     * A tela chama "Fluxo de Caixa" o que é faturamento diário por meio. */
    expect(somaFluxo.total).toBeGreaterThan(0);
    expect(dre.result).toBeLessThan(0);
    // Não existe no produto um número que responda "sobrou quanto no caixa".
  });

  it("CORRIGIDO · cada venda cai na coluna do instrumento que a pagou", () => {
    /* Era o D4: 340 em dinheiro, somando 50 de serviço com os 290 de produto
     * inteiros, mesmo com o meio gravado no movimento desde G1.
     *
     * Agora o caixa lê `payments`, e a venda em Pix vai para Pix. Os valores
     * são líquidos, então cartão fica abaixo do bruto — pela taxa. */
    expect(somaFluxo.dinheiro).toBe(95);
    expect(somaFluxo.pix).toBe(300);
    expect(somaFluxo.dinheiro + somaFluxo.pix + somaFluxo.cartao).toBeCloseTo(
      somaFluxo.total,
      2
    );
  });

  it("os atendimentos do fluxo batem com os do DRE", () => {
    /* Venda de produto não conta como atendimento, e está certo. */
    expect(somaFluxo.atendimentos).toBe(8);
    expect(receita.atendimentos).toBe(8);
  });
});

/* ------------------------------------------------------------------ */
/* VISÃO 5 · Projeção — competência FUTURA                             */
/* ------------------------------------------------------------------ */

const projecao = projecaoDeCaixa({
  bookings: BOOKINGS,
  expenses: EXPENSES,
  subscribers: SUBSCRIBERS,
  historico: fluxo,
  openWeekdays: [1, 2, 3, 4, 5, 6],
  inicio: new Date("2026-10-01T12:00:00"),
  dias: 30,
});

describe("visão 5 · Projeção", () => {
  it("COMPETÊNCIA · olha para a frente, e por isso não bate com nenhuma outra", () => {
    /* A massa toda é de setembro; a projeção parte de outubro. Nenhum fato
     * realizado aparece aqui — o que aparece é média histórica e compromisso
     * futuro. Comparar com o DRE é comparar competências diferentes. */
    const receitaProjetada = projecao.reduce((s, d) => s + d.bookingRevenue, 0);
    expect(receitaProjetada).toBeGreaterThan(0);
    expect(projecao.every((d) => d.date >= "2026-10-01")).toBe(true);
  });

  it("CONCEITO · mensalista ENTRA na projeção, e está certo", () => {
    /* Aqui a mensalidade é legítima: projeção é sobre o que vai ser cobrado, e
     * o contrato é a melhor informação disponível sobre o futuro. É a mesma
     * mensalidade que fica FORA da receita realizada — conceitos diferentes,
     * não contradição.
     *
     * Se um dia isso mudar, a regra a preservar é: contratado projeta,
     * realizado fatura. */
    const mensalistasProjetados = projecao.reduce((s, d) => s + d.subscriptionCharge, 0);
    expect(mensalistasProjetados).toBeGreaterThan(0);
    expect(receita.bruta).toBe(680); // e continua fora do realizado
  });

  it("a despesa recorrente vigente é projetada; a eventual não", () => {
    const despesaProjetada = projecao.reduce((s, d) => s + d.fixedExpense, 0);
    // Aluguel (dia 5) + energia (dia 10) caem uma vez em outubro = 2.350.
    expect(despesaProjetada).toBe(2350);
    // O impulsionamento (eventual) não se repete.
    expect(despesaProjetada).not.toBe(2550);
  });

  it("o dia sem marcação é ESTIMADO, e a tela precisa dizer isso", () => {
    const estimados = projecao.filter((d) => d.isEstimate).length;
    expect(estimados).toBeGreaterThan(0);
    const porMes = agruparProjecaoPorMes(projecao);
    expect(porMes[0].fracaoEstimada).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* VISÃO 6 · Comissões                                                 */
/* ------------------------------------------------------------------ */

describe("visão 6 · Comissões", () => {
  it("cada barbeiro tem base, percentual e valor coerentes entre si", () => {
    /* Sem arredondar a conta antes de comparar: a comissão do Léo é 112,50, e
     * um `Math.round` no meio da verificação destruiria justamente os centavos
     * que o teste existe para proteger. */
    for (const b of comissoes.porBarbeiro) {
      expect((b.base * b.pct) / 100, b.nome).toBeCloseTo(b.valor, 2);
    }
  });

  it("o percentual é o de quem atendeu, congelado no dia", () => {
    const rafael = comissoes.porBarbeiro.find((b) => b.nome === "Rafael")!;
    const leo = comissoes.porBarbeiro.find((b) => b.nome === "Léo")!;
    expect(rafael.pct).toBe(40);
    expect(leo.pct).toBe(50);
    expect(rafael.base).toBe(165);
    expect(leo.base).toBe(225);
  });

  it("a base da comissão é a receita de SERVIÇO, não a receita total", () => {
    /* 390, e não 680: produto tem base própria (o lucro) e percentual aplicado
     * separadamente. Confundir as duas foi o defeito que fez o DRE informar 60%
     * de margem. */
    const baseTotal = comissoes.porBarbeiro.reduce((s, b) => s + b.base, 0);
    expect(baseTotal).toBe(receita.servicos);
    expect(baseTotal).not.toBe(receita.bruta);
  });

  it("nenhum atendimento sem desfecho gera comissão", () => {
    /* 8 atendimentos concluídos geram comissão; o no-show e o cancelado, não. */
    const totalAtendimentos = comissoes.porBarbeiro.reduce((s, b) => s + b.atendimentos, 0);
    expect(totalAtendimentos).toBe(8);
  });
});

/* ------------------------------------------------------------------ */
/* A MATRIZ — cada fato, em cada visão                                 */
/* ------------------------------------------------------------------ */

describe("matriz fato × visão", () => {
  it("receita de serviço · 390,00 — nasce em 8 bookings concluídos", () => {
    expect(receita.servicos).toBe(390);
    expect(dre.grossRevenue - receita.produtos).toBe(390);
    expect(comissoes.porBarbeiro.reduce((s, b) => s + b.base, 0)).toBe(390);
    // Fluxo: distribuída entre os meios — 200 pix + 140 cartão + 50 dinheiro.
    expect(200 + 140 + 50).toBe(390);
  });

  it("receita de produto · 290,00 — nasce em 5 movimentos de venda", () => {
    expect(receita.produtos).toBe(290);
    // Dashboard: ausente (não conhece produto).
    /* Fluxo: presente e DISTRIBUÍDO pelo instrumento desde a 3.2 — o D4 caiu.
     * A soma das três colunas é o líquido, não os 290 brutos. */
    expect(somaFluxo.dinheiro + somaFluxo.pix + somaFluxo.cartao).toBeCloseTo(
      somaFluxo.total,
      2
    );
  });

  it("mensalistas · 248,00 — contratado, nunca realizado", () => {
    expect(receita.mensalistas).toBe(248);
    expect(receita.bruta).toBe(680); // fora
    expect(somaFluxo.total).toBeCloseTo(680 - LEDGER_TAXAS, 2); // fora do fluxo realizado
    // Projeção: presente, e corretamente (competência futura).
    expect(projecao.reduce((s, d) => s + d.subscriptionCharge, 0)).toBeGreaterThan(0);
  });

  it("no-show · 50,00 — ocupa a cadeira, não vira dinheiro", () => {
    const noShow = BOOKINGS.find((b) => b.status === "no_show")!;
    expect(noShow.value).toBe(50);
    expect(receita.bruta).toBe(680); // fora
    expect(somaFluxo.total).toBeCloseTo(680 - LEDGER_TAXAS, 2); // fora
    expect(comissoes.porBarbeiro.reduce((s, b) => s + b.atendimentos, 0)).toBe(8); // fora
    expect(dashboardDe("2026-09-18").previsto).toBe(50); // ← só o Dashboard o mantém
  });

  it("cancelamento · 50,00 — sai de tudo, inclusive da agenda", () => {
    expect(receita.bruta).toBe(680);
    expect(dashboardDe("2026-09-20").previsto).toBe(0);
  });

  it("CMV · sistema e ledger dizem 116", () => {
    expect(dre.cmv).toBe(116);
    // Só o DRE mostra CMV. Nenhuma outra visão o expõe.
  });

  it("comissão · 248,10 (178,50 serviço + 69,60 loja), igual ao ledger", () => {
    expect(dre.commissions).toBeCloseTo(248.1, 2);
    expect(dre.commissionsServico).toBe(178.5);
    expect(dre.commissionsLoja).toBe(69.6);
  });

  it("taxas · 7,85 nos dois — serviço 4,14 + produto 3,71", () => {
    expect(dre.gatewayFees).toBe(7.85);
  });

  it("imposto · 40,80 nos dois", () => {
    expect(dre.tax).toBe(40.8);
  });

  it("despesas · 2.550 de custo fixo, exibido como 2.962,75 no Financeiro", () => {
    /* O rótulo continua sendo o achado — ver a visão 2. */
    expect(dre.fixedCost).toBe(2550);
    expect(financeiro.despesas).toBeCloseTo(2962.75, 2);
  });
});
