import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import type { PaymentMethod } from "./financial-events";
import { idDoPagamento } from "./payments";
import { custoMedioPonderado, movimentoDeDevolucao } from "./inventory";
import { estornoDaComissao, idDoEstornoDaComissao } from "./comissoes";

/**
 * O estorno como fato — Rodada 3.1 · D22 / D23.
 *
 * ## O que existia
 *
 * `refunds` estava declarada em `paths.ts` e nas regras (`write: false`), com
 * **zero escritas, zero leituras e nenhum tipo**. Mesma classe de
 * `inventory_movements` antes de G1: uma coleção que parece implementada.
 *
 * `cancelBooking` calculava uma devolução e gravava em `bookings.refundedAmount`
 * — campo que nenhuma linha do produto lê. E ele só age sobre reserva ABERTA,
 * onde `paymentMethod` ainda é nulo porque nasce na conclusão: na prática o
 * valor calculado é sempre zero, e a tela já diz corretamente "o cliente ainda
 * não pagou". Aquele caminho **não é o estorno**; é a régua de cancelamento de
 * um pagamento antecipado que o produto ainda não aceita.
 *
 * O estorno atua sobre o fato **já materializado**: atendimento concluído, venda
 * registrada, fatura paga. Os três têm `PaymentDoc`.
 *
 * ## A regra que este módulo existe para não quebrar
 *
 * **Corrigir histórico é somar fatos, nunca apagar.** O `PaymentDoc` original
 * fica intacto, o movimento de estoque original fica intacto, a fatura paga
 * continua paga. O estorno é um documento novo que aponta para o original.
 *
 * Isso não colide com o `delete` que `materializeFinancialsOnCompletion` já faz:
 * lá o efeito é `"reverter"`, e o caso é outro — o dono marcou como concluído
 * por engano, o atendimento **não aconteceu**, e o fato nunca deveria ter
 * existido. Apagar o que não ocorreu é correção; apagar o que ocorreu é perda de
 * histórico. `decidirEfeito` já separa os dois, e o estorno é um terceiro caso
 * que não substitui nenhum deles.
 *
 * ## A taxa não volta, e a conta fecha sozinha
 *
 * A maquininha retém a taxa quando o dinheiro entra; devolvê-lo ao cliente não a
 * traz de volta. Então o estorno grava `feeAmount: 0` e devolve o **bruto**.
 *
 * O efeito disso é que o par se resolve sem campo especial:
 *
 * ```
 * pagamento   +43,43 líquido   (bruto 45,00 − taxa 1,57)
 * estorno     −45,00
 * ────────────────────────────
 * saldo        −1,57           = exatamente a taxa perdida
 * ```
 *
 * A perda emerge da soma dos dois fatos. Nenhuma fórmula da Rodada 3.2 precisa
 * saber que houve estorno para chegar nela — que é o teste de um fato bem posto.
 */

export type OrigemDoEstorno = "servico" | "produto" | "mensalidade";

export type ReferenciaDoEstorno =
  | { origem: "servico"; bookingId: string }
  | { origem: "produto"; movementId: string }
  | { origem: "mensalidade"; invoiceId: string };

/**
 * O id do documento.
 *
 * Deriva do fato **e** da chave de idempotência, porque um mesmo fato aceita
 * mais de um estorno parcial — três devoluções de uma unidade cada são três
 * fatos distintos, não um sobrescrevendo o outro.
 *
 * A chave é obrigatória por isso. Em `payments` ela não existe porque lá o id do
 * fato basta: um atendimento tem um pagamento. Aqui não basta, e derivar só do
 * fato faria o segundo estorno apagar o primeiro em silêncio.
 */
export function idDoEstorno(ref: ReferenciaDoEstorno, chave: string): string {
  if (ref.origem === "servico") return `estorno_${ref.bookingId}_${chave}`;
  if (ref.origem === "produto") return `estorno_venda_${ref.movementId}_${chave}`;
  return `estorno_fatura_${ref.invoiceId}_${chave}`;
}

