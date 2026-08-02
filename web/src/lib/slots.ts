import { bookingPolicy, isOpenOn } from "@/lib/business-rules";
import { toISODate } from "@/lib/format";
import type { TimeSlot } from "@/lib/types";

/**
 * Motor de slots.
 *
 * A tela de Agendar oferecia 10 dias corridos com grade cheia: incluía domingo
 * (fechado), permitia marcar 09:00 às 18h do mesmo dia e ignorava a duração
 * total dos serviços — dava para pegar 60 min no último horário da jornada.
 */

/** Jornada padrão da barbearia (mesma grade do mock original). */
export const WORKDAY_TIMES = [
  "09:00", "09:30", "10:00", "10:30", "11:00",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00",
];

export type BookableDay = {
  date: Date;
  iso: string;
  /** Fechado (domingo) ou fora da janela de antecedência máxima. */
  disabled: boolean;
  reason?: "fechado" | "fora_da_janela";
};

/** Próximos dias oferecidos, já marcando os que não são agendáveis. */
export function bookableDays(from: Date = new Date()): BookableDay[] {
  const days: BookableDay[] = [];
  const maxDate = new Date(from);
  maxDate.setDate(from.getDate() + bookingPolicy.maxAdvanceDays);

  for (let i = 0; days.length < bookingPolicy.visibleDays; i++) {
    const date = new Date(from);
    date.setDate(from.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const closed = !isOpenOn(date);
    const outOfWindow = date > maxDate;
    days.push({
      date,
      iso: toISODate(date),
      disabled: closed || outOfWindow,
      reason: closed ? "fechado" : outOfWindow ? "fora_da_janela" : undefined,
    });

    // Trava de segurança: nunca varrer mais que o horizonte permitido.
    if (i > bookingPolicy.maxAdvanceDays) break;
  }
  return days;
}

/** Índices já ocupados naquele dia — determinístico a partir da DATA, não do
 *  índice do dia na lista (antes "amanhã" tinha sempre a mesma ocupação). */
function occupiedIndexesFor(iso: string) {
  const seed = Number(iso.replaceAll("-", "")) % 97;
  const total = WORKDAY_TIMES.length;
  return new Set([
    (seed * 2 + 2) % total,
    (seed * 3 + 4) % total,
    (seed * 5 + 7) % total,
  ]);
}

export type SlotOptions = {
  /** Duração total dos serviços escolhidos, em minutos. */
  durationMin?: number;
  /** Momento de referência — injetável para teste. */
  now?: Date;
  /** Horários ocupados podem ser oferecidos como pedido de encaixe. */
  allowFitIn?: boolean;
};

/**
 * Slots de um dia, já filtrados por antecedência mínima e por caber a duração
 * total dos serviços dentro da jornada sem colidir com horário ocupado.
 */
export function slotsForDate(iso: string, options: SlotOptions = {}): TimeSlot[] {
  const { durationMin = bookingPolicy.slotMinutes, now = new Date(), allowFitIn = true } = options;

  const occupied = occupiedIndexesFor(iso);
  const slotsNeeded = Math.max(1, Math.ceil(durationMin / bookingPolicy.slotMinutes));
  const earliest = new Date(now.getTime() + bookingPolicy.minAdvanceMinutes * 60_000);

  return WORKDAY_TIMES.map((time, index) => {
    const start = new Date(`${iso}T${time}:00`);

    // Antecedência mínima: horário que já passou (ou passa em menos de 1h) some.
    if (start < earliest) {
      return { time, available: false };
    }

    // A duração precisa caber: todos os slots consecutivos livres e contíguos.
    const fits = fitsDuration(index, slotsNeeded, occupied);
    if (!fits.ok) {
      return {
        time,
        available: false,
        // Só vira encaixe se o impedimento for ocupação, não fim de jornada.
        isFitIn: allowFitIn && fits.reason === "ocupado",
      };
    }

    return { time, available: true };
  });
}

function fitsDuration(startIndex: number, slotsNeeded: number, occupied: Set<number>) {
  if (startIndex + slotsNeeded > WORKDAY_TIMES.length) {
    return { ok: false, reason: "fim_da_jornada" as const };
  }

  for (let i = 0; i < slotsNeeded; i++) {
    const index = startIndex + i;
    if (occupied.has(index)) {
      return { ok: false, reason: "ocupado" as const };
    }
    // Os slots precisam ser contíguos no relógio — 11:00 e 14:00 são vizinhos
    // na lista, mas há um intervalo de almoço entre eles.
    if (i > 0 && !isContiguous(WORKDAY_TIMES[index - 1], WORKDAY_TIMES[index])) {
      return { ok: false, reason: "fim_da_jornada" as const };
    }
  }
  return { ok: true as const, reason: undefined };
}

function isContiguous(previous: string, next: string) {
  return toMinutes(next) - toMinutes(previous) === bookingPolicy.slotMinutes;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
