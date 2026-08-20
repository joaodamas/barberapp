import { describe, expect, it } from "vitest";
import {
  caixaDiario,
  comissoesDeServico,
  composicaoDaReceita,
  indicadores,
  mesPeriodo,
  receitaDoMes,
  resultadoDoMes,
  taxasDePagamento,
} from "@/lib/analytics";
import { fluxoDiario, movimentosDeCaixa, resumoDoFluxo } from "@/lib/fluxo-de-caixa";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  CashEntryDoc,
  CommissionDoc,
  ExpenseDoc,
  InventoryMovementDoc,
  PaymentDoc,
  RefundDoc,
  StaffDoc,
  SubscriberDoc,
  SubscriptionInvoiceDoc,
} from "@/lib/domain";

/**
 * Bateria de regressão — QA-01.
 *
 * Escrita durante a integração de quatro equipes em paralelo (FIN-01 motor
 * financeiro · UX-04 design system · UX-01 navegação). Ela não repete o que
 * `fontes-financeiras.test.ts` e `fluxo-de-caixa.test.ts` já provam sobre cada
 * linha isolada; ela cobre o que só quebra QUANDO AS PEÇAS SE ENCONTRAM:
 *
 * 1. **O mesmo número em duas telas.** Dois módulos calculam "quanto entrou".
 *    Enquanto ninguém compara os dois no mesmo cenário, eles podem divergir por
 *    meses sem que nenhum teste de linha isolada perceba.
 * 2. **Dupla contagem por uma leitura futura.** O `MAPA-DE-FONTES` proíbe somar
 *    duas coleções. Os testes abaixo montam o cenário que uma implementação
 *    ingênua contaria duas vezes e provam que o total é o valor UMA vez.
 * 3. **Estados de borda.** Mês vazio, barbearia nova, valor zerado e — o mais
 *    perigoso — documento histórico sem os campos que a Rodada 3.1 criou.
 * 4. **Invariantes que só existiam em comentário.**
 *
 * Preferimos invariantes a valores fixos: "a soma dos filhos fecha o cabeçalho"
 * sobrevive a uma mudança de preço na massa; "o total é 194" não.
 *
 * ## Sobre os blocos `DEFEITO`
 *
 * Dois achados desta bateria são defeitos de produto confirmados. Seguindo a
 * convenção que `reconciliacao.test.ts` já usa para as divergências do ledger,
 * eles são registrados com **os dois números** — o que o sistema devolve hoje e
 * o que seria correto — em vez de falharem. QA-01 não corrige código de
 * produto, e uma bateria vermelha herdada vira ruído que ninguém lê.
 *
 * Quando o defeito for corrigido **estes testes falham**, de propósito: é o
 * sinal de que a documentação em `BATERIA-DE-REGRESSAO.md` precisa ser fechada.
 */

const P = mesPeriodo("2026-09");
const POL = PLATFORM_DEFAULT_POLICIES;

/* ---- construtores mínimos, no padrão de `fontes-financeiras.test.ts` ---- */

const bk = (id: string, over: Partial<BookingDoc> = {}): Doc<BookingDoc> =>
  ({
    id,
    date: "2026-09-14",
    time: "10:00",
    status: "completed",
    value: 50,
    staffId: "leo",
    clientId: "c1",
    serviceIds: ["corte"],
    isFitIn: false,
    paymentOrigin: "in_person",
    paymentMethod: "credit",
    ...over,
  }) as Doc<BookingDoc>;

const pg = (id: string, over: Partial<PaymentDoc> = {}): Doc<PaymentDoc> =>
  ({
    id,
    origin: "servico",
    clientId: "c1",
    date: "2026-09-14",
    paymentOrigin: "in_person",
    paymentMethod: "credit",
    grossAmount: 50,
    feePct: 3.49,
    feeAmount: 1.75,
    netAmount: 48.25,
    ...over,
  }) as Doc<PaymentDoc>;

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

const rf = (id: string, over: Partial<RefundDoc> = {}): Doc<RefundDoc> =>
  ({
    id,
    origin: "servico",
    paymentId: "pagamento_bk1",
    bookingId: "bk1",
    clientId: "c1",
    date: "2026-09-20",
    originalDate: "2026-09-14",
    reason: "teste",
    paymentMethod: "credit",
    grossAmount: 20,
    feeAmount: 0,
    netAmount: 20,
    parcial: true,
    ...over,
  }) as Doc<RefundDoc>;

const cm = (id: string, over: Partial<CommissionDoc> = {}): Doc<CommissionDoc> =>
  ({
    id,
    origin: "servico",
    bookingId: "bk1",
    staffId: "leo",
    uid: null,
    staffName: "Léo",
    date: "2026-09-14",
    commissionPct: 40,
    commissionBase: 50,
    commissionAmount: 20,
    ...over,
  }) as Doc<CommissionDoc>;

const st = (id: string, over: Partial<StaffDoc> = {}): Doc<StaffDoc> =>
  ({ id, name: id, commissionPct: 40, serviceIds: ["corte"], active: true, ...over }) as Doc<StaffDoc>;

const dsp = (id: string, over: Partial<ExpenseDoc> = {}): Doc<ExpenseDoc> =>
  ({
    id,
    category: "Aluguel",
    description: "Aluguel da loja",
    value: 2000,
    date: "2026-09-05",
    recurring: true,
    payment: "Pix",
    ...over,
  }) as Doc<ExpenseDoc>;

