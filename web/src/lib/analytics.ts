import { safeDiv, toISODate } from "@/lib/format";
import {
  isReceived,
  isRevenue,
  monthOf,
  OCCUPIES_SLOT,
  type BookingDoc,
  type ExpenseDoc,
  type InventoryMovementDoc,
  type CommissionDoc,
  type PaymentDoc,
  type ProductDoc,
  type StaffDoc,
  type SubscriberDoc,
} from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { TenantPolicies } from "@/lib/tenant";
import type { PaymentMethod } from "@/lib/types";
import { dentroDoPeriodo, type Periodo } from "@/lib/analytics-periodo";
import {
  comissaoDeProduto,
  custoDoVendido,
  receitaDeMensalidade,
  receitaDeProduto,
  receitaDeServico,
} from "@/lib/fontes-financeiras";
import type { RefundDoc, SubscriptionInvoiceDoc } from "@/lib/domain";

/**
 * Derivações financeiras a partir do dado bruto.
 *
 * O mock guardava resultado pronto — `dre`, `dailyCashHistory`, `monthKpis`,
 * `cashProjection` eram todos literais que precisavam bater entre si na mão, e
 * não batiam. Aqui tudo desce de duas fontes: reservas e despesas. Se dois
 * números divergirem, é bug de cálculo num lugar só, não de dado em quatro.
 *
 * Funções puras de propósito: recebem os documentos e devolvem números, sem
 * tocar em Firestore. É o que as torna testáveis sem emulador.
 */

/* O recorte de período mora em `analytics-periodo.ts` desde a Rodada 3.2, para
 * `fontes-financeiras.ts` poder usá-lo sem ciclo de import. Reexportado aqui
 * porque dezenas de telas já importam daqui. */
export { dentroDoPeriodo, mesPeriodo, type Periodo } from "@/lib/analytics-periodo";

/** Arredonda ao centavo — nunca ao real. Ver D1/D5. */
function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Receita                                                             */
/* ------------------------------------------------------------------ */

export type ReceitaDoMes = {
  servicos: number;
  encaixes: number;
  produtos: number;
  /**
   * MRR CONTRATADO — o retrato de `subscriptions` com status `ativo`.
   *
   * Continua fora de `bruta`: é contrato, não recebimento. Fica exposto para a
   * tela mostrar à parte, com nome próprio.
   */
  mensalistas: number;
  /**
   * Mensalidade REALIZADA — faturas efetivamente pagas no período (D20).
   *
   * Esta entra em `bruta`, porque tem lastro: existe uma fatura marcada como
   * paga e, desde G1.6, um `PaymentDoc` com a taxa congelada.
   *
   * **Contratado projeta; realizado fatura.**
   */
  mensalidades: number;
  bruta: number;
  /** O que entra pelo balcão. */
  caixa: number;
  atendimentos: number;
  /** Quanto voltou ao cliente no período, somando as três origens (D22). */
  estornos: number;
  /**
   * Quantos fatos caíram no fallback histórico.
   *
   * Torna a migração VISÍVEL. Sem isto, "a receita saiu dos pagamentos" e "a
   * receita saiu do documento antigo" ficam indistinguíveis, e a reconciliação
   * da 3.4 não teria como explicar uma divergência.
   */
  semFatoMaterializado: number;
};

export function receitaDoMes(params: {
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  periodo: Periodo;
  /** Data de referência — decide se o retrato de mensalistas vale no período. */
  hoje?: Date;
  /**
   * Pagamentos congelados — Rodada 3.2.
   *
   * Quando existe um para o fato, o valor sai dele. Ausentes, cada linha cai no
   * documento original: é o fallback histórico, e ele cobre os fatos anteriores
   * à materialização automática.
   *
   * O fallback **não é uma segunda parcela somada**. A iteração é sobre o FATO,
   * e o pagamento só substitui o valor — ver `fontes-financeiras.ts`.
   */
  payments?: Doc<PaymentDoc>[];
  /** Devoluções do período. Reduzem a receita sem apagar o pagamento (D22). */
  refunds?: Doc<RefundDoc>[];
  /** Faturas de mensalidade. A PAGA é o que vira receita realizada (D20). */
  invoices?: Doc<SubscriptionInvoiceDoc>[];
}): ReceitaDoMes {
  const { bookings, movements, subscribers, periodo } = params;
  const payments = params.payments ?? [];
  const refunds = params.refunds ?? [];
  const invoices = params.invoices ?? [];

  /* Cada linha itera sobre o próprio universo de fatos e escolhe a fonte por
   * item. Nenhuma soma duas coleções — é o que garante que um atendimento não
   * entre duas vezes quando o pagamento dele existe. */
  const normais = receitaDeServico({ bookings, payments, refunds, periodo, apenasEncaixes: false });
  const encaixados = receitaDeServico({ bookings, payments, refunds, periodo, apenasEncaixes: true });
  const servico = receitaDeServico({ bookings, payments, refunds, periodo });
  const produto = receitaDeProduto({ movements, payments, refunds, periodo });
  const mensalidade = receitaDeMensalidade({ invoices, payments, refunds, periodo });

  /* MRR contratado — o retrato de HOJE, e por isso recortado pela data de
   * referência. `SubscriberDoc` não guarda `createdAt` nem `canceledAt`: somar
   * em qualquer período faria os 40 assinantes de hoje virarem receita de um
   * janeiro que teve 5.
   *
   * Continua FORA de `bruta`. O que entra é `mensalidades`, que tem lastro de
   * fatura paga — a decisão D20. */
  const referencia = toISODate(params.hoje ?? new Date());
  const mensalistas = dentroDoPeriodo(referencia, periodo)
    ? subscribers.filter((s) => s.status === "ativo").reduce((s, sub) => s + sub.price, 0)
    : 0;

  /* TODAS as linhas expõem o BRUTO, e o estorno é uma dedução única.
   *
   * Misturar bruto e líquido entre as linhas quebraria a soma da árvore — os
   * filhos não fechariam com o cabeçalho, que é exatamente o D6/P1-2 que a
   * Rodada 1 corrigiu. E descontar a devolução dentro da linha E de novo no
   * total a subtrairia duas vezes.
   *
   * É também como um DRE de verdade se lê: receita bruta, deduções, receita
   * líquida. */
  const estornos = centavos(servico.estornada + produto.estornada + mensalidade.estornada);
  const somaDasLinhas = centavos(
    servico.bruta + produto.bruta + mensalidade.bruta
  );
  const caixa = centavos(somaDasLinhas - estornos);

  return {
    servicos: normais.bruta,
    encaixes: encaixados.bruta,
    produtos: produto.bruta,
    mensalistas,
    mensalidades: mensalidade.bruta,
    caixa,
    /** Receita REALIZADA: soma das linhas menos as devoluções. */
    bruta: caixa,
    atendimentos: servico.quantidade,
    estornos,
    semFatoMaterializado:
      servico.semFatoMaterializado +
      produto.semFatoMaterializado +
      mensalidade.semFatoMaterializado,
  };
}

