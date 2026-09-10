/**
 * Que horas a barbearia abre NAQUELE dia — a régua em um lugar só.
 *
 * ## O que estava faltando
 *
 * `TenantSchedule` guardava **um** `opensAt`/`closesAt` para a semana inteira.
 * O dono da barbearia piloto pediu, na primeira semana de uso:
 *
 * > *"na terça feira desse ano eu tenho compromisso aí eu fecho as 17:30. Ano
 * > que vem vai ser outro dia. (…) Mas se eu quiser travar um dia específico?"*
 *
 * Com uma jornada só, fechar a terça às 17:30 significava fechar **todos** os
 * dias às 17:30 — e o app do cliente passaria a esconder três horas de sábado
 * que a barbearia atende. O sistema oferecendo horário que não existe é o
 * mesmo 🔴 que fez `/painel/horarios` nascer; isto é a segunda metade dele.
 *
 * ## Duas perguntas diferentes, e por isso dois campos
 *
 * | | Pergunta | Campo |
 * |---|---|---|
 * | recorrente | *"toda terça eu fecho mais cedo"* | `perDay[2]` |
 * | pontual | *"dia 15 eu não abro"* | `exceptions` |
 *
 * Só o segundo resolveria o caso dele com ~50 lançamentos à mão, um por terça
 * do ano — e no ano seguinte, quando o compromisso mudar de dia, outros 50.
 * Só o primeiro não cobre feriado nem imprevisto, que é o que mais acontece
 * numa barbearia.
 *
 * ## Precedência, e por que a exceção também ABRE
 *
 * ```
 * exceção da data  >  jornada do dia da semana  >  jornada geral
 * ```
 *
 * Uma exceção sem `closed` **abre** o dia mesmo que ele esteja fora de
 * `weekdays`: é o domingo de véspera de Natal, o feriado em que a barbearia
 * decide atender. Fosse só para fechar, o dono não teria como registrar o dia
 * extra e voltaria a marcar no caderno — que é o lugar de onde este produto
 * está tirando a barbearia.
 *
 * ⚠️ **PAR OBRIGATÓRIO com `functions/src/jornada.ts`.** A mesma decisão roda
 * nos dois lados: aqui para pintar a tela do dono e contar capacidade, lá para
 * decidir o que o cliente pode reservar. Divergir significa a tela oferecer um
 * horário que o servidor recusa — e o cliente lendo "não foi possível" sem
 * motivo visível. Os dois arquivos mudam juntos, sempre.
 */

/** Uma pausa no meio do dia: almoço, ida ao banco, o que for. */
export type PausaDaJornada = { from: string; to: string };

/** Quando abre e quando fecha em UM dia. */
export type JornadaDoDia = {
  opensAt: string;
  closesAt: string;
  breaks: PausaDaJornada[];
};

/**
 * Um dia com regra própria, por data.
 *
 * `closed` ausente e horário ausente = o dia abre no horário normal dele, o
 * que só faz sentido para reabrir um dia da semana fechado. `note` é o que o
 * dono escreve para si mesmo ("feriado", "casamento do primo") e aparece na
 * lista — sem ela, uma data solta em dezembro não se explica em janeiro.
 */
export type ExcecaoDeAgenda = {
  /** ISO `YYYY-MM-DD`, no fuso da barbearia. */
  date: string;
  closed?: boolean;
  opensAt?: string;
  closesAt?: string;
  breaks?: PausaDaJornada[];
  note?: string;
};

/**
 * O que a jornada de um dia é depois de aplicada toda a precedência.
 *
 * `origem` não é enfeite: é o que permite a tela dizer POR QUE o dia está
 * fechado. "A barbearia não abre neste dia" e "Fechado neste dia — feriado"
 * são frases diferentes para o cliente, e a segunda evita que ele conclua que
 * a barbearia fechou as portas.
 */
export type JornadaResolvida =
  | { aberto: false; origem: "semana" | "excecao"; nota?: string }
  | ({ aberto: true; origem: "geral" | "dia" | "excecao"; nota?: string } & JornadaDoDia);

