import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  CommissionDoc,
  InventoryMovementDoc,
  PaymentDoc,
  RefundDoc,
  SubscriptionInvoiceDoc,
} from "@/lib/domain";
import { isRevenue } from "@/lib/domain";
import { dentroDoPeriodo, type Periodo } from "@/lib/analytics-periodo";

/**
 * De onde cada linha financeira tira o número — Rodada 3.2.
 *
 * Isolado de `analytics.ts` de propósito: a decisão de FONTE é diferente da
 * decisão de FÓRMULA, e misturar as duas foi o que permitiu, por toda a Fase 3,
 * que um número certo saísse do lugar errado.
 *
 * ## O padrão, e por que não é uma soma de duas coleções
 *
 * ```
 * para cada FATO no universo:
 *     valor = materializado?.campo  ??  derivação_do_original
 * ```
 *
 * A forma ingênua seria `soma(payments) + soma(fatos sem payment)`. Duas fontes
 * somadas exigem que a exclusão entre elas esteja perfeita — e basta um
 * `PaymentDoc` órfão, um id renomeado ou uma migração parcial para o mesmo
 * atendimento entrar duas vezes. O erro é silencioso e sempre para cima, que é
 * a direção que ninguém questiona.
 *
 * Iterando sobre o fato, **cada um contribui exatamente uma vez por
 * construção** — mesma decisão da exclusividade de `cash_entries`, que vem de
 * um enum fechado e não de uma validação.
 *
 * O padrão não é novo: `comissoesDeServico` já o usava para não zerar o
 * histórico anterior ao gatilho de materialização.
 *
 * ## O estorno reduz, não apaga
 *
 * A receita realizada é `soma(fatos) − soma(refunds da mesma origem)`. O
 * pagamento original permanece inteiro. Gravar o estorno como pagamento
 * negativo obrigaria toda leitura de `payments` a aprender a filtrar — e a que
 * esquecesse contaria devolução como receita.
 */

export type LinhaDeReceita = {
  /** Soma dos fatos, com o valor congelado quando ele existe. */
  bruta: number;
  /** Quanto voltou para o cliente no período. */
  estornada: number;
  /** `bruta − estornada`. */
  liquida: number;
  /** Quantos fatos entraram. */
  quantidade: number;
  /**
   * Quantos caíram no fallback histórico.
   *
   * Existe para a migração ser VISÍVEL. Sem este número, a diferença entre "a
   * receita saiu dos pagamentos" e "a receita saiu do documento antigo" fica
   * indistinguível — e a reconciliação da 3.4 não teria como explicar uma
   * divergência.
   */
  semFatoMaterializado: number;
};

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * Indexa pagamentos pela referência do fato.
 *
 * Casa pelo campo (`bookingId` / `movementId` / `invoiceId`) e não pela
 * convenção de id: reimplementar `idDoPagamento` aqui faria uma mudança no
 * servidor quebrar isto em silêncio.
 *
 * `origin` ausente é tolerado. Pagamentos anteriores ao D29 não gravavam o
 * campo, e todos eles são de serviço — era a única origem que materializava
 * pagamento antes de G1.6. Exigir `origin` os descartaria, e a receita
 * histórica de serviço cairia para o fallback sem necessidade.
 */
function indexarPagamentos(
  payments: Doc<PaymentDoc>[],
  origem: NonNullable<PaymentDoc["origin"]>
): Map<string, Doc<PaymentDoc>> {
  const chave: Record<NonNullable<PaymentDoc["origin"]>, keyof PaymentDoc> = {
    servico: "bookingId",
    produto: "movementId",
    mensalidade: "invoiceId",
  };
  const campo = chave[origem];

  const mapa = new Map<string, Doc<PaymentDoc>>();
  for (const p of payments) {
    const declarada = p.origin ?? (p.bookingId ? "servico" : undefined);
    if (declarada !== origem) continue;
    const ref = p[campo];
    if (typeof ref === "string" && ref) mapa.set(ref, p);
  }
  return mapa;
}

/**
 * Quanto foi devolvido no período, por origem.
 *
 * Recortado pela data do ESTORNO (`date`), não pela do fato original: é a
 * competência em que a devolução aconteceu. `originalDate` fica no documento
 * para quem precisar do outro regime — a decisão de qual usar em cada visão é
 * da 3.3, e guardar as duas foi justamente para não ter de adivinhar agora.
 */