export type RefundDoc = {
  origin: OrigemDoEstorno;
  bookingId?: string;
  movementId?: string;
  invoiceId?: string;
  /**
   * O pagamento que este estorno reverte.
   *
   * Explícito em vez de reconstruído pela convenção de id: quem lê o estorno
   * precisa achar o pagamento sem reimplementar `idDoPagamento`, e a Rodada 3.2
   * vai precisar exatamente disso para não contar receita já devolvida.
   */
  paymentId: string;
  clientId: string | null;
  /** Quando o dinheiro voltou. */
  date: string;
  /**
   * Quando o fato original aconteceu.
   *
   * Guardadas as duas, a leitura escolhe o regime sem inventar nada: competência
   * usa `originalDate`, caixa usa `date`. Guardar uma só forçaria a Rodada 3.2 a
   * adivinhar a outra.
   */
  originalDate: string;
  /** Por que foi devolvido. Sem isto o histórico registra o valor e não o fato. */
  reason: string;
  /** Como o dinheiro voltou — o mesmo meio da entrada (N12). */
  paymentMethod: PaymentMethod | null;
  /** Quanto voltou ao cliente. */
  grossAmount: number;
  /** Zero explícito, não ausente — ver a nota sobre a taxa no topo do arquivo. */
  feeAmount: number;
  /** O que saiu do caixa da barbearia. Igual ao bruto: a taxa fica com ela. */
  netAmount: number;
  /** Cobre o fato inteiro, ou só parte dele. */
  parcial: boolean;
  /** Unidades devolvidas ao estoque. Só em produto. */
  quantity?: number;
};

export type Estornavel =
  | { ok: true; valor: number; restaDepois: number; parcial: boolean }
  | { ok: false; motivo: "sem_saldo" | "excede" | "invalido" };

/**
 * Quanto ainda pode ser devolvido, e se o pedido cabe.
 *
 * Pura porque é a regra que impede devolver mais do que entrou — e uma regra de
 * dinheiro que só se exerce com emulador é uma regra que ninguém exercita.
 *
 * `pedido` nulo significa "o que restar": é o caminho do estorno total, e ele
 * não pode ser escrito como `pedido = pago` porque isso ignoraria estornos
 * anteriores e devolveria o valor cheio duas vezes.
 */
export function valorEstornavel(params: {
  /** `grossAmount` do pagamento original. */
  pago: number;
  /** Soma dos estornos já registrados contra esse pagamento. */
  jaEstornado: number;
  pedido: number | null;
}): Estornavel {
  const pago = Number(params.pago) || 0;
  const jaEstornado = Number(params.jaEstornado) || 0;
  const resta = Math.round((pago - jaEstornado) * 100) / 100;

  if (pago <= 0) return { ok: false, motivo: "invalido" };
  if (resta <= 0) return { ok: false, motivo: "sem_saldo" };

  if (params.pedido === null || params.pedido === undefined) {
    return { ok: true, valor: resta, restaDepois: 0, parcial: jaEstornado > 0 };
  }

  /* `typeof` e não `Number(...)`, pelo mesmo motivo de `quantidadeValida`: uma
   * string do formulário coagida vira valor de estorno, e aqui sai dinheiro. */
  if (typeof params.pedido !== "number" || !Number.isFinite(params.pedido)) {
    return { ok: false, motivo: "invalido" };
  }

  const pedido = Math.round(params.pedido * 100) / 100;
  if (pedido <= 0) return { ok: false, motivo: "invalido" };
  if (pedido > resta) return { ok: false, motivo: "excede" };

  const restaDepois = Math.round((resta - pedido) * 100) / 100;
  return { ok: true, valor: pedido, restaDepois, parcial: restaDepois > 0 || jaEstornado > 0 };
}

export type QuantidadeEstornavel =
  | { ok: true; quantidade: number; restaDepois: number }
  | { ok: false; motivo: "sem_saldo" | "excede" | "invalido" };

/**
 * Quantas unidades ainda podem voltar para a prateleira.
 *
 * Na venda o dono escolhe a QUANTIDADE e o valor é derivado dela — nunca o
 * contrário. Deixar o valor ser digitado permitiria devolver R$ 90 por uma
 * unidade de R$ 45, e o estoque contaria uma história diferente do caixa.
 */
