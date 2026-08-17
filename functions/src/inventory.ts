import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import type { PaymentMethod } from "./financial-events";

/**
 * A venda de produto — G1.
 *
 * ## Por que precisa existir
 *
 * `inventory_movements` era uma coleção que **ninguém escrevia**. A tela da Loja
 * cadastrava produto, calculava margem e mostrava estoque — um cadastro com
 * simulador. Receita de loja, CMV e comissão de produto eram estruturalmente
 * zero, e a massa de teste precisava de uma constante paralela
 * (`MEIO_DA_VENDA`) para representar o que o documento não sabia guardar.
 *
 * ## O que esta função congela, e por quê
 *
 * O `unitCost` é lido do produto **antes** de o estoque mudar e gravado no
 * movimento. Depois disso a venda nunca mais depende de `products.cost`.
 *
 * Isso não é detalhe de implementação: é o que vai permitir corrigir o CMV
 * (D3) **sem reescrever o histórico**. Enquanto o custo vier do cadastro, uma
 * reposição mais cara reescreve o custo de todas as vendas passadas — o lucro
 * de setembro muda porque a pomada subiu em outubro. Com o custo congelado no
 * fato, cada venda carrega o custo que ela realmente teve.
 *
 * O mesmo vale para `unitPrice`: mudar a tabela de preços não pode alterar o
 * que já foi vendido.
 *
 * ## O que ela deliberadamente NÃO faz
 *
 * **Não escreve `payments` nem `commissions`.** A venda produz o FATO; a
 * interpretação financeira dele — taxa de maquininha (D7), comissão sobre o
 * lucro da loja (P1-7), rateio no caixa por meio de pagamento (D4) e CMV pelo
 * custo do vendido (D3) — é a Rodada 3.
 *
 * O produto fica numa posição deliberada e temporária: **o fato está certo e
 * algumas visões continuam erradas**. `caixaDiario` vai seguir jogando toda
 * venda em "dinheiro" mesmo agora que o meio de pagamento existe no documento.
 * Isso é D4, está registrado, e corrigi-lo aqui mascararia a evidência que a
 * Rodada 3 precisa encontrar.
 */

export type TipoDeMovimento = "compra" | "venda" | "ajuste" | "perda";

export type InventoryMovementDoc = {
  productId: string;
  kind: TipoDeMovimento;
  quantity: number;
  /** Preço unitário praticado, CONGELADO. Mudar a tabela não altera o passado. */
  unitPrice: number;
  /**
   * Custo unitário no instante da venda, CONGELADO.
   *
   * É o campo que sustenta o CMV por competência. Sem ele, o custo do vendido
   * só pode ser reconstruído a partir de `products.cost`, que é o custo de
   * HOJE — e aí uma reposição mais cara reescreve o lucro de meses fechados.
   */
  unitCost: number;
  /** Total da linha: `unitPrice × quantity`. */
  value: number;
  paymentMethod: PaymentMethod | null;
  /** Quem levou. Nulo na venda de balcão sem cadastro — é caso normal. */
  clientId: string | null;
  /** Atendimento a que a venda ficou casada, quando houver. */
  bookingId: string | null;
  date: string;
};

/** Os meios que o produto conhece. */
const METODOS: PaymentMethod[] = ["pix", "cash", "debit", "credit"];

export function metodoValido(metodo: unknown): metodo is PaymentMethod {
  return METODOS.includes(metodo as PaymentMethod);
}

/**
 * A quantidade pedida é utilizável?
 *
 * Inteiro e positivo. Fração de produto não existe no cadastro — `stock` é
 * contado em unidades —, e quantidade zero ou negativa viraria uma venda que
 * some do faturamento e **devolve** estoque.
 */
export function quantidadeValida(quantidade: unknown): boolean {
  /* `typeof` antes de `Number.isInteger`, e não `Number(quantidade)`.
   *
   * A coerção parecia inofensiva e não é: `Number("2e3")` devolve 2000, e um
   * campo com lixo viraria uma venda de duas mil unidades — que passaria pela
   * checagem de estoque só quando houvesse estoque, e faturaria uma fortuna
   * quando houvesse. `Number([2])` também é 2, e `Number(" ")` é 0.
   *
   * A tela manda número. Quem manda string está fora do contrato, e o lugar de
   * descobrir isso é aqui, não no fechamento do mês. */
  return typeof quantidade === "number" && Number.isInteger(quantidade) && quantidade > 0;
}

/**
 * O estoque cobre a venda?
 *
 * Separado e puro porque é a regra que a transação protege. Estoque ausente no
 * documento vale zero: produto sem o campo nunca teve entrada registrada, e
 * tratá-lo como infinito deixaria vender o que não existe.
 */
export function estoqueSuficiente(estoque: unknown, quantidade: number): boolean {
  const disponivel = Number(estoque);
  return Number.isFinite(disponivel) && disponivel >= quantidade;
}

