import { centavos, taxaDoMetodo, type PaymentFees, type PaymentMethod, type PaymentOrigin } from "./financial-events";
import { taxaDoPagamento, type FormaDePagamento } from "./formas-de-pagamento";

/**
 * O pagamento como fato financeiro — G1.6.
 *
 * ## O que estava faltando
 *
 * `payments` era escrita **só** pela conclusão de atendimento. Venda de produto
 * e mensalidade paga registravam o `paymentMethod` no próprio fato — e não
 * geravam pagamento nenhum.
 *
 * Como `gatewayFeesTotal` soma `payments`, uma venda de R$ 145 no crédito e uma
 * mensalidade de R$ 149 no crédito **não debitavam taxa alguma** no DRE, com o
 * meio de pagamento gravado nos dois documentos. Era o D7, e a auditoria do
 * modelo localizou a causa como D21.
 *
 * ## A convenção de id, e por que ela importa
 *
 * ```
 * pagamento_{bookingId}          serviço
 * pagamento_venda_{movementId}   produto
 * pagamento_fatura_{invoiceId}   mensalidade
 * pagamento_caixinha_{bookingId} caixinha (gorjeta) do atendimento
 * ```
 *
 * Idempotência **por construção**, como em `materializeFinancialsOnCompletion`:
 * o id deriva do fato econômico, então reexecutar a operação sobrescreve em vez
 * de duplicar. E a origem fica legível no próprio id, sem precisar abrir o
 * documento.
 *
 * A referência também fica explícita no corpo (`bookingId` / `movementId` /
 * `invoiceId`), em vez de um `refId` genérico: uma abstração que esconde a
 * origem economiza um campo e cobra em toda consulta futura.
 *
 * ## O pagamento é consequência do FATO, não do botão
 *
 * Ele nasce dentro da mesma transação que grava a venda e dentro da mesma que
 * marca a fatura como paga. Não existe caminho em que o fato econômico exista
 * sem o pagamento correspondente — que é o que separa "registrar dinheiro" de
 * "registrar o clique".
 */

export type OrigemDoPagamento = "servico" | "produto" | "mensalidade" | "caixinha";

export type ReferenciaDoPagamento =
  | { origem: "servico"; bookingId: string }
  | { origem: "produto"; movementId: string }
  | { origem: "mensalidade"; invoiceId: string }
  | { origem: "caixinha"; bookingId: string };

/** O id do documento, derivado do fato. */
export function idDoPagamento(ref: ReferenciaDoPagamento): string {
  if (ref.origem === "servico") return `pagamento_${ref.bookingId}`;
  if (ref.origem === "produto") return `pagamento_venda_${ref.movementId}`;
  if (ref.origem === "caixinha") return `pagamento_caixinha_${ref.bookingId}`;
  return `pagamento_fatura_${ref.invoiceId}`;
}

/**
 * A parte econômica do pagamento, com a taxa CONGELADA.
 *
 * Pura de propósito: o resultado depende só dos argumentos, então o documento
 * gravado é reprodutível a partir dos próprios campos. É o que torna o
 * histórico auditável e o que impede que mudar a taxa da maquininha reescreva
 * o que já foi recebido.
 *
 * Sem método, a taxa é **desconhecida**, não zero. Materializa assim mesmo com
 * `paymentMethod: null` explícito: o bruto aconteceu e precisa existir no
 * histórico, e o nulo é o que permite separar depois "não teve taxa" de "não
 * sabemos a taxa".
 */