export function estornosDoPeriodo(
  refunds: Doc<RefundDoc>[],
  origem: RefundDoc["origin"],
  periodo: Periodo
): number {
  return centavos(
    refunds
      .filter((r) => r.origin === origem && dentroDoPeriodo(r.date, periodo))
      .reduce((s, r) => s + (Number(r.grossAmount) || 0), 0)
  );
}

/* ================================================================== */
/* Receita                                                            */
/* ================================================================== */

/**
 * Receita de SERVIÇO.
 *
 * Universo: atendimentos concluídos no período. O valor preferido é o
 * `grossAmount` do pagamento congelado; sem ele, `booking.value`.
 *
 * O fallback cobre os atendimentos anteriores ao gatilho de materialização.
 * Sem ele, o histórico inteiro apareceria zerado no dia em que a fonte mudasse
 * — e o dono concluiria que o sistema perdeu a receita dele.
 */
export function receitaDeServico(params: {
  bookings: Doc<BookingDoc>[];
  payments: Doc<PaymentDoc>[];
  refunds: Doc<RefundDoc>[];
  periodo: Periodo;
  /** `true` soma só encaixes, `false` só o resto, ausente soma tudo. */
  apenasEncaixes?: boolean;
}): LinhaDeReceita {
  const porBooking = indexarPagamentos(params.payments, "servico");

  const universo = params.bookings.filter(
    (b) =>
      isRevenue(b) &&
      dentroDoPeriodo(b.date, params.periodo) &&
      (params.apenasEncaixes === undefined || Boolean(b.isFitIn) === params.apenasEncaixes)
  );

  let bruta = 0;
  let semFato = 0;
  for (const b of universo) {
    const pago = porBooking.get(b.id);
    if (pago) bruta += Number(pago.grossAmount) || 0;
    else {
      bruta += Number(b.value) || 0;
      semFato++;
    }
  }

  /* O estorno de serviço não é repartido entre encaixe e não-encaixe: ele
   * aponta o `bookingId`, e dividir exigiria um join que a linha não precisa.
   * Só a chamada que soma TUDO desconta — as parciais devolvem bruto. */
  const estornada =
    params.apenasEncaixes === undefined
      ? estornosDoPeriodo(params.refunds, "servico", params.periodo)
      : 0;

  return {
    bruta: centavos(bruta),
    estornada,
    liquida: centavos(bruta - estornada),
    quantidade: universo.length,
    semFatoMaterializado: semFato,
  };
}

/**
 * Receita de PRODUTO.
 *
 * Universo: movimentos de venda. Ajustes de devolução (`kind: "ajuste"` com
 * `refundOf`) **não** entram aqui — quem reduz a receita é o `refund`, e contar
 * os dois subtrairia a mesma devolução duas vezes.
 */
export function receitaDeProduto(params: {
  movements: Doc<InventoryMovementDoc>[];
  payments: Doc<PaymentDoc>[];
  refunds: Doc<RefundDoc>[];
  periodo: Periodo;
}): LinhaDeReceita {
  const porMovimento = indexarPagamentos(params.payments, "produto");

  const universo = params.movements.filter(
    (m) => m.kind === "venda" && dentroDoPeriodo(m.date, params.periodo)
  );

  let bruta = 0;
  let semFato = 0;
  for (const m of universo) {
    const pago = porMovimento.get(m.id);
    if (pago) bruta += Number(pago.grossAmount) || 0;
    else {
      bruta += Number(m.value) || 0;
      semFato++;
    }
  }

  const estornada = estornosDoPeriodo(params.refunds, "produto", params.periodo);

  return {
    bruta: centavos(bruta),
    estornada,
    liquida: centavos(bruta - estornada),
    quantidade: universo.length,
    semFatoMaterializado: semFato,
  };
}

/**
 * Receita de MENSALIDADE — D20.
 *
 * Universo: faturas **pagas**. Não `subscriptions.status === "ativo"`, que é
 * contrato, não recebimento: um mensalista que parou de pagar seguia gerando
 * receita até alguém mudar o status à mão.
 *
 * **Contratado projeta; realizado fatura.**
 */