export function quantidadeEstornavel(params: {
  vendida: number;
  jaDevolvida: number;
  pedida: number | null;
}): QuantidadeEstornavel {
  const vendida = Number(params.vendida) || 0;
  const jaDevolvida = Number(params.jaDevolvida) || 0;
  const resta = vendida - jaDevolvida;

  if (vendida <= 0) return { ok: false, motivo: "invalido" };
  if (resta <= 0) return { ok: false, motivo: "sem_saldo" };

  if (params.pedida === null || params.pedida === undefined) {
    return { ok: true, quantidade: resta, restaDepois: 0 };
  }
  if (typeof params.pedida !== "number" || !Number.isInteger(params.pedida)) {
    return { ok: false, motivo: "invalido" };
  }
  if (params.pedida <= 0) return { ok: false, motivo: "invalido" };
  if (params.pedida > resta) return { ok: false, motivo: "excede" };

  return { ok: true, quantidade: params.pedida, restaDepois: resta - params.pedida };
}

/** O documento completo, pronto para gravar. */
export function documentoDeEstorno(params: {
  ref: ReferenciaDoEstorno;
  paymentId: string;
  clientId: string | null;
  date: string;
  originalDate: string;
  reason: string;
  metodo: PaymentMethod | null;
  valor: number;
  parcial: boolean;
  quantidade?: number;
}): RefundDoc {
  const referencia =
    params.ref.origem === "servico"
      ? { bookingId: params.ref.bookingId }
      : params.ref.origem === "produto"
        ? { movementId: params.ref.movementId }
        : { invoiceId: params.ref.invoiceId };

  const valor = Math.round(params.valor * 100) / 100;

  return {
    origin: params.ref.origem,
    ...referencia,
    paymentId: params.paymentId,
    clientId: params.clientId,
    date: params.date,
    originalDate: params.originalDate,
    reason: params.reason,
    paymentMethod: params.metodo,
    grossAmount: valor,
    /* A taxa não é recobrada nem devolvida. Ver a nota no topo: a perda aparece
     * sozinha na soma do pagamento com o estorno. */
    feeAmount: 0,
    netAmount: valor,
    parcial: params.parcial,
    ...(params.quantidade !== undefined ? { quantity: params.quantidade } : {}),
  };
}

/**
 * O motivo, normalizado.
 *
 * Obrigatório de propósito. Um estorno sem motivo registra que o dinheiro voltou
 * e não por quê — e a pergunta que o dono faz três meses depois, olhando o mês
 * fechado, é exatamente essa.
 */
export function motivoValido(motivo: unknown): motivo is string {
  return typeof motivo === "string" && motivo.trim().length >= 3;
}

/* ================================================================== */
/* O estorno, dentro da transação                                     */
/* ================================================================== */

export type ResultadoDoEstornoGravado = {
  refundId: string;
  valor: number;
  restaDepois: number;
  parcial: boolean;
  /** Unidades devolvidas — só em produto. */
  quantidade: number | null;
  estoqueDepois: number | null;
  /** Quanto de comissão voltou. Negativo, porque é o que sai do acerto. */
  comissaoRevertida: number;
  repetida: boolean;
};

/** A recusa, traduzida para quem está na frente do balcão. */
function erroDeSaldo(motivo: "sem_saldo" | "excede" | "invalido", unidade: "real" | "unidade") {
  if (motivo === "sem_saldo") {
    return new HttpsError(
      "failed-precondition",
      unidade === "real"
        ? "Esse valor já foi totalmente devolvido."
        : "Todas as unidades dessa venda já voltaram para o estoque."
    );
  }
  if (motivo === "excede") {
    return new HttpsError(
      "failed-precondition",
      unidade === "real"
        ? "O valor pedido é maior do que o que ainda pode ser devolvido."
        : "Você está devolvendo mais unidades do que foram vendidas."
    );
  }
  return new HttpsError("invalid-argument", "Valor de estorno inválido.");
}

