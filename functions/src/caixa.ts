import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import type { PaymentMethod } from "./financial-events";

/**
 * O livro caixa — Rodada 3.1 · D25.
 *
 * ## A regra que define esta coleção
 *
 * > `cash_entries` só existe quando há movimento de caixa que **não possui
 * > outro fato econômico que o represente**.
 *
 * Atendimento, venda e mensalidade já têm `PaymentDoc`. Compra de estoque já
 * tem `InventoryMovementDoc`. Despesa tem `ExpenseDoc`. Nenhum deles pode
 * gerar um lançamento aqui — se gerasse, o Fluxo de Caixa somaria o mesmo
 * dinheiro duas vezes, que é exatamente a duplicidade que a Rodada 3.1 acabou
 * de eliminar da receita.
 *
 * O que sobra são os movimentos que **não derivam de nada**: sangria, troco
 * inicial, aporte do dono, pagamento de comissão ao barbeiro e ajuste de
 * contagem. Nenhum é atendimento, venda, mensalidade, compra ou despesa; e
 * nenhum é reconstruível a partir de outro documento.
 *
 * ## Exclusividade POR CONSTRUÇÃO, não por validação
 *
 * `TipoDeCaixa` é um enum fechado que **não contém** "venda", "atendimento",
 * "mensalidade", "compra" nem "despesa". Não existe caminho para escrever um
 * lançamento de venda aqui, porque o tipo não existe — do mesmo jeito que a
 * idempotência dos pagamentos vem do id derivado do fato, e não de uma
 * checagem que poderia ter corrida.
 *
 * Uma validação que compara strings pode ser contornada por um `kind` novo
 * acrescentado sem pensar. Um enum fechado obriga a decisão a passar por aqui.
 *
 * ## Comissão devida não é comissão paga
 *
 * `CommissionDoc` registra o que a barbearia DEVE ao barbeiro no fechamento —
 * é competência. O dinheiro sair da gaveta é outro momento, e é ele que este
 * arquivo registra. Os dois precisam existir: sem o primeiro não há acerto;
 * sem o segundo o caixa mostra dinheiro que já foi embora.
 *
 * Isto **não** viola a exclusividade: a comissão não é movimento de caixa, é
 * uma obrigação. O pagamento dela não tem outro fato.
 */

/**
 * Os movimentos de caixa que não têm fato próprio.
 *
 * Fechado de propósito — ver "Exclusividade por construção" acima.
 */
export type TipoDeCaixa =
  | "sangria"
  | "troco_inicial"
  | "aporte"
  | "pagamento_comissao"
  | "ajuste";

export const TIPOS_DE_CAIXA: TipoDeCaixa[] = [
  "sangria",
  "troco_inicial",
  "aporte",
  "pagamento_comissao",
  "ajuste",
];

/**
 * Origens que JÁ TÊM fato financeiro próprio.
 *
 * Existe para o teste poder afirmar a exclusividade sobre uma lista escrita em
 * vez de sobre a ausência de algo: provar que `TIPOS_DE_CAIXA` não intersecta
 * esta lista é verificável; "não tem venda" não é.
 */
export const ORIGENS_COM_FATO_PROPRIO = [
  "atendimento",
  "servico",
  "venda",
  "produto",
  "mensalidade",
  "compra",
  "despesa",
] as const;

export type DirecaoDeCaixa = "entrada" | "saida";

export type CashEntryDoc = {
  kind: TipoDeCaixa;
  direction: DirecaoDeCaixa;
  /**
   * ASSINADO: positivo entra, negativo sai.
   *
   * Somar a coleção dá o saldo sem que nenhuma leitura precise conhecer a
   * tabela de tipos — mesmo princípio da comissão negativa no estorno e da
   * taxa que emerge da soma do par. Uma fórmula que precisa de um `switch`
   * sobre `kind` para descobrir o sinal é uma fórmula que vai errar no dia em
   * que alguém acrescentar um tipo.
   *
   * O dono nunca digita sinal: a tela escolhe o TIPO e o servidor deriva a
   * direção. `direction` fica gravado junto porque é o vocabulário da tela, e
   * reconstruí-lo do sinal na leitura seria reimplementar a decisão.
   */
  amount: number;
  date: string;
  /** Por que existe. Sem isto o lançamento diz quanto e não o quê. */
  reason: string;
  /** Como o dinheiro se moveu. Sangria é espécie; aporte pode ser Pix. */
  paymentMethod: PaymentMethod;
  /** Beneficiário, no pagamento de comissão. Nulo nos outros tipos. */
  staffId: string | null;
};