/**
 * De onde vem a receita REALIZADA — a composição que as telas listam.
 *
 * Existia duas vezes, montada à mão em cada tela, e as duas discordavam: o
 * Financeiro excluía mensalista e o DRE o incluía. No DRE isso quebrava a
 * própria árvore — os filhos somavam 928 sob um cabeçalho de 680, e o dono que
 * expandisse e somasse na mão não fechava.
 *
 * Mensalista fica de fora porque **não é receita realizada**: é contrato sem
 * lastro de recebimento. Ele não some do produto — aparece com nome próprio,
 * como receita contratada, e na projeção como cobrança futura. A regra, escrita:
 * **contratado projeta, realizado fatura.**
 *
 * Linha zerada não entra: uma barbearia que não vende produto não precisa ver
 * "Produtos (loja) · R$ 0,00" todo mês.
 */
export type LinhaDaReceita = {
  label: string;
  value: number;
  /** Fatia sobre a receita BRUTA. Negativo na dedução. */
  pct: number;
  /** `true` na devolução: subtrai em vez de compor. */
  deducao: boolean;
};

export function composicaoDaReceita(receita: ReceitaDoMes): LinhaDaReceita[] {
  const entradas = [
    { label: "Serviços avulsos", value: receita.servicos },
    { label: "Produtos (loja)", value: receita.produtos },
    { label: "Encaixes", value: receita.encaixes },
    /* Mensalidade RECEBIDA entra na árvore desde a Rodada 3.2 (D20). O que
     * continua fora é o MRR contratado, que não tem lastro de recebimento. */
    { label: "Mensalidades recebidas", value: receita.mensalidades },
  ].filter((item) => item.value > 0);

  /* O denominador é o BRUTO — a soma das entradas —, não a receita líquida.
   *
   * Usar a líquida fazia as fatias somarem mais de 100% num mês com devolução:
   * R$ 50 + R$ 90 + R$ 99 sobre R$ 194 dá 26% + 46% + 51% = 123%. E a linha de
   * devolução aparecia com 0%, porque `safePct` clampa negativo — o dono via
   * uma dedução de R$ 45,00 valendo zero por cento.
   *
   * É o D6/P1-2 na versão percentual: os filhos não fechavam o cabeçalho. */
  const bruto = entradas.reduce((s, i) => s + i.value, 0);
  const fatia = (v: number) => (bruto > 0 ? Math.round((v / bruto) * 100) : 0);

  const linhas: LinhaDaReceita[] = entradas.map((i) => ({
    ...i,
    pct: fatia(i.value),
    deducao: false,
  }));

  /* A devolução entra por último e com sinal, porque não é uma fatia da receita
   * — é o que saiu dela. Escondê-la faria a soma das linhas não bater com a
   * receita realizada logo acima. */
  if (receita.estornos > 0) {
    linhas.push({
      label: "Devoluções",
      value: -receita.estornos,
      pct: -fatia(receita.estornos),
      deducao: true,
    });
  }

  return linhas;
}

/**
 * Quanto o dia ainda pode render.
 *
 * Somava tudo que ocupa a agenda — e `no_show` ocupa, corretamente, porque a
 * cadeira foi reservada e ninguém mais pôde usá-la. O efeito: depois de o dono
 * marcar "não veio", o recebido caía para zero e a previsão continuava contando
 * o valor. A barra mostrava 0% de um número que já se sabia que não viria.
 *
 * Previsão e ocupação respondem perguntas diferentes: uma é sobre dinheiro que
 * ainda pode entrar, a outra sobre a cadeira que foi perdida. A falta continua
 * ocupando; ela só deixa de ser prevista.
 */
export function previsaoDoDia(bookings: Doc<BookingDoc>[]) {
  return bookings
    .filter((b) => b.status !== "no_show" && OCCUPIES_SLOT.includes(b.status))
    .reduce((soma, b) => soma + b.value, 0);
}

/**
 * O resumo de despesas de um período.
 *
 * A tela somava TODAS as despesas já lançadas e rotulava "Total no mês" — o erro
 * cresce a cada mês de uso, e no terceiro mostra o triplo do que o dono gastou.
 */
export function resumoDeDespesas(expenses: Doc<ExpenseDoc>[], periodo: Periodo) {
  const doPeriodo = expenses.filter((e) => dentroDoPeriodo(e.date, periodo));

  const porCategoria = new Map<string, number>();
  for (const e of doPeriodo) {
    porCategoria.set(e.category, (porCategoria.get(e.category) ?? 0) + e.value);
  }

  let maiorCategoria = { categoria: "—", valor: 0 };
  for (const [categoria, valor] of porCategoria) {
    if (valor > maiorCategoria.valor) maiorCategoria = { categoria, valor };
  }

  return {
    lancamentos: doPeriodo.length,
    total: doPeriodo.reduce((s, e) => s + e.value, 0),
    recorrentes: doPeriodo.filter((e) => e.recurring).reduce((s, e) => s + e.value, 0),
    maiorCategoria,
    /** A lista já recortada, para a tabela não refazer o filtro. */
    itens: doPeriodo,
  };
}

/* ------------------------------------------------------------------ */
/* Caixa dia a dia                                                     */
/* ------------------------------------------------------------------ */