const cx = (id: string, over: Partial<CashEntryDoc> = {}): Doc<CashEntryDoc> =>
  ({
    id,
    kind: "sangria",
    direction: "saida",
    amount: -100,
    date: "2026-09-15",
    reason: "sangria do dia",
    paymentMethod: "cash",
    staffId: null,
    ...over,
  }) as Doc<CashEntryDoc>;

const fat = (id: string, over: Partial<SubscriptionInvoiceDoc> = {}): Doc<SubscriptionInvoiceDoc> =>
  ({
    id,
    subscriptionId: "sub1",
    clientId: "c1",
    competencia: "2026-09",
    dueDate: "2026-09-05",
    amount: 99,
    status: "paga",
    paidAt: "2026-09-05",
    ...over,
  }) as Doc<SubscriptionInvoiceDoc>;

/** O fluxo completo, montado uma vez, do jeito que a tela monta. */
function fluxo(params: {
  payments?: Doc<PaymentDoc>[];
  refunds?: Doc<RefundDoc>[];
  expenses?: Doc<ExpenseDoc>[];
  movements?: Doc<InventoryMovementDoc>[];
  cashEntries?: Doc<CashEntryDoc>[];
}) {
  return resumoDoFluxo(
    movimentosDeCaixa({
      payments: params.payments ?? [],
      refunds: params.refunds ?? [],
      expenses: params.expenses ?? [],
      movements: params.movements ?? [],
      cashEntries: params.cashEntries ?? [],
      periodo: P,
    })
  );
}

/** Todo número de um objeto, recursivamente — para as varreduras de borda. */
function numerosDe(o: unknown, caminho = "", saida: [string, number][] = []) {
  if (typeof o === "number") saida.push([caminho || "raiz", o]);
  else if (Array.isArray(o)) o.forEach((v, i) => numerosDe(v, `${caminho}[${i}]`, saida));
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) numerosDe(v, caminho ? `${caminho}.${k}` : k, saida);
  return saida;
}

/* ================================================================== */
/* 1 · O MESMO NÚMERO EM DUAS TELAS                                    */
/* ================================================================== */

