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
  const d = detalheDoCustoDoVendido(params);
  return { total: d.total, semCustoCongelado: d.semCustoCongelado };
}

/**
 * Uma linha do detalhamento do CMV — o que a tela abre embaixo do cabeçalho.
 *
 * Os valores já vêm **em centavos fechados**: a soma assinada de
 * `custoVendido − custoDevolvido` de todas as linhas é exatamente `total`.
 * Fechar aqui, e não na tela, é o ponto inteiro deste tipo — ver
 * `detalheDoCustoDoVendido`.
 */
export type LinhaDoCmv = {
  productId: string;
  /** Custo consumido pelas vendas do período, ANTES da devolução. */
  custoVendido: number;
  /** Custo que voltou para a prateleira. Zero quando não houve devolução. */
  custoDevolvido: number;
  unidadesVendidas: number;
  unidadesDevolvidas: number;
  /**
   * Custo unitário congelado, quando é o MESMO em todas as vendas do período.
   *
   * `null` quando o produto saiu a custos diferentes — duas reposições com
   * preços diferentes na mesma prateleira é o caso normal, e é exatamente por
   * isso que o custo é congelado por movimento. A tela que anunciasse um
   * "× R$ X" único nesse caso estaria mostrando uma conta que não fecha.
   */
  custoUnitario: number | null;
  /** Vendas do produto sem `unitCost` congelado — anteriores a G1. */
  vendasSemCusto: number;
  /** Unidades vendidas que não entraram no custo, por falta do campo. */
  unidadesSemCusto: number;
};

export type DetalheDoCmv = {
  /** Uma por produto que teve venda ou devolução no período. */
  linhas: LinhaDoCmv[];
  /** O mesmo número que o cabeçalho publica — por construção, não por teste. */
  total: number;
  /** Vendas do período sem custo congelado, somadas. */
  semCustoCongelado: number;
  unidadesSemCusto: number;
};

/**
 * O CMV aberto por produto — a conta que o cabeçalho resume.
 *
 * ## Por que isto mora no motor, e não na tela
 *
 * O detalhamento vivia dentro do `page.tsx` do DRE, montado a partir de
 * `kind === "compra"`. Quando a Rodada 3.2 trocou a fonte do TOTAL para o
 * custo do vendido (D3), o filho ficou órfão e ninguém percebeu: na tela
 * apareceu cabeçalho de R$ 18,00 com um único filho de R$ 180,00 embaixo.
 *
 * Nenhum teste pegou — e não pegaria, porque a conta do filho era uma IIFE
 * dentro de um componente, inalcançável sem renderizar. O defeito não foi de
 * aritmética: foi de ARQUITETURA. Duas contas para o mesmo número, em módulos
 * diferentes, com só uma delas testável.
 *
 * Aqui há uma conta só. `custoDoVendido` delega para esta função, então o
 * cabeçalho e os filhos não podem divergir nem que alguém queira: são o mesmo
 * laço, no mesmo acumulador.
 *
 * ## Por que os valores já vêm fechados em centavos
 *
 * A tela arredondava cada filho por conta própria enquanto o motor arredondava
 * só o total. Com custo unitário que não cai em centavo redondo — uma caixa de
 * 12 pomadas por R$ 100,00 dá R$ 8,333… a unidade, que é o caso comum e não a
 * exceção — a soma dos filhos arredondados foge do cabeçalho por centavos. O
 * dono que conferisse na calculadora não fecharia, de novo.
 *
 * O resíduo é distribuído pelo maior resto, e não jogado no último filho: a
 * distorção fica no item de maior valor, onde um centavo é ruído, em vez de
 * cair sempre no mesmo azarado da lista.
 *
 * ## Por que a devolução é linha própria, e não desconto embutido
 *
 * Agregar a devolução dentro do produto faz "vendeu 3, devolveu 1" aparecer
 * como "2 un. vendidas": o fato de ter havido devolução SOME da tela, e o
 * número deixa de bater com a Loja, que mostra as 3 vendas. Some justamente o
 * fato que o dono precisa investigar.
 *
 * `composicaoDaReceita` já resolveu isso do jeito certo, na mesma tela e um
 * bloco acima: a devolução entra por último, com sinal, como dedução. Este é o
 * mesmo contrato — as entradas primeiro, o que saiu delas depois.
 *
 * ## Por que a venda sem custo vira linha visível
 *
 * Ela contribui R$ 0,00 para o total (ler `products.cost` reintroduziria o
 * defeito que o D3 existe para matar). Mas se ela apenas desaparecer do
 * detalhamento, o dono vê uma lista mais curta e um total menor sem nenhuma
 * explicação — e a leitura natural é que o sistema perdeu a venda. Os
 * contadores por produto deixam a lacuna dizível na tela, pelo mesmo motivo
 * que `LinhaDeReceita.semFatoMaterializado` existe.
 */