/**
 * O valor da linha.
 *
 * Arredondado ao centavo, não ao real: o preço unitário pode ter centavos, e
 * multiplicar por 3 antes de arredondar acumula erro. Arredondar ao real aqui
 * seria criar um D1/D5 novo dentro de um fato que acabou de nascer.
 */
export function valorDaVenda(unitPrice: number, quantidade: number): number {
  return Math.round(unitPrice * quantidade * 100) / 100;
}

/**
 * O documento da venda, montado a partir do produto e do pedido.
 *
 * Puro de propósito: é a decisão de o que fica congelado, e ela precisa ser
 * verificável sem emulador.
 */
export function movimentoDeVenda(params: {
  productId: string;
  quantidade: number;
  unitPrice: number;
  unitCost: number;
  paymentMethod: PaymentMethod;
  clientId: string | null;
  bookingId: string | null;
  date: string;
}): InventoryMovementDoc {
  return {
    productId: params.productId,
    kind: "venda",
    quantity: params.quantidade,
    unitPrice: params.unitPrice,
    unitCost: params.unitCost,
    value: valorDaVenda(params.unitPrice, params.quantidade),
    paymentMethod: params.paymentMethod,
    clientId: params.clientId,
    bookingId: params.bookingId,
    date: params.date,
  };
}

/**
 * A venda, dentro da transação que protege o estoque.
 *
 * Separada do `onCall` pelo mesmo motivo de `gravarComTravaDeHorario`: dentro
 * do wrapper ela exigiria autenticação e emulador de Functions, e **a trava que
 * impede duas vendas da mesma unidade nunca seria exercida sob concorrência**.
 * Aqui é uma função com `db` injetável, e `inventory-transacao.test.ts` dispara
 * N chamadas simultâneas contra o emulador.
 *
 * A ordem é leitura → validação → escrita, e não pode ser outra: o Firestore
 * exige todas as leituras antes de qualquer escrita, e a validação de estoque
 * precisa acontecer sobre a leitura DESTA transação — é isso que faz duas
 * vendas concorrentes serem serializadas em vez de somarem em cima do mesmo
 * saldo.
 */
export type ItemDaVenda = { productId: string; quantity: number };

export async function gravarVendaComTravaDeEstoque(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  /** Uma ou mais linhas. A venda é ATÔMICA entre elas. */
  itens: ItemDaVenda[];
  paymentMethod: PaymentMethod;
  clientId: string | null;
  bookingId: string | null;
  date: string;
  /** Sufixo do id dos movimentos. Sem ele, cada chamada é uma venda nova. */
  chave?: string;
  /** Campos extras de auditoria — quem registrou, quando. */
  extras?: Record<string, unknown>;
}): Promise<{
  movementIds: string[];
  value: number;
  estoqueDepois: Record<string, number>;
  repetida: boolean;
}> {
  const { db, shopRef, itens } = params;

  /* ---- Uma linha por produto ----
   *
   * Duas linhas do MESMO produto na mesma venda seriam duas leituras do mesmo
   * documento e duas subtrações a partir do mesmo saldo — a segunda apagaria a
   * primeira, e o estoque baixaria só uma vez para duas unidades vendidas. A
   * tela soma na quantidade; aqui a duplicata é erro. */
  const vistos = new Set<string>();
  for (const item of itens) {
    if (vistos.has(item.productId)) {
      throw new HttpsError(
        "invalid-argument",
        "O mesmo produto aparece duas vezes na venda. Some na quantidade."
      );
    }
    vistos.add(item.productId);
  }

  const refs = itens.map((item) => ({
    item,
    productRef: shopRef.collection("products").doc(item.productId),
    movementRef: params.chave
      ? shopRef.collection("inventory_movements").doc(`venda_${params.chave}_${item.productId}`)
      : shopRef.collection("inventory_movements").doc(),
  }));

  return db.runTransaction(async (tx) => {
    /* ---- LEITURAS — todas antes de qualquer escrita ---- */
    const lidos = await Promise.all(
      refs.map(async (r) => ({
        ...r,
        produtoSnap: await tx.get(r.productRef),
        jaExiste: await tx.get(r.movementRef),
      }))
    );

    /* Idempotência: a mesma chave não vende duas vezes. Devolve o que já foi
     * gravado, sem tocar no estoque — um retry precisa ser indistinguível de
     * sucesso, senão a tela mostra erro sobre uma venda que deu certo e o dono
     * registra de novo.
     *
     * Basta UMA linha existir: a venda é atômica, então ou todas foram
     * gravadas ou nenhuma foi. */
    if (lidos.some((l) => l.jaExiste.exists)) {
      return {
        movementIds: lidos.map((l) => l.movementRef.id),
        value: lidos.reduce((s, l) => s + (Number(l.jaExiste.get("value")) || 0), 0),
        estoqueDepois: Object.fromEntries(
          lidos.map((l) => [l.item.productId, Number(l.produtoSnap.get("stock")) || 0])
        ),
        repetida: true,
      };
    }

    /* ---- VALIDAÇÃO — todas as linhas antes de escrever qualquer uma ----
     *
     * É o que torna o carrinho atômico. Validar e gravar linha a linha deixaria
     * a primeira baixar estoque e a segunda falhar por falta — venda pela
     * metade, com o dono achando que registrou tudo. */
    const movimentos = lidos.map((l) => {
      if (!l.produtoSnap.exists) {
        throw new HttpsError("not-found", "Esse produto não está mais cadastrado.");
      }
      const estoqueAntes = Number(l.produtoSnap.get("stock")) || 0;
      if (!estoqueSuficiente(estoqueAntes, l.item.quantity)) {
        throw new HttpsError(
          "failed-precondition",
          `${l.produtoSnap.get("name") ?? "Produto"}: estoque insuficiente, restam ${estoqueAntes} unidade(s).`
        );
      }
      return {
        ...l,
        estoqueAntes,
        /* O custo é capturado AQUI, antes de qualquer escrita, e vai congelado
         * para o movimento. Daqui em diante esta venda não depende mais de
         * `products.cost` — é o que permitirá corrigir D3 sem reescrever nada. */
        movimento: movimentoDeVenda({
          productId: l.item.productId,
          quantidade: l.item.quantity,
          unitPrice: Number(l.produtoSnap.get("price")) || 0,
          unitCost: Number(l.produtoSnap.get("cost")) || 0,
          paymentMethod: params.paymentMethod,
          clientId: params.clientId,
          bookingId: params.bookingId,
          date: params.date,
        }),
      };
    });

    /* ---- ESCRITAS ---- */
    for (const m of movimentos) {
      /* Estoque calculado a partir da leitura desta transação, e não com
       * `increment`: a transação já garante que ninguém mexeu no documento
       * entre a leitura e o commit, e o valor explícito torna "estoque depois"
       * determinístico — é o que o teste de concorrência verifica. */
      tx.update(m.productRef, { stock: m.estoqueAntes - m.item.quantity });
      tx.set(m.movementRef, { ...m.movimento, ...(params.extras ?? {}) });
    }

    return {
      movementIds: movimentos.map((m) => m.movementRef.id),
      value: movimentos.reduce((s, m) => s + m.movimento.value, 0),
      estoqueDepois: Object.fromEntries(
        movimentos.map((m) => [m.item.productId, m.estoqueAntes - m.item.quantity])
      ),
      repetida: false,
    };
  });
}