describe("cross-screen · o mesmo número em duas telas", () => {
  /* Dois módulos respondem "quanto entrou no caixa": `caixaDiario`, que a tela
   * do Financeiro consome, e `resumoDoFluxo`, que a tela de Fluxo consome. Os
   * dois leem `payments`. Enquanto ninguém os comparar no MESMO cenário, eles
   * podem divergir sem que nenhum teste de linha isolada perceba. */

  const payments = [
    pg("p1", { paymentMethod: "pix", grossAmount: 100, feeAmount: 0, netAmount: 100 }),
    pg("p2", { paymentMethod: "credit", grossAmount: 100, feeAmount: 3.49, netAmount: 96.51 }),
    pg("p3", { paymentMethod: "cash", grossAmount: 50, feeAmount: 0, netAmount: 50 }),
  ];

  it("o TOTAL de entradas é o mesmo nas duas telas", () => {
    /* Pega o dia em que alguém trocar a base de uma das duas — bruto por
     * líquido, ou `payments` por `bookings`. O total é a primeira coisa que o
     * dono compara ao abrir as duas telas lado a lado. */
    const dias = caixaDiario({ payments, periodo: P });
    const totalDoFinanceiro = dias.reduce((s, d) => s + d.total, 0);

    expect(totalDoFinanceiro).toBeCloseTo(fluxo({ payments }).entradas, 2);
  });

  it("CORRIGIDO · a DISTRIBUIÇÃO por instrumento concorda nas duas telas", () => {
    /* Achado de QA-01, 17/08/2026.
     *
     * Um pagamento com `paymentMethod: null` — "atendimento concluído sem
     * informar como o cliente pagou", estado que o SERVIDOR grava de propósito
     * (ver `financial-events.test.ts` › "materializa o bruto e marca o método
     * como desconhecido") — é classificado de dois jeitos:
     *
     *   caixaDiario     → coluna DINHEIRO   (`else d.dinheiro += valor`)
     *   resumoDoFluxo   → coluna OUTROS     (só `cash` vira dinheiro)
     *
     * O total fecha nas duas; o que diverge é a distribuição. É a mesma forma
     * do D4 — "o erro está na distribuição, não na soma" —, que a Rodada 3.2
     * corrigiu para a venda de produto e que sobrevive aqui pelo método
     * desconhecido.
     *
     * Por que `outros` é o correto: a régua do projeto diz que o sistema não
     * pode afirmar que algo aconteceu quando não aconteceu. Um pagamento sem
     * método NÃO é sabidamente dinheiro — e é contra a coluna dinheiro que o
     * dono confere a gaveta no fim do dia. */
    const semMetodo = [
      pg("p0", { paymentMethod: null, grossAmount: 100, feeAmount: 0, netAmount: 100 }),
    ];

    const dias = caixaDiario({ payments: semMetodo, periodo: P });
    const porMetodo = fluxo({ payments: semMetodo }).porMetodo;

    /* CORRIGIDO por FIN-01 na mesma sessão em que este teste o encontrou.
     *
     * `caixaDiario` ganhou a coluna `naoInformado`: o `else` que engolia o nulo
     * e o somava em espécie virou `else if (cash)`, e o desconhecido tem lugar
     * próprio. O `not` que existia aqui caiu, como o teste previa.
     *
     * Nenhuma das duas telas afirma dinheiro que não se sabe ser dinheiro. */
    expect(dias[0].dinheiro).toBe(0);
    expect(dias[0].naoInformado).toBe(100);
    expect(porMetodo.dinheiro).toBe(0);
    expect(porMetodo.outros).toBe(100);
    expect(dias[0].naoInformado).toBe(porMetodo.outros);

    // E o total continua fechando nos dois lados, que é o que esconde o defeito.
    expect(dias[0].total).toBe(fluxo({ payments: semMetodo }).entradas);
  });

  it("com o método conhecido, as duas telas concordam coluna a coluna", () => {
    /* O contraste que prova que o DEFEITO 1 é sobre o método AUSENTE e não uma
     * diferença estrutural entre os dois módulos. */
    const dias = caixaDiario({ payments, periodo: P });
    const dia = dias[0];
    const porMetodo = fluxo({ payments }).porMetodo;

    expect(dia.pix).toBeCloseTo(porMetodo.pix, 2);
    expect(dia.cartao).toBeCloseTo(porMetodo.cartao, 2);
    expect(dia.dinheiro).toBeCloseTo(porMetodo.dinheiro, 2);
    expect(porMetodo.outros).toBe(0);
  });

  it("a receita do DRE é exatamente a receita do Financeiro", () => {
    /* `grossRevenue` não pode virar uma segunda derivação: as duas telas
     * mostram o número lado a lado e o dono soma na mão. */
    const receita = receitaDoMes({
      bookings: [bk("bk1")],
      movements: [mv("v1")],
      subscribers: [],
      periodo: P,
      payments: [pg("pagamento_bk1", { bookingId: "bk1" })],
    });
    const dre = resultadoDoMes({ receita, expenses: [], movements: [], periodo: P, policies: POL });

    expect(dre.grossRevenue).toBe(receita.bruta);
  });

  it("a comissão de serviço do DRE é a mesma da tela de Comissões", () => {
    /* São duas telas que somam a MAIOR linha de custo da barbearia. O DRE
     * chama `comissoesDeServico` por dentro; a tela de Comissões chama de fora.
     * Se os parâmetros divergirem, o barbeiro recebe um valor e o DRE mostra
     * outro — e a diferença só aparece no dia do acerto. */
    const bookings = [bk("bk1"), bk("bk2", { staffId: "rafael", value: 80 })];
    const staff = [st("leo", { commissionPct: 50 }), st("rafael", { commissionPct: 30 })];
    const commissions = [cm("comissao_bk1")];

    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const dre = resultadoDoMes({
      receita,
      expenses: [],
      movements: [],
      periodo: P,
      policies: POL,
      staff,
      bookings,
      commissions,
    });
    const tela = comissoesDeServico({ bookings, staff, periodo: P, policies: POL, commissions });

    expect(dre.commissionsServico).toBe(tela.total);
    expect(dre.comissaoPorBarbeiro.reduce((s, b) => s + b.valor, 0)).toBe(dre.commissionsServico);
  });

  it("os filhos da composição fecham o cabeçalho, com e sem devolução", () => {
    /* O D6/P1-2. Vale para QUALQUER receita, não só para a massa conhecida — é
     * a versão invariante do teste que hoje existe com números fixos. */
    for (const refunds of [[], [rf("r1", { grossAmount: 20 })]]) {
      const receita = receitaDoMes({
        bookings: [bk("bk1")],
        movements: [mv("v1")],
        subscribers: [],
        periodo: P,
        payments: [pg("pagamento_bk1", { bookingId: "bk1" })],
        refunds,
      });
      const soma = composicaoDaReceita(receita).reduce((s, l) => s + l.value, 0);
      expect(soma).toBeCloseTo(receita.bruta, 2);
    }
  });

  it("o ticket médio e a receita do DRE contam o MESMO atendimento", () => {
    /* `indicadores.appointments` e `receita.atendimentos` são o mesmo número em
     * telas diferentes. Se um passar a contar pagamentos e o outro reservas,
     * o ticket muda sem que a receita mude. */
    const bookings = [bk("bk1"), bk("bk2"), bk("bk3", { status: "no_show" })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const kpis = indicadores({ bookings, receita, periodo: P, capacidade: 100 });

    expect(kpis.appointments).toBe(receita.atendimentos);
    expect(kpis.avgTicket * kpis.appointments).toBeCloseTo(receita.servicos + receita.encaixes, 0);
  });
});

/* ================================================================== */
/* 2 · DUPLA CONTAGEM                                                  */
/* ================================================================== */

describe("dupla contagem · o que uma leitura futura poderia somar duas vezes", () => {
  it("DOIS pagamentos para o MESMO atendimento não dobram a receita", () => {
    /* O cenário do `MAPA-DE-FONTES`: migração parcial, retry de gatilho, id
     * renomeado. Dois `PaymentDoc` apontando o mesmo `bookingId`.
     *
     * Como a iteração é sobre o BOOKING, o atendimento contribui uma vez por
     * construção — o segundo pagamento é ignorado. Uma implementação que
     * somasse `payments` veria 100 onde o atendimento vale 50. */
    const bookings = [bk("bk1", { value: 50 })];
    const payments = [
      pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 }),
      pg("pagamento_bk1_retry", { bookingId: "bk1", grossAmount: 50 }),
    ];

    const r = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P, payments });
    expect(r.servicos).toBe(50);
    expect(r.bruta).toBe(50);
  });

  it("DOIS pagamentos para a MESMA venda não dobram a receita de produto", () => {
    /* Mesma prova na segunda origem. A linha de produto é a que mais mudou na
     * 3.2 e a que menos histórico tem. */
    const movements = [mv("v1", { value: 90 })];
    const payments = [
      pg("pagamento_venda_v1", { origin: "produto", movementId: "v1", grossAmount: 90 }),
      pg("pagamento_venda_v1_dup", { origin: "produto", movementId: "v1", grossAmount: 90 }),
    ];

    const r = receitaDoMes({ bookings: [], movements, subscribers: [], periodo: P, payments });
    expect(r.produtos).toBe(90);
  });

  it("pagamento ÓRFÃO entra no CAIXA e não na RECEITA — e isso é correto", () => {
    /* Divergência INTENCIONAL entre duas telas, registrada para ninguém
     * "consertar" no futuro igualando as duas.
     *
     * O dinheiro caiu na conta: o Fluxo precisa mostrá-lo, senão o saldo não
     * bate com o extrato. Mas não existe atendimento que o justifique, e a
     * receita se recusa a inventar um — é a razão de a receita iterar sobre o
     * FATO e não sobre `payments`.
     *
     * Fazer a receita ler `payments` direto resolveria a "divergência" e
     * reintroduziria a dupla contagem que a rodada inteira existe para
     * eliminar. */
    const orfao = [
      pg("orfao", { bookingId: "bk-que-nao-existe", grossAmount: 500, netAmount: 500 }),
    ];

    const r = receitaDoMes({
      bookings: [],
      movements: [],
      subscribers: [],
      periodo: P,
      payments: orfao,
    });

    expect(r.bruta).toBe(0);
    expect(fluxo({ payments: orfao }).entradas).toBe(500);
  });

  it("a COMPRA de estoque sai no caixa e NÃO entra no CMV", () => {
    /* O D3. Contar a compra nos dois lugares dobraria o custo do produto — uma
     * vez na compra, outra no CMV quando a mercadoria for vendida. Este teste
     * prova que ela aparece em exatamente UM dos dois. */
    const compra = mv("c1", { kind: "compra", value: 180, quantity: 10, unitCost: 18 });
    const venda = mv("v1", { kind: "venda", value: 90, quantity: 2, unitCost: 18 });

    const receita = receitaDoMes({
      bookings: [],
      movements: [compra, venda],
      subscribers: [],
      periodo: P,
    });
    const dre = resultadoDoMes({
      receita,
      expenses: [],
      movements: [compra, venda],
      periodo: P,
      policies: POL,
    });

    // No DRE: só o custo do que foi VENDIDO (2 × 18), nunca os 180 da compra.
    expect(dre.cmv).toBe(36);

    // No caixa: os 180 saem, e o CMV não aparece em lugar nenhum.
    const f = fluxo({ movements: [compra, venda] });
    expect(f.porOrigem.compra).toBe(-180);
    expect(f.saidas).toBe(180);
  });

  it("o mesmo estorno não é descontado na linha E de novo no total", () => {
    /* As linhas expõem o BRUTO e a dedução é única. Descontar dentro da linha e
     * outra vez no cabeçalho subtrairia a devolução duas vezes — e o dono veria
     * a receita cair R$ 40 numa devolução de R$ 20. */
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 50 })],
      movements: [],
      subscribers: [],
      periodo: P,
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 })],
      refunds: [rf("r1", { grossAmount: 20 })],
    });

    expect(receita.servicos).toBe(50); // bruto, sem a dedução
    expect(receita.estornos).toBe(20);
    expect(receita.bruta).toBe(30); // uma dedução só
  });

  it("o livro caixa não repete o dinheiro que já entrou por pagamento", () => {
    /* A exclusividade do D25 vem do enum fechado: `TipoDeCaixa` não tem "venda"
     * nem "atendimento". Este teste prova o efeito — a soma das origens é o
     * saldo, e cada fato aparece em exatamente uma delas. */
    const f = fluxo({
      payments: [pg("p1", { grossAmount: 100, feeAmount: 0, netAmount: 100 })],
      cashEntries: [cx("cx1", { amount: -30 })],
    });

    expect(f.porOrigem.servico).toBe(100);
    expect(f.porOrigem.caixa).toBe(-30);
    expect(Object.values(f.porOrigem).reduce((s, v) => s + v, 0)).toBeCloseTo(f.saldo, 2);
    expect(f.saldo).toBe(70);
  });
});

