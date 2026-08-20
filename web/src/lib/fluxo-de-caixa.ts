import type { Doc } from "@/lib/db/repository";
import type {
  CashEntryDoc,
  ExpenseDoc,
  InventoryMovementDoc,
  PaymentDoc,
  RefundDoc,
} from "@/lib/domain";
import type { PaymentMethod } from "@/lib/types";
import { dentroDoPeriodo, type Periodo } from "@/lib/analytics-periodo";

/**
 * Fluxo de caixa — Rodada 3.2 · D8 / D11 / D4.
 *
 * ## O que existia
 *
 * `caixaDiario` somava `bookings.value` e `movements.value` e chamava isso de
 * fluxo de caixa. Três problemas de uma vez:
 *
 * 1. **Só tinha entradas.** Nenhuma saída — despesa, compra de estoque,
 *    devolução ou sangria. Um "fluxo" que só cresce é faturamento com outro
 *    nome, e era o D8/D11: não existia em lugar nenhum um número que
 *    respondesse *"quanto sobrou no caixa"*.
 * 2. **Toda venda entrava como dinheiro** (D4), mesmo com o meio de pagamento
 *    gravado no movimento desde G1.
 * 3. Lia o documento original em vez do pagamento congelado.
 *
 * ## Caixa não é resultado
 *
 * As duas visões respondem perguntas diferentes e **devem divergir**:
 *
 * ```
 * DRE     competência   o que o mês PRODUZIU
 * Fluxo   caixa         o que ENTROU e SAIU da conta
 * ```
 *
 * Comprar R$ 1.000 de estoque é saída de caixa e **não** é custo do período —
 * vira CMV quando a mercadoria for vendida. Uma despesa recorrente é custo de
 * todo mês em que vigora, e saída só no mês em que foi paga. Forçar os dois
 * números a coincidir é o erro que apaga a diferença entre lucro e dinheiro em
 * conta — a razão pela qual barbearia lucrativa quebra.
 *
 * ## Entra o LÍQUIDO, não o bruto
 *
 * A maquininha deposita o valor já descontado da taxa; o bruto nunca passa pela
 * conta. Somar o bruto e lançar a taxa como saída daria o mesmo saldo, mas
 * mostraria no caixa um dinheiro que não chegou — e o dono confere o Fluxo
 * contra o extrato.
 *
 * Em Pix e dinheiro líquido e bruto coincidem, então a diferença só aparece
 * onde ela é real.
 */

/**
 * De onde o dinheiro veio ou para onde foi.
 *
 * Cada movimento carrega a origem, e é isso que torna a **exclusividade
 * verificável**: o teste conta por origem e prova que o mesmo fato não aparece
 * em duas. Um total certo pode esconder dois erros que se cancelam.
 */
export type OrigemDeCaixa =
  | "servico"
  | "produto"
  | "mensalidade"
  | "estorno"
  | "despesa"
  | "compra"
  | "caixa";

export type MovimentoDeCaixa = {
  date: string;
  origem: OrigemDeCaixa;
  direcao: "entrada" | "saida";
  /** Sempre POSITIVO. A direção mora no campo, não no sinal. */
  valor: number;
  /** Por onde o dinheiro passou. Nulo quando o fato não guarda o meio. */
  metodo: PaymentMethod | null;
  descricao: string;
};

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * Quem paga a despesa, traduzido para o vocabulário de `PaymentMethod`.
 *
 * `ExpenseDoc.payment` é `"Pix" | "Boleto" | "Cartão" | "Transferência"` — um
 * vocabulário PARALELO ao do resto do produto, e só "Pix" tem correspondente
 * exato.
 *
 * "Cartão" fica `null` de propósito: não dá para saber se foi débito ou
 * crédito, e chutar um deles inventaria informação num campo que o dono usa
 * para conferir com o extrato. "Boleto" e "Transferência" não existem em
 * `PaymentMethod` e caem em "outros".
 *
 * Devolver `null` é mais honesto que forçar encaixe — e mantém visível que
 * `expenses` não tem o mesmo lastro das outras coleções. Normalizar o
 * vocabulário é dívida registrada em D24.
 */