/**
 * O que esta função precisa saber, e nada além.
 *
 * Tipado como parcial de propósito: o chamador do servidor entrega o documento
 * cru do Firestore, onde todo campo pode faltar — inclusive nas barbearias
 * criadas antes de `perDay` e `exceptions` existirem, que são todas as de
 * hoje.
 */
export type EntradaDeJornada = {
  weekdays?: number[];
  opensAt?: string;
  closesAt?: string;
  breaks?: PausaDaJornada[];
  slotMinutes?: number;
  /** Chave = dia da semana (0 = domingo), em string. */
  perDay?: Record<string, Partial<JornadaDoDia> | null | undefined> | null;
  exceptions?: ExcecaoDeAgenda[] | null;
};

export const JORNADA_PADRAO: JornadaDoDia = {
  opensAt: "09:00",
  closesAt: "19:00",
  breaks: [],
};

const DIAS_PADRAO = [1, 2, 3, 4, 5, 6];

/** `null` para horário ilegível — quem chama decide, ninguém quebra a tela. */
export function paraMinutos(hhmm: unknown): number | null {
  const [h, m] = String(hhmm ?? "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function paraHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function pausasValidas(bruto: unknown): PausaDaJornada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((b) => {
      const de = paraMinutos((b as PausaDaJornada)?.from);
      const ate = paraMinutos((b as PausaDaJornada)?.to);
      return de !== null && ate !== null && ate > de;
    })
    .map((b) => ({ from: String(b.from), to: String(b.to) }));
}

/** A exceção daquela data, se houver. A última cadastrada vence. */
export function excecaoDaData(
  excecoes: ExcecaoDeAgenda[] | null | undefined,
  date: string
): ExcecaoDeAgenda | null {
  if (!Array.isArray(excecoes)) return null;
  const achadas = excecoes.filter((e) => e?.date === date);
  return achadas.length > 0 ? achadas[achadas.length - 1] : null;
}

/**
 * A jornada efetiva de uma data — a única função que aplica a precedência.
 *
 * `weekday` chega pronto em vez de ser derivado de `date` porque o dia da
 * semana depende do FUSO da barbearia, e o fuso mora no documento dela
 * (`locale.timeZone`). Derivar aqui com `new Date(date)` daria UTC, e uma
 * barbearia em Manaus veria a segunda-feira começar no domingo à noite.
 */
export function jornadaDoDia(params: {
  schedule: EntradaDeJornada | null | undefined;
  /** 0 = domingo. Calculado no fuso da barbearia. */
  weekday: number;
  /** ISO `YYYY-MM-DD`, no fuso da barbearia. */
  date: string;
}): JornadaResolvida {
  const s = params.schedule ?? {};

  const geral: JornadaDoDia = {
    opensAt: String(s.opensAt ?? JORNADA_PADRAO.opensAt),
    closesAt: String(s.closesAt ?? JORNADA_PADRAO.closesAt),
    breaks: pausasValidas(s.breaks),
  };

  const doDiaDaSemana = s.perDay?.[String(params.weekday)] ?? null;
  const base: JornadaDoDia = doDiaDaSemana
    ? {
        opensAt: String(doDiaDaSemana.opensAt ?? geral.opensAt),
        closesAt: String(doDiaDaSemana.closesAt ?? geral.closesAt),
        breaks: doDiaDaSemana.breaks ? pausasValidas(doDiaDaSemana.breaks) : geral.breaks,
      }
    : geral;

  const excecao = excecaoDaData(s.exceptions, params.date);

  if (excecao) {
    if (excecao.closed) {
      return { aberto: false, origem: "excecao", nota: excecao.note || undefined };
    }
    /* Exceção que não fecha ABRE — inclusive um dia fora de `weekdays`. É o
     * feriado em que a barbearia decide atender. O que ela não disser, herda
     * do dia normal. */
    return {
      aberto: true,
      origem: "excecao",
      nota: excecao.note || undefined,
      opensAt: String(excecao.opensAt ?? base.opensAt),
      closesAt: String(excecao.closesAt ?? base.closesAt),
      breaks: excecao.breaks ? pausasValidas(excecao.breaks) : base.breaks,
    };
  }

  const abertos = Array.isArray(s.weekdays) && s.weekdays.length > 0 ? s.weekdays : DIAS_PADRAO;
  if (!abertos.includes(params.weekday)) {
    return { aberto: false, origem: "semana" };
  }

  return { aberto: true, origem: doDiaDaSemana ? "dia" : "geral", ...base };
}