/**
 * Grava o estorno e tudo que ele arrasta, atomicamente.
 *
 * Separada do `onCall` pelo mesmo motivo de `gravarVendaComTravaDeEstoque`:
 * dentro do wrapper a trava só se exerceria com autenticação e emulador de
 * Functions, e **a regra que impede devolver mais do que entrou nunca seria
 * exercida sob concorrência**. Dois estornos simultâneos de R$ 30 sobre um
 * pagamento de R$ 45 têm de virar um sucesso e uma recusa, não R$ 60 devolvidos.
 *
 * O que faz a serialização funcionar é a query dos estornos anteriores rodar
 * **dentro** da transação: ela entra no conjunto de leitura, e uma escrita
 * concorrente naquela faixa força o retry.
 *
 * ## O que este caminho NUNCA faz
 *
 * Não apaga o `PaymentDoc`, não altera o movimento de venda, não reescreve a
 * comissão original e não muda o status da fatura paga. Tudo que ele faz é
 * **acrescentar**: um `refund`, um movimento de devolução e uma comissão
 * negativa. Quem quiser reconstruir o dia da venda ainda encontra a venda.
 */
export async function gravarEstorno(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  ref: ReferenciaDoEstorno;
  chave: string;
  reason: string;
  /** Serviço e mensalidade: quanto devolver. Nulo = o que restar. */
  valorPedido?: number | null;
  /** Produto: quantas unidades voltam. Nulo = todas as que restarem. */
  quantidadePedida?: number | null;
  date: string;
  extras?: Record<string, unknown>;
}): Promise<ResultadoDoEstornoGravado> {
  const { db, shopRef, ref } = params;

  const paymentId = idDoPagamento(ref);
  const pagamentoRef = shopRef.collection("payments").doc(paymentId);
  const refundRef = shopRef.collection("refunds").doc(idDoEstorno(ref, params.chave));
  const anterioresQuery = shopRef.collection("refunds").where("paymentId", "==", paymentId);

  const movimentoRef =
    ref.origem === "produto"
      ? shopRef.collection("inventory_movements").doc(ref.movementId)
      : null;
  const comissaoRef =
    ref.origem === "produto"
      ? shopRef.collection("commissions").doc(`comissao_venda_${ref.movementId}`)
      : null;

  return db.runTransaction(async (tx) => {
    /* ================= LEITURAS =================
     *
     * TODAS antes de qualquer escrita. O Firestore recusa uma leitura posterior
     * a uma escrita na mesma transação, e o erro só aparece em runtime — passou
     * perto de acontecer em G3. */
    const [pagamentoSnap, refundSnap, anterioresSnap, movimentoSnap, comissaoSnap] =
      await Promise.all([
        tx.get(pagamentoRef),
        tx.get(refundRef),
        tx.get(anterioresQuery),
        movimentoRef ? tx.get(movimentoRef) : Promise.resolve(null),
        comissaoRef ? tx.get(comissaoRef) : Promise.resolve(null),
      ]);

    /* Idempotência: a mesma chave não estorna duas vezes. Devolve o que já foi
     * gravado sem tocar em estoque nem em comissão — um retry precisa ser
     * indistinguível de sucesso, senão a tela mostra erro sobre um estorno que
     * deu certo e o dono devolve o dinheiro de novo. */
    if (refundSnap.exists) {
      return {
        refundId: refundRef.id,
        valor: Number(refundSnap.get("grossAmount")) || 0,
        restaDepois: 0,
        parcial: Boolean(refundSnap.get("parcial")),
        quantidade: (refundSnap.get("quantity") as number | undefined) ?? null,
        estoqueDepois: null,
        comissaoRevertida: 0,
        repetida: true,
      };
    }

    /* Sem pagamento não há o que devolver. É o caso do atendimento nunca
     * concluído e da fatura ainda aberta: ali o caminho é cancelar, não
     * estornar dinheiro que não entrou. */
    if (!pagamentoSnap.exists) {
      throw new HttpsError(
        "failed-precondition",
        "Não há pagamento registrado para esse fato — não existe valor a devolver."
      );
    }

    const pago = Number(pagamentoSnap.get("grossAmount")) || 0;
    const metodo = (pagamentoSnap.get("paymentMethod") ?? null) as PaymentMethod | null;
    const clientId = (pagamentoSnap.get("clientId") ?? null) as string | null;
    const originalDate = String(pagamentoSnap.get("date") ?? params.date);
    const jaEstornado = anterioresSnap.docs.reduce(
      (s, d) => s + (Number(d.get("grossAmount")) || 0),
      0
    );

    /* Na venda quem manda é a QUANTIDADE, e o valor deriva dela. Deixar o valor
     * ser digitado permitiria devolver R$ 90 por uma unidade de R$ 45, e o
     * estoque contaria uma história diferente do caixa. */
    let quantidade: number | null = null;
    let valorPedido = params.valorPedido ?? null;
    let produtoSnap: FirebaseFirestore.DocumentSnapshot | null = null;

    if (ref.origem === "produto") {
      if (!movimentoSnap?.exists) {
        throw new HttpsError("not-found", "Essa venda não está registrada.");
      }
      if (movimentoSnap.get("kind") !== "venda") {
        throw new HttpsError("failed-precondition", "Esse movimento não é uma venda.");
      }

      const cabe = quantidadeEstornavel({
        vendida: Number(movimentoSnap.get("quantity")) || 0,
        jaDevolvida: anterioresSnap.docs.reduce(
          (s, d) => s + (Number(d.get("quantity")) || 0),
          0
        ),
        pedida: params.quantidadePedida ?? null,
      });
      if (!cabe.ok) throw erroDeSaldo(cabe.motivo, "unidade");

      quantidade = cabe.quantidade;
      valorPedido =
        Math.round((Number(movimentoSnap.get("unitPrice")) || 0) * quantidade * 100) / 100;

      /* Última leitura da fase. Depende do movimento, por isso não cabia no
       * `Promise.all` acima. */
      produtoSnap = await tx.get(
        shopRef.collection("products").doc(String(movimentoSnap.get("productId")))
      );
    }

    const cabe = valorEstornavel({ pago, jaEstornado, pedido: valorPedido });
    if (!cabe.ok) throw erroDeSaldo(cabe.motivo, "real");

    /* ================= ESCRITAS ================= */
    tx.set(refundRef, {
      ...documentoDeEstorno({
        ref,
        paymentId,
        clientId,
        date: params.date,
        originalDate,
        reason: params.reason.trim(),
        metodo,
        valor: cabe.valor,
        parcial: cabe.restaDepois > 0,
        ...(quantidade !== null ? { quantidade } : {}),
      }),
      ...(params.extras ?? {}),
    });

    let estoqueDepois: number | null = null;
    let comissaoRevertida = 0;

    if (ref.origem === "produto" && movimentoSnap && produtoSnap && quantidade !== null) {
      const unitCost = Number(movimentoSnap.get("unitCost")) || 0;
      const unitPrice = Number(movimentoSnap.get("unitPrice")) || 0;
      const staffId = (movimentoSnap.get("staffId") ?? null) as string | null;
      const estoqueAntes = Number(produtoSnap.get("stock")) || 0;
      estoqueDepois = estoqueAntes + quantidade;

      /* O médio ponderado é recalculado com o custo CONGELADO do movimento
       * original: a unidade que volta custou o que custou quando saiu. Reusar
       * `custoMedioPonderado` em vez de escrever outra fórmula — é a mesma
       * operação de G1.5, entrada de mercadoria a um custo conhecido. */
      tx.update(produtoSnap.ref, {
        stock: estoqueDepois,
        cost: custoMedioPonderado({
          estoqueAtual: estoqueAntes,
          custoAtual: Number(produtoSnap.get("cost")) || 0,
          quantidade,
          custoDaCompra: unitCost,
        }),
      });

      tx.set(
        shopRef
          .collection("inventory_movements")
          .doc(`ajuste_estorno_${ref.movementId}_${params.chave}`),
        {
          ...movimentoDeDevolucao({
            productId: produtoSnap.id,
            quantidade,
            unitPrice,
            unitCost,
            paymentMethod: metodo,
            clientId,
            bookingId: (movimentoSnap.get("bookingId") ?? null) as string | null,
            staffId,
            movementIdOriginal: ref.movementId,
            date: params.date,
          }),
          ...(params.extras ?? {}),
        }
      );

      /* A comissão volta somando uma linha negativa, nunca apagando a original.
       *
       * O percentual sai do DOCUMENTO de comissão da venda, não do cadastro do
       * barbeiro: quem mudou de 50% para 30% no meio do caminho teria o estorno
       * calculado a 30% sobre uma venda comissionada a 50%, e sobraria saldo a
       * pagar de uma venda que não existe. É o P1-7 tentando entrar pela porta
       * de saída. */
      if (staffId && comissaoSnap?.exists) {
        const estorno = estornoDaComissao({
          movementId: ref.movementId,
          chave: params.chave,
          staffId,
          uid: (comissaoSnap.get("uid") ?? null) as string | null,
          staffName: (comissaoSnap.get("staffName") ?? null) as string | null,
          unitPrice,
          unitCost,
          quantidade,
          commissionPct: Number(comissaoSnap.get("commissionPct")) || 0,
          date: params.date,
        });

        tx.set(
          shopRef
            .collection("commissions")
            .doc(idDoEstornoDaComissao(ref.movementId, params.chave)),
          { ...estorno, ...(params.extras ?? {}) }
        );
        comissaoRevertida = estorno.commissionAmount;
      }
    }

    return {
      refundId: refundRef.id,
      valor: cabe.valor,
      restaDepois: cabe.restaDepois,
      parcial: cabe.restaDepois > 0,
      quantidade,
      estoqueDepois,
      comissaoRevertida,
      repetida: false,
    };
  });
}

