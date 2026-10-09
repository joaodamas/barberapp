import type { BookingDoc } from "@/lib/domain";

/**
 * O que a agenda do BARBEIRO sabe sobre plano, olhando só para o horário.
 *
 * Desde 08/10 as regras não deixam o barbeiro ler `subscriptions` (preço e
 * vencimento de todo mensalista da casa), então a etiqueta do dono —
 * `useMensalistasAtivos` — não existe aqui. Sobra o que está NA RESERVA:
 *
 * - `cobertura.tipo === "plano"`: o servidor já liquidou pelo plano (fato);
 * - `horarioFixoId` / `origin: "fixo"`: a reserva nasceu do horário fixo, que
 *   só existe para mensalista.
 *
 * O mensalista que marcou pelo app não é identificável aqui — a tela não
 * afirma o que não sabe. Quem decide se ESTE corte entra no plano é o servidor,
 * na conclusão; por isso "fixo" diz "entra no plano, se tiver cota" e não
 * "coberto".
 */
export type MensalistaDoHorario = "coberto" | "fixo" | null;

export function mensalistaDoHorario(
  b: Pick<BookingDoc, "cobertura" | "horarioFixoId" | "origin">
): MensalistaDoHorario {
  if (b.cobertura?.tipo === "plano") return "coberto";
  if (b.horarioFixoId || b.origin === "fixo") return "fixo";
  return null;
}
