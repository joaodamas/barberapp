import * as logger from "firebase-functions/logger";

/**
 * Fuso, moeda e idioma de uma barbearia.
 *
 * A Cloud Function roda em UTC. Enquanto todas as barbearias eram brasileiras,
 * fixar `America/Sao_Paulo` funcionava; com a primeira fora do Brasil, cada
 * lugar onde o fuso está cravado vira um defeito silencioso:
 *
 * - `hojeISO()` decide o que é "reserva futura". Em UTC, depois das 21h em São
 *   Paulo já é o dia seguinte — e uma reserva de hoje passa a contar como
 *   passada, ou vice-versa.
 * - `dataPorExtenso()` é o que o cliente lê. Errar aqui é o cliente aparecer no
 *   dia errado, e isso não gera erro em log nenhum.
 *
 * Por isso o fuso não tem padrão implícito em nenhuma função: quem chama passa,
 * e o valor vem do documento da barbearia.
 */

export type BarbershopLocale = {
  timeZone: string;
  currency: string;
  locale: string;
};

export const DEFAULT_LOCALE: BarbershopLocale = {
  timeZone: "America/Sao_Paulo",
  currency: "BRL",
  locale: "pt-BR",
};

/**
 * O fuso é um nome IANA que o `Intl` conhece?
 *
 * `Intl.DateTimeFormat` LANÇA `RangeError` com fuso desconhecido. Um
 * `locale.timeZone: "Brasil"` gravado no documento derrubava, sem aviso, cada
 * função que decide "que dia é hoje" para aquela loja — e, nas rotinas que
 * percorrem todas as barbearias, também as lojas que vinham depois dela.
 */
export function fusoValido(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lê o `locale` do documento da barbearia, com o padrão da plataforma no que
 * faltar. `barbershopId` só serve ao log, para o fuso torto ter endereço.
 */
export function localeDoDocumento(data: unknown, barbershopId?: string): BarbershopLocale {
  const l = ((data as { locale?: unknown })?.locale ?? {}) as Partial<BarbershopLocale>;
  let timeZone = l.timeZone || DEFAULT_LOCALE.timeZone;
  /* Fuso ilegível cai no padrão e fica no log: errar o dia de uma loja é
   * ruim, mas parar a agenda dela (e de quem vem depois na rotina) é pior. */
  if (!fusoValido(timeZone)) {
    logger.error("[locale] fuso inválido no documento da barbearia; usando o padrão", {
      barbershopId: barbershopId ?? null,
      timeZone: String(timeZone).slice(0, 80),
      padrao: DEFAULT_LOCALE.timeZone,
    });
    timeZone = DEFAULT_LOCALE.timeZone;
  }
  return {
    timeZone,
    currency: l.currency || DEFAULT_LOCALE.currency,
    locale: l.locale || DEFAULT_LOCALE.locale,
  };
}

/** Hoje, no fuso da barbearia. `en-CA` porque devolve exatamente `AAAA-MM-DD`. */
export function hojeNoFuso(timeZone: string, agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/**
 * `"2026-08-04"` + `"15:00"` no fuso da barbearia → instante real.
 *
 * `new Date("2026-08-04T15:00:00")` interpreta no fuso do processo, que é UTC.
 * Para uma barbearia em Dublin isso erra por uma hora, e para uma em São Paulo,
 * por três — o suficiente para a antecedência mínima recusar um horário
 * perfeitamente válido, ou aceitar um que já passou.
 *
 * O deslocamento é calculado para a data em questão, não fixo: horário de verão
 * muda o offset no meio do ano, e uma reserva de dezembro em Dublin não tem o
 * mesmo deslocamento que uma de julho.
 */
export function instanteNoFuso(date: string, time: string, timeZone: string): Date {
  const ingenuo = new Date(`${date}T${time}:00Z`);
  const formatado = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(ingenuo);

  const p = (tipo: string) => Number(formatado.find((x) => x.type === tipo)?.value);
  const comoLocal = Date.UTC(
    p("year"),
    p("month") - 1,
    p("day"),
    p("hour") % 24,
    p("minute"),
    p("second")
  );
  return new Date(ingenuo.getTime() * 2 - comoLocal);
}

/** Dia da semana (0 = domingo) daquela data no fuso da barbearia. */
export function diaDaSemanaNoFuso(date: string, timeZone: string): number {
  const nomes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const curto = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date(`${date}T12:00:00Z`));
  return nomes.indexOf(curto);
}