function metodoDaDespesa(payment: ExpenseDoc["payment"] | undefined): PaymentMethod | null {
  return payment === "Pix" ? "pix" : null;
}

/**
 * Todo movimento de caixa do período, um por linha, com a origem explícita.
 *
 * A ordem das seções abaixo é a mesma da tabela em `MAPA-DE-FONTES.md`, e cada
 * uma itera sobre **um universo só**. Nenhuma soma duas coleções.
 */
export function movimentosDeCaixa(params: {
  payments: Doc<PaymentDoc>[];
  refunds: Doc<RefundDoc>[];
  expenses: Doc<ExpenseDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  cashEntries: Doc<CashEntryDoc>[];
  periodo: Periodo;
}): MovimentoDeCaixa[] {
  const out: MovimentoDeCaixa[] = [];

  /* ---- ENTRADAS: pagamentos, pelo LÍQUIDO ----
   *
   * As três origens vêm da MESMA coleção, e é por isso que não há risco de
   * dupla contagem entre elas: `payments` é o único lugar onde o dinheiro
   * recebido existe. Ler `bookings` ou `movements` aqui somaria o mesmo
   * recebimento outra vez. */
  for (const p of params.payments) {
    if (!dentroDoPeriodo(p.date, params.periodo)) continue;
    const origem = (p.origin ?? (p.bookingId ? "servico" : undefined)) as
      | OrigemDeCaixa
      | undefined;
    if (!origem) continue;

    out.push({
      date: p.date,
      origem,
      direcao: "entrada",
      valor: centavos(Number(p.netAmount ?? p.grossAmount) || 0),
      metodo: p.paymentMethod ?? null,
      descricao:
        origem === "servico"
          ? "Atendimento"
          : origem === "produto"
            ? "Venda de produto"
            : "Mensalidade",
    });
  }

  /* ---- SAÍDA: devolução ao cliente ----
   *
   * Sai pelo BRUTO: é o valor que volta para a mão do cliente. A taxa retida na
   * entrada não volta — ver `refunds.ts`. */
  for (const r of params.refunds) {
    if (!dentroDoPeriodo(r.date, params.periodo)) continue;
    out.push({
      date: r.date,
      origem: "estorno",
      direcao: "saida",
      valor: centavos(Number(r.grossAmount) || 0),
      metodo: r.paymentMethod ?? null,
      descricao: r.reason || "Devolução",
    });
  }

  /* ---- SAÍDA: despesa ----
   *
   * Pela data LANÇADA, e não pela vigência que o DRE usa. Uma recorrente é
   * custo de todo mês em que vigora e saída só no mês em que foi paga —
   * divergir do DRE aqui é correto, e é a diferença entre competência e caixa.
   *
   * `expenses` continua sem escrita de servidor, sem congelamento e sem
   * idempotência: é o D24, dívida consciente. O Fluxo a consome sem fingir que
   * ela tem as garantias das outras cinco coleções. */
  for (const e of params.expenses) {
    if (!dentroDoPeriodo(e.date, params.periodo)) continue;
    out.push({
      date: e.date,
      origem: "despesa",
      direcao: "saida",
      valor: centavos(Number(e.value) || 0),
      metodo: metodoDaDespesa(e.payment),
      descricao: e.description || e.category || "Despesa",
    });
  }

  /* ---- SAÍDA: compra de estoque ----
   *
   * Saída de caixa que **não é despesa nem CMV**. O dinheiro sai hoje; o custo
   * aparece no DRE quando a mercadoria for vendida. Contá-la como despesa
   * dobraria o custo do produto — uma vez na compra, outra no CMV.
   *
   * Só a compra: venda, ajuste e perda não movem dinheiro por aqui. A venda já
   * entrou pelo pagamento, e devolução já saiu pelo estorno. */
  for (const m of params.movements) {
    if (m.kind !== "compra" || !dentroDoPeriodo(m.date, params.periodo)) continue;
    out.push({
      date: m.date,
      origem: "compra",
      direcao: "saida",
      valor: centavos(Number(m.value) || 0),
      metodo: m.paymentMethod ?? null,
      descricao: "Compra de estoque",
    });
  }

  /* ---- OS DOIS LADOS: livro caixa ----
   *
   * Só o que não tem outro fato por trás — sangria, troco, aporte, pagamento de
   * comissão, ajuste. A exclusividade vem do enum fechado em `caixa.ts`: não
   * existe `kind` de venda ou despesa, então nada daqui pode repetir o que já
   * entrou acima. */
  for (const c of params.cashEntries) {
    if (!dentroDoPeriodo(c.date, params.periodo)) continue;
    const valor = Number(c.amount) || 0;
    out.push({
      date: c.date,
      origem: "caixa",
      direcao: valor >= 0 ? "entrada" : "saida",
      valor: centavos(Math.abs(valor)),
      metodo: c.paymentMethod ?? null,
      descricao: c.reason || "Movimento de caixa",
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export type ResumoDoFluxo = {
  entradas: number;
  saidas: number;
  /** `entradas − saidas`. É o que sobrou no caixa. */
  saldo: number;
  /** Quanto cada origem contribuiu, com sinal. Serve à prova de exclusividade. */
  porOrigem: Record<OrigemDeCaixa, number>;
  /** Por instrumento — só entradas, que é o que o dono concilia com o extrato. */
  porMetodo: { pix: number; cartao: number; dinheiro: number; outros: number };
};

const ORIGENS_ZERADAS: Record<OrigemDeCaixa, number> = {
  servico: 0,
  produto: 0,
  mensalidade: 0,
  estorno: 0,
  despesa: 0,
  compra: 0,
  caixa: 0,
};

export function resumoDoFluxo(movimentos: MovimentoDeCaixa[]): ResumoDoFluxo {
  const porOrigem = { ...ORIGENS_ZERADAS };
  const porMetodo = { pix: 0, cartao: 0, dinheiro: 0, outros: 0 };
  let entradas = 0;
  let saidas = 0;

  for (const m of movimentos) {
    const sinal = m.direcao === "entrada" ? 1 : -1;
    porOrigem[m.origem] += sinal * m.valor;

    if (m.direcao === "entrada") {
      entradas += m.valor;
      /* Débito e crédito somam em "cartão": o dono concilia com o extrato da
       * maquininha, que é uma fila só. A distinção por instrumento vive em
       * `payments`, onde a taxa de cada um está congelada. */
      if (m.metodo === "pix") porMetodo.pix += m.valor;
      else if (m.metodo === "debit" || m.metodo === "credit") porMetodo.cartao += m.valor;
      else if (m.metodo === "cash") porMetodo.dinheiro += m.valor;
      else porMetodo.outros += m.valor;
    } else {
      saidas += m.valor;
    }
  }

  const arred = <T extends Record<string, number>>(o: T): T =>
    Object.fromEntries(Object.entries(o).map(([k, v]) => [k, centavos(v)])) as T;

  return {
    entradas: centavos(entradas),
    saidas: centavos(saidas),
    saldo: centavos(entradas - saidas),
    porOrigem: arred(porOrigem),
    porMetodo: arred(porMetodo),
  };
}

export type DiaDoFluxo = {
  date: string;
  entradas: number;
  saidas: number;
  saldo: number;
  /** Saldo somado desde o início do período. */
  acumulado: number;
};

/**
 * O fluxo dia a dia, com o acumulado.
 *
 * O acumulado é o que responde *"em que dia o caixa virou"* — e um fluxo diário
 * sem ele obriga o dono a somar as colunas de cabeça.
 *
 * Dias sem movimento não viram linha: uma tabela com 31 linhas onde 20 são zero
 * esconde as 11 que importam.
 */
export function fluxoDiario(movimentos: MovimentoDeCaixa[]): DiaDoFluxo[] {
  const porDia = new Map<string, { entradas: number; saidas: number }>();

  for (const m of movimentos) {
    const d = porDia.get(m.date) ?? { entradas: 0, saidas: 0 };
    if (m.direcao === "entrada") d.entradas += m.valor;
    else d.saidas += m.valor;
    porDia.set(m.date, d);
  }

  let acumulado = 0;
  return [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, d]) => {
      const saldo = centavos(d.entradas - d.saidas);
      acumulado = centavos(acumulado + saldo);
      return {
        date,
        entradas: centavos(d.entradas),
        saidas: centavos(d.saidas),
        saldo,
        acumulado,
      };
    });
}
