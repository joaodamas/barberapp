import { horariosDaJornada, jornadaDoDia, type EntradaDeJornada } from "@/lib/jornada";
import { EM_ABERTO } from "@/lib/domain";

/**
 * O que mudar a jornada semanal faz com quem JÁ marcou (09/10).
 *
 * As exceções de agenda avisam ("já há 3 horários nesse dia"); mudar a semana
 * não avisava: o dono tirava o sábado da jornada, salvava, e as reservas e os
 * horários fixos de sábado continuavam de pé, no app do cliente e na agenda,
 * sem ninguém saber que agora estavam fora do expediente.
 *
 * Conta só o que CABIA na jornada antiga e não cabe na nova: o atendimento que
 * o balcão lançou fora do expediente de propósito já estava fora, e não é
 * consequência desta mudança.
 */

type Reserva = { staffId?: string; date: string; time: string; durationMin?: number; status: string };
type Fixo = { staffId: string; diaDaSemana: number; hora: string; duracao: number };

function diaDaSemanaDe(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

/** O horário cabe na jornada, com a duração do atendimento. */
export function cabeNaJornada(
  schedule: EntradaDeJornada,
  params: { date: string; time: string; duracao?: number }
): boolean {
  const jornada = jornadaDoDia({ schedule, weekday: diaDaSemanaDe(params.date), date: params.date });
  if (!jornada.aberto) return false;
  return horariosDaJornada({
    jornada,
    slotMinutes: Number(schedule.slotMinutes) || 30,
    duracao: params.duracao && params.duracao > 0 ? params.duracao : undefined,
  }).includes(params.time);
}

export function impactoDaJornada(params: {
  antes: EntradaDeJornada;
  depois: EntradaDeJornada;
  reservas: Reserva[];
  fixos: Fixo[];
  /** Hoje, `YYYY-MM-DD`. */
  hoje: string;
  /** Quem tem jornada própria não é afetado pela da loja. */
  temJornadaPropria: (staffId: string | undefined) => boolean;
}): { reservas: number; fixos: number } {
  const reservas = params.reservas.filter((r) => {
    if (!EM_ABERTO.includes(r.status as never) || r.date < params.hoje) return false;
    if (params.temJornadaPropria(r.staffId)) return false;
    const p = { date: r.date, time: r.time, duracao: r.durationMin };
    return cabeNaJornada(params.antes, p) && !cabeNaJornada(params.depois, p);
  }).length;

  /* O fixo é por dia da semana, sem data: avalia sem as exceções, que são de
   * uma data só. */
  const semExcecoes = (s: EntradaDeJornada): EntradaDeJornada => ({ ...s, exceptions: [] });
  const fixos = params.fixos.filter((f) => {
    if (params.temJornadaPropria(f.staffId)) return false;
    // Uma data qualquer do dia da semana: a de referência é só para a função de jornada.
    const base = new Date(`${params.hoje}T12:00:00`);
    while (base.getDay() !== f.diaDaSemana) base.setDate(base.getDate() + 1);
    const d = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
    const p = { date: d, time: f.hora, duracao: f.duracao };
    return cabeNaJornada(semExcecoes(params.antes), p) && !cabeNaJornada(semExcecoes(params.depois), p);
  }).length;

  return { reservas, fixos };
}