export type DiaDeCaixa = {
  date: string;
  pix: number;
  cartao: number;
  dinheiro: number;
  /**
   * Recebido sem meio informado.
   *
   * Existe para o nulo não virar dinheiro. O servidor grava `paymentMethod:
   * null` quando o atendimento é concluído sem dizer como o cliente pagou — e
   * somar isso em espécie faz a coluna que o dono confere contra a gaveta
   * afirmar algo que ninguém registrou.
   */
  naoInformado: number;
  total: number;
  appointments: number;
};

/**
 * O caixa diário — agora a partir dos PAGAMENTOS.
 *
 * Lia `bookings.value` e `movements.value`, e jogava **toda venda de produto na
 * coluna dinheiro** (D4) mesmo com o meio gravado no movimento desde G1.
 *
 * Passa a somar `payments`, pelo valor LÍQUIDO: é o que cai na conta, e é
 * contra o extrato que o dono confere. Uma venda no crédito some da coluna
 * dinheiro e aparece em cartão, com a taxa já descontada.
 *
 * `appointments` conta só a origem `servico` — é quantas cadeiras giraram, não
 * quantos recebimentos houve. Somar venda e mensalidade ali inflaria o
 * denominador do ticket médio, que é o defeito D2 entrando por outra porta.
 *
 * Mantém o formato `DiaDeCaixa` porque o gráfico e a tabela já o consomem. As
 * SAÍDAS vivem em `fluxo-de-caixa.ts`, com estrutura própria: elas não cabem
 * neste tipo, e forçá-las aqui misturaria duas perguntas diferentes.
 */
