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

/** Barbeiros na ordem do dono; sem `order`, no fim, por nome. */
export function emOrdem<B extends { order?: number; name: string }>(equipe: B[]): B[] {
  const ordem = (b: B) => (Number.isFinite(Number(b.order)) ? Number(b.order) : Number.MAX_SAFE_INTEGER);
  return [...equipe].sort((a, b) => ordem(a) - ordem(b) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Troca de lugar o barbeiro `i` com o vizinho (`-1` sobe, `1` desce). */
export function mover<T>(lista: T[], i: number, direcao: -1 | 1): T[] {
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[j]] = [nova[j], nova[i]];
  return nova;
}