export function valoresDoPagamento(params: {
  bruto: number;
  metodo: PaymentMethod | null;
  fees: PaymentFees;
  /**
   * As formas cadastradas pela barbearia, quando o chamador as tem.
   *
   * Ausentes, a taxa vem das quatro chaves de sempre — o caminho de todo teste
   * e de todo chamador anterior às formas. Presentes, mandam: é nelas que mora
   * a diferença entre a taxa da aproximação e a do cartão inserido.
   */
  formas?: FormaDePagamento[];
  /** Qual delas o dono escolheu no fechamento. */
  formaId?: string | null;
}) {
  const bruto = Number(params.bruto) || 0;

  const resolvida = params.formas?.length
    ? taxaDoPagamento({ formaId: params.formaId, meio: params.metodo, formas: params.formas })
    : { feePct: params.metodo ? taxaDoMetodo(params.metodo, params.fees) : 0, forma: null };

  const feePct = params.metodo ? resolvida.feePct : 0;
  const feeAmount = Math.round(((bruto * feePct) / 100) * 100) / 100;

  return {
    paymentMethod: params.metodo,
    /* O id E o rótulo, congelados juntos.
     *
     * Só o id não basta: o dono pode renomear a forma, desativá-la ou apagá-la,
     * e o extrato de três meses atrás passaria a exibir um código ou um vazio.
     * Congelar o rótulo é a mesma regra que já vale para `feePct` — o documento
     * tem de ser legível a partir dos próprios campos. */
    paymentFormId: params.metodo ? (resolvida.forma?.id ?? null) : null,
    paymentFormLabel: params.metodo ? (resolvida.forma?.label ?? null) : null,
    grossAmount: bruto,
    feePct,
    feeAmount,
    netAmount: Math.round((bruto - feeAmount) * 100) / 100,
  };
}

/**
 * O documento completo, pronto para gravar.
 *
 * `paymentOrigin` ("onde o pagamento aconteceu") continua existindo e é
 * diferente de `origin` ("de que fato ele veio"). Venda e mensalidade são
 * sempre `in_person` enquanto não houver caminho online — o produto recusa
 * pagamento antecipado na porta de entrada.
 */
export function documentoDePagamento(params: {
  ref: ReferenciaDoPagamento;
  clientId: string | null;
  date: string;
  bruto: number;
  metodo: PaymentMethod | null;
  fees: PaymentFees;
  formas?: FormaDePagamento[];
  formaId?: string | null;
  paymentOrigin?: PaymentOrigin;
}) {
  const referencia =
    params.ref.origem === "servico" || params.ref.origem === "caixinha"
      ? { bookingId: params.ref.bookingId }
      : params.ref.origem === "produto"
        ? { movementId: params.ref.movementId }
        : { invoiceId: params.ref.invoiceId };

  return {
    origin: params.ref.origem satisfies OrigemDoPagamento,
    ...referencia,
    clientId: params.clientId,
    date: params.date,
    paymentOrigin: params.paymentOrigin ?? "in_person",
    ...valoresDoPagamento({
      bruto: params.bruto,
      metodo: params.metodo,
      fees: params.fees,
      formas: params.formas,
      formaId: params.formaId,
    }),
  };
}

/**
 * A caixinha (gorjeta) de um atendimento, com a taxa CONGELADA — pedido do dono.
 *
 * ## As três regras do dono, em uma conta
 *
 * 1. 100% do barbeiro que atendeu: `commissionPct: 100`, sobre a caixinha bruta.
 * 2. A taxa da maquininha é DO BARBEIRO: R$ 10,00 no crédito a 3% rendem R$ 9,70
 *    a ele. A casa não absorve taxa de um dinheiro que não é dela.
 * 3. Mesma forma de pagamento do atendimento: não há seletor próprio, então a
 *    taxa congelada é a da forma já escolhida no fechamento.
 *
 * ## Por que são DOIS documentos e nenhum deles é receita
 *
 * O `payment` é o dinheiro que ENTROU (caixa, recebido por forma, fechamento
 * das 21h) e a `commission` é o que a casa DEVE ao barbeiro. Os dois nascem
 * juntos e os dois carregam `origin: "caixinha"`, que é o que as leituras de
 * receita, DRE e ticket usam para ignorá-los: é repasse que passa pela casa.
 * Quando o barbeiro é pago, a saída (`pagamento_comissao`) fecha o par em zero.
 *
 * Pura de propósito, como `calcularEventoFinanceiro`. Sem forma de pagamento
 * (`metodo` nulo) não há caixinha: a taxa seria desconhecida, e a regra do dono
 * é que ela só existe quando a forma foi escolhida. Devolve `null` nesse caso e
 * também para valor ausente, zero ou negativo.
 */
