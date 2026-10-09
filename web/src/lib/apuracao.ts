/**
 * Falha de leitura não vira zero — D3/D4.
 *
 * ## O defeito que este módulo existe para impedir
 *
 * Com a coleção `expenses` ilegível, a tela "Quanto sobrou" exibiu, no mesmo
 * minuto em que a base legível dizia −R$ 769,61:
 *
 * ```
 * banner de erro no topo   "Não foi possível carregar o resultado do mês"
 * RESULTADO DO MÊS         + R$ 30,39
 * CUSTO FIXO TOTAL         R$ 0,00   "aluguel, contas e o que não varia…"
 * ```
 *
 * A diferença é exatamente R$ 800,00 — o aluguel que não pôde ser lido. O
 * banner é uma tarja; o número é o maior elemento da tela, e é ele que o dono
 * leva para a decisão. Pior: a legenda do custo fixo **nomeia o fato que não
 * foi lido** e afirma que ele vale zero.
 *
 * A causa não é aritmética. É que uma lista vazia por falha de leitura e uma
 * lista vazia por ausência de despesa produzem o mesmo `reduce(…, 0)`, e
 * nenhuma soma do produto sabia distinguir as duas. É o `ErroAoCarregar`
 * outra vez (`components/ui/erro-ao-carregar.tsx`), um nível abaixo: lá o
 * defeito era a tabela dizer "nenhuma despesa"; aqui é o KPI dizer "R$ 0,00".
 *
 * ## A regra, decidida pelo dono do produto
 *
 * ```
 * todas as fontes lidas   →  calcula e mostra o número
 * uma fonte obrigatória falhou   →  NÃO mostra número nenhum
 * ```
 *
 * E a segunda metade, que é a que dá valor à primeira: **o que não depende da
 * fonte quebrada continua sendo mostrado**. Apagar a tela inteira por causa de
 * uma coleção seria trocar um número falso por nenhuma informação — e a
 * receita do mês continua sendo verdade quando o que falhou foi a despesa.
 *
 * Por isso a unidade aqui é a GRANDEZA, não a tela: cada número declara de
 * quais coleções ele depende, e só ele some quando uma delas cai.
 *
 * ## Por que a declaração mora aqui, e não em cada tela
 *
 * "Receita realizada" aparece no DRE e no Financeiro; "resultado do mês", em
 * três lugares. Se cada tela declarasse as próprias dependências, elas
 * divergiriam — e a divergência apareceria como o mesmo número suprimido numa
 * tela e afirmado na outra, que é a forma mais confusa possível do defeito
 * original. Mesma razão de `composicaoDaReceita` viver no motor.
 *
 * ## Por que não há fallback
 *
 * Nenhuma função aqui devolve "um valor aproximado" nem "o último conhecido".
 * Um fallback silencioso é o defeito com outra roupa: continuaria existindo um
 * número na tela que ninguém pode conferir contra fato nenhum.
 */

/**
 * As coleções de que um número financeiro pode depender.
 *
 * São os nomes do Firestore de propósito — é assim que `use-financeiro.ts`
 * mapeia hook a hook, e um apelido no meio do caminho seria mais uma tabela
 * para divergir.
 */
export type FonteFinanceira =
  | "bookings"
  | "expenses"
  | "movements"
  | "payments"
  | "refunds"
  | "invoices"
  | "subscribers"
  | "staff"
  | "commissions"
  | "cashEntries";

/** O nome da coleção em linguagem de dono, para entrar numa frase. */
const NOME_DA_FONTE: Record<FonteFinanceira, string> = {
  bookings: "os atendimentos",
  expenses: "as despesas",
  movements: "a movimentação de estoque",
  payments: "os pagamentos",
  refunds: "as devoluções",
  invoices: "as faturas de mensalidade",
  subscribers: "os mensalistas",
  staff: "a equipe",
  commissions: "as comissões",
  cashEntries: "o livro caixa",
};

/* As três receitas que compõem a bruta. Nomeadas porque entram em quase toda
 * grandeza abaixo e repetir a lista é como duas delas divergiriam. */
const RECEITA: readonly FonteFinanceira[] = [
  "bookings",
  "movements",
  "invoices",
  "payments",
  "refunds",
];

/* Comissão sai do fato congelado quando existe e da reserva quando não —
 * `staff` entra porque o percentual é de cada profissional. */
const COMISSAO: readonly FonteFinanceira[] = ["bookings", "staff", "commissions"];

const CUSTO_VARIAVEL: readonly FonteFinanceira[] = [
  "movements", // CMV
  "payments", // taxa de maquininha
  ...COMISSAO,
];

/* Despesa recorrente e eventual saem de `expenses`; a folha fixa, de `staff`. */
const CUSTO_FIXO: readonly FonteFinanceira[] = ["expenses", "staff"];

const RESULTADO: readonly FonteFinanceira[] = [
  ...RECEITA,
  ...CUSTO_VARIAVEL,
  ...CUSTO_FIXO,
];

/* O caixa é o dinheiro que se moveu, e ele se move por seis portas. */
const CAIXA: readonly FonteFinanceira[] = [
  "payments",
  "refunds",
  "expenses",
  "movements",
  "cashEntries",
];

