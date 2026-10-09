/**
 * Contas puras da barra de ferramentas da Agenda e do Hoje.
 *
 * Sem React: entra número, sai texto ou medida. O motivo de existirem aqui é
 * que cada uma delas decide algo que, errado, faz a tela "pular" — o rótulo do
 * contador de pedidos (largura reservada), a largura das colunas da grade (o
 * conteúdo não pode esticar nem encolher com o filtro) e o teclado dos chips.
 */

/** O contador de pedidos de encaixe. Zero é texto esmaecido, não ausência. */
export function rotuloDosPedidos(n: number): string {
  if (n <= 0) return "Sem pedidos";
  return n === 1 ? "1 pedido de encaixe" : `${n} pedidos de encaixe`;
}

/**
 * Larguras das trilhas da grade conforme quantas colunas de barbeiro há.
 *
 * - 1 coluna: confortável (35rem ≈ 560px), nunca esticada na tela toda;
 * - 2 a 3: entre 10rem e 22rem, para não ficarem nem espremidas nem gigantes;
 * - 4 ou mais: dividem o espaço (com mínimo, e a grade rola na horizontal).
 *
 * `contida` diz se o quadro da grade deve abraçar o conteúdo (`w-fit`) em vez
 * de ocupar a largura inteira.
 */
export function medidasDasColunas(nColunas: number): { trilha: string; pedidos: string; contida: boolean } {
  if (nColunas <= 1) return { trilha: "minmax(0, 35rem)", pedidos: "minmax(10rem, 16rem)", contida: true };
  if (nColunas <= 3) return { trilha: "minmax(10rem, 22rem)", pedidos: "minmax(10rem, 16rem)", contida: true };
  return { trilha: "minmax(7rem, 1fr)", pedidos: "minmax(0, 0.9fr)", contida: false };
}

/**
 * O chip que o teclado escolhe: ← e → andam entre os chips sem dar a volta
 * (no fim, ficam onde estão); Home e End vão às pontas. Devolve o índice.
 */
export function proximoChip(total: number, atual: number, tecla: string): number {
  if (total <= 0) return 0;
  const limite = total - 1;
  switch (tecla) {
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(0, atual - 1);
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(limite, atual + 1);
    case "Home":
      return 0;
    case "End":
      return limite;
    default:
      return atual;
  }
}

/**
 * O filtro depois de um clique num chip. Clicar no que já está selecionado não
 * muda nada — em particular NÃO volta para "Todos"; só o chip "Todos" faz isso.
 */
export function filtroAposClique(atual: string | null, clicado: string | null): string | null {
  return clicado === atual ? atual : clicado;
}