export function calcularCaixinha(params: {
  /** O `tipAmount` da reserva, em reais. Qualquer coisa que não seja > 0 vale "sem caixinha". */
  caixinha: unknown;
  metodo: PaymentMethod | null;
  origem?: PaymentOrigin | null;
  fees: PaymentFees;
  formas?: FormaDePagamento[];
  formaId?: string | null;
}) {
  const bruta = centavos(Number(params.caixinha));
  if (!Number.isFinite(bruta) || !(bruta > 0) || !params.metodo) return null;

  const payment = valoresDoPagamento({
    bruto: bruta,
    metodo: params.metodo,
    fees: params.fees,
    formas: params.formas,
    formaId: params.formaId,
  });

  return {
    caixinha: bruta,
    payment: { paymentOrigin: params.origem ?? ("in_person" as PaymentOrigin), ...payment },
    commission: {
      commissionPct: 100,
      commissionBase: bruta,
      feeAmount: payment.feeAmount,
      commissionAmount: payment.netAmount,
    },
  };
}

/** O id da comissão da caixinha: o da comissão do CICLO do atendimento + `_caixinha`. */
export function idDaComissaoDaCaixinha(idDaComissaoDoCiclo: string): string {
  return `${idDaComissaoDoCiclo}_caixinha`;
}

/** O id do estorno da caixinha. Deriva da reserva E do evento, como o do serviço. */
export function idDoEstornoDaCaixinha(bookingId: string, chave: string): string {
  return `comissao_estorno_caixinha_${bookingId}_${chave}`;
}

/** O id da linha de AJUSTE da caixinha quando o meio é corrigido. Deriva da correção. */
export function idDoAjusteDaCaixinha(bookingId: string, chave: string): string {
  return `comissao_ajuste_caixinha_${bookingId}_${chave}`;
}

/**
 * O saldo LÍQUIDO das linhas de caixinha de uma reserva — original, ajustes de
 * correção do meio e estornos de ciclos anteriores, tudo somado.
 *
 * É o que a reversão nega: negar só a linha original deixaria um ajuste
 * (−R$ 0,30 da taxa corrigida) sozinho no saldo do barbeiro, e negar pelo id do
 * ciclo falharia depois de uma edição de cobrança, que troca a comissão vigente
 * do serviço sem tocar na gorjeta. Nulo quando não há o que negar.
 */
export function somarLinhasDaCaixinha(
  linhas: { staffId?: unknown; uid?: unknown; staffName?: unknown; commissionBase?: unknown; commissionAmount?: unknown; feeAmount?: unknown }[]
) {
  if (linhas.length === 0) return null;
  const soma = (campo: "commissionBase" | "commissionAmount" | "feeAmount") =>
    centavos(linhas.reduce((t, l) => t + (Number(l[campo]) || 0), 0));
  const commissionBase = soma("commissionBase");
  const commissionAmount = soma("commissionAmount");
  const feeAmount = soma("feeAmount");
  if (commissionBase === 0 && commissionAmount === 0 && feeAmount === 0) return null;
  const dono = linhas.find((l) => l.staffId) ?? linhas[0];
  return {
    staffId: String(dono.staffId ?? ""),
    uid: (dono.uid ?? null) as string | null,
    staffName: (dono.staffName ?? null) as string | null,
    commissionBase,
    commissionAmount,
    feeAmount,
  };
}

/** A linha que NEGA o saldo de caixinha da reserva (reversão da conclusão). */
export function estornoDaCaixinha(params: {
  bookingId: string;
  staffId: string;
  uid: string | null;
  staffName: string | null;
  date: string;
  commissionBase: number;
  commissionAmount: number;
  feeAmount: number;
}) {
  return {
    origin: "caixinha" as const,
    bookingId: params.bookingId,
    staffId: params.staffId,
    uid: params.uid,
    staffName: params.staffName,
    date: params.date,
    commissionPct: 100,
    commissionBase: -params.commissionBase,
    feeAmount: -params.feeAmount,
    commissionAmount: -params.commissionAmount,
  };
}
