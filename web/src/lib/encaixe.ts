import { horariosDaJornada, jornadaDoDia, paraMinutos, type EntradaDeJornada } from "@/lib/jornada";
import { OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * O que o barbeiro precisa saber para decidir um encaixe.
 *
 * "O horário já está ocupado" não basta (28/09): um encaixe de 30 min dentro
 * de um corte de 90 é uma coisa; um de 90 min em cima de três clientes é
 * outra. A tela mostra COM QUEM o pedido bate e que horários o mesmo dia ainda
 * tem livres — para o barbeiro aprovar, ou recusar oferecendo um horário.
 *
 * Mesma conta de ocupação do resto do produto: janela [início, início +
 * duração), por cadeira; reserva sem duração ocupa a grade.
 */

type Reserva = Pick<BookingDoc, "date" | "time" | "status" | "staffId" | "durationMin">;

function janela(r: Pick<BookingDoc, "time" | "durationMin">, grade: number) {
  const ini = paraMinutos(r.time);
  if (ini === null) return null;
  return [ini, ini + (Number(r.durationMin) || grade)] as const;
}

const mesmaCadeira = (a?: string, b?: string) => (a ?? "") === (b ?? "");

/** As reservas que ocupam a cadeira no trecho que o encaixe pede. */
export function conflitosDoEncaixe<R extends Reserva>(pedido: Reserva, todas: R[], grade: number): R[] {
  const alvo = janela(pedido, grade);
  if (!alvo) return [];
  return todas
    .filter(
      (b) =>
        b !== (pedido as unknown) &&
        b.date === pedido.date &&
        mesmaCadeira(b.staffId, pedido.staffId) &&
        OCCUPIES_SLOT.includes(b.status)
    )
    .filter((b) => {
      const j = janela(b, grade);
      return !!j && j[0] < alvo[1] && alvo[0] < j[1];
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

/** Horários em que a MESMA duração cabe livre, no mesmo dia e na mesma cadeira. */
export function livresNoDia(params: {
  schedule: EntradaDeJornada | null | undefined;
  date: string;
  staffId?: string;
  duracao: number;
  todas: Reserva[];
  /** "HH:mm" de agora, quando a data é hoje — horário que passou não é oferta. */
  agora?: string;
}): string[] {
  const grade = Number(params.schedule?.slotMinutes) || 30;
  const jornada = jornadaDoDia({
    schedule: params.schedule,
    weekday: new Date(`${params.date}T12:00:00`).getDay(),
    date: params.date,
  });
  if (!jornada.aberto) return [];
  const agoraMin = params.agora ? paraMinutos(params.agora) : null;
  const ocupadas = params.todas
    .filter(
      (b) =>
        b.date === params.date &&
        mesmaCadeira(b.staffId, params.staffId) &&
        OCCUPIES_SLOT.includes(b.status)
    )
    .map((b) => janela(b, grade))
    .filter(Boolean) as Array<readonly [number, number]>;

  return horariosDaJornada({ jornada, slotMinutes: grade, duracao: params.duracao }).filter((h) => {
    const t = paraMinutos(h) as number;
    if (agoraMin !== null && t < agoraMin) return false;
    return !ocupadas.some(([de, ate]) => t < ate && de < t + params.duracao);
  });
}

export type ReservaDoc = Doc<BookingDoc>;