export function caixaDiario(params: {
  payments: Doc<PaymentDoc>[];
  periodo: Periodo;
}): DiaDeCaixa[] {
  const porDia = new Map<string, DiaDeCaixa>();

  const dia = (date: string) => {
    let d = porDia.get(date);
    if (!d) {
      d = { date, pix: 0, cartao: 0, dinheiro: 0, naoInformado: 0, total: 0, appointments: 0 };
      porDia.set(date, d);
    }
    return d;
  };

  for (const p of params.payments) {
    if (!dentroDoPeriodo(p.date, params.periodo)) continue;

    const d = dia(p.date);
    const valor = Number(p.netAmount ?? p.grossAmount) || 0;

    /* Débito e crédito somam em "cartão": o dono concilia com o extrato da
     * maquininha, que é uma fila só. A distinção por instrumento vive em
     * `payments`, onde a taxa de cada um está congelada.
     *
     * Método NULO vai para `naoInformado`, não para dinheiro.
     *
     * O `else` engolia o nulo e afirmava espécie. O servidor grava `null` DE
     * PROPÓSITO quando o atendimento foi concluído sem informar como o cliente
     * pagou — é "não sabemos", e a coluna dinheiro é justamente a que o dono
     * confere contra a gaveta. Chamar de dinheiro o que não se sabe ser dinheiro
     * é a primeira metade da régua sendo violada.
     *
     * `resumoDoFluxo` já classificava isso como "outros"; as duas leituras
     * discordavam do mesmo pagamento, e o total fechava nas duas — que é o que
     * escondia. */
    if (p.paymentMethod === "pix") d.pix += valor;
    else if (p.paymentMethod === "debit" || p.paymentMethod === "credit") d.cartao += valor;
    else if (p.paymentMethod === "cash") d.dinheiro += valor;
    else d.naoInformado += valor;

    d.total = centavos(d.total + valor);

    const origem = p.origin ?? (p.bookingId ? "servico" : undefined);
    if (origem === "servico") d.appointments += 1;
  }

  for (const d of porDia.values()) {
    d.pix = centavos(d.pix);
    d.cartao = centavos(d.cartao);
    d.dinheiro = centavos(d.dinheiro);
    d.naoInformado = centavos(d.naoInformado);
  }

  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Custo do trabalho                                                   */
/* ------------------------------------------------------------------ */

export type ComissaoDeBarbeiro = {
  staffId: string;
  nome: string;
  /** Faturamento de serviço que passou pela cadeira dele no período. */
  base: number;
  pct: number;
  valor: number;
  atendimentos: number;
};

/**
 * Quanto do faturamento de serviço vira pagamento de barbeiro.
 *
 * Esta é a MAIOR linha de custo de uma barbearia com equipe, e até 04/08/2026
 * ela não existia no DRE: a comissão era calculada só sobre o lucro da loja de
 * produtos. Com R$ 12.432 de serviço e 40% de rateio, o sistema lançava R$ 140
 * de custo de mão de obra em vez de R$ 5.113 — e informava 60% de margem para
 * um setor cuja margem real fica entre 15% e 30%.
 *
 * Cada reserva paga a taxa DO BARBEIRO que atendeu (`StaffDoc.commissionPct`),
 * não uma média: contratar alguém com percentual diferente muda o custo de
 * verdade, e um percentual único esconde exatamente a decisão que o dono
 * precisa tomar.
 *
 * O pagamento do dono-barbeiro entra aqui também, como comissão e não como
 * pró-labore no custo fixo. São duas escolhas contábeis defensáveis e o
 * resultado final é idêntico; esta evita um degrau absurdo no dia da primeira
 * contratação — a margem de contribuição cairia de 95% para 58% de um mês para
 * o outro sem nada ter piorado — e mantém o ponto de equilíbrio na definição
 * padrão (custo fixo ÷ margem de contribuição).
 */
export function comissoesDeServico(params: {
  bookings: Doc<BookingDoc>[];
  staff: Doc<StaffDoc>[];
  periodo: Periodo;
  policies: TenantPolicies;
  /**
   * Comissões congeladas na conclusão do atendimento. Quando existe uma para a
   * reserva, ela VENCE — é o valor que de fato foi acertado com o barbeiro
   * naquele dia, e reler o cadastro atual faria o mês fechado se reescrever
   * sozinho toda vez que alguém mudasse um percentual.
   *
   * Atendimentos anteriores ao trigger de materialização não têm comissão
   * gravada; sem a derivação como fallback, o histórico inteiro apareceria
   * zerado no dia em que o trigger entrou.
   */
  commissions?: Doc<CommissionDoc>[];
}): { total: number; porBarbeiro: ComissaoDeBarbeiro[] } {
  const { bookings, staff, periodo, policies } = params;
  const padrao = policies.commissionSplit.barberPct;
  const porId = new Map(staff.map((s) => [s.id, s]));
  const acc = new Map<string, ComissaoDeBarbeiro>();

  /* Só as de serviço: a comissão de produto tem outra base — o lucro da venda,
   * não o faturamento — e é somada separadamente. Sem esse recorte, uma comissão
   * de produto que compartilhasse `bookingId` entraria com a base errada.
   *
   * `origin` AUSENTE conta como serviço, e a tolerância não é cosmética.
   *
   * O campo só passou a ser gravado depois; todo `CommissionDoc` anterior a ele
   * é de serviço, porque produto só virou fato na Rodada 3.1 — e produto aponta
   * `movementId`, nunca `bookingId`. Exigir `origin` descartava esses
   * documentos do mapa de congeladas, e o valor caía no fallback: derivado do
   * `commissionPct` de HOJE.
   *
   * Ou seja, **o P1-7 continuava vivo em todo o histórico anterior à 3.1** —
   * mudar o percentual de um barbeiro reescrevia o acerto de meses fechados.
   * Achado pela bateria de regressão: mesmo documento, comissão congelada de
   * R$ 30; com `origin` devolve 30, sem `origin` devolvia 60.
   *
   * `indexarPagamentos` já tratava exatamente este buraco em `payments`. A
   * assimetria entre as duas camadas era o defeito. */
  const congelada = new Map(
    (params.commissions ?? [])
      .filter((c) => {
        const origem = c.origin ?? (c.bookingId ? "servico" : undefined);
        return origem === "servico" && dentroDoPeriodo(c.date, periodo);
      })
      .map((c) => [c.bookingId, c])
  );

  for (const b of bookings) {
    if (!isRevenue(b) || !dentroDoPeriodo(b.date, periodo)) continue;

    const pessoa = porId.get(b.staffId);
    const doDia = congelada.get(b.id);

    /* Reserva órfã ainda custa dinheiro: o corte aconteceu e alguém recebeu.
     * Cair no percentual da barbearia é melhor que somar zero — mas o nome
     * fica explícito para o dono ver que há dado a corrigir. */
    const pct = doDia?.commissionPct ?? pessoa?.commissionPct ?? padrao;
    const base = doDia?.commissionBase ?? b.value;
    const valor = doDia?.commissionAmount ?? Math.round((base * pct) / 100);

    let linha = acc.get(b.staffId);
    if (!linha) {
      linha = {
        staffId: b.staffId,
        nome: doDia?.staffName ?? pessoa?.name ?? "Barbeiro não identificado",
        base: 0,
        pct,
        valor: 0,
        atendimentos: 0,
      };
      acc.set(b.staffId, linha);
    }
    linha.base += base;
    linha.valor += valor;
    linha.atendimentos += 1;
  }

  /* O percentual exibido é recalculado do que foi somado, e não copiado do
   * cadastro: num mês em que a taxa do barbeiro mudou, parte dos atendimentos
   * está congelada na taxa antiga e parte na nova. Mostrar só uma delas seria
   * uma legenda que não explica o próprio número ao lado. */
  const porBarbeiro = [...acc.values()]
    .map((l) => ({ ...l, pct: Math.round(safeDiv(l.valor, l.base) * 1000) / 10 }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total: porBarbeiro.reduce((s, l) => s + l.valor, 0),
    porBarbeiro,
  };
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Despesas recorrentes que já valem numa data — uma por compromisso.
 *
 * `recurring` é um booleano num documento de data única: nada gera a ocorrência
 * do mês seguinte. As duas telas que leem esse campo discordavam sobre ele — o
 * DRE filtrava por período e perdia a despesa no mês seguinte ao lançamento,
 * enquanto a Projeção pegava todos os lançamentos de todos os meses e cobrava
 * seis aluguéis no mesmo dia depois de seis meses de uso.
 *
 * Aqui o compromisso vale a partir do lançamento e segue valendo. Quando o dono
 * relançou a mesma despesa na mão, a chave `categoria|descrição` reconhece que
 * é o mesmo compromisso e vale a versão mais recente — o reajuste do aluguel
 * substitui o valor velho em vez de somar com ele.
 */
export function despesasRecorrentesVigentes(
  expenses: Doc<ExpenseDoc>[],
  ateData: string
): Doc<ExpenseDoc>[] {
  const porCompromisso = new Map<string, Doc<ExpenseDoc>>();

  for (const e of expenses) {
    if (!e.recurring || e.date > ateData) continue;
    const chave = `${e.category}|${e.description}`.trim().toLowerCase();
    const atual = porCompromisso.get(chave);
    if (!atual || e.date > atual.date) porCompromisso.set(chave, e);
  }

  return [...porCompromisso.values()];
}

/**
 * Folha mensal da equipe.
 *
 * Quem está fora do quadro não entra: o cadastro é preservado para o histórico
 * e para um eventual retorno, mas o salário não é mais devido. Sem salário
 * definido conta zero — o arranjo mais comum em barbearia é só comissão.
 */
export function folhaMensal(staff: Doc<StaffDoc>[]) {
  return staff
    .filter((s) => s.active !== false)
    .reduce((soma, s) => soma + (s.salary ?? 0), 0);
}

/**
 * Taxa de maquininha do período, somada dos pagamentos congelados.
 *
 * `gatewayFeesTotal` era um parâmetro que nenhum chamador preenchia, então o
 * DRE debitava zero de taxa: numa barbearia que passa metade do faturamento no
 * crédito, some cerca de 1,5% do faturamento total do resultado.
 */
/**
 * Soma das taxas congeladas do período — ao CENTAVO, não ao real (D1/D5).
 *
 * Arredondava para real inteiro: R$ 7,85 virava R$ 8,00. Parece irrelevante e
 * é sistemático — e sempre na mesma direção, porque o valor arredondado entra
 * como CUSTO. Com 7,85 → 8,00 o lucro aparente cai; com 4,14 → 4,00 ele sobe.
 * Em nenhum dos dois o número bate com o extrato da maquininha, que é onde o
 * dono confere.
 *
 * A taxa individual já nasce ao centavo em `valoresDoPagamento`; era só a soma
 * que perdia a precisão de volta.
 */
export function taxasDePagamento(
  payments: Doc<PaymentDoc>[],
  periodo: Periodo
) {
  return centavos(
    payments
      .filter((p) => dentroDoPeriodo(p.date, periodo))
      .reduce((soma, p) => soma + (p.feeAmount ?? 0), 0)
  );
}

export type ResultadoDoMes = ReturnType<typeof resultadoDoMes>;

export function resultadoDoMes(params: {
  receita: ReceitaDoMes;
  expenses: Doc<ExpenseDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
  policies: TenantPolicies;
  /** Salário fixo, para quem não trabalha por comissão. Ainda sem tela. */
  payroll?: number;
  /**
   * Equipe e reservas do período — juntas, permitem ratear a comissão por quem
   * atendeu e cobrar a taxa de recebimento por meio. Ausentes, a comissão cai
   * no percentual único da barbearia, que é o comportamento correto para
   * operação solo.
   */
  staff?: Doc<StaffDoc>[];
  bookings?: Doc<BookingDoc>[];
  /** Congeladas na conclusão — vencem sobre a derivação quando existem. */
  commissions?: Doc<CommissionDoc>[];
  /** Soma de `taxasDePagamento` sobre os pagamentos congelados do período. */
  gatewayFeesTotal?: number;
}) {
  const { receita, expenses, movements, periodo, policies } = params;

  /* Custo fixo é o que está VIGENTE no período, não o que foi lançado nele.
   * O filtro por período fazia o aluguel marcado como recorrente em agosto
   * sumir do DRE de setembro: o mês seguinte nascia com custo fixo R$ 0,00 e
   * lucro inflado no valor da conta, até o dono relançar tudo na mão. */
  const fixedExpenses = despesasRecorrentesVigentes(expenses, periodo.fim).reduce(
    (s, e) => s + e.value,
    0
  );
  const variableOperatingExpenses = expenses
    .filter((e) => !e.recurring && dentroDoPeriodo(e.date, periodo))
    .reduce((s, e) => s + e.value, 0);

  /* CMV pelo custo do que foi VENDIDO — D3.
   *
   * Somava `kind === "compra"` do período. Num mês de reposição o lucro da loja
   * despencava sem nada ter piorado; num mês sem reposição a margem aparecia
   * perfeita. Pior: com D19 aberto **não havia compras a somar**, e o CMV era
   * zero estrutural — o dono pagava comissão sobre o custo da mercadoria.
   *
   * Só é possível porque G1 congelou `unitCost` na venda. Compra de estoque
   * deixa de ser custo do período e passa a ser saída de CAIXA, na 3.3. */
  const custoVendido = custoDoVendido({ movements, periodo });
  const cmv = custoVendido.total;

  /* Vem somado de `taxasDePagamento`, sobre os pagamentos CONGELADOS, e não
   * derivado das reservas com a taxa vigente hoje: mudar a taxa da maquininha
   * não pode reescrever o que já foi pago. Provado em produção — 1,99/3,49 →
   * 2,99/4,99 não alterou pagamento anterior nenhum. */
  const gatewayFees = params.gatewayFeesTotal ?? 0;

  /* Comissão do profissional.
   *
   * A base era só o lucro de revenda de produto — o serviço, que é o negócio
   * inteiro de uma barbearia, ficava de fora. Numa loja de 400 cortes a R$ 50,
   * a comissão real de 40% é R$ 8.000 no mês e o DRE mostrava R$ 0,00: o maior
   * custo variável da operação, invisível na tela que existe para decidir se
   * contrata ou demite barbeiro.
   *
   * Duas bases diferentes, de propósito — ver `commissionSplit`. Serviço paga
   * sobre o faturamento, rateado POR RESERVA e respeitando o percentual de cada
   * um; produto paga sobre o lucro, porque o custo de compra não é receita de
   * ninguém.
   *
   * Sem a lista de profissionais não há a quem ratear: cai no percentual da
   * barbearia aplicado ao total, que é o certo enquanto todos ganham igual. O
   * DRE perde só o detalhe por pessoa, não o custo. */
  const receitaDeServico = receita.servicos + receita.encaixes;
  const padraoPct = policies.commissionSplit.barberPct;

  const servico = params.staff
    ? comissoesDeServico({
        bookings: params.bookings ?? [],
        staff: params.staff,
        periodo,
        policies,
        commissions: params.commissions,
      })
    : {
        total: Math.round((receitaDeServico * padraoPct) / 100),
        porBarbeiro: [] as ComissaoDeBarbeiro[],
      };

  /* Comissão de produto a partir do FATO — P1-7.
   *
   * Era `lucroLoja × política de hoje`, recalculada a cada leitura: mudar o
   * split em outubro reescrevia o acerto de setembro. Agora cada venda carrega
   * a própria comissão, com o percentual do barbeiro congelado, e as linhas de
   * estorno (negativas) entram na mesma soma sem que a fórmula precise saber
   * que houve devolução.
   *
   * **Sem fallback**, e a ausência é deliberada: derivar aqui restauraria o
   * P1-7 na porta de saída. Venda anterior à Rodada 3.1 fica com zero, o que é
   * verdade — não havia comissão registrada.
   *
   * `lucroLoja` sumiu junto: ele existia só como base da comissão, e nenhuma
   * tela o consome. Mantê-lo "para o caso de" deixaria uma derivação viva ao
   * lado do fato, que é o convite para alguém voltar a usá-la. */
  const commissionsLoja = comissaoDeProduto({
    commissions: params.commissions ?? [],
    periodo,
  });
  const commissions = servico.total + commissionsLoja;

  /* Simples Nacional (Anexo III) incide sobre RECEITA BRUTA, e é devido mesmo
   * no mês em que a barbearia dá prejuízo. Cobrar a alíquota sobre o resultado
   * subestimava o imposto em cerca de 3× — R$ 360 em vez de R$ 1.200 num mês
   * de R$ 20.000 faturados — e o dono planejava com dinheiro que é do governo.
   *
   * Fica fora de `variableCost` para a escada do DRE continuar legível, e a
   * identidade `grossRevenue − totalCost === result` segue valendo. */
  /* Ao CENTAVO, não ao real — D1/D5. R$ 40,80 virava R$ 41,00, e o número
   * deixava de bater com a guia que o dono paga. Mesma correção da soma das
   * taxas de maquininha, e pela mesma razão: o erro é pequeno, sistemático e
   * some exatamente onde ele seria conferido. */
  const tax = centavos((receita.bruta * policies.taxRatePct) / 100);

  const variableCost = cmv + gatewayFees + commissions;
  const contributionMargin = receita.bruta - variableCost;
  const contributionMarginPct = safeDiv(contributionMargin, receita.bruta) * 100;

  const payroll = params.payroll ?? 0;
  const fixedCost = fixedExpenses + variableOperatingExpenses + payroll;

  const resultBeforeTax = contributionMargin - fixedCost;
  const result = resultBeforeTax - tax;

  const totalCost = variableCost + fixedCost + tax;
  const marginPct = safeDiv(result, receita.bruta) * 100;

  const diasNoMes = Number(periodo.fim.slice(-2));
  const breakEvenDay = breakEvenDayFor(receita.bruta, totalCost, diasNoMes);

  return {
    grossRevenue: receita.bruta,
    cmv,
    gatewayFees,
    commissions,
    /** Só a parte de serviço, aberta por pessoa — é o que a tela detalha. */
    commissionsServico: servico.total,
    commissionsLoja,
    comissaoPorBarbeiro: servico.porBarbeiro,
    variableCost,
    contributionMargin,
    contributionMarginPct,
    fixedExpenses,
    variableOperatingExpenses,
    payroll,
    fixedCost,
    resultBeforeTax,
    tax,
    result,
    totalCost,
    marginPct,
    breakEvenDay,
    diasNoMes,
  };
}

function breakEvenDayFor(receita: number, custo: number, diasNoMes: number) {
  if (receita <= 0) return null;
  const dia = Math.ceil(safeDiv(custo, receita / diasNoMes));
  return dia > 0 && dia <= diasNoMes ? dia : null;
}

/* ------------------------------------------------------------------ */
/* Indicadores operacionais                                            */
/* ------------------------------------------------------------------ */

export type Indicadores = {
  revenue: number;
  appointments: number;
  /** Valor médio do ATENDIMENTO — só serviço, que é o que a cadeira produz. */
  avgTicket: number;
  /** O mesmo atendimento, contando o que o cliente levou do balcão. */
  avgTicketComProduto: number;
  occupancyPct: number;
  noShowPct: number;
  noShowCount: number;
  lateCancelCount: number;
  totalBookings: number;
};

export function indicadores(params: {
  bookings: Doc<BookingDoc>[];
  receita: ReceitaDoMes;
  periodo: Periodo;
  /** Horários oferecidos no período — capacidade da jornada. */
  capacidade: number;
}): Indicadores {
  const doPeriodo = params.bookings.filter((b) => dentroDoPeriodo(b.date, params.periodo));
  const ocupados = doPeriodo.filter((b) => OCCUPIES_SLOT.includes(b.status));
  const noShow = doPeriodo.filter((b) => b.status === "no_show");
  const cancelados = doPeriodo.filter((b) => b.status === "cancelled_by_client");

  /* O ticket mede o ATENDIMENTO.
   *
   * Dividia `receita.bruta` — que inclui a venda de produto — pelo número de
   * atendimentos de serviço: o numerador de uma grandeza sobre o denominador de
   * outra. Numa massa de 8 atendimentos, dava R$ 85,00 onde o serviço médio é
   * R$ 48,75, 74% maior. É o número com que o dono decide preço.
   *
   * O valor com produto não some: ganha nome próprio, porque quem vende bem no
   * balcão precisa enxergar isso. São duas perguntas, e agora têm duas
   * respostas. */
  const receitaDeServico = params.receita.servicos + params.receita.encaixes;

  return {
    revenue: params.receita.bruta,
    appointments: params.receita.atendimentos,
    avgTicket: Math.round(safeDiv(receitaDeServico, params.receita.atendimentos)),
    avgTicketComProduto: Math.round(
      safeDiv(params.receita.bruta, params.receita.atendimentos)
    ),
    occupancyPct: Math.min(Math.round(safeDiv(ocupados.length, params.capacidade) * 100), 100),
    noShowPct: Math.round(safeDiv(noShow.length, doPeriodo.length) * 1000) / 10,
    noShowCount: noShow.length,
    lateCancelCount: cancelados.length,
    totalBookings: doPeriodo.length,
  };
}

/** Serviços mais vendidos no período. */
export function topServicos(params: {
  bookings: Doc<BookingDoc>[];
  nomePorId: Map<string, string>;
  periodo: Periodo;
  limite?: number;
}) {
  const acc = new Map<string, { name: string; count: number; revenue: number }>();

  for (const b of params.bookings) {
    if (!isRevenue(b) || !dentroDoPeriodo(b.date, params.periodo)) continue;
    // Combo de dois serviços rateia o valor entre eles.
    const fatia = safeDiv(b.value, b.serviceIds.length);
    for (const id of b.serviceIds) {
      const name = params.nomePorId.get(id) ?? id;
      const atual = acc.get(id) ?? { name, count: 0, revenue: 0 };
      atual.count += 1;
      atual.revenue += fatia;
      acc.set(id, atual);
    }
  }

  return [...acc.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, params.limite ?? 5)
    .map((s) => ({ ...s, revenue: Math.round(s.revenue) }));
}

/** Recorrência dos clientes — mais acionável que ranquear por gasto. */
export type StatusRecorrencia = "em_dia" | "esfriando" | "sumiu";

export function recorrenciaDeClientes(params: {
  bookings: Doc<BookingDoc>[];
  hoje: Date;
  limite?: number;
}) {
  const porCliente = new Map<string, { name: string; datas: string[]; spent: number }>();

  for (const b of params.bookings) {
    if (!isRevenue(b)) continue;
    const atual = porCliente.get(b.clientId) ?? { name: b.clientName, datas: [], spent: 0 };
    atual.datas.push(b.date);
    atual.spent += b.value;
    porCliente.set(b.clientId, atual);
  }

  const hojeMs = params.hoje.getTime();

  return [...porCliente.entries()]
    .map(([clientId, c]) => {
      const datas = [...c.datas].sort();
      const ultima = datas[datas.length - 1];
      const lastVisitDaysAgo = Math.floor(
        (hojeMs - new Date(`${ultima}T00:00:00`).getTime()) / 86_400_000
      );

      const intervalos: number[] = [];
      for (let i = 1; i < datas.length; i++) {
        intervalos.push(
          Math.round(
            (new Date(`${datas[i]}T00:00:00`).getTime() -
              new Date(`${datas[i - 1]}T00:00:00`).getTime()) /
              86_400_000
          )
        );
      }
      const avgIntervalDays = intervalos.length
        ? Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
        : 0;

      /* "Sumiu" é relativo ao hábito DELE: quem vem a cada 30 dias e sumiu há
       * 40 não é o mesmo caso de quem vem a cada 7. Sem histórico de intervalo,
       * cai num limite absoluto. */
      const limiteEsfriando = avgIntervalDays > 0 ? avgIntervalDays * 1.5 : 30;
      const limiteSumiu = avgIntervalDays > 0 ? avgIntervalDays * 3 : 60;
      const status: StatusRecorrencia =
        lastVisitDaysAgo >= limiteSumiu
          ? "sumiu"
          : lastVisitDaysAgo >= limiteEsfriando
            ? "esfriando"
            : "em_dia";

      return {
        clientId,
        name: c.name,
        visits: datas.length,
        spent: c.spent,
        lastVisitDaysAgo,
        avgIntervalDays,
        status,
      };
    })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, params.limite ?? 8);
}

/** Ocupação por dia da semana × hora — o mapa de calor. */
export function mapaDeCalor(params: {
  bookings: Doc<BookingDoc>[];
  periodo: Periodo;
  horarios: string[];
}) {
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const horas = params.horarios;

  const contagem = dias.map(() => horas.map(() => 0));
  const semanas = new Set<string>();

  for (const b of params.bookings) {
    if (!OCCUPIES_SLOT.includes(b.status) || !dentroDoPeriodo(b.date, params.periodo)) continue;
    const dow = new Date(`${b.date}T00:00:00`).getDay();
    if (dow === 0) continue; // domingo não entra na grade
    const i = dow - 1;
    const j = horas.indexOf(b.time);
    if (i < 0 || i >= dias.length || j < 0) continue;
    contagem[i][j] += 1;
    semanas.add(`${b.date.slice(0, 4)}-${semanaDoAno(b.date)}`);
  }

  const totalSemanas = Math.max(semanas.size, 1);
  const values = contagem.map((linha) =>
    linha.map((n) => Math.min(Math.round((n / totalSemanas) * 100), 100))
  );

  return { days: dias, hours: horas, values };
}

function semanaDoAno(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const inicio = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + inicio.getDay() + 1) / 7);
}

