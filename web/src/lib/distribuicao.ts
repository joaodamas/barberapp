/**
 * "Qualquer barbeiro" do lado da tela (05/10).
 *
 * Só o que a tela precisa: o valor que vai no lugar do id do barbeiro, a regra
 * gravada e como explicá-la ao dono. Quem ESCOLHE o barbeiro é o servidor, na
 * transação que trava o horário (`functions/src/distribuicao.ts`) — por isso a
 * conta não existe aqui e não há paridade a manter.
 */

export type RegraDeDistribuicao = "equilibrio" | "rodizio" | "prioridade";

/** Vai no lugar do id do barbeiro em `availableSlots` e `createBooking`. */
export const QUALQUER_BARBEIRO = "qualquer";

export const REGRAS: Array<{ id: RegraDeDistribuicao; titulo: string; explicacao: string }> = [
  {
    id: "equilibrio",
    titulo: "Equilíbrio do dia",
    explicacao: "Vai para quem está livre e atendeu menos no dia. Divide o movimento por igual.",
  },
  {
    id: "rodizio",
    titulo: "Rodízio",
    explicacao: "Um de cada vez, na ordem da equipe. Quem está ocupado é pulado e a vez passa para o próximo.",
  },
  {
    id: "prioridade",
    titulo: "Ordem de preferência",
    explicacao: "Vai para o primeiro livre da lista abaixo. Use para encher primeiro a agenda de quem você escolher.",
  },
];

/** A regra gravada, ou o padrão. */
export function regraDe(valor: unknown): RegraDeDistribuicao {
  return REGRAS.some((r) => r.id === valor) ? (valor as RegraDeDistribuicao) : "equilibrio";
}

function ordemDe(order: unknown): number {
  /* `Number(null)` é 0: sem esta guarda, o barbeiro sem ordem ia para o topo. */
  if (order === null || order === undefined || order === "") return Number.MAX_SAFE_INTEGER;
  const n = Number(order);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Barbeiros na ordem do dono; sem `order`, no fim. Empate, pelo id — o MESMO
 * desempate de `porOrdem` em `functions/src/distribuicao.ts` (08/10).
 *
 * Desempatava pelo nome, e o servidor pelo id: com dois `order` iguais a tela
 * de Ajustes mostrava uma fila e a "Ordem de preferência" escolhia por outra.
 * O id não muda quando o dono renomeia e nunca empata.
 */
export function emOrdem<B extends { id: string; order?: number | null }>(equipe: B[]): B[] {
  return [...equipe].sort(
    (a, b) => ordemDe(a.order) - ordemDe(b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/**
 * O `order` de quem entra na equipe: depois do maior que existe (08/10).
 *
 * Era `equipe.length + 1`: com três barbeiros (1, 2, 3), remover o 2 e
 * adicionar outro gravava 3 de novo — dois barbeiros na mesma posição, e a
 * fila dependia só do desempate.
 */
export function proximaOrdem(equipe: Array<{ order?: number | null }>): number {
  let maior = 0;
  for (const b of equipe) {
    const n = ordemDe(b.order);
    if (n !== Number.MAX_SAFE_INTEGER && n > maior) maior = n;
  }
  return Math.floor(maior) + 1;
}

/** Troca de lugar o barbeiro `i` com o vizinho (`-1` sobe, `1` desce). */
export function mover<T>(lista: T[], i: number, direcao: -1 | 1): T[] {
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}