/* ================================================================== */
/* 3 · ESTADOS DE BORDA                                                */
/* ================================================================== */

describe("borda · barbearia nova e mês vazio", () => {
  /* A tela que o primeiro cliente vê. Um NaN aqui aparece como "R$ NaN" no
   * primeiro dia de uso, que é o pior momento possível para o produto perder
   * credibilidade — e nenhum teste de linha isolada cobre o objeto inteiro. */

  const vazia = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });

  it("nenhum campo da receita é NaN ou Infinity", () => {
    const campos = numerosDe(vazia);
    /* Guarda contra varredura vazia: sem isto o teste passaria sobre um objeto
     * que deixou de ter campos — o mesmo cuidado de "encontra os arquivos que
     * gravam pagamento" em `financial-events.test.ts`. */
    expect(campos.length).toBeGreaterThanOrEqual(8);
    for (const [campo, valor] of campos) {
      expect(Number.isFinite(valor), `receita.${campo} = ${valor}`).toBe(true);
    }
  });

  it("nenhum campo do DRE é NaN ou Infinity", () => {
    const dre = resultadoDoMes({
      receita: vazia,
      expenses: [],
      movements: [],
      periodo: P,
      policies: POL,
      staff: [],
      bookings: [],
      commissions: [],
    });
    const campos = numerosDe(dre);
    expect(campos.length).toBeGreaterThanOrEqual(15);
    for (const [campo, valor] of campos) {
      expect(Number.isFinite(valor), `dre.${campo} = ${valor}`).toBe(true);
    }
    /* `breakEvenDay` é nulo e não zero: "o caixa vira no dia 0" seria uma
     * afirmação falsa sobre um mês sem receita. */
    const bruto = resultadoDoMes({
      receita: vazia,
      expenses: [],
      movements: [],
      periodo: P,
      policies: POL,
    });
    expect(bruto.breakEvenDay).toBeNull();
  });

  it("nenhum indicador é NaN — inclusive as divisões por zero", () => {
    const kpis = indicadores({ bookings: [], receita: vazia, periodo: P, capacidade: 0 });
    const campos = numerosDe(kpis);
    expect(campos.length).toBeGreaterThanOrEqual(8);
    for (const [campo, valor] of campos) {
      expect(Number.isFinite(valor), `kpis.${campo} = ${valor}`).toBe(true);
    }
  });

  it("o fluxo de um mês sem movimento é zero em todas as origens", () => {
    const f = fluxo({});
    const campos = numerosDe(f);
    /* 3 totais + 7 origens + 4 instrumentos. */
    expect(campos.length).toBeGreaterThanOrEqual(14);
    for (const [campo, valor] of campos) {
      expect(Number.isFinite(valor), `fluxo.${campo} = ${valor}`).toBe(true);
      expect(valor).toBe(0);
    }
    expect(fluxoDiario([])).toEqual([]);
  });

  it("a composição de uma receita zerada é uma lista vazia, não uma linha de zero", () => {
    /* Uma barbearia que ainda não vendeu nada não precisa ver quatro linhas de
     * "R$ 0,00 · 0%". */
    expect(composicaoDaReceita(vazia)).toEqual([]);
  });

  it("a taxa de maquininha de um mês sem pagamento é zero, não NaN", () => {
    expect(taxasDePagamento([], P)).toBe(0);
  });
});

