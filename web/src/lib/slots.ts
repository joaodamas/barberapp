import { bookingPolicy } from "@/lib/business-rules";
import { horariosDaJornada } from "@/lib/analytics";
import { parseISODate, toISODate } from "@/lib/format";
import { DEFAULT_SCHEDULE, type TenantSchedule } from "@/lib/tenant";
import type { TimeSlot } from "@/lib/types";

/**
 * Motor de slots.
 *
 * A tela de Agendar oferecia 10 dias corridos com grade cheia: incluía domingo
 * (fechado), permitia marcar 09:00 às 18h do mesmo dia e ignorava a duração
 * total dos serviços — dava para pegar 60 min no último horário da jornada.
 */

/**
 * A grade de horários agora vem da jornada da barbearia, não de uma constante.
 * Cada tenant abre e fecha na hora dele, com o próprio intervalo.
 */
export function workdayTimes(schedule: TenantSchedule = DEFAULT_SCHEDULE) {
  return horariosDaJornada(schedule);
}

function isOpenOnSchedule(date: Date, schedule: TenantSchedule) {
  return schedule.weekdays.includes(date.getDay());
}

export type BookableDay = {
  date: Date;
  iso: string;
  /** Fechado (domingo) ou fora da janela de antecedência máxima. */
  disabled: boolean;
  reason?: "fechado" | "fora_da_janela";
};

/** Próximos dias oferecidos, já marcando os que não são agendáveis. */
export function bookableDays(
  from: Date = new Date(),
  schedule: TenantSchedule = DEFAULT_SCHEDULE
): BookableDay[] {
  const days: BookableDay[] = [];
  const maxDate = new Date(from);
  maxDate.setDate(from.getDate() + bookingPolicy.maxAdvanceDays);

  for (let i = 0; days.length < bookingPolicy.visibleDays; i++) {
    const date = new Date(from);
    date.setDate(from.getDate() + i);
    date.setHours(0, 0, 0, 0);

    const closed = !isOpenOnSchedule(date, schedule);
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
function occupiedIndexesFor(iso: string, ocupados: string[], horarios: string[]) {
  /* A ocupação agora vem das reservas reais. O padrão determinístico só
   * sobrevive para quem chamar sem passar reservas — telas de demonstração. */
  if (ocupados.length > 0) {
    return new Set(ocupados.map((h) => horarios.indexOf(h)).filter((i) => i >= 0));
  }
  return new Set<number>();
}

export type SlotOptions = {
  /** Duração total dos serviços escolhidos, em minutos. */
  durationMin?: number;
  /** Momento de referência — injetável para teste. */
  now?: Date;
  /** Horários ocupados podem ser oferecidos como pedido de encaixe. */
  allowFitIn?: boolean;
  /** Jornada da barbearia. Sem ela, cai no padrão da plataforma. */
  schedule?: TenantSchedule;
  /** Horários já tomados naquele dia (`HH:mm`), vindos das reservas. */
  ocupados?: string[];
};

/**
 * Slots de um dia, já filtrados por antecedência mínima e por caber a duração
 * total dos serviços dentro da jornada sem colidir com horário ocupado.
 */
export function slotsForDate(iso: string, options: SlotOptions = {}): TimeSlot[] {
  const {
    now = new Date(),
    allowFitIn = true,
    schedule = DEFAULT_SCHEDULE,
    ocupados = [],
  } = options;
  const durationMin = options.durationMin || schedule.slotMinutes;
  const horarios = workdayTimes(schedule);

  /* Defesa em profundidade: a tela já esconde dia fechado, mas quem chamar
   * direto não deve receber horário nenhum num domingo. */
  if (!isOpenOnSchedule(parseISODate(iso), schedule)) {
    return horarios.map((time) => ({ time, available: false }));
  }

  const occupied = occupiedIndexesFor(iso, ocupados, horarios);
  const slotsNeeded = Math.max(1, Math.ceil(durationMin / schedule.slotMinutes));
  const earliest = new Date(now.getTime() + bookingPolicy.minAdvanceMinutes * 60_000);

  return horarios.map((time, index) => {
    const start = new Date(`${iso}T${time}:00`);

    // Antecedência mínima: horário que já passou (ou passa em menos de 1h) some.
    if (start < earliest) {
      return { time, available: false };
    }

    // A duração precisa caber: todos os slots consecutivos livres e contíguos.
    const fits = fitsDuration(index, slotsNeeded, occupied, horarios, schedule);
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

function fitsDuration(
  startIndex: number,
  slotsNeeded: number,
  occupied: Set<number>,
  horarios: string[],
  schedule: TenantSchedule
) {
  if (startIndex + slotsNeeded > horarios.length) {
    return { ok: false, reason: "fim_da_jornada" as const };
  }

  for (let i = 0; i < slotsNeeded; i++) {
    const index = startIndex + i;
    if (occupied.has(index)) {
      return { ok: false, reason: "ocupado" as const };
    }
    // Os slots precisam ser contíguos no relógio — 11:00 e 14:00 são vizinhos
    // na lista, mas há um intervalo de almoço entre eles.
    if (i > 0 && !isContiguous(horarios[index - 1], horarios[index], schedule.slotMinutes)) {
      return { ok: false, reason: "fim_da_jornada" as const };
    }
  }
  return { ok: true as const, reason: undefined };
}

function isContiguous(previous: string, next: string, slotMinutes: number) {
  return toMinutes(next) - toMinutes(previous) === slotMinutes;
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Índice do primeiro dia realmente agendável.
 *
 * O seletor iniciava em 0 — e quando "hoje" cai num domingo, a tela abria já
 * num dia fechado, sem horário nenhum e sem o usuário ter escolhido nada.
 */
export function firstBookableIndex(days: BookableDay[]) {
  const index = days.findIndex((d) => !d.disabled);
  return index === -1 ? 0 : index;
}
