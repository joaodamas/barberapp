import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Apagar o movimento de demonstração e começar o mês limpo.
 *
 * ## De onde veio
 *
 * O dono d'O Siqueira, na primeira semana de uso:
 *
 * > *"como tiro o registro que você fez no mês?"*
 *
 * Ele tinha razão em perguntar e não tinha onde clicar: existia exclusão de
 * equipe, despesa, plano e serviço — de atendimento concluído, pagamento e
 * comissão, nenhuma. Dá para desfazer a conclusão (e aí o pagamento some) e
 * cancelar enquanto está em aberto, mas a reserva continua no dia, e o primeiro
 * mês de operação nasceria misturado com o que foi teste.
 *
 * ## Por que é uma callable, e não uma tela apagando documento
 *
 * Três razões, e nenhuma é conveniência:
 *
 * 1. **`payments`, `commissions`, `refunds` e `cash_entries` são `write: if
 *    false` para o cliente.** Elas só se escrevem pelo servidor, por desenho —
 *    afrouxar a regra para permitir a limpeza destruiria a propriedade que
 *    torna o histórico confiável.
 * 2. **O rastro.** `audit_log` também é imutável para a tela. Um apagamento em
 *    massa que não deixa registro é a única operação do produto que poderia
 *    acontecer sem ninguém saber depois — §26.
 * 3. **Atomicidade não é possível, e por isso a ORDEM importa.** São milhares
 *    de documentos em coleções diferentes; não cabe numa transação. O que dá
 *    para garantir é que o registro do que foi apagado seja escrito ANTES, e
 *    que a contagem venha do mesmo lugar que a exclusão.
 *
 * ## O que ela NÃO apaga, e por quê
 *
 * Cadastro fica: equipe, serviços, preços, planos, produtos, clientes,
 * horários, taxas e configurações. O dono está começando a operar, não
 * recomeçando o cadastro — e refazer tudo aquilo é justamente o que faria ele
 * desistir de limpar e conviver com o mês sujo.
 *
 * `audit_log` fica **inteiro**. Ele passa a descrever fatos que não existem
 * mais, e isso é correto: o rastro é de que a coisa aconteceu, não de que ela
 * continua lá.
 *
 * ## O estoque volta a zero, e isso não é efeito colateral
 *
 * `products.stock` é o saldo dos movimentos. Apagar os movimentos e manter o
 * saldo deixaria o produto afirmando oito unidades sem uma linha que explique
 * de onde vieram — o oposto do que este produto faz com número. Os produtos
 * continuam cadastrados, com preço e custo; o que zera é a contagem.
 */

/**
 * Movimento: some. Tudo que não está aqui é cadastro e fica.
 *
 * Exportada porque é o CONTRATO, não um detalhe: o teste confere que nenhuma
 * coleção de cadastro entrou por engano e que `audit_log` continua de fora.
 * Uma linha a mais aqui apaga dados de uma barbearia real.
 */
export const COLECOES_DE_MOVIMENTO = [
  "bookings",
  "payments",
  "commissions",
  "refunds",
  "cash_entries",
  "inventory_movements",
  "expenses",
  "subscriptions",
  "subscription_invoices",
  "loyalty_transactions",
  "client_occurrences",
  "whatsapp_messages",
] as const;

/**
 * Teto por chamada.
 *
 * Não é limite de produto: é o que impede uma função de 60s morrer no meio de
 * uma barbearia com anos de histórico e deixar metade apagada sem ninguém
 * saber quanto sobrou. Estourando, a resposta diz que sobrou — e chamar de novo
 * continua de onde parou.
 */
const TETO_POR_CHAMADA = 5_000;

/** O Firestore aceita 500 operações por lote. */
const TAMANHO_DO_LOTE = 500;

type Contagem = Record<string, number>;

/**
 * Quanto existe de cada coleção — a conta que a tela mostra ANTES de apagar.
 *
 * `count()` em vez de baixar os documentos: numa barbearia com um ano de
 * operação, contar reservas trazendo cada uma custa leitura e tempo para
 * responder um número que cabe em um inteiro.
 */
