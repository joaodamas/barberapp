import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, vinculosDe } from "./acesso";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import { valorDaVenda, type InventoryMovementDoc } from "./inventory";

/**
 * Ajustar o estoque — o dono diz "o saldo real é outro" ou "saiu sem venda".
 *
 * ## O buraco que isto fecha
 *
 * Antes não havia como corrigir o saldo: a entrada só soma, a venda só baixa, e
 * a devolução só repõe o que uma venda tirou. Pomada que quebrou, shampoo usado
 * na cadeira e contagem que não bate eram "editar o número na mão" — sem
 * motivo, sem custo e sem rastro, que é o D19 de volta pela porta dos fundos.
 *
 * ## O que o ajuste é, e o que ele NÃO é
 *
 * É um movimento `kind: "ajuste"` com `quantity` ASSINADA (negativa = saiu) e
 * `reason`. **Não** tem `refundOf` — é isso que o separa de uma devolução e
 * mantém o CMV e a receita intactos: o `detalheDoCustoDoVendido` só desconta
 * `ajuste` com `refundOf`.
 *
 * - Saída (perda, uso interno, vencido, diferença de contagem a menos, outro):
 *   é CUSTO. O `unitCost` é o do cadastro no instante, CONGELADO no movimento —
 *   mudar o custo depois não reescreve a perda de ontem. O DRE soma
 *   `|quantity| × unitCost` na linha "Perdas e uso interno de estoque"
 *   (`perdasDeEstoque`, em `fontes-financeiras.ts`).
 * - Entrada por contagem (achou mais do que o sistema dizia): só corrige a
 *   quantidade. **Não gera receita nem custo** — nenhum dinheiro entrou, e o
 *   custo médio do cadastro não se move (não há compra para ponderar).
 *
 * O saldo nunca fica negativo: a saída maior que o estoque é recusada, dentro
 * da transação, contra a leitura daquele instante.
 */

export const MOTIVOS_DE_AJUSTE = ["perda", "uso_interno", "vencido", "contagem", "outro"] as const;
export type MotivoDeAjuste = (typeof MOTIVOS_DE_AJUSTE)[number];

export const ROTULO_DO_MOTIVO: Record<MotivoDeAjuste, string> = {
  perda: "Perda/quebra",
  uso_interno: "Uso interno (na barbearia)",
  vencido: "Vencido",
  contagem: "Contagem (diferença de inventário)",
  outro: "Outro",
};

export function motivoDeAjusteValido(motivo: unknown): motivo is MotivoDeAjuste {
  return MOTIVOS_DE_AJUSTE.includes(motivo as MotivoDeAjuste);
}

/** O pedido do dono: contou o saldo real, ou informou quanto saiu sem venda. */
export type PedidoDeAjuste =
  | {
      modo: "contagem";
      contado: number;
      /**
       * O saldo que o dono tinha na tela ao contar. Se na transação o saldo for
       * outro (uma venda entrou no meio), a contagem é recusada: "contei 7"
       * calculado sobre um saldo velho viraria uma diferença errada.
       */
      estoqueVisto?: number;
    }
  | { modo: "saida"; quantidade: number };

export type CalculoDoAjuste =
  | { ok: true; delta: number; estoqueDepois: number }
  | { ok: false; motivo: "invalido" | "excede" | "sem_mudanca" };

/**
 * O saldo que resulta do pedido — pura, porque é a regra que a transação
 * protege.
 *
 * `typeof` antes de `Number.isInteger`, pelo mesmo motivo de `quantidadeValida`:
 * a string do formulário coagida viraria saldo.
 */
export function calcularAjuste(params: { estoqueAtual: number; pedido: PedidoDeAjuste }): CalculoDoAjuste {
  const atual = Math.max(Number(params.estoqueAtual) || 0, 0);
  const p = params.pedido;

  if (p.modo === "contagem") {
    if (typeof p.contado !== "number" || !Number.isInteger(p.contado) || p.contado < 0) {
      return { ok: false, motivo: "invalido" };
    }
    if (p.contado === atual) return { ok: false, motivo: "sem_mudanca" };
    return { ok: true, delta: p.contado - atual, estoqueDepois: p.contado };
  }

  if (p.modo === "saida") {
    if (typeof p.quantidade !== "number" || !Number.isInteger(p.quantidade) || p.quantidade <= 0) {
      return { ok: false, motivo: "invalido" };
    }
    if (p.quantidade > atual) return { ok: false, motivo: "excede" };
    return { ok: true, delta: -p.quantidade, estoqueDepois: atual - p.quantidade };
  }

  return { ok: false, motivo: "invalido" };
}