type VendaInput = {
  barbershopId: string;
  /** O carrinho. Uma venda pode ter mais de um produto, e é atômica entre eles. */
  itens: ItemDaVenda[];
  paymentMethod: PaymentMethod;
  clientId?: string | null;
  bookingId?: string | null;
  /**
   * Chave de idempotência, gerada pela tela a cada tentativa de venda.
   *
   * Sem ela, um toque duplo no botão ou um retry de rede baixa o estoque duas
   * vezes e fatura duas vezes — e não há como distinguir isso de duas vendas
   * legítimas do mesmo produto no mesmo minuto, que acontecem.
   *
   * Mesmo princípio de `materializeFinancialsOnCompletion`, que deriva o id do
   * `bookingId`: idempotência por construção, não por checagem depois.
   */
  idempotencyKey?: string;
};

export const registrarVendaDeProduto = onCall<VendaInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, itens, paymentMethod } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  if (!Array.isArray(itens) || itens.length === 0) {
    throw new HttpsError("invalid-argument", "Escolha pelo menos um produto.");
  }

  /* Vender é operar a loja: exige vínculo, como marcar no balcão. Sem esta
   * guarda, qualquer autenticado baixaria o estoque de qualquer barbearia — o
   * Admin SDK ignora as regras do Firestore. */
  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia registra venda.");
  }

  for (const item of itens) {
    if (!item?.productId) throw new HttpsError("invalid-argument", "Produto não informado.");
    if (!quantidadeValida(item.quantity)) {
      throw new HttpsError(
        "invalid-argument",
        "Quantidade precisa ser um número inteiro maior que zero."
      );
    }
  }
  /* O meio nasce NO FATO. Aceitar venda sem ele obrigaria a inferir depois — e
   * inferir meio de pagamento é exatamente o que a premissa N12 recusa. */
  if (!metodoValido(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o cliente pagou.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const locale = localeDoDocumento(shopSnap.data());
  const hoje = hojeNoFuso(locale.timeZone);

  /* Sanitizada porque vira ID de documento: uma chave com "/" criaria uma
   * subcoleção em vez de um movimento, e o Firestore aceitaria sem reclamar. */
  const chave = String(request.data?.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");

  return gravarVendaComTravaDeEstoque({
    db,
    shopRef,
    itens: itens.map((i) => ({ productId: String(i.productId), quantity: i.quantity })),
    paymentMethod,
    clientId: request.data?.clientId ? String(request.data.clientId) : null,
    bookingId: request.data?.bookingId ? String(request.data.bookingId) : null,
    date: hoje,
    chave: chave || undefined,
    extras: { registradoPor: uid, createdAt: FieldValue.serverTimestamp() },
  });
});
