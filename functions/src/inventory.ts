import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import {
  padraoDaCasa,
  percentualDaComissao,
  SEM_TAXA,
  type PaymentFees,
  type PaymentMethod,
} from "./financial-events";
import { documentoDePagamento, idDoPagamento } from "./payments";
import { comissaoDaVenda, idDaComissao } from "./comissoes";

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
  /**
   * Quem vendeu — Rodada 3.1.
   *
   * Faltava, e a ausência só apareceu ao materializar a comissão de produto:
   * `commissions.staffId` não tinha de onde sair. Sem beneficiário, ou a
   * comissão não nasce, ou nasce um valor a pagar que nenhum acerto alcança.
   *
   * Nulo é caso legítimo: venda registrada sem indicar o vendedor não gera
   * comissão, e a barbearia fica com o lucro inteiro.
   */
  staffId: string | null;
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
 * O custo unitário do estoque depois de uma entrada — **custo médio ponderado**.
 *
 * ## A decisão, e a alternativa que ela recusa
 *
 * A alternativa é o **último custo**: `cost = unitCost da última compra`. É mais
 * simples e fica errada enquanto sobrar estoque antigo — comprar 2 unidades a
 * R$ 30 com 8 a R$ 18 na prateleira faria as 8 antigas passarem a custar R$ 30
 * na próxima venda, e o CMV do mês seguinte estouraria sem nada ter acontecido.
 *
 * O médio ponderado responde o que o CMV precisa: **quanto custou, em média, a
 * unidade que está na prateleira agora**.
 *
 * ```
 * (estoque × custoAtual + quantidade × custoDaCompra) ÷ (estoque + quantidade)
 * ```
 *
 * Isto **não reescreve histórico**: as vendas já feitas carregam o `unitCost`
 * que congelaram. O médio vale daqui para frente.
 *
 * Estoque zerado devolve o custo da compra — não há média a fazer, e dividir
 * por zero gravaria `NaN` dentro do documento.
 */
export function custoMedioPonderado(params: {
  estoqueAtual: number;
  custoAtual: number;
  quantidade: number;
  custoDaCompra: number;
}): number {
  const estoque = Math.max(Number(params.estoqueAtual) || 0, 0);
  const total = estoque + params.quantidade;
  if (total <= 0) return params.custoDaCompra;

  const valorAntigo = estoque * (Number(params.custoAtual) || 0);
  const valorNovo = params.quantidade * params.custoDaCompra;
  return Math.round(((valorAntigo + valorNovo) / total) * 100) / 100;
}

/**
 * O documento da compra — G1.5.
 *
 * `kind: "compra"` existia no tipo e **nenhum caminho do produto o produzia**:
 * era o achado D19. O estoque inicial vinha do formulário de cadastro, e a
 * reposição era o dono editando o número — sem custo, sem data, sem registro.
 *
 * Consequência: `cmv = movimentos.filter(kind === "compra")` somava sobre um
 * conjunto vazio, e o CMV do DRE era **zero estrutural**. D3 descrevia
 * corretamente o código e incorretamente o produto — não havia compras a somar.
 */
export function movimentoDeCompra(params: {
  productId: string;
  quantidade: number;
  unitCost: number;
  paymentMethod: PaymentMethod | null;
  supplier: string | null;
  date: string;
}): InventoryMovementDoc & { supplier: string | null } {
  return {
    productId: params.productId,
    kind: "compra",
    quantity: params.quantidade,
    /* Compra não tem preço de venda: o produto entrou, não saiu. Zero explícito
     * em vez de ausente, para o campo significar a mesma coisa nos dois tipos
     * de movimento. */
    unitPrice: 0,
    unitCost: params.unitCost,
    value: valorDaVenda(params.unitCost, params.quantidade),
    paymentMethod: params.paymentMethod,
    clientId: null,
    bookingId: null,
    /* Compra não tem vendedor: ninguém ganha comissão por receber mercadoria. */
    staffId: null,
    supplier: params.supplier,
    date: params.date,
  };
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
  staffId?: string | null;
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
    staffId: params.staffId ?? null,
    date: params.date,
  };
}