export function detalheDoCustoDoVendido(params: {
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
}): DetalheDoCmv {
  type Acc = {
    productId: string;
    custoVendido: number;
    custoDevolvido: number;
    unidadesVendidas: number;
    unidadesDevolvidas: number;
    custos: Set<number>;
    vendasSemCusto: number;
    unidadesSemCusto: number;
  };

  /* Acumulador único, na ordem dos movimentos. É literalmente o laço que o
   * cabeçalho usava — mantido idêntico para o total não mudar de valor ao
   * ganhar detalhamento. */
  let total = 0;
  let semCusto = 0;
  let unidadesSemCusto = 0;

  /* `Map` preserva a ordem de inserção: os produtos saem na ordem em que
   * apareceram no mês, e não numa ordem que muda a cada render. */
  const porProduto = new Map<string, Acc>();
  const linhaDe = (productId: string): Acc => {
    let a = porProduto.get(productId);
    if (!a) {
      a = {
        productId,
        custoVendido: 0,
        custoDevolvido: 0,
        unidadesVendidas: 0,
        unidadesDevolvidas: 0,
        custos: new Set<number>(),
        vendasSemCusto: 0,
        unidadesSemCusto: 0,
      };
      porProduto.set(productId, a);
    }
    return a;
  };

  for (const m of params.movements) {
    if (!dentroDoPeriodo(m.date, params.periodo)) continue;

    const custo = Number(m.unitCost);
    const qtd = Number(m.quantity) || 0;

    if (m.kind === "venda") {
      const linha = linhaDe(m.productId);
      /* Venda anterior a G1 não congelou custo. Somar zero é o correto — e o
       * contador expõe quantas, porque a alternativa (ler `products.cost`)
       * reintroduziria exatamente o defeito que este cálculo existe para
       * eliminar. */
      if (!Number.isFinite(custo)) {
        semCusto++;
        unidadesSemCusto += qtd;
        linha.vendasSemCusto++;
        linha.unidadesSemCusto += qtd;
        continue;
      }
      total += custo * qtd;
      linha.custoVendido += custo * qtd;
      linha.unidadesVendidas += qtd;
      linha.custos.add(custo);
    } else if (m.kind === "ajuste" && m.refundOf) {
      if (!Number.isFinite(custo)) continue;
      const linha = linhaDe(m.productId);
      total -= custo * qtd;
      linha.custoDevolvido += custo * qtd;
      linha.unidadesDevolvidas += qtd;
    }
  }

  const acumulado = [...porProduto.values()];

  /* Os valores que a tela vai SOMAR, em ordem, com o sinal com que aparecem.
   * Arredondar este vetor junto — e não cada linha isolada — é o que faz o
   * detalhamento fechar com o cabeçalho no centavo. */
  const exatos: number[] = [];
  for (const a of acumulado) {
    exatos.push(a.custoVendido);
    exatos.push(-a.custoDevolvido);
  }
  const fechados = emCentavosFechando(exatos, Math.round(total * 100));

  const linhas: LinhaDoCmv[] = acumulado.map((a, i) => ({
    productId: a.productId,
    custoVendido: fechados[i * 2],
    /* Volta a positivo: o sinal é da APRESENTAÇÃO, e guardá-lo no dado faria
     * cada consumidor ter de lembrar de qual lado ele está. */
    custoDevolvido: -fechados[i * 2 + 1] + 0,
    unidadesVendidas: a.unidadesVendidas,
    unidadesDevolvidas: a.unidadesDevolvidas,
    custoUnitario: a.custos.size === 1 ? [...a.custos][0] : null,
    vendasSemCusto: a.vendasSemCusto,
    unidadesSemCusto: a.unidadesSemCusto,
  }));

  return {
    linhas,
    /* `+ 0` mata o zero negativo, e ele é alcançável: um mês em que tudo foi
     * devolvido termina o acumulador um fio abaixo de zero por resíduo de
     * ponto flutuante, `Math.round` devolve `-0`, e o cabeçalho do CMV sai
     * como "−R$ 0,00" — um custo negativo, que não existe. Achado pelo teste
     * de cenário aleatório. */
    total: centavos(total) + 0,
    semCustoCongelado: semCusto,
    unidadesSemCusto,
  };
}

/**
 * Arredonda um vetor de valores para centavos **preservando a soma**.
 *
 * Maior resto (Hare): arredonda tudo para baixo e devolve os centavos que
 * sobraram a quem tinha a maior fração pendente. É a mesma regra que rateio de
 * assento em eleição usa, e existe aqui pelo motivo prático de que
 * `Σ round(xᵢ) ≠ round(Σ xᵢ)` — a desigualdade que fazia o detalhamento
 * divergir do cabeçalho por centavos.
 *
 * `alvoEmCentavos` é a soma já arredondada, calculada pelo MESMO acumulador que
 * publica o cabeçalho. Não é recomputada aqui de propósito: recomputar abriria
 * a porta para a divergência que a função existe para fechar.
 */
function emCentavosFechando(valores: number[], alvoEmCentavos: number): number[] {
  if (valores.length === 0) return [];

  const emCentavos = valores.map((v) => v * 100);
  const piso = emCentavos.map((v) => Math.floor(v));
  const soma = piso.reduce((s, v) => s + v, 0);

  const ordem = emCentavos
    .map((v, i) => ({ i, resto: v - piso[i] }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);

  /* Fechar a soma é INVARIANTE, não expectativa: os dois laços cobrem sobra
   * positiva e negativa e giram na lista, então `Σ resultado === alvo` vale
   * para qualquer entrada. A alternativa — assumir que a sobra cabe numa
   * passada — é o tipo de premissa que só falha em produção, num mês com
   * muitos produtos e custo quebrado. */
  let sobra = alvoEmCentavos - soma;
  for (let k = 0; sobra > 0; k++, sobra--) piso[ordem[k % ordem.length].i] += 1;
  for (let k = 0; sobra < 0; k++, sobra++) {
    piso[ordem[ordem.length - 1 - (k % ordem.length)].i] -= 1;
  }

  /* `+ 0` mata o zero negativo: `formatBRL(-0)` sai como "−R$ 0,00" e o dono
   * lê uma devolução que não existiu. */
  return piso.map((c) => c / 100 + 0);
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