/**
 * Os horários que cabem numa jornada — a grade que o cliente vê.
 *
 * `duracao` é a do atendimento pedido, não a da grade: um combo de 60 min não
 * pode começar 30 min antes de fechar nem 30 min antes do almoço. Era esta
 * conta que estava escrita em quatro lugares — na prévia do onboarding, na
 * capacidade do painel, no `availableSlots` e na projeção.
 */
export function horariosDaJornada(params: {
  jornada: JornadaDoDia;
  slotMinutes: number;
  duracao?: number;
}): string[] {
  const abre = paraMinutos(params.jornada.opensAt);
  const fecha = paraMinutos(params.jornada.closesAt);
  const grade = Number(params.slotMinutes);

  if (abre === null || fecha === null || !Number.isFinite(grade) || grade < 5) return [];
  if (fecha <= abre) return [];

  const duracao = Math.max(Number(params.duracao) || grade, 5);
  const pausas = params.jornada.breaks
    .map((b) => [paraMinutos(b.from), paraMinutos(b.to)] as const)
    .filter((par) => par[0] !== null && par[1] !== null) as Array<readonly [number, number]>;

  const horarios: string[] = [];
  for (let t = abre; t + duracao <= fecha; t += grade) {
    const invadePausa = pausas.some(([de, ate]) => t < ate && t + duracao > de);
    if (!invadePausa) horarios.push(paraHora(t));
    /* Teto de sanidade: uma grade de 5 min num expediente de 24h renderiza 288
     * pastilhas na prévia e trava o celular do dono enquanto ele digita. */
    if (horarios.length > 200) break;
  }
  return horarios;
}

/**
 * Quantos horários cabem naquela data — capacidade real, não a da semana.
 *
 * Devolve zero em dia fechado, que é o que faz a ocupação do dia parar de ser
 * calculada contra uma capacidade que a barbearia não tem.
 */
export function capacidadeDaData(params: {
  schedule: EntradaDeJornada | null | undefined;
  weekday: number;
  date: string;
}): number {
  const jornada = jornadaDoDia(params);
  if (!jornada.aberto) return 0;
  return horariosDaJornada({
    jornada,
    slotMinutes: Number(params.schedule?.slotMinutes) || 30,
  }).length;
}

/**
 * Exceções que ainda importam, em ordem de data.
 *
 * O array vive no documento da barbearia e cresceria para sempre — um feriado
 * de 2026 continuaria sendo lido em 2030, em toda resolução de tenant, em toda
 * tela. A poda acontece na GRAVAÇÃO e guarda uma janela curta de passado: o
 * dono precisa enxergar a semana que passou para entender por que a terça
 * rendeu menos, e o relatório do mês corrente também.
 */
export function podarExcecoes(
  excecoes: ExcecaoDeAgenda[] | null | undefined,
  hoje: string,
  diasDeMemoria = 90
): ExcecaoDeAgenda[] {
  if (!Array.isArray(excecoes)) return [];
  const corte = new Date(`${hoje}T00:00:00Z`);
  corte.setUTCDate(corte.getUTCDate() - diasDeMemoria);
  const limite = corte.toISOString().slice(0, 10);

  const vistas = new Map<string, ExcecaoDeAgenda>();
  for (const e of excecoes) {
    if (!e?.date || e.date < limite) continue;
    /* Uma data só pode ter uma regra. Guardar duas faria a tela listar o mesmo
     * dia duas vezes e o dono apagar uma sem entender por que nada mudou. */
    vistas.set(e.date, e);
  }
  return [...vistas.values()].sort((a, b) => a.date.localeCompare(b.date));
}