/**
 * A direção que o tipo IMPÕE.
 *
 * `null` para `ajuste`, o único que serve aos dois lados: recontagem pode achar
 * sobra ou falta. Nos outros, deixar a direção aberta permitiria gravar uma
 * sangria que ENTRA dinheiro — um erro de digitação viraria caixa inventado, e
 * o Fluxo de Caixa não teria como saber.
 */
export function direcaoDoTipo(kind: TipoDeCaixa): DirecaoDeCaixa | null {
  if (kind === "sangria" || kind === "pagamento_comissao") return "saida";
  if (kind === "troco_inicial" || kind === "aporte") return "entrada";
  return null;
}

export function tipoValido(kind: unknown): kind is TipoDeCaixa {
  return TIPOS_DE_CAIXA.includes(kind as TipoDeCaixa);
}

/**
 * O valor pedido é utilizável?
 *
 * `typeof` antes de qualquer coisa, pelo mesmo motivo de `quantidadeValida`:
 * `Number("3e4")` é 30000, e aqui sai dinheiro do caixa. Zero e negativo são
 * recusados porque o sinal vem do tipo, nunca digitado.
 */
export function valorDeCaixaValido(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}

export function motivoDeCaixaValido(motivo: unknown): motivo is string {
  return typeof motivo === "string" && motivo.trim().length >= 3;
}

/** O id do documento. Deriva da chave: reexecutar não lança duas vezes. */
export function idDoLancamento(chave: string): string {
  return `caixa_${chave}`;
}

/** O documento pronto para gravar, com o sinal já resolvido pelo tipo. */
export function documentoDeCaixa(params: {
  kind: TipoDeCaixa;
  /** Sempre POSITIVO. O sinal sai do tipo. */
  valor: number;
  /** Obrigatória só quando o tipo não a impõe (`ajuste`). */
  direcao?: DirecaoDeCaixa;
  date: string;
  reason: string;
  paymentMethod: PaymentMethod;
  staffId?: string | null;
}): CashEntryDoc {
  const imposta = direcaoDoTipo(params.kind);
  const direction = imposta ?? params.direcao;
  if (!direction) {
    throw new HttpsError("invalid-argument", "Diga se o dinheiro entrou ou saiu.");
  }

  const bruto = Math.round(Math.abs(params.valor) * 100) / 100;

  return {
    kind: params.kind,
    direction,
    amount: direction === "saida" ? -bruto : bruto,
    date: params.date,
    reason: params.reason.trim(),
    paymentMethod: params.paymentMethod,
    /* Só o pagamento de comissão tem beneficiário. Guardar `staffId` numa
     * sangria sugeriria que aquele dinheiro é dele. */
    staffId: params.kind === "pagamento_comissao" ? (params.staffId ?? null) : null,
  };
}

/** O saldo de um conjunto de lançamentos. Soma direta — o sinal já está no fato. */
export function saldoDeCaixa(entradas: Array<Pick<CashEntryDoc, "amount">>): number {
  return Math.round(entradas.reduce((s, e) => s + (Number(e.amount) || 0), 0) * 100) / 100;
}

/* ================================================================== */
/* O lançamento, dentro da transação                                  */
/* ================================================================== */

export type ResultadoDoLancamento = {
  entryId: string;
  amount: number;
  direction: DirecaoDeCaixa;
  repetida: boolean;
};

/**
 * Grava o lançamento, uma vez só.
 *
 * Separada do `onCall` pelo mesmo motivo de `gravarVendaComTravaDeEstoque` e
 * `gravarEstorno`: dentro do wrapper a idempotência só se exerceria com
 * autenticação e emulador de Functions, e **a garantia de que dois toques no
 * botão não tiram R$ 400 do caixa nunca seria testada**.
 */