async function contarMovimento(
  shopRef: FirebaseFirestore.DocumentReference
): Promise<{ porColecao: Contagem; total: number; maisAntigo: string | null }> {
  const porColecao: Contagem = {};
  let total = 0;

  await Promise.all(
    COLECOES_DE_MOVIMENTO.map(async (nome) => {
      const agregado = await shopRef.collection(nome).count().get();
      const n = agregado.data().count;
      if (n > 0) porColecao[nome] = n;
      total += n;
    })
  );

  /* A data do registro mais antigo entra na resposta porque muda a decisão: o
   * dono que vê "o mais antigo é de 3 dias atrás" está apagando teste; quem vê
   * "de 7 meses atrás" está prestes a apagar a operação da barbearia. A tela
   * não pode decidir isso por ele, mas pode impedir que ele decida sem saber. */
  const primeira = await shopRef
    .collection("bookings")
    .orderBy("date", "asc")
    .limit(1)
    .get();
  const maisAntigo = primeira.empty ? null : String(primeira.docs[0].get("date") ?? "") || null;

  return { porColecao, total, maisAntigo };
}

/** Apaga em lotes, devolvendo quantos saíram. */
async function apagarColecao(
  db: FirebaseFirestore.Firestore,
  colecao: FirebaseFirestore.CollectionReference,
  teto: number
): Promise<number> {
  let apagados = 0;

  while (apagados < teto) {
    const lote = await colecao.limit(Math.min(TAMANHO_DO_LOTE, teto - apagados)).get();
    if (lote.empty) break;

    const batch = db.batch();
    for (const doc of lote.docs) batch.delete(doc.ref);
    await batch.commit();

    apagados += lote.size;
    /* Página menor que o pedido significa que acabou. Sem esta saída, a última
     * volta faria uma consulta a mais em toda execução. */
    if (lote.size < TAMANHO_DO_LOTE) break;
  }

  return apagados;
}

/**
 * A porta. Sem `confirmacao`, ela só CONTA — e é assim que a tela monta o aviso.
 *
 * Duas fases na mesma callable de propósito: a contagem que o dono leu e a
 * exclusão que ele autorizou precisam vir da mesma régua. Fossem duas funções,
 * a lista de coleções existiria em dois lugares, e a que conta acabaria
 * esquecendo a coleção que a que apaga aprendeu.
 */
export const comecarDoZero = onCall<{
  barbershopId: string;
  /** A palavra que o dono digita. Só `"ZERAR"` executa; qualquer outra coisa conta. */
  confirmacao?: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const barbershopId = String(request.data?.barbershopId ?? "");
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  /* A guarda de vínculo, como em toda porta que mexe em dinheiro: as regras do
   * Firestore protegem o DADO e o Admin SDK as ignora. Sem esta leitura do
   * claim, o dono da Alfa zeraria a Beta com um token perfeitamente válido —
   * e aqui isso seria irreversível. */
  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono pode zerar o movimento.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const antes = await contarMovimento(shopRef);

  /* Fase 1 — a conta, sem tocar em nada. */
  if (request.data?.confirmacao !== "ZERAR") {
    return { modo: "previa" as const, ...antes };
  }

  /* Fase 2 — o registro vem ANTES da exclusão.
   *
   * Se a função morrer no meio, o que fica é um log dizendo o que foi mandado
   * apagar e um banco parcialmente limpo — que é recuperável por leitura. Na
   * ordem inversa, o que ficaria é um banco vazio sem uma linha explicando por
   * quê, e ninguém teria como distinguir isso de perda de dados. */
  await shopRef.collection("audit_log").add({
    tipo: "comecar_do_zero",
    at: FieldValue.serverTimestamp(),
    por: uid,
    detail: { antes: antes.porColecao, total: antes.total, maisAntigo: antes.maisAntigo },
  });

  const apagado: Contagem = {};
  let restante = TETO_POR_CHAMADA;

  /* Sequencial, e não `Promise.all`: paralelizar 12 coleções multiplicaria a
   * escrita por 12 no mesmo instante e é assim que se descobre o limite de
   * gravação do Firestore com o dono olhando a tela. */
  for (const nome of COLECOES_DE_MOVIMENTO) {
    if (restante <= 0) break;
    const n = await apagarColecao(db, shopRef.collection(nome), restante);
    if (n > 0) apagado[nome] = n;
    restante -= n;
  }

  /* O saldo do estoque acompanha os movimentos que o explicavam. */
  const produtos = await shopRef.collection("products").get();
  if (!produtos.empty) {
    const batch = db.batch();
    for (const p of produtos.docs) batch.update(p.ref, { stock: 0 });
    await batch.commit();
  }

  const depois = await contarMovimento(shopRef);

  return {
    modo: "executado" as const,
    apagado,
    total: Object.values(apagado).reduce((s, n) => s + n, 0),
    /* Maior que zero quando o teto foi atingido: a tela precisa poder dizer
     * "ainda sobrou, clique de novo" em vez de afirmar que terminou. */
    sobrou: depois.total,
    produtosZerados: produtos.size,
  };
});
