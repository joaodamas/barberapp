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

/**
 * A comissão devolvida quando a venda é estornada — D23.
 *
 * ## Por que é um documento novo, e não um `delete`
 *
 * A mercadoria voltou para a prateleira: não houve venda, e comissão sobre lucro
 * de venda desfeita não é devida. O caminho óbvio seria apagar o documento
 * original — e é justamente o que a régua da rodada proíbe. Apagar deixa o
 * acerto do mês certo e o histórico mudo: ninguém consegue mais responder "por
 * que o Léo recebeu R$ 16,50 a menos do que a lista de vendas dele mostra".
 *
 * Somando, as duas linhas coexistem e o acerto fecha em zero sozinho:
 *
 * ```
 * comissao_venda_{mv}            +16,50
 * comissao_estorno_venda_{mv}_x  −16,50
 * ```
 *
 * ## Por que recalcula em vez de negar o valor original
 *
 * O estorno pode ser parcial. Negar `commissionAmount` devolveria a comissão
 * inteira por uma unidade de três. Recalcular com a quantidade devolvida, o
 * mesmo `unitPrice`/`unitCost` congelados e o **mesmo percentual do documento
 * original**, reverte exatamente a parte correspondente.
 *
 * O percentual vem do documento original de propósito: reler o cadastro do
 * barbeiro aqui recriaria o P1-7 na porta de saída — quem mudou de 50% para 30%
 * teria o estorno calculado a 30% sobre uma venda comissionada a 50%, e sobraria
 * saldo a pagar de uma venda que não existe.
 */
export function estornoDaComissao(params: {
  /** Movimento de venda ORIGINAL — o estorno aponta para ele, não para o ajuste. */
  movementId: string;
  /** Chave do estorno, para dois estornos parciais não colidirem. */
  chave: string;
  staffId: string;
  uid: string | null;
  staffName: string | null;
  unitPrice: number;
  unitCost: number;
  /** Quantas unidades voltaram. */
  quantidade: number;
  /** CONGELADO do documento original, nunca relido do cadastro. */
  commissionPct: number;
  /** Data do estorno. */
  date: string;
}): CommissionDoc {
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
    /* Base e valor NEGATIVOS. Somáveis com a linha original sem que nenhuma
     * leitura precise saber que houve estorno — mesmo princípio da taxa em
     * `refunds.ts`: o fato bem posto dispensa a fórmula especial. */
    commissionBase: -base,
    commissionAmount: -centavos((base * params.commissionPct) / 100),
  };
}

/** O id da comissão devolvida. Deriva da venda original E da chave do estorno. */
export function idDoEstornoDaComissao(movementId: string, chave: string): string {
  return `comissao_estorno_venda_${movementId}_${chave}`;
}

/**
 * A comissão devolvida quando a conclusão de um ATENDIMENTO é desfeita — P1-7.
 *
 * ## O mesmo defeito, na outra porta
 *
 * O cabeçalho deste arquivo diz que a comissão de serviço "é materializada
 * desde o Gate A, com percentual e base congelados", e que só a loja tinha o
 * P1-7. **Não era verdade, e o gate de 20/08 mediu:** `completed → no_show`
 * apagava `comissao_{bookingId}`, e a reconclusão o recriava lendo
 * `staff.commissionPct` de HOJE. Um atendimento de R$ 50,00 comissionado a 40%
 * (R$ 20,00) virou 60% (R$ 30,00) porque o cadastro mudou no intervalo — sem
 * tela, sem log, sem nada que o dono pudesse notar.
 *
 * Era o P1-7 entrando pela porta da frente, enquanto `refunds.ts` já o barrava
 * na de saída.
 *
 * ## Por que somar, e não apagar
 *
 * A regra é a mesma de `estornoDaComissao`, e a razão também: apagar deixa o
 * acerto do mês certo e o histórico mudo. Com as duas linhas, o ciclo inteiro
 * se lê:
 *
 * ```
 * comissao_{bk}                  +20,00   concluído a 40%
 * comissao_estorno_{bk}_{ev1}    −20,00   dono desfez a conclusão
 * comissao_{bk}_{ev2}            +20,00   "veio depois" — MESMOS 40%
 * ```
 *
 * O saldo é R$ 20,00, e é possível responder por que — que é justamente o que
 * o `delete` tornava impossível.
 *
 * ## Por que nega o valor original em vez de recalcular
 *
 * Aqui, ao contrário da venda, **não existe reversão parcial**: ou o
 * atendimento aconteceu, ou não aconteceu. Negar exatamente o que foi gravado
 * é o que garante que o par sempre feche em zero, inclusive para documentos
 * antigos gravados por versões anteriores desta função.
 */
export function estornoDaComissaoDeServico(params: {
  /** Reserva ORIGINAL — o estorno aponta para ela. */
  bookingId: string;
  /** Chave do evento que desfez a conclusão, para dois ciclos não colidirem. */
  chave: string;
  staffId: string;
  uid: string | null;
  staffName: string | null;
  date: string;
  /** CONGELADOS do documento vigente, nunca relidos do cadastro. */
  commissionPct: number;
  commissionBase: number;
  commissionAmount: number;
}): CommissionDoc {
  return {
    origin: "servico",
    bookingId: params.bookingId,
    staffId: params.staffId,
    uid: params.uid,
    staffName: params.staffName,
    date: params.date,
    commissionPct: params.commissionPct,
    commissionBase: -params.commissionBase,
    commissionAmount: -params.commissionAmount,
  };
}

/** O id da comissão de atendimento devolvida. Deriva da reserva E do evento. */
export function idDoEstornoDaComissaoDeServico(bookingId: string, chave: string): string {
  return `comissao_estorno_${bookingId}_${chave}`;
}

/**
 * O id da comissão de um atendimento RECONCLUÍDO.
 *
 * A primeira conclusão grava em `comissao_{bookingId}` — id derivado do fato,
 * como sempre. A reconclusão **não pode** reusar esse id: sobrescreveria a
 * linha original, que a linha de estorno já negou, e o saldo do barbeiro cairia
 * pela metade. Cada ciclo ganha o seu, derivado do evento que o abriu.
 */
export function idDaComissaoDeCicloNovo(bookingId: string, chave: string): string {
  return `comissao_${bookingId}_${chave}`;
}