export async function gravarLancamentoDeCaixa(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  documento: CashEntryDoc;
  chave: string;
  extras?: Record<string, unknown>;
}): Promise<ResultadoDoLancamento> {
  const ref = params.shopRef.collection("cash_entries").doc(idDoLancamento(params.chave));

  return params.db.runTransaction(async (tx) => {
    const jaExiste = await tx.get(ref);

    /* Idempotência: a mesma chave não lança duas vezes. Devolve o que está
     * gravado, sem reescrever — um retry precisa ser indistinguível de sucesso,
     * senão a tela mostra erro sobre uma sangria que deu certo e o dono lança
     * de novo. E NÃO sobrescreve: valor congelado significa que nem a repetição
     * da própria operação pode alterá-lo. */
    if (jaExiste.exists) {
      return {
        entryId: ref.id,
        amount: Number(jaExiste.get("amount")) || 0,
        direction: jaExiste.get("direction") as DirecaoDeCaixa,
        repetida: true,
      };
    }

    /* `create` e não `set`: se dois lançamentos com a mesma chave chegarem
     * concorrentes, o segundo falha em vez de sobrescrever em silêncio. A
     * transação já serializa, e o `create` é a segunda camada — a mesma
     * decisão da emissão de faturas em G2. */
    tx.create(ref, { ...params.documento, ...(params.extras ?? {}) });

    return {
      entryId: ref.id,
      amount: params.documento.amount,
      direction: params.documento.direction,
      repetida: false,
    };
  });
}

/* ================================================================== */
/* A porta de entrada                                                 */
/* ================================================================== */

type LancamentoInput = {
  barbershopId: string;
  kind: TipoDeCaixa;
  amount: number;
  direction?: DirecaoDeCaixa;
  reason: string;
  paymentMethod: PaymentMethod;
  staffId?: string | null;
  idempotencyKey?: string;
};

const METODOS: PaymentMethod[] = ["pix", "cash", "debit", "credit"];

/**
 * O dono registra um movimento de caixa que não tem outro fato por trás.
 *
 * Só o DONO: sangria e aporte são decisões de quem responde pelo negócio, e
 * pagamento de comissão mexe no acerto de alguém.
 *
 * Escrita pelo servidor, e a regra do Firestore passou a recusar escrita direta
 * — antes era `allow write: if isOwnerOf`, herdado de quando a coleção não
 * tinha contrato. Sem isso, "valor congelado" e "idempotência" seriam promessas
 * que a primeira tela a gravar direto quebraria.
 */
export const registrarMovimentoDeCaixa = onCall<LancamentoInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const data = request.data ?? ({} as LancamentoInput);
  const { barbershopId } = data;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono registra movimento de caixa.");
  }

  if (!tipoValido(data.kind)) {
    throw new HttpsError("invalid-argument", "Tipo de movimento de caixa desconhecido.");
  }
  if (!valorDeCaixaValido(data.amount)) {
    throw new HttpsError("invalid-argument", "Informe um valor maior que zero.");
  }
  if (!motivoDeCaixaValido(data.reason)) {
    throw new HttpsError("invalid-argument", "Diga por que esse dinheiro se moveu.");
  }
  if (!METODOS.includes(data.paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o dinheiro se moveu.");
  }

  const chave = String(data.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!chave) throw new HttpsError("invalid-argument", "Chave de idempotência ausente.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);

  /* O beneficiário é conferido ANTES de gravar: um `staffId` que não existe
   * criaria saída de caixa a favor de ninguém. */
  if (data.kind === "pagamento_comissao" && data.staffId) {
    const s = await shopRef.collection("staff").doc(String(data.staffId)).get();
    if (!s.exists) throw new HttpsError("not-found", "Esse profissional não está cadastrado.");
  }

  const documento = documentoDeCaixa({
    kind: data.kind,
    valor: data.amount,
    direcao: data.direction,
    date: hoje,
    reason: data.reason,
    paymentMethod: data.paymentMethod,
    staffId: data.staffId ?? null,
  });

  return gravarLancamentoDeCaixa({
    db,
    shopRef,
    documento,
    chave,
    extras: { registradoPor: uid, createdAt: FieldValue.serverTimestamp() },
  });
});