/**
 * A mercadoria voltando para a prateleira — D23.
 *
 * `kind: "ajuste"` existia em `TipoDeMovimento` desde sempre e **nenhum caminho
 * do produto o produzia**, exatamente como `"compra"` antes de G1.5.
 *
 * O `unitCost` vem CONGELADO do movimento original, não de `products.cost`: a
 * unidade que volta é a mesma que saiu, e relê-la do cadastro faria uma
 * reposição mais cara inflar o custo do que está sendo devolvido — o CMV
 * subtrairia mais do que somou.
 *
 * `value` guarda o valor de VENDA desfeito, não o custo, porque é ele que a
 * leitura de receita precisa descontar. O custo continua no campo próprio, e os
 * dois juntos permitem à Rodada 3.2 corrigir receita e CMV sem inferir nada.
 *
 * `refundOf` aponta o movimento original: sem ele, um ajuste de devolução é
 * indistinguível de um ajuste de inventário — quebra, vencimento, recontagem —
 * e as duas coisas mexem no resultado de formas opostas.
 */
export function movimentoDeDevolucao(params: {
  productId: string;
  quantidade: number;
  unitPrice: number;
  unitCost: number;
  paymentMethod: PaymentMethod | null;
  clientId: string | null;
  bookingId: string | null;
  staffId: string | null;
  movementIdOriginal: string;
  date: string;
}): InventoryMovementDoc & { refundOf: string } {
  return {
    productId: params.productId,
    kind: "ajuste",
    /* Positiva: o estoque SOBE. A direção mora no sinal, não no tipo, porque
     * `"ajuste"` também serve para perda e recontagem. */
    quantity: params.quantidade,
    unitPrice: params.unitPrice,
    unitCost: params.unitCost,
    value: valorDaVenda(params.unitPrice, params.quantidade),
    paymentMethod: params.paymentMethod,
    clientId: params.clientId,
    bookingId: params.bookingId,
    /* Preservado do original: é o barbeiro cuja comissão está sendo revertida. */
    staffId: params.staffId,
    refundOf: params.movementIdOriginal,
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
  /**
   * Taxas da barbearia, lidas ANTES da transação — G1.6.
   *
   * São política, não estado disputado: ler fora não abre corrida. Passá-las
   * como argumento mantém a transação sem I/O extra e torna o congelamento da
   * taxa verificável sem emulador.
   *
   * Ausentes, o pagamento nasce com taxa zero — que é o comportamento correto
   * para quem ainda não preencheu as taxas em Configurações.
   */
  fees?: PaymentFees;
  /**
   * Quem vendeu, e sob que percentual — Rodada 3.1.
   *
   * Lido ANTES da transação, junto das taxas: barbeiro e política são
   * configuração, não estado disputado. O percentual vem congelado daqui para o
   * documento de comissão, e mudar o split amanhã não reescreve o acerto de
   * hoje — que é o P1-7.
   *
   * Ausente, a venda não gera comissão. É caso legítimo: venda sem vendedor
   * indicado deixa o lucro inteiro com a barbearia.
   */
  vendedor?: {
    staffId: string;
    uid: string | null;
    staffName: string | null;
    commissionPct: number;
  };
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
          staffId: params.vendedor?.staffId ?? null,
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

      /* G1.6 · o pagamento nasce com a venda, na MESMA transação.
       *
       * Não é o botão que cria o pagamento — é o fato econômico. Escrevê-lo
       * fora daqui abriria o estado em que a venda existe e o dinheiro dela
       * não, que é exatamente o que `payments` serve para impedir.
       *
       * Uma linha por produto, com id derivado do movimento: idempotência por
       * construção, e reexecutar não cobra a taxa duas vezes. */
      tx.set(
        params.shopRef
          .collection("payments")
          .doc(idDoPagamento({ origem: "produto", movementId: m.movementRef.id })),
        {
          ...documentoDePagamento({
            ref: { origem: "produto", movementId: m.movementRef.id },
            clientId: params.clientId,
            date: params.date,
            bruto: m.movimento.value,
            metodo: params.paymentMethod,
            fees: params.fees ?? SEM_TAXA,
          }),
          ...(params.extras ?? {}),
        }
      );

      /* Rodada 3.1 · a comissão de produto vira FATO.
       *
       * Era derivada a cada leitura, do agregado do mês, com a política de
       * HOJE — mudar o split reescrevia o acerto de meses fechados (P1-7). E
       * como o CMV estava zerado por D19, a base era o faturamento inteiro: o
       * dono pagava comissão sobre o custo da mercadoria.
       *
       * Aqui a base é o lucro DAQUELA linha, com o `unitCost` que ela mesma
       * congelou. Não depende de nenhum agregado nem de nenhuma leitura
       * posterior. */
      const comissao = params.vendedor
        ? comissaoDaVenda({
            movementId: m.movementRef.id,
            staffId: params.vendedor.staffId,
            uid: params.vendedor.uid,
            staffName: params.vendedor.staffName,
            unitPrice: m.movimento.unitPrice,
            unitCost: m.movimento.unitCost,
            quantidade: m.item.quantity,
            commissionPct: params.vendedor.commissionPct,
            date: params.date,
          })
        : null;

      if (comissao) {
        tx.set(
          params.shopRef
            .collection("commissions")
            .doc(idDaComissao({ origem: "produto", refId: m.movementRef.id })),
          { ...comissao, ...(params.extras ?? {}) }
        );
      }
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
  /** Quem vendeu. Sem ele a venda não gera comissão — ver `comissoes.ts`. */
  staffId?: string | null;
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

  /* Taxas lidas AQUI, fora da transação: são política, não estado disputado.
   * Congelam no pagamento — mudar a taxa da maquininha amanhã não reescreve o
   * que foi recebido hoje. */
  const politicas = (shopSnap.get("policies") ?? {}) as {
    paymentFees?: Partial<PaymentFees>;
    commissionSplit?: { barberPct?: number };
  };
  const fees: PaymentFees = { ...SEM_TAXA, ...(politicas.paymentFees ?? {}) };

  /* O vendedor e o percentual, lidos AGORA e congelados no documento.
   *
   * Mesma leitura que `materializeFinancialsOnCompletion` faz para o serviço:
   * o percentual do barbeiro quando ele tem um, o padrão da casa quando não.
   * Depois desta escrita, nada relê `policies` para reconstruir a comissão —
   * que é justamente o defeito P1-7 do lado da loja. */
  const staffId = request.data?.staffId ? String(request.data.staffId) : null;
  const vendedorSnap = staffId
    ? await shopRef.collection("staff").doc(staffId).get()
    : null;

  if (staffId && !vendedorSnap?.exists) {
    throw new HttpsError("not-found", "Esse profissional não está cadastrado.");
  }
  if (vendedorSnap?.exists && vendedorSnap.get("active") === false) {
    throw new HttpsError("failed-precondition", "Esse profissional não está ativo.");
  }

  const vendedor = vendedorSnap?.exists
    ? {
        staffId: staffId as string,
        uid: (vendedorSnap.get("uid") as string | null) ?? null,
        staffName: (vendedorSnap.get("name") as string | null) ?? null,
        /* Mesma fonte do serviço desde o D1.
         *
         * A expressão que estava aqui era `Number(staff ?? politicas…) || 0`, e
         * o `|| 0` transformava "barbearia sem `policies`" em 0% — o vendedor
         * no padrão da casa levava zero enquanto o simulador da Loja anunciava
         * "40% do lucro". Não aparecia na verificação de 18/08 só porque a
         * venda foi feita com um barbeiro que tem percentual próprio. */
        commissionPct: percentualDaComissao({
          doProfissional: vendedorSnap.get("commissionPct"),
          padrao: padraoDaCasa(politicas),
        }),
      }
    : undefined;

  return gravarVendaComTravaDeEstoque({
    fees,
    vendedor,
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

/* ================================================================== */
/* G1.5 · a ENTRADA de estoque — o fato que não existia (D19)         */
/* ================================================================== */

/**
 * A compra, dentro da transação que sobe o estoque.
 *
 * Mesma forma da venda, e pelos mesmos motivos: o movimento e o estoque nascem
 * juntos ou não nascem, e a leitura acontece toda antes de qualquer escrita.
 *
 * ## O que ela faz com `products.cost`, e por que isso NÃO é "editar o custo"
 *
 * A compra **atualiza** o custo do produto para o médio ponderado. Isso não é o
 * antipadrão que D19 denuncia — o antipadrão era usar a edição do custo **no
 * lugar** do registro da compra, sem quantidade, sem data e sem fato.
 *
 * Aqui o fato é o movimento, e o custo do cadastro passa a ser o que ele
 * sempre deveria ter sido: uma **derivada** dos movimentos, mantida atualizada
 * para a próxima venda congelar o valor certo.
 */
export async function gravarCompraComEntradaDeEstoque(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  productId: string;
  quantity: number;
  unitCost: number;
  paymentMethod: PaymentMethod | null;
  supplier: string | null;
  date: string;
  chave?: string;
  extras?: Record<string, unknown>;
}): Promise<{
  movementId: string;
  value: number;
  estoqueDepois: number;
  custoDepois: number;
  repetida: boolean;
}> {
  const { db, shopRef, productId, quantity } = params;
  const productRef = shopRef.collection("products").doc(productId);
  const movementRef = params.chave
    ? shopRef.collection("inventory_movements").doc(`compra_${params.chave}`)
    : shopRef.collection("inventory_movements").doc();

  return db.runTransaction(async (tx) => {
    /* ---- LEITURAS ---- */
    const [produtoSnap, jaExiste] = await Promise.all([
      tx.get(productRef),
      tx.get(movementRef),
    ]);

    if (jaExiste.exists) {
      return {
        movementId: movementRef.id,
        value: Number(jaExiste.get("value")) || 0,
        estoqueDepois: Number(produtoSnap.get("stock")) || 0,
        custoDepois: Number(produtoSnap.get("cost")) || 0,
        repetida: true,
      };
    }
    if (!produtoSnap.exists) {
      throw new HttpsError("not-found", "Esse produto não está mais cadastrado.");
    }

    const estoqueAntes = Number(produtoSnap.get("stock")) || 0;
    const custoAntes = Number(produtoSnap.get("cost")) || 0;

    const custoDepois = custoMedioPonderado({
      estoqueAtual: estoqueAntes,
      custoAtual: custoAntes,
      quantidade: quantity,
      custoDaCompra: params.unitCost,
    });

    const movimento = movimentoDeCompra({
      productId,
      quantidade: quantity,
      unitCost: params.unitCost,
      paymentMethod: params.paymentMethod,
      supplier: params.supplier,
      date: params.date,
    });

    /* ---- ESCRITAS ---- */
    tx.update(productRef, { stock: estoqueAntes + quantity, cost: custoDepois });
    tx.set(movementRef, { ...movimento, ...(params.extras ?? {}) });

    return {
      movementId: movementRef.id,
      value: movimento.value,
      estoqueDepois: estoqueAntes + quantity,
      custoDepois,
      repetida: false,
    };
  });
}

/**
 * O dono registra a chegada da mercadoria.
 *
 * ## Por que não é uma despesa
 *
 * Comprar estoque é troca de caixa por mercadoria, não consumo: o dinheiro sai
 * e o valor continua na prateleira. Gravar `expenses` aqui somaria o custo duas
 * vezes no resultado — uma como despesa no mês da compra, outra como CMV no mês
 * da venda.
 *
 * A saída de caixa é real e vai aparecer quando o Fluxo de Caixa passar a ter
 * saídas (D8/D11). É por isso que `paymentMethod` já nasce aqui, mesmo sem
 * ninguém lê-lo ainda: descobrir o meio depois é o que a premissa N12 recusa.
 */
export const registrarEntradaDeEstoque = onCall<{
  barbershopId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  paymentMethod?: PaymentMethod | null;
  supplier?: string | null;
  idempotencyKey?: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, productId, quantity, unitCost } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  if (!productId) throw new HttpsError("invalid-argument", "Produto não informado.");

  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia dá entrada.");
  }

  if (!quantidadeValida(quantity)) {
    throw new HttpsError(
      "invalid-argument",
      "Quantidade precisa ser um número inteiro maior que zero."
    );
  }
  /* Custo pode ter centavos, então não exige inteiro — mas precisa ser número e
   * não pode ser negativo, que seria uma compra que devolve dinheiro. Zero é
   * aceito: brinde do fornecedor entra no estoque e custa nada. */
  if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost < 0) {
    throw new HttpsError("invalid-argument", "Custo unitário inválido.");
  }

  const metodo = request.data?.paymentMethod ?? null;
  if (metodo !== null && !metodoValido(metodo)) {
    throw new HttpsError("invalid-argument", "Forma de pagamento inválida.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const chave = String(request.data?.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");

  return gravarCompraComEntradaDeEstoque({
    db,
    shopRef,
    productId: String(productId),
    quantity,
    unitCost,
    paymentMethod: metodo,
    supplier: request.data?.supplier ? String(request.data.supplier).trim() : null,
    date: hoje,
    chave: chave || undefined,
    extras: { registradoPor: uid, createdAt: FieldValue.serverTimestamp() },
  });
});