describe("borda · valor zerado", () => {
  it("atendimento de valor ZERO é atendimento, e não some da contagem", () => {
    /* Cortesia, retoque grátis, serviço coberto por plano. O valor é zero e o
     * atendimento ACONTECEU: a cadeira girou. Sumir da contagem faria a
     * ocupação mentir; virar receita faria o DRE mentir. */
    const bookings = [bk("bk1", { value: 0 }), bk("bk2", { value: 50 })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });

    expect(receita.atendimentos).toBe(2);
    expect(receita.servicos).toBe(50);
  });

  it("um mês inteiro de cortesia não vira NaN no ticket nem no DRE", () => {
    const bookings = [bk("bk1", { value: 0 }), bk("bk2", { value: 0 })];
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const kpis = indicadores({ bookings, receita, periodo: P, capacidade: 10 });
    const dre = resultadoDoMes({
      receita,
      expenses: [dsp("d1", { value: 500 })],
      movements: [],
      periodo: P,
      policies: POL,
    });

    expect(kpis.avgTicket).toBe(0);
    expect(Number.isFinite(dre.contributionMarginPct)).toBe(true);
    expect(Number.isFinite(dre.marginPct)).toBe(true);
    expect(dre.result).toBe(-500);
  });

  it("estorno que devolve TUDO zera a receita sem deixá-la negativa por engano", () => {
    const receita = receitaDoMes({
      bookings: [bk("bk1", { value: 50 })],
      movements: [],
      subscribers: [],
      periodo: P,
      payments: [pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 })],
      refunds: [rf("r1", { grossAmount: 50, parcial: false })],
    });

    expect(receita.bruta).toBe(0);
    expect(receita.servicos).toBe(50); // o fato original permanece — D22
  });
});

