import type { BarbershopLocale } from "../locale";

/**
 * Formatação dos valores que entram nas mensagens.
 *
 * Fica separado e testado porque é o que o cliente lê. Data errada numa
 * confirmação faz alguém aparecer no dia errado — e o defeito não aparece em
 * nenhum log, só na cadeira vazia.
 *
 * O fuso vem da barbearia, nunca do processo: a Cloud Function roda em UTC, e
 * `new Date("2026-08-04")` lá é 04/08 00:00 UTC, que no Brasil ainda é dia 3.
 * Uma reserva de segunda vira "domingo" na mensagem.
 */

/**
 * "2026-08-04" → "terça-feira, 04 de agosto"
 *
 * Fuso e idioma vêm da BARBEARIA. Fixá-los aqui fazia a confirmação de uma
 * barbearia em Dublin sair com o dia de São Paulo — e o cliente aparecer no dia
 * errado, sem erro em log nenhum.
 */
export function dataPorExtenso(iso: string, locale: BarbershopLocale): string {
  const partes = new Intl.DateTimeFormat(locale.locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: locale.timeZone,
  }).formatToParts(new Date(`${iso}T12:00:00Z`));

  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  /* Em português o formato é "terça-feira, 04 de agosto"; em inglês, o próprio
   * `Intl` já monta "Tuesday, August 04". Montar à mão só onde a preposição
   * existe evita "Tuesday, 04 de August". */
  const emPortugues = locale.locale.toLowerCase().startsWith("pt");
  return emPortugues
    ? `${pega("weekday")}, ${pega("day")} de ${pega("month")}`
    : new Intl.DateTimeFormat(locale.locale, {
        weekday: "long",
        day: "2-digit",
        month: "long",
        timeZone: locale.timeZone,
      }).format(new Date(`${iso}T12:00:00Z`));
}

/** 90 → "R$ 90,00" ou "€90.00", conforme a barbearia. */
export function moeda(valor: number, locale: BarbershopLocale): string {
  return new Intl.NumberFormat(locale.locale, {
    style: "currency",
    currency: locale.currency,
  }).format(Number(valor) || 0);
}

/**
 * Primeiro nome.
 *
 * A mensagem trata por "Oi {{1}}" — nome completo ali soa a cobrança de banco.
 */
export function primeiroNome(completo: string): string {
  const limpo = String(completo ?? "").trim().replace(/\s+/g, " ");
  return limpo.split(" ")[0] || "tudo bem";
}

/** Como o pagamento aparece na mensagem, entre parênteses. */
export function formaPagamento(metodo: string): string {
  if (metodo === "pix") return "pago via Pix";
  if (metodo === "cartao") return "pago no cartão";
  return "pagar no salão";
}

/** ["Corte", "Barba"] → "Corte e Barba" */
export function listaDeServicos(nomes: string[]): string {
  const limpos = (nomes ?? []).map((n) => String(n).trim()).filter(Boolean);
  if (limpos.length === 0) return "Atendimento";
  if (limpos.length === 1) return limpos[0];
  return `${limpos.slice(0, -1).join(", ")} e ${limpos[limpos.length - 1]}`;
}