export function receitaDeMensalidade(params: {
  invoices: Doc<SubscriptionInvoiceDoc>[];
  payments: Doc<PaymentDoc>[];
  refunds: Doc<RefundDoc>[];
  periodo: Periodo;
}): LinhaDeReceita {
  const porFatura = indexarPagamentos(params.payments, "mensalidade");

  /* Recorte pela data do PAGAMENTO (`paidAt`), não pela competência da fatura:
   * a fatura de agosto paga em setembro é receita realizada de setembro. A
   * competência continua no documento para o MRR histórico. */
  const universo = params.invoices.filter(
    (f) => f.status === "paga" && f.paidAt && dentroDoPeriodo(f.paidAt, params.periodo)
  );

  let bruta = 0;
  let semFato = 0;
  for (const f of universo) {
    const pago = porFatura.get(f.id);
    if (pago) bruta += Number(pago.grossAmount) || 0;
    else {
      bruta += Number(f.amount) || 0;
      semFato++;
    }
  }

  const estornada = estornosDoPeriodo(params.refunds, "mensalidade", params.periodo);

  return {
    bruta: centavos(bruta),
    estornada,
    liquida: centavos(bruta - estornada),
    quantidade: universo.length,
    semFatoMaterializado: semFato,
  };
}

/* ================================================================== */
/* Custo da mercadoria vendida — D3                                   */
/* ================================================================== */

/**
 * CMV pelo custo do que foi VENDIDO — e não pelas compras do período.
 *
 * A fórmula antiga somava `kind === "compra"` do mês. Num mês de reposição o
 * lucro da loja despencava sem nada ter piorado, e num mês sem reposição a
 * margem aparecia perfeita. Pior: com D19 aberto **não havia compras a somar**,
 * e o CMV era zero estrutural — o dono pagava comissão sobre o custo da
 * mercadoria.
 *
 * Só é possível agora porque G1 congelou `unitCost` no movimento de venda. O
 * custo sai do fato, não de `products.cost`, que é o custo de HOJE — reler o
 * cadastro faria uma reposição mais cara reescrever o lucro de meses fechados.
 *
 * **Devoluções reduzem o CMV.** O `kind: "ajuste"` com `refundOf` devolve
 * mercadoria à prateleira: aquele custo não foi consumido. Subtrair aqui é o
 * espelho de subtrair a receita no estorno — se só a receita caísse, a margem
 * de um mês com devolução apareceria negativa sem motivo.
 */
export function custoDoVendido(params: {
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
}): { total: number; semCustoCongelado: number } {
  let total = 0;
  let semCusto = 0;

  for (const m of params.movements) {
    if (!dentroDoPeriodo(m.date, params.periodo)) continue;

    const custo = Number(m.unitCost);
    const qtd = Number(m.quantity) || 0;

    if (m.kind === "venda") {
      /* Venda anterior a G1 não congelou custo. Somar zero é o correto — e o
       * contador expõe quantas, porque a alternativa (ler `products.cost`)
       * reintroduziria exatamente o defeito que este cálculo existe para
       * eliminar. */
      if (!Number.isFinite(custo)) {
        semCusto++;
        continue;
      }
      total += custo * qtd;
    } else if (m.kind === "ajuste" && m.refundOf) {
      if (!Number.isFinite(custo)) continue;
      total -= custo * qtd;
    }
  }

  return { total: centavos(total), semCustoCongelado: semCusto };
}

/* ================================================================== */
/* Comissão de produto — P1-7                                         */
/* ================================================================== */

/**
 * Comissão de produto a partir dos fatos materializados.
 *
 * **Não tem fallback**, e a ausência é deliberada. Antes da Rodada 3.1 a
 * comissão de produto não existia como fato: era `lucroLoja × política de
 * hoje`, recalculado a cada leitura. Derivar aqui restauraria o P1-7 —
 * meses fechados voltariam a se reescrever quando o split mudasse.
 *
 * Venda antiga fica com comissão zero, o que é verdade: não havia comissão
 * registrada. Isso difere do serviço, cuja comissão congelada existe desde o
 * Gate A e onde o fallback cobre só o intervalo anterior ao gatilho.
 *
 * As linhas de estorno entram naturalmente: elas são `CommissionDoc` com valor
 * negativo, e a soma já as considera.
 */
export function comissaoDeProduto(params: {
  commissions: Doc<CommissionDoc>[];
  periodo: Periodo;
}): number {
  return centavos(
    params.commissions
      .filter((c) => c.origin === "produto" && dentroDoPeriodo(c.date, params.periodo))
      .reduce((s, c) => s + (Number(c.commissionAmount) || 0), 0)
  );
}
