import type { FichaDoCliente } from "@/lib/ficha-do-cliente";

/**
 * Os recortes da lista de Clientes.
 *
 * "Sumidos" é o recorte que o dono usa para agir: quem já veio e não volta há
 * 30 dias ou mais. Quem NUNCA foi atendido não é "sumido" — não há de onde
 * sumir (cadastro criado por reserva futura, por exemplo) — e entra só em
 * "Todos".
 */
export type FiltroDeClientes = "todos" | "sumidos" | "mensalistas";

export const DIAS_PARA_SUMIDO = 30;

export const ROTULO_DO_FILTRO: Record<FiltroDeClientes, string> = {
  todos: "Todos",
  sumidos: `Sumidos (${DIAS_PARA_SUMIDO}+ dias)`,
  mensalistas: "Mensalistas",
};

export function filtrarFichas<
  T extends Pick<FichaDoCliente, "diasSemVir" | "mensalista">
>(fichas: readonly T[], filtro: FiltroDeClientes): T[] {
  switch (filtro) {
    case "sumidos":
      return fichas.filter((f) => f.diasSemVir !== null && f.diasSemVir >= DIAS_PARA_SUMIDO);
    case "mensalistas":
      return fichas.filter((f) => f.mensalista !== null);
    default:
      return [...fichas];
  }
}