/* ------------------------------------------------------------------ */
/* Projeção de caixa                                                   */
/* ------------------------------------------------------------------ */

/**
 * Horizontes de projeção.
 *
 * Quanto mais longe, menos "previsão" e mais "modelo": ninguém marca corte
 * para daqui a seis meses, então além de ~60 dias praticamente todo dia é
 * estimativa em cima da média histórica por dia da semana. A tela precisa
 * DIZER isso — projeção anual apresentada com a mesma confiança da mensal é
 * número bonito que induz decisão errada.
 *
 * `dias` é a fonte única do horizonte: o mesmo valor alimenta o cálculo e o
 * rótulo. A legenda da tela dizia "acumulado nos 30 dias" cravado, com este
 * seletor de quatro opções logo acima — errada em três dos quatro casos, e o
 * erro crescia com o horizonte (P1-14).
 */
export const HORIZONTES = {
  mensal: { dias: 30, rotulo: "Mensal", porMes: false },
  trimestral: { dias: 91, rotulo: "Trimestral", porMes: true },
  semestral: { dias: 182, rotulo: "Semestral", porMes: true },
  anual: { dias: 365, rotulo: "Anual", porMes: true },
} as const;

export type Horizonte = keyof typeof HORIZONTES;

export type DiaProjetado = {
  date: string;
  isClosed: boolean;
  isEstimate: boolean;
  bookingRevenue: number;
  subscriptionCharge: number;
  fixedExpense: number;
  net: number;
  cumulative: number;
};