describe("borda · documento HISTÓRICO, sem os campos que a 3.1 criou", () => {
  /* A classe de defeito mais perigosa da rodada: o campo não existe no
   * documento antigo, o `??` cai num caminho diferente, e o número muda para
   * uma barbearia que já usava o produto. Nada disso aparece numa massa nova. */

  it("pagamento sem `origin` ainda é reconhecido como serviço", () => {
    /* Anteriores ao D29 não gravavam o campo, e todos eram de serviço. Exigir
     * `origin` jogaria a receita histórica inteira no fallback. */
    const bookings = [bk("bk1", { value: 50 })];
    const antigo = pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 77 });
    delete (antigo as Partial<PaymentDoc>).origin;

    const r = receitaDoMes({
      bookings,
      movements: [],
      subscribers: [],
      periodo: P,
      payments: [antigo],
    });

    expect(r.servicos).toBe(77); // usou o pagamento, não o `booking.value`
    expect(r.semFatoMaterializado).toBe(0);
  });

  it("pagamento sem `netAmount` entra pelo bruto no fluxo, sem virar NaN", () => {
    const antigo = pg("p1", { grossAmount: 60, feeAmount: 0 });
    delete (antigo as Partial<PaymentDoc>).netAmount;

    expect(fluxo({ payments: [antigo] }).entradas).toBe(60);
  });

  it("`netAmount` legitimamente ZERO não é confundido com ausente", () => {
    /* `??` só cai no bruto quando o campo é nulo/ausente. Um `||` aqui faria um
     * líquido de zero virar o bruto — e o caixa mostraria dinheiro que a
     * maquininha reteve inteiro. */
    const p = pg("p1", { grossAmount: 60, feeAmount: 60, netAmount: 0 });
    expect(fluxo({ payments: [p] }).entradas).toBe(0);
  });

  it("venda sem `unitCost` soma ZERO de CMV e é CONTADA como tal", () => {
    /* Anterior a G1. Somar zero é correto — ler `products.cost` reintroduziria
     * o P1-7 —, mas o contador precisa expor quantas, senão a margem parece
     * ótima e ninguém sabe por quê. */
    const antiga = mv("v1", { value: 90, quantity: 2 });
    delete (antiga as Partial<InventoryMovementDoc>).unitCost;

    const receita = receitaDoMes({
      bookings: [],
      movements: [antiga],
      subscribers: [],
      periodo: P,
    });
    const dre = resultadoDoMes({
      receita,
      expenses: [],
      movements: [antiga],
      periodo: P,
      policies: POL,
    });

    expect(dre.cmv).toBe(0);
    expect(receita.produtos).toBe(90);
  });

  it("reserva sem `isFitIn` conta como atendimento normal, e não some", () => {
    /* `Boolean(undefined)` é false, e o encaixe é a única linha em que a
     * ausência do campo poderia fazer o atendimento cair fora das DUAS
     * partições — sumindo da receita sem sumir da contagem. */
    const antiga = bk("bk1", { value: 50 });
    delete (antiga as Partial<BookingDoc>).isFitIn;

    const r = receitaDoMes({ bookings: [antiga], movements: [], subscribers: [], periodo: P });

    expect(r.servicos + r.encaixes).toBe(50);
    expect(r.bruta).toBe(50);
  });

  it("DEFEITO 2 · comissão congelada SEM `origin` é IGNORADA e o valor é rederivado", () => {
    /* Achado de QA-01, 17/08/2026.
     *
     * `domain.ts` documenta, no próprio tipo: *"Ausente nas comissões
     * anteriores à Rodada 3.1 — todas de serviço, que era a única
     * materializada."*
     *
     * `comissoesDeServico` monta o mapa de congeladas filtrando
     * `c.origin === "servico"`. O documento histórico não tem o campo, é
     * descartado do mapa, e a comissão volta a ser derivada de
     * `staff.commissionPct` — o cadastro de HOJE.
     *
     * **É o P1-7 vivo para todo o histórico anterior à 3.1**, que é exatamente
     * o defeito que a rodada existe para eliminar: mudar o percentual de um
     * barbeiro reescreve meses fechados.
     *
     * A assimetria que confirma o diagnóstico: `indexarPagamentos`, em
     * `fontes-financeiras.ts`, TRATA o mesmo buraco —
     * `p.origin ?? (p.bookingId ? "servico" : undefined)`. A camada de
     * pagamentos tolera o documento histórico; a de comissões não.
     *
     * Evidência abaixo: o mesmo documento, com e sem o campo. */
    const bookings = [bk("bk1", { value: 100, staffId: "leo" })];
    const staff = [st("leo", { commissionPct: 60 })]; // o cadastro mudou desde então

    const congelada = cm("comissao_bk1", {
      bookingId: "bk1",
      staffId: "leo",
      commissionPct: 30, // o que valia no dia
      commissionBase: 100,
      commissionAmount: 30,
    });

    const historica = { ...congelada } as Doc<CommissionDoc>;
    delete (historica as Partial<CommissionDoc>).origin;

    const comCampo = comissoesDeServico({
      bookings,
      staff,
      periodo: P,
      policies: POL,
      commissions: [congelada],
    });
    const semCampo = comissoesDeServico({
      bookings,
      staff,
      periodo: P,
      policies: POL,
      commissions: [historica],
    });

    /* CORRIGIDO. O `not` que existia aqui caiu no dia da correção, como o teste
     * previa: os dois são o MESMO documento e agora devolvem o mesmo número.
     *
     * `origin` ausente passou a contar como serviço — produto só virou fato na
     * 3.1 e aponta `movementId`, nunca `bookingId`. É a mesma tolerância que
     * `indexarPagamentos` já tinha para `payments`; a assimetria entre as duas
     * camadas era o defeito. */
    expect(comCampo.total).toBe(30);
    expect(semCampo.total).toBe(30);
    expect(semCampo.total).toBe(comCampo.total);

    /* E o efeito de ponta que o defeito produzia: o DRE de um mês fechado
     * mudava quando o dono mexia no cadastro — o P1-7 na definição original.
     * Agora o congelado vence nas duas leituras. */
    const receita = receitaDoMes({ bookings, movements: [], subscribers: [], periodo: P });
    const base = {
      receita,
      expenses: [],
      movements: [],
      periodo: P,
      policies: POL,
      bookings,
      commissions: [historica],
    };
    const antes = resultadoDoMes({ ...base, staff: [st("leo", { commissionPct: 30 })] });
    const depois = resultadoDoMes({ ...base, staff: [st("leo", { commissionPct: 60 })] });

    expect(antes.commissionsServico).toBe(30);
    expect(depois.commissionsServico).toBe(30); // mesmo mês, mesmo fato, MESMO número
  });

  it("comissão de PRODUTO sem `origin` some da soma — o outro lado do DEFEITO 2", () => {
    /* `comissaoDeProduto` filtra `origin === "produto"`. Sem o campo, a linha
     * não entra em NENHUMA das duas somas: nem serviço, nem produto.
     *
     * Nesta direção o erro é o segundo da régua — "não pode deixar de
     * reconhecer algo que aconteceu". O custo existe e o DRE não o mostra.
     *
     * Hoje o servidor sempre grava `origin` na comissão de produto (ela nasceu
     * na 3.1 já com o campo), então isto não afeta dado real — é a rede que
     * pega o dia em que um caminho novo esquecer o campo. */
    const semOrigin = cm("comissao_venda_v1", {
      bookingId: undefined,
      movementId: "v1",
      commissionAmount: 25,
    });
    delete (semOrigin as Partial<CommissionDoc>).origin;

    const receita = receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
    const dre = resultadoDoMes({
      receita,
      expenses: [],
      movements: [],
      periodo: P,
      policies: POL,
      staff: [],
      bookings: [],
      commissions: [semOrigin],
    });

    expect(dre.commissionsLoja).toBe(0); // os R$ 25 não aparecem em lugar nenhum
    expect(dre.commissionsServico).toBe(0);
  });
});

