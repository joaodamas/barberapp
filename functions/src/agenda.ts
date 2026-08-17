/**
 * Ocupação da agenda — a conta que decide se duas reservas colidem.
 *
 * Existe porque essa conta estava escrita TRÊS vezes, das três maneiras erradas,
 * e nenhuma delas olhava a duração:
 *
 * - `availableSlots` montava um `Set` com o HORÁRIO DE INÍCIO das reservas;
 * - `createBooking` procurava conflito com `where("time", "==", time)`;
 * - `rescheduleBooking` fazia o mesmo.
 *
 * O efeito é uma cadeira com dois clientes ao mesmo tempo, pelo caminho normal
 * do produto e com o catálogo que toda barbearia recebe ao nascer: "Corte +
 * barba" dura 60 min e a grade é de 30. Um atendimento das 15:00 às 16:00
 * ocupava, para efeito de conflito, apenas o instante "15:00" — então 15:30
 * continuava sendo oferecido, e a transação que deveria barrar não via nada.
 *
 * Aqui a unidade deixa de ser o INSTANTE e passa a ser a JANELA. É a mesma
 * lógica que `availability.ts` já usava para o intervalo de almoço — a agenda
 * só não a aplicava a si mesma.
 *
 * Módulo puro de propósito: dentro do `onCall` isto só se exercia com emulador,
 * autenticação e reserva semeada, que é exatamente o motivo de nunca ter sido
 * exercido.
 */

/** Um trecho ocupado de UMA cadeira, em minutos desde a meia-noite. */
export type Janela = {
  inicio: number;
  /** Exclusivo: uma reserva que termina às 11:00 não ocupa as 11:00. */
  fim: number;
};

/** Reserva, no mínimo que esta conta precisa saber. */
export type ReservaOcupante = {
  time: string;
  /** Ausente nas reservas criadas antes de o campo existir. */
  durationMin?: number | null;
};

export const paraMinutos = (hhmm: string): number => {
  const [h, m] = String(hhmm).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return NaN;
  return h * 60 + m;
};

export const paraHora = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Janela que uma reserva ocupa.
 *
 * `duracaoPadrao` cobre a reserva antiga, gravada antes de `durationMin`
 * existir. Assumir a grade é a suposição conservadora: erra para menos em um
 * combo antigo, e errar para MAIS bloquearia horário que a barbearia pode
 * vender. Devolve `null` para horário ilegível — dado corrompido não deve
 * derrubar a agenda inteira, e quem chama decide o que fazer.
 */
export function janelaDaReserva(
  reserva: ReservaOcupante,
  duracaoPadrao: number
): Janela | null {
  const inicio = paraMinutos(reserva.time);
  if (!Number.isFinite(inicio)) return null;

  const bruta = Number(reserva.durationMin);
  const duracao = Number.isFinite(bruta) && bruta > 0 ? bruta : duracaoPadrao;

  return { inicio, fim: inicio + duracao };
}

/**
 * Duas janelas dividem algum minuto?
 *
 * Meia-aberto nas duas pontas: 10:00–11:00 e 11:00–11:30 se ENCOSTAM e não se
 * sobrepõem — é o caso mais comum de uma agenda cheia, e tratá-lo como conflito
 * apagaria metade dos horários vendáveis.
 */
export function seSobrepoem(a: Janela, b: Janela): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/** A janela candidata está livre de todas as ocupadas? */
export function janelaLivre(candidata: Janela, ocupadas: Janela[]): boolean {
  return !ocupadas.some((ocupada) => seSobrepoem(candidata, ocupada));
}

/**
 * Janelas ocupadas de uma lista de reservas.
 *
 * Reserva com horário ilegível é DESCARTADA, e não tratada como ocupando o dia
 * inteiro: um documento corrompido não pode derrubar a agenda de uma barbearia.
 */
export function janelasOcupadas(
  reservas: ReservaOcupante[],
  duracaoPadrao: number
): Janela[] {
  return reservas
    .map((r) => janelaDaReserva(r, duracaoPadrao))
    .filter((j): j is Janela => j !== null);
}

/**
 * O horário candidato cabe, considerando tudo que já está marcado?
 *
 * Atalho para o caminho mais comum: monta a janela e testa contra as ocupadas.
 */
export function horarioDisponivel(params: {
  time: string;
  durationMin: number;
  ocupadas: Janela[];
}): boolean {
  const candidata = janelaDaReserva(
    { time: params.time, durationMin: params.durationMin },
    params.durationMin
  );
  if (!candidata) return false;
  return janelaLivre(candidata, params.ocupadas);
}