export function projecaoDeCaixa(params: {
  bookings: Doc<BookingDoc>[];
  expenses: Doc<ExpenseDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  historico: DiaDeCaixa[];
  openWeekdays: number[];
  inicio: Date;
  dias?: number;
}): DiaProjetado[] {
  const dias = params.dias ?? 30;

  // Média histórica por dia da semana — base para os dias sem marcação.
  const soma: Record<number, { total: number; n: number }> = {};
  for (const d of params.historico) {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    soma[dow] ??= { total: 0, n: 0 };
    soma[dow].total += d.total;
    soma[dow].n += 1;
  }
  const media = (dow: number) => (soma[dow] ? Math.round(soma[dow].total / soma[dow].n) : 0);

  const ativos = params.subscribers.filter((s) => s.status === "ativo");
  /* Um compromisso recorrente por conta, não um por lançamento.
   *
   * Era `expenses.filter(e => e.recurring)` sobre o histórico inteiro: depois
   * de seis meses de uso havia seis documentos "Aluguel", e a projeção cobrava
   * os seis no mesmo dia — R$ 12.000 num dia 5 que devia ser R$ 2.000. O erro
   * crescia a cada mês em que o produto era usado. */
  const recorrentes = despesasRecorrentesVigentes(
    params.expenses,
    toISODate(params.inicio)
  );

  const resultado: DiaProjetado[] = [];
  let cumulative = 0;

  for (let i = 0; i < dias; i++) {
    const d = new Date(params.inicio);
    d.setDate(params.inicio.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const dow = d.getDay();
    const isClosed = !params.openWeekdays.includes(dow);

    const confirmado = params.bookings
      .filter((b) => b.date === date && OCCUPIES_SLOT.includes(b.status))
      .reduce((s, b) => s + b.value, 0);

    const isEstimate = !isClosed && confirmado === 0;
    const bookingRevenue = isClosed ? 0 : confirmado || media(dow);

    /* Mensalidade é RECORRENTE, não um evento único.
     *
     * A regra antiga era `nextCharge === date`: casa uma vez e nunca mais. Em
     * 30 dias isso passa despercebido, porque a próxima cobrança de todo mundo
     * cai dentro da janela. Em 6 ou 12 meses vira erro grosseiro — cada
     * mensalista pagaria UMA vez no ano inteiro, e a projeção subestimaria a
     * receita recorrente em mais de 90%.
     *
     * Agora cobra todo mês no mesmo dia da próxima cobrança, e só a partir
     * dela: mensalista com cobrança dia 20 não gera receita no dia 20 de um mês
     * anterior ao contrato. Dia 31 em mês de 30 cai no último dia — é o que os
     * meios de pagamento fazem. */
    const diaDaCobranca = (iso: string) => Number(iso.slice(-2));
    const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const subscriptionCharge = ativos
      .filter((sub) => {
        if (!sub.nextCharge || sub.nextCharge > date) return false;
        const alvoDia = Math.min(diaDaCobranca(sub.nextCharge), ultimoDiaDoMes);
        return alvoDia === d.getDate();
      })
      .reduce((s, sub) => s + sub.price, 0);

    /* Mesma regra de dia da cobrança do mensalista, agora para a conta a pagar:
     * o dia do lançamento é o do vencimento, e o que cai no 31 vence no último
     * dia de um mês de 30 — antes nunca era cobrado nesses meses. */
    const fixedExpense = recorrentes
      .filter((e) => Math.min(Number(e.date.slice(-2)), ultimoDiaDoMes) === d.getDate())
      .reduce((s, e) => s + e.value, 0);

    const net = bookingRevenue + subscriptionCharge - fixedExpense;
    cumulative += net;

    resultado.push({
      date,
      isClosed,
      isEstimate,
      bookingRevenue,
      subscriptionCharge,
      fixedExpense,
      net,
      cumulative,
    });
  }

  return resultado;
}

/* ------------------------------------------------------------------ */
/* Loja                                                                */
/* ------------------------------------------------------------------ */

export function estoqueBaixo(products: Doc<ProductDoc>[]) {
  return products.filter((p) => p.stock < p.minStock);
}

/** Caixa do dia por meio de pagamento — a tela Hoje. */
export function caixaDoDia(bookings: Doc<BookingDoc>[]) {
  const recebidas = bookings.filter(isReceived);
  const soma = (metodos: PaymentMethod[]) =>
    recebidas
      .filter((b) => b.paymentMethod && metodos.includes(b.paymentMethod))
      .reduce((s, b) => s + b.value, 0);

  return {
    pix: soma(["pix"]),
    cartao: soma(["debit", "credit"]),
    dinheiro: soma(["cash"]),
    total: recebidas.reduce((s, b) => s + b.value, 0),
  };
}

/** Quantos horários a jornada oferece por dia. */
export function capacidadeDiaria(schedule: {
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
}) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const inicio = min(schedule.opensAt);
  const fim = min(schedule.closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0;

  let total = 0;
  for (let t = inicio; t + schedule.slotMinutes <= fim; t += schedule.slotMinutes) {
    const emIntervalo = schedule.breaks.some((b) => t >= min(b.from) && t < min(b.to));
    if (!emIntervalo) total += 1;
  }
  return total;
}

/** Horários da jornada, para o mapa de calor e a grade. */
export function horariosDaJornada(schedule: {
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
}) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (v: number) =>
    `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

  const inicio = min(schedule.opensAt);
  const fim = min(schedule.closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return [];

  const horarios: string[] = [];
  for (let t = inicio; t + schedule.slotMinutes <= fim; t += schedule.slotMinutes) {
    const emIntervalo = schedule.breaks.some((b) => t >= min(b.from) && t < min(b.to));
    if (!emIntervalo) horarios.push(fmt(t));
  }
  return horarios;
}

export { monthOf };

/** Uma linha de projeção agregada por mês. */
export type MesProjetado = {
  /** `AAAA-MM`. */
  mes: string;
  rotulo: string;
  bookingRevenue: number;
  subscriptionCharge: number;
  fixedExpense: number;
  net: number;
  cumulative: number;
  /** Quanto da receita do mês é estimativa, de 0 a 1. */
  fracaoEstimada: number;
};

/**
 * Agrupa a projeção diária por mês.
 *
 * 365 barras não são um gráfico, são ruído — e 365 linhas de tabela ninguém
 * lê. Além de uns dois meses, o que o dono decide é por mês: "dezembro fecha
 * no vermelho?", não "dia 14 de dezembro fecha no vermelho?".
 *
 * `fracaoEstimada` viaja junto de propósito. Ela é o que separa projeção de
 * chute com aparência de projeção: em janeiro pode ser 20%, em dezembro é
 * 100%, e a tela precisa mostrar essa diferença em vez de apresentar os dois
 * números com a mesma cara.
 */
export function agruparProjecaoPorMes(dias: DiaProjetado[]): MesProjetado[] {
  const porMes = new Map<string, MesProjetado>();

  for (const d of dias) {
    const mes = d.date.slice(0, 7);
    let m = porMes.get(mes);
    if (!m) {
      m = {
        mes,
        rotulo: new Date(`${mes}-01T12:00:00`).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        }),
        bookingRevenue: 0,
        subscriptionCharge: 0,
        fixedExpense: 0,
        net: 0,
        // O acumulado é o do ÚLTIMO dia do mês, não a soma dos acumulados
        // diários — somar acumulado é contar o mesmo dinheiro várias vezes.
        cumulative: 0,
        fracaoEstimada: 0,
      };
      porMes.set(mes, m);
    }
    m.bookingRevenue += d.bookingRevenue;
    m.subscriptionCharge += d.subscriptionCharge;
    m.fixedExpense += d.fixedExpense;
    m.net += d.net;
    m.cumulative = d.cumulative;
    if (d.isEstimate) m.fracaoEstimada += d.bookingRevenue;
  }

  for (const m of porMes.values()) {
    m.fracaoEstimada = m.bookingRevenue > 0 ? m.fracaoEstimada / m.bookingRevenue : 0;
  }
  return [...porMes.values()];
}