/* ================================================================== */
/* 4 · INVARIANTES QUE SÓ EXISTIAM EM COMENTÁRIO                       */
/* ================================================================== */

describe("invariantes · o que estava escrito em prosa e não em teste", () => {
  const cenario = () => {
    const bookings = [bk("bk1", { value: 50 }), bk("bk2", { value: 80, staffId: "rafael" })];
    const movements = [
      mv("v1", { value: 90, quantity: 2, unitCost: 18 }),
      mv("c1", { kind: "compra", value: 180, quantity: 10, unitCost: 18 }),
    ];
    const payments = [
      pg("pagamento_bk1", { bookingId: "bk1", grossAmount: 50 }),
      pg("pagamento_venda_v1", { origin: "produto", movementId: "v1", grossAmount: 90 }),
      pg("pagamento_fatura_f1", { origin: "mensalidade", invoiceId: "f1", grossAmount: 99 }),
    ];
    const refunds = [rf("r1", { grossAmount: 20 })];
    const receita = receitaDoMes({
      bookings,
      movements,
      subscribers: [],
      periodo: P,
      payments,
      refunds,
      invoices: [fat("f1")],
    });
    const dre = resultadoDoMes({
      receita,
      expenses: [dsp("d1", { value: 2000 })],
      movements,
      periodo: P,
      policies: POL,
      staff: [st("leo"), st("rafael")],
      bookings,
      commissions: [cm("comissao_bk1")],
      gatewayFeesTotal: taxasDePagamento(payments, P),
    });
    return { receita, dre, payments, refunds, movements };
  };

  it("a identidade `receita − custo = resultado` vale COM devolução no mês", () => {
    /* A identidade é testada hoje num cenário sem estorno. O estorno mexe no
     * numerador de várias linhas ao mesmo tempo — receita, imposto, margem — e
     * é onde ela tem mais chance de quebrar. */
    const { dre } = cenario();
    expect(dre.grossRevenue - dre.totalCost).toBeCloseTo(dre.result, 2);
  });

  it("a escada do DRE fecha degrau a degrau", () => {
    /* Cada degrau é exibido na tela. Se um deles deixar de derivar do anterior,
     * a tela mostra uma soma que não fecha na conta de cima. */
    const { dre } = cenario();
    expect(dre.variableCost).toBeCloseTo(dre.cmv + dre.gatewayFees + dre.commissions, 2);
    expect(dre.commissions).toBeCloseTo(dre.commissionsServico + dre.commissionsLoja, 2);
    expect(dre.contributionMargin).toBeCloseTo(dre.grossRevenue - dre.variableCost, 2);
    expect(dre.fixedCost).toBeCloseTo(
      dre.fixedExpenses + dre.variableOperatingExpenses + dre.payroll,
      2
    );
    expect(dre.resultBeforeTax).toBeCloseTo(dre.contributionMargin - dre.fixedCost, 2);
    expect(dre.result).toBeCloseTo(dre.resultBeforeTax - dre.tax, 2);
    expect(dre.totalCost).toBeCloseTo(dre.variableCost + dre.fixedCost + dre.tax, 2);
  });

  it("todo valor monetário do DRE está AO CENTAVO — D1/D5", () => {
    /* O defeito que a rodada corrigiu duas vezes (taxa e imposto) era sempre o
     * mesmo: um `Math.round` ao real sobrevivendo num canto. Esta varredura
     * pega o próximo, em qualquer campo novo que alguém acrescentar.
     *
     * Percentuais ficam de fora: eles não são dinheiro. */
    const { dre } = cenario();
    const percentuais = ["contributionMarginPct", "marginPct", "pct", "breakEvenDay", "diasNoMes"];
    const monetarios = numerosDe(dre).filter(
      ([campo]) => !percentuais.some((p) => campo.includes(p))
    );

    expect(monetarios.length).toBeGreaterThanOrEqual(15);
    for (const [campo, valor] of monetarios) {
      expect(
        Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6,
        `dre.${campo} = ${valor} tem fração de centavo`
      ).toBe(true);
    }
  });

  it("o imposto incide sobre a receita REALIZADA, e a devolução o reduz", () => {
    /* `receita.bruta` já é líquida de devolução. Cobrar imposto sobre o valor
     * antes do estorno faria o dono pagar sobre dinheiro que ele devolveu. */
    const comum = {
      bookings: [bk("bk1", { value: 100 })],
      movements: [],
      subscribers: [],
      periodo: P,
    };
    const semEstorno = receitaDoMes(comum);
    const comEstorno = receitaDoMes({ ...comum, refunds: [rf("r1", { grossAmount: 40 })] });

    const imposto = (r: ReturnType<typeof receitaDoMes>) =>
      resultadoDoMes({ receita: r, expenses: [], movements: [], periodo: P, policies: POL }).tax;

    expect(imposto(semEstorno)).toBeCloseTo((100 * POL.taxRatePct) / 100, 2);
    expect(imposto(comEstorno)).toBeCloseTo((60 * POL.taxRatePct) / 100, 2);
    expect(imposto(comEstorno)).toBeLessThan(imposto(semEstorno));
  });

  it("CAIXA e RESULTADO divergem — e a diferença é explicável", () => {
    /* A invariante que o comentário de `fluxo-de-caixa.ts` enuncia em prosa:
     * "forçar os dois números a coincidir é o erro que apaga a diferença entre
     * lucro e dinheiro em conta". Este teste prova que eles divergem PELO
     * MOTIVO CERTO — a compra de estoque que ainda não virou CMV. */
    const { dre, payments, refunds, movements } = cenario();
    const f = fluxo({ payments, refunds, movements, expenses: [dsp("d1", { value: 2000 })] });

    expect(f.saldo).not.toBeCloseTo(dre.result, 2);

    /* A compra de 180 saiu do caixa; só 36 (2 × 18) viraram CMV. Os 144 que
     * ficaram na prateleira são a maior parte da diferença. */
    expect(f.porOrigem.compra).toBe(-180);
    expect(dre.cmv).toBe(36);
  });

  it("o acumulado do fluxo diário termina no saldo do resumo", () => {
    /* Dois números que a mesma tela mostra: a última linha da tabela e o KPI do
     * topo. Se divergirem, o dono soma a coluna na mão e não fecha. */
    const { payments, refunds, movements } = cenario();
    const movs = movimentosDeCaixa({
      payments,
      refunds,
      expenses: [dsp("d1", { value: 2000 })],
      movements,
      cashEntries: [cx("cx1", { amount: -50 })],
      periodo: P,
    });
    const dias = fluxoDiario(movs);

    expect(dias.at(-1)!.acumulado).toBeCloseTo(resumoDoFluxo(movs).saldo, 2);
  });

  it("cada dia do fluxo fecha: entradas − saídas = saldo", () => {
    const { payments, refunds, movements } = cenario();
    const dias = fluxoDiario(
      movimentosDeCaixa({
        payments,
        refunds,
        expenses: [dsp("d1", { value: 2000 })],
        movements,
        cashEntries: [],
        periodo: P,
      })
    );

    expect(dias.length).toBeGreaterThan(0);
    for (const d of dias) expect(d.entradas - d.saidas).toBeCloseTo(d.saldo, 2);
  });

  it("o MRR contratado nunca entra na receita realizada, com quantos mensalistas for", () => {
    /* O I5, na forma invariante: a receita não pode mudar em função do número
     * de assinantes ativos. Foi o defeito do PR #18. */
    const subscribers = Array.from(
      { length: 40 },
      (_, i) => ({ id: `s${i}`, status: "ativo", price: 149 }) as Doc<SubscriberDoc>
    );
    const comum = { bookings: [bk("bk1", { value: 50 })], movements: [], periodo: P };

    const sem = receitaDoMes({ ...comum, subscribers: [] });
    const com = receitaDoMes({ ...comum, subscribers, hoje: new Date("2026-09-15T12:00:00") });

    expect(com.bruta).toBe(sem.bruta);
    expect(com.mensalistas).toBe(40 * 149);
    expect(composicaoDaReceita(com).some((l) => l.value === com.mensalistas)).toBe(false);
  });

  it("a fatura PAGA é receita; o contrato ATIVO não — D20", () => {
    /* As duas metades da mesma decisão, no mesmo cenário: o mensalista tem
     * contrato ativo E uma fatura paga. Só a fatura vira receita, e não as
     * duas somadas. */
    const receita = receitaDoMes({
      bookings: [],
      movements: [],
      subscribers: [{ id: "s1", status: "ativo", price: 99 } as Doc<SubscriberDoc>],
      periodo: P,
      invoices: [fat("f1", { amount: 99 })],
      hoje: new Date("2026-09-15T12:00:00"),
    });

    expect(receita.mensalidades).toBe(99);
    expect(receita.mensalistas).toBe(99);
    expect(receita.bruta).toBe(99); // 99, nunca 198
  });
});
