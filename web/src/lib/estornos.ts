import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc, RefundDoc } from "@/lib/domain";
import { contarDeTotal } from "@/lib/plural";

/**
 * O que a tela precisa saber para oferecer um estorno — D22 / D23.
 *
 * Tudo aqui é DERIVADO dos fatos. Nenhuma função deste arquivo decide quanto
 * pode ser devolvido: ela mostra o que os documentos já dizem, e a decisão real
 * acontece no servidor, dentro da transação, contra a leitura daquele instante.
 *
 * Isso não é redundância: a tela precisa desabilitar o botão de uma venda já
 * totalmente devolvida, e o servidor precisa recusar duas devoluções
 * simultâneas. Uma é ergonomia, a outra é integridade — e a régua da rodada é
 * que a segunda nunca dependa da primeira.
 */

export type VendaEstornavel = {
  movementId: string;
  productId: string;
  date: string;
  /** Unidades da venda original. */
  quantidade: number;
  /** Quantas já voltaram para a prateleira. */
  devolvida: number;
  /** Quantas ainda podem voltar. */
  resta: number;
  unitPrice: number;
  /** Valor da venda original. */
  valor: number;
  /** Valor ainda estornável — `unitPrice × resta`. */
  valorRestante: number;
  staffId: string | null;
  paymentMethod: string | null;
  clientId: string | null;
  /**
   * O carrinho a que esta linha pertence. Uma venda de vários produtos grava um
   * movimento por produto com id `venda_<chave>_<productId>`: as linhas do
   * mesmo carrinho dividem a `<chave>`. Venda antiga (id sorteado) é carrinho
   * de uma linha só.
   */
  carrinho: string;
  /** Já devolvida por inteiro. */
  encerrada: boolean;
};

/**
 * A chave do carrinho de um movimento de venda.
 *
 * Deriva do id, e não de `assinaturaDoPedido`: dois carrinhos iguais (mesmos
 * itens, forma, cliente e vendedor) têm a mesma assinatura e são vendas
 * diferentes.
 */
export function carrinhoDe(movementId: string, productId: string): string {
  const prefixo = "venda_";
  const sufixo = `_${productId}`;
  if (
    movementId.startsWith(prefixo) &&
    movementId.endsWith(sufixo) &&
    movementId.length > prefixo.length + sufixo.length
  ) {
    return movementId.slice(prefixo.length, movementId.length - sufixo.length);
  }
  return movementId;
}

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * Quanto já foi devolvido de cada venda.
 *
 * Indexa por `movementId` em vez de `paymentId` porque é o movimento que a tela
 * lista. Os dois apontam para o mesmo fato — o `paymentId` de uma venda deriva
 * do movimento —, mas depender da convenção de id aqui obrigaria a tela a
 * reimplementar `idDoPagamento`, e uma mudança lá quebraria isto em silêncio.
 */
export function devolucoesPorVenda(refunds: Doc<RefundDoc>[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const r of refunds) {
    if (r.origin !== "produto" || !r.movementId) continue;
    mapa.set(r.movementId, (mapa.get(r.movementId) ?? 0) + (Number(r.quantity) || 0));
  }
  return mapa;
}

/**
 * As vendas que ainda podem ser desfeitas, mais recentes primeiro.
 *
 * Vendas totalmente devolvidas continuam na lista, marcadas como `encerrada`.
 * Sumir com elas esconderia justamente o que o dono quer conferir depois de
 * devolver — e faria a tela parecer que a venda nunca existiu, que é a mesma
 * classe de erro do `delete` que a rodada recusa.
 */
export function vendasEstornaveis(params: {
  movimentos: Doc<InventoryMovementDoc>[];
  refunds: Doc<RefundDoc>[];
  /** Quantas mostrar. O balcão não precisa de paginação; precisa das últimas. */
  limite?: number;
  /** "Ver todas": só as vendas deste produto. */
  produtoId?: string | null;
  /** "Ver todas": só as vendas deste mês (`YYYY-MM`). */
  mes?: string | null;
}): VendaEstornavel[] {
  const devolvidas = devolucoesPorVenda(params.refunds);

  return params.movimentos
    .filter((m) => m.kind === "venda")
    .filter((m) => !params.produtoId || m.productId === params.produtoId)
    .filter((m) => !params.mes || String(m.date ?? "").startsWith(params.mes))
    .map((m) => {
      const quantidade = Number(m.quantity) || 0;
      const devolvida = devolvidas.get(m.id) ?? 0;
      const resta = Math.max(quantidade - devolvida, 0);
      const unitPrice = Number(m.unitPrice) || 0;

      return {
        movementId: m.id,
        productId: m.productId,
        date: m.date,
        quantidade,
        devolvida,
        resta,
        unitPrice,
        valor: centavos(unitPrice * quantidade),
        valorRestante: centavos(unitPrice * resta),
        staffId: m.staffId ?? null,
        paymentMethod: m.paymentMethod ?? null,
        clientId: m.clientId ?? null,
        carrinho: carrinhoDe(m.id, m.productId),
        encerrada: resta === 0,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, params.limite ?? 12);
}

/**
 * Quanto já foi devolvido de um fato qualquer — serviço, produto ou mensalidade.
 *
 * Casa pelo campo de referência da própria origem, e não pelo `paymentId`, pelo
 * mesmo motivo de `devolucoesPorVenda`: a tela não deve reimplementar a
 * convenção de id do servidor para descobrir o que já aconteceu.
 */
export function estornadoDe(
  refunds: Doc<RefundDoc>[],
  origem: RefundDoc["origin"],
  refId: string
): number {
  const campo =
    origem === "servico" ? "bookingId" : origem === "produto" ? "movementId" : "invoiceId";

  return centavos(
    refunds
      .filter((r) => r.origin === origem && r[campo] === refId)
      .reduce((s, r) => s + (Number(r.grossAmount) || 0), 0)
  );
}

/**
 * A frase que descreve o estado de uma venda na lista.
 *
 * Separada da tela porque é uma AFIRMAÇÃO sobre dinheiro, e afirmação sobre
 * dinheiro tem de ser testável sem renderizar nada.
 */
export function situacaoDaVenda(v: VendaEstornavel): string {
  if (v.devolvida === 0) return "";
  if (v.encerrada) return "Devolvida por inteiro";
  /* Na forma "X de Y", quem manda na concordância é o TOTAL, não a parte — e
   * era a parte que mandava aqui, num ternário `devolvida > 1 ? "s" : ""`. Com
   * 1 devolvida de 3 a Loja escrevia "1 de 3 devolvida", concordando com o 1 e
   * ignorando as 3 unidades de que ele fala.
   *
   * `contarDeTotal` foi escrita para exatamente este caso e já existia quando
   * esta linha foi escrita. O ternário inline é o anti-padrão que o
   * `plural.ts` existe para eliminar, e ele reapareceu dentro do arquivo da
   * mesma equipe que escreveu a regra — por isso a trava agora é de FONTE
   * (`concordancia.test.ts`), e não só de valor. */
  return contarDeTotal(v.devolvida, v.quantidade, "devolvida", "devolvidas");
}
