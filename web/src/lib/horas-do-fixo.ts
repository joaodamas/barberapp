import { horariosDaJornada, jornadaDoDia, type EntradaDeJornada } from "@/lib/jornada";

/**
 * As contas da tela do horário fixo que precisam bater com o servidor
 * (`functions/src/horario-fixo.ts` e `jornadaDoBarbeiro` em `booking.ts`).
 * Puras, para terem teste: a tela oferecer um horário que o servidor recusa foi
 * o defeito de 09/10.
 */

/**
 * Os horários que o fixo pode usar num dia da semana, para UM barbeiro e uma
 * duração.
 *
 * - Jornada do barbeiro quando ele tem uma, senão a da loja — a mesma
 *   precedência do servidor (`jornadaDoBarbeiro`).
 * - A duração é a dos serviços escolhidos: um corte+barba de 60 min não pode
 *   começar meia hora antes do almoço, e o servidor recusa.
 * - SEM as exceções por data: um feriado numa sexta não tira "sexta" da lista
 *   para sempre. A data que não cabe aparece na prévia, semana a semana.
 */
export function horasDoFixo(params: {
  schedule: EntradaDeJornada | null | undefined;
  barbeiro?: { schedule?: EntradaDeJornada | null } | null;
  /** 0 = domingo. */
  weekday: number;
  /** Uma data qualquer desse dia da semana (só alimenta a função de jornada). */
  date: string;
  /** Duração do atendimento, em minutos. Ausente cai na grade. */
  duracao?: number;
}): string[] {
  const loja = params.schedule ?? {};
  const dele = params.barbeiro?.schedule ?? null;
  const efetiva: EntradaDeJornada = {
    weekdays: dele?.weekdays ?? loja.weekdays,
    opensAt: dele?.opensAt ?? loja.opensAt,
    closesAt: dele?.closesAt ?? loja.closesAt,
    breaks: dele?.breaks ?? loja.breaks,
    perDay: dele?.perDay ?? loja.perDay,
    exceptions: [],
  };
  const jornada = jornadaDoDia({ schedule: efetiva, weekday: params.weekday, date: params.date });
  if (!jornada.aberto) return [];
  return horariosDaJornada({
    jornada,
    slotMinutes: Number(dele?.slotMinutes) || Number(loja.slotMinutes) || 30,
    duracao: params.duracao && params.duracao > 0 ? params.duracao : undefined,
  });
}

/** `YYYY-MM-DD` de uma data local. */
function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}

/**
 * A primeira data do fixo: a próxima ocorrência do dia da semana que ainda NÃO
 * passou. Hoje só vale se o horário escolhido ainda não chegou — senão a
 * quinzena começaria numa data que o servidor descarta, e a fase ficaria 14
 * dias atrasada em vez de 7.
 */
export function inicioDoFixo(params: { diaDaSemana: number; hora?: string; agora?: Date }): string {
  const agora = params.agora ?? new Date();
  const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  while (d.getDay() !== params.diaDaSemana) d.setDate(d.getDate() + 1);
  if (params.hora && iso(d) === iso(agora)) {
    const [h, m] = params.hora.split(":").map(Number);
    const instante = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);
    if (instante.getTime() <= agora.getTime()) d.setDate(d.getDate() + 7);
  }
  return iso(d);
}

/**
 * Quantas ocorrências do fixo a remoção libera: as que o servidor cancela
 * (`liberarOcorrenciasFuturas`) — em aberto, ainda no futuro e NÃO remarcadas
 * pelo cliente, que ficam como horário dele.
 */
export function contarLiberaveis(
  reservas: Array<{ status?: unknown; date?: unknown; time?: unknown; rescheduledFrom?: unknown; origemDoFixo?: unknown }>,
  agora: Date = new Date()
): number {
  return reservas.filter((r) => {
    if (!["confirmed", "confirmed_by_client"].includes(String(r.status ?? ""))) return false;
    if (r.rescheduledFrom || r.origemDoFixo) return false;
    if (typeof r.date !== "string" || typeof r.time !== "string") return false;
    return new Date(`${r.date}T${r.time}:00`).getTime() > agora.getTime();
  }).length;
}
