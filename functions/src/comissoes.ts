/**
 * A comissão como fato — Rodada 3.1.
 *
 * ## O que faltava
 *
 * A comissão de **serviço** é materializada desde o Gate A, com percentual e
 * base congelados. A de **produto** não existe: `analytics.ts:511` a deriva a
 * cada leitura, com a política de HOJE.
 *
 * ```
 * lucroLoja        = max(receita.produtos − cmv, 0)
 * commissionsLoja  = round(lucroLoja × policies.commissionSplit.barberPct / 100)
 * ```
 *
 * Dois defeitos numa linha:
 *
 * 1. **Relê a política.** Mudar o split de 40% para 50% em outubro reescreve a
 *    comissão de produto de setembro — exatamente o que o congelamento da
 *    comissão de serviço resolveu e que nunca chegou à loja. É o P1-7.
 * 2. **É um agregado, não um fato.** Não existe "a comissão daquela venda":
 *    existe um número do mês inteiro, que ninguém consegue rastrear até uma
 *    linha. E como o CMV é agregado do período, uma venda de setembro pode ser
 *    debitada por uma compra de setembro que chegou depois dela.
 *
 * ## A base é o LUCRO, não o faturamento
 *
 * PRD §10: *"pomada com custo R$ 18 e venda R$ 45, rateio 40/60 → lucro bruto
 * R$ 27 → barbeiro recebe R$ 10,80"*.
 *
 * Com o CMV zerado por D19, `lucroLoja` era o faturamento inteiro e o dono
 * pagava comissão sobre o custo da mercadoria. Com o `unitCost` congelado na
 * venda, o lucro daquela linha é conhecido no ato — e a comissão deixa de
 * depender de qualquer agregado.
 */

export type OrigemDaComissao = "servico" | "produto";

export type CommissionDoc = {
  origin: OrigemDaComissao;
  staffId: string;
  /** Conta do barbeiro. A regra deixa ele ler só a própria comissão. */
  uid: string | null;
  staffName: string | null;
  date: string;
  /** Percentual CONGELADO. Mudar o split não reescreve o passado. */
  commissionPct: number;
  /** Sobre o que incidiu. Guardar só o resultado tornaria o passado indecifrável. */
  commissionBase: number;
  commissionAmount: number;
  bookingId?: string;
  movementId?: string;
};

/** Arredonda ao centavo — comissão de R$ 10,7999 não existe no acerto. */
function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * O lucro bruto de uma linha de venda.
 *
 * `max(…, 0)` porque produto vendido abaixo do custo — promoção, queima de
 * estoque — não pode gerar comissão negativa. O prejuízo é da barbearia, e
 * descontá-lo do barbeiro seria transformar decisão comercial do dono em
 * desconto no acerto de outra pessoa.
 */
export function lucroDaVenda(params: {
  unitPrice: number;
  unitCost: number;
  quantidade: number;
}): number {
  return centavos(Math.max(params.unitPrice - params.unitCost, 0) * params.quantidade);
}

/**
 * A comissão de uma venda de produto, congelada.
 *
 * `staffId` vazio devolve `null`: **sem beneficiário não há comissão**. Gravar
 * um documento sem dono deixaria um valor a pagar que nenhum acerto alcança, e
 * inventar um barbeiro seria pior.
 */
export function comissaoDaVenda(params: {
  movementId: string;
  staffId: string | null;
  uid: string | null;
  staffName: string | null;
  unitPrice: number;
  unitCost: number;
  quantidade: number;
  /** Do barbeiro, quando ele tem o próprio; senão o padrão da casa. */
  commissionPct: number;
  date: string;
}): CommissionDoc | null {
  if (!params.staffId) return null;

  const base = lucroDaVenda({
    unitPrice: params.unitPrice,
    unitCost: params.unitCost,
    quantidade: params.quantidade,
  });

  return {
    origin: "produto",
    movementId: params.movementId,
    staffId: params.staffId,
    uid: params.uid,
    staffName: params.staffName,
    date: params.date,
    commissionPct: params.commissionPct,
    commissionBase: base,
    commissionAmount: centavos((base * params.commissionPct) / 100),
  };
}

/** O id do documento, derivado do fato — mesma convenção de `payments`. */
export function idDaComissao(ref: { origem: OrigemDaComissao; refId: string }): string {
  return ref.origem === "servico"
    ? `comissao_${ref.refId}`
    : `comissao_venda_${ref.refId}`;
}
