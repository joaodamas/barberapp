import { taxaDoMetodo, type PaymentFees, type PaymentMethod, type PaymentOrigin } from "./financial-events";

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

export type OrigemDoPagamento = "servico" | "produto" | "mensalidade";

export type ReferenciaDoPagamento =
  | { origem: "servico"; bookingId: string }
  | { origem: "produto"; movementId: string }
  | { origem: "mensalidade"; invoiceId: string };

/** O id do documento, derivado do fato. */
export function idDoPagamento(ref: ReferenciaDoPagamento): string {
  if (ref.origem === "servico") return `pagamento_${ref.bookingId}`;
  if (ref.origem === "produto") return `pagamento_venda_${ref.movementId}`;
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
}) {
  const bruto = Number(params.bruto) || 0;
  const feePct = params.metodo ? taxaDoMetodo(params.metodo, params.fees) : 0;
  const feeAmount = Math.round(((bruto * feePct) / 100) * 100) / 100;

  return {
    paymentMethod: params.metodo,
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
  paymentOrigin?: PaymentOrigin;
}) {
  const referencia =
    params.ref.origem === "servico"
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
    ...valoresDoPagamento({ bruto: params.bruto, metodo: params.metodo, fees: params.fees }),
  };
}