/** Quanto o ajuste custou: só saída custa; entrada por contagem é zero. */
export function custoDoAjuste(delta: number, unitCost: number): number {
  if (!(delta < 0)) return 0;
  return valorDaVenda(Math.max(Number(unitCost) || 0, 0), -delta);
}

/**
 * O texto do motivo, normalizado. "Outro" exige explicação; os demais ignoram o
 * texto digitado (a tela pode ter deixado lixo de uma escolha anterior).
 */
export function motivoCompleto(motivo: MotivoDeAjuste, texto: unknown): { ok: true; texto: string | null } | { ok: false } {
  if (motivo !== "outro") return { ok: true, texto: null };
  const t = typeof texto === "string" ? texto.trim() : "";
  return t.length >= 3 ? { ok: true, texto: t.slice(0, 200) } : { ok: false };
}

/** O documento do ajuste, com o custo CONGELADO. */
export function movimentoDeAjuste(params: {
  productId: string;
  delta: number;
  unitCost: number;
  reason: MotivoDeAjuste;
  reasonText: string | null;
  date: string;
}): InventoryMovementDoc {
  return {
    productId: params.productId,
    kind: "ajuste",
    /* Assinada: a direção mora no sinal, como na devolução. */
    quantity: params.delta,
    /* Ajuste não é venda: não há preço praticado. */
    unitPrice: 0,
    unitCost: params.unitCost,
    /* O custo da saída (ou o valor, ao custo, da entrada por contagem) — sempre
     * positivo, para quem somar `value` não precisar olhar o sinal. */
    value: valorDaVenda(params.unitCost, Math.abs(params.delta)),
    paymentMethod: null,
    clientId: null,
    bookingId: null,
    staffId: null,
    reason: params.reason,
    reasonText: params.reasonText,
    date: params.date,
  };
}

/** A assinatura do pedido, para recusar a mesma chave com outro pedido. */
export function assinaturaDoAjuste(p: {
  productId: string;
  pedido: PedidoDeAjuste;
  reason: MotivoDeAjuste;
  reasonText: string | null;
}): string {
  const valor = p.pedido.modo === "contagem" ? `contagem:${p.pedido.contado}` : `saida:${p.pedido.quantidade}`;
  return [p.productId, valor, p.reason, p.reasonText ?? ""].join("|");
}

export type ResultadoDoAjuste = {
  movementId: string;
  delta: number;
  estoqueDepois: number;
  /** Custo lançado no DRE por este ajuste (zero na entrada por contagem). */
  custo: number;
  repetida: boolean;
};

/**
 * O ajuste dentro da transação — mesma forma de `gravarCompraComEntradaDeEstoque`.
 * Exportada para o teste de emulador exercer a transação que roda em produção.
 */