/**
 * De quais coleções cada número da tela depende.
 *
 * Uma linha por número que o dono lê. Acrescentar um KPI sem acrescentar a
 * linha correspondente é o jeito de o defeito voltar — e é por isso que a
 * chave é o nome do indicador, e não o da função que o calcula.
 */
export const FONTES_DA_GRANDEZA = {
  /* --- receita --- */
  receitaRealizada: RECEITA,
  composicaoDaReceita: RECEITA,
  imposto: RECEITA,
  faturamento: RECEITA,
  /** Mensalidade contratada é retrato do cadastro, não fato de caixa. */
  receitaContratada: ["subscribers"],

  /* --- custo --- */
  cmv: ["movements"],
  taxasDeGateway: ["payments"],
  comissoes: COMISSAO,
  custoVariavel: CUSTO_VARIAVEL,
  despesasFixas: ["expenses"],
  despesasEventuais: ["expenses"],
  despesasDoMes: ["expenses"],
  custoFixo: CUSTO_FIXO,
  custoTotal: RESULTADO,

  /* --- resultado --- */
  margemDeContribuicao: [...RECEITA, ...CUSTO_VARIAVEL],
  resultado: RESULTADO,
  margem: RESULTADO,
  pontoDeEquilibrio: RESULTADO,

  /* --- caixa --- */
  caixaDoMes: CAIXA,
  entradaDeCaixa: ["payments"],
  /** O bloco "Caixa de hoje" da tela Hoje sai só das reservas concluídas. */
  caixaDeHoje: ["bookings"],

  /* --- operação --- */
  atendimentos: ["bookings", "payments"],
  ticketMedio: ["bookings", "payments", "refunds"],
  ocupacao: ["bookings", "staff"],
  taxaDeFalta: ["bookings"],

  /* --- futuro --- */
  projecao: ["bookings", "expenses", "subscribers", "payments"],
  mensalistas: ["subscribers", "invoices"],
} as const satisfies Record<string, readonly FonteFinanceira[]>;

export type Grandeza = keyof typeof FONTES_DA_GRANDEZA;

/** O que a tela escreve no lugar do número. */
export const NAO_APURADO = "não apurado";

/**
 * Por que o número não pôde ser determinado, em linguagem de dono.
 *
 * Nomeia a COLEÇÃO que faltou, e não "um erro": o dono que lê "não foi
 * possível ler as despesas" sabe que o aluguel dele não entrou na conta. "Erro
 * ao calcular" não diz isso, e é a diferença entre ele desconfiar do número
 * certo e ele desconfiar do número errado.
 */
export function porQueNaoApurou(faltando: readonly FonteFinanceira[]): string {
  if (faltando.length === 0) return "";
  const nomes = faltando.map((f) => NOME_DA_FONTE[f]);
  /* "a e b", "a, b e c" — a conjunção final é `e`, nunca vírgula. Duas fontes
   * caídas é o caso comum (uma regra que muda costuma derrubar um par), e
   * "as despesas, os pagamentos" lê-se como lista truncada. */
  const lista =
    nomes.length === 1
      ? nomes[0]
      : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `não foi possível ler ${lista}`;
}

/**
 * A leitura da tela sobre o que pôde e o que não pôde ser apurado.
 *
 * Recebe as coleções ILEGÍVEIS — e não as legíveis — porque a lista de falha é
 * a curta e a que o hook conhece com certeza. Perguntar "quais deram certo"
 * obrigaria cada chamador a enumerar as dez, e a que alguém esquecesse
 * apareceria como número suprimido sem motivo.
 */
export function apuracaoDe(ilegiveis: Iterable<FonteFinanceira>) {
  const caidas = new Set(ilegiveis);

  const faltando = (g: Grandeza): FonteFinanceira[] =>
    caidas.size === 0 ? [] : FONTES_DA_GRANDEZA[g].filter((f) => caidas.has(f));

  const ok = (g: Grandeza) => faltando(g).length === 0;

  return {
    /** Se todas as fontes da grandeza puderam ser lidas. */
    ok,
    faltando,
    /** Quais coleções caíram, para a tela decidir o que mais suprimir. */
    caidas,
    /** O texto do número: o valor formatado, ou o marcador. */
    valor: (g: Grandeza, formatado: string) => (ok(g) ? formatado : NAO_APURADO),
    /**
     * A legenda: a original quando o número existe, o motivo quando não.
     *
     * Trocar a legenda é obrigatório, não cosmético — "aluguel, contas e o que
     * não varia com o movimento" embaixo de um custo fixo não apurado continua
     * afirmando que o aluguel foi considerado.
     */
    legenda: (g: Grandeza, original?: string) =>
      ok(g) ? original : porQueNaoApurou(faltando(g)),
    /**
     * O tom: o original quando o número existe, neutro quando não.
     *
     * Verde ou vermelho num número que não foi apurado afirma um sinal que
     * ninguém calculou — e verde é justamente o que o DRE mostrava sobre o
     * lucro falso de R$ 30,39.
     */
    tom: <T extends string>(g: Grandeza, original: T) =>
      ok(g) ? original : ("neutral" as const),
  };
}

export type Apuracao = ReturnType<typeof apuracaoDe>;