/* ================================================================== */
/* A porta de entrada                                                 */
/* ================================================================== */

type EstornoInput = {
  barbershopId: string;
  origem: OrigemDoEstorno;
  /** Um dos três, conforme a origem. */
  bookingId?: string;
  movementId?: string;
  invoiceId?: string;
  reason: string;
  /** Serviço e mensalidade. Ausente = devolver tudo que resta. */
  amount?: number | null;
  /** Produto. Ausente = devolver todas as unidades que restam. */
  quantity?: number | null;
  idempotencyKey?: string;
};

/** Monta a referência discriminada a partir do que veio da tela. */
function referenciaDoPedido(data: EstornoInput): ReferenciaDoEstorno {
  if (data.origem === "servico") {
    if (!data.bookingId) throw new HttpsError("invalid-argument", "Atendimento não informado.");
    return { origem: "servico", bookingId: String(data.bookingId) };
  }
  if (data.origem === "produto") {
    if (!data.movementId) throw new HttpsError("invalid-argument", "Venda não informada.");
    return { origem: "produto", movementId: String(data.movementId) };
  }
  if (data.origem === "mensalidade") {
    if (!data.invoiceId) throw new HttpsError("invalid-argument", "Fatura não informada.");
    return { origem: "mensalidade", invoiceId: String(data.invoiceId) };
  }
  throw new HttpsError("invalid-argument", "Origem do estorno desconhecida.");
}