export async function gravarAjusteDeEstoque(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  productId: string;
  pedido: PedidoDeAjuste;
  reason: MotivoDeAjuste;
  reasonText: string | null;
  date: string;
  /** Obrigatória: ajuste sem chave seria refeito por um toque duplo. */
  chave: string;
  extras?: Record<string, unknown>;
}): Promise<ResultadoDoAjuste> {
  const { db, shopRef, productId } = params;
  const productRef = shopRef.collection("products").doc(productId);
  const movementRef = shopRef.collection("inventory_movements").doc(`ajuste_manual_${params.chave}`);
  const assinatura = assinaturaDoAjuste({
    productId,
    pedido: params.pedido,
    reason: params.reason,
    reasonText: params.reasonText,
  });

  return db.runTransaction(async (tx) => {
    /* ---- LEITURAS ---- */
    const [produtoSnap, jaExiste] = await Promise.all([tx.get(productRef), tx.get(movementRef)]);

    /* Idempotência: a mesma chave não ajusta duas vezes. Vem ANTES do cálculo —
     * depois do primeiro ajuste o saldo já é outro, e um retry de "contei 7"
     * cairia em `sem_mudanca`, com a tela mostrando erro sobre algo que deu
     * certo. */
    if (jaExiste.exists) {
      if (jaExiste.get("assinaturaDoPedido") !== assinatura) {
        throw new HttpsError(
          "failed-precondition",
          "Esse ajuste já foi registrado com outros dados. Confira o estoque antes de tentar de novo."
        );
      }
      const delta = Number(jaExiste.get("quantity")) || 0;
      return {
        movementId: movementRef.id,
        delta,
        estoqueDepois: Number(produtoSnap.get("stock")) || 0,
        custo: custoDoAjuste(delta, Number(jaExiste.get("unitCost")) || 0),
        repetida: true,
      };
    }

    if (!produtoSnap.exists) {
      throw new HttpsError("not-found", "Esse produto não está mais cadastrado.");
    }

    const estoqueAntes = Number(produtoSnap.get("stock")) || 0;
    if (
      params.pedido.modo === "contagem" &&
      typeof params.pedido.estoqueVisto === "number" &&
      params.pedido.estoqueVisto !== estoqueAntes
    ) {
      throw new HttpsError(
        "failed-precondition",
        `O estoque mudou desde que você abriu (agora: ${estoqueAntes}). Confira e conte de novo.`
      );
    }
    const calculo = calcularAjuste({ estoqueAtual: estoqueAntes, pedido: params.pedido });
    if (!calculo.ok) {
      if (calculo.motivo === "excede") {
        throw new HttpsError(
          "failed-precondition",
          `${produtoSnap.get("name") ?? "Produto"}: só há ${estoqueAntes} un. no estoque — não dá para registrar a saída de mais que isso.`
        );
      }
      if (calculo.motivo === "sem_mudanca") {
        throw new HttpsError("failed-precondition", "O estoque já está com essa quantidade — nada a ajustar.");
      }
      throw new HttpsError("invalid-argument", "Quantidade inválida. Use um número inteiro.");
    }

    /* O custo é lido AQUI e congelado no movimento. */
    const unitCost = Number(produtoSnap.get("cost")) || 0;
    const movimento = movimentoDeAjuste({
      productId,
      delta: calculo.delta,
      unitCost,
      reason: params.reason,
      reasonText: params.reasonText,
      date: params.date,
    });

    /* ---- ESCRITAS ---- */
    tx.update(productRef, { stock: calculo.estoqueDepois });
    tx.set(movementRef, { ...movimento, assinaturaDoPedido: assinatura, ...(params.extras ?? {}) });

    return {
      movementId: movementRef.id,
      delta: calculo.delta,
      estoqueDepois: calculo.estoqueDepois,
      custo: custoDoAjuste(calculo.delta, unitCost),
      repetida: false,
    };
  });
}

type AjusteInput = {
  barbershopId: string;
  productId: string;
  modo: "contagem" | "saida";
  /** `modo: "contagem"` — o saldo real contado. */
  contado?: number;
  /** `modo: "contagem"` — o saldo que a tela mostrava ao contar. */
  estoqueVisto?: number;
  /** `modo: "saida"` — quantas unidades saíram sem venda. */
  quantity?: number;
  /** Obrigatório em `saida`; em `contagem` é sempre "contagem". */
  reason?: MotivoDeAjuste;
  reasonText?: string | null;
  idempotencyKey?: string;
};

/**
 * O dono ajusta o estoque.
 *
 * Só o DONO, como a entrada: ajuste muda o saldo e o custo do mês, e quem o
 * faz sem motivo apaga o rastro de uma subtração.
 */
export const ajustarEstoque = onCall<AjusteInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const data = request.data ?? ({} as AjusteInput);
  const { barbershopId, productId } = data;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  if (!productId) throw new HttpsError("invalid-argument", "Produto não informado.");

  const papel = vinculosDe(request)?.[barbershopId];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia ajusta o estoque.");
  }
  await exigirEdicao(barbershopId);

  let pedido: PedidoDeAjuste;
  let reason: MotivoDeAjuste;
  if (data.modo === "contagem") {
    pedido = {
      modo: "contagem",
      contado: data.contado as number,
      ...(typeof data.estoqueVisto === "number" ? { estoqueVisto: data.estoqueVisto } : {}),
    };
    reason = "contagem";
  } else if (data.modo === "saida") {
    pedido = { modo: "saida", quantidade: data.quantity as number };
    if (!motivoDeAjusteValido(data.reason)) {
      throw new HttpsError("invalid-argument", "Diga por que o produto saiu do estoque.");
    }
    reason = data.reason;
  } else {
    throw new HttpsError("invalid-argument", "Tipo de ajuste desconhecido.");
  }

  const motivo = motivoCompleto(reason, data.reasonText);
  if (!motivo.ok) {
    throw new HttpsError("invalid-argument", "Explique o motivo em poucas palavras.");
  }

  /* Sanitizada porque vira ID de documento. */
  const chave = String(data.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!chave) throw new HttpsError("invalid-argument", "Chave de idempotência ausente.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);

  return gravarAjusteDeEstoque({
    db,
    shopRef,
    productId: String(productId),
    pedido,
    reason,
    reasonText: motivo.texto,
    date: hoje,
    chave,
    extras: { registradoPor: uid, createdAt: FieldValue.serverTimestamp() },
  });
});