/**
 * O dono devolve dinheiro de um fato já registrado.
 *
 * Só o DONO. Estorno tira dinheiro do caixa e mexe no acerto de comissão do
 * mês; `staff` registra venda e conclui atendimento, mas desfazer o que já foi
 * cobrado é decisão de quem responde pelo negócio.
 */
export const registrarEstorno = onCall<EstornoInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const data = request.data ?? ({} as EstornoInput);
  const { barbershopId } = data;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono registra estorno.");
  }

  if (!motivoValido(data.reason)) {
    throw new HttpsError("invalid-argument", "Diga por que o valor está sendo devolvido.");
  }

  const ref = referenciaDoPedido(data);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);

  /* Sanitizada porque vira ID de documento: uma chave com "/" criaria uma
   * subcoleção em vez de um estorno, e o Firestore aceitaria sem reclamar. */
  const chave = String(data.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!chave) {
    throw new HttpsError("invalid-argument", "Chave de idempotência ausente.");
  }

  return gravarEstorno({
    db,
    shopRef,
    ref,
    chave,
    reason: data.reason,
    valorPedido: data.amount ?? null,
    quantidadePedida: data.quantity ?? null,
    date: hoje,
    extras: { registradoPor: uid, createdAt: FieldValue.serverTimestamp() },
  });
});

