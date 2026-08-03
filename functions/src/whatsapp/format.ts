/**
 * Formatação dos valores que entram nas mensagens.
 *
 * Fica separado e testado porque é o que o cliente lê. Data errada numa
 * confirmação faz alguém aparecer no dia errado — e o defeito não aparece em
 * nenhum log, só na cadeira vazia.
 *
 * O fuso é fixo em São Paulo: a Cloud Function roda em UTC, e `new Date("2026-08-04")`
 * lá é 04/08 00:00 UTC, que no Brasil ainda é dia 3. Uma reserva de segunda
 * vira "domingo" na mensagem.
 */

const FUSO = "America/Sao_Paulo";

/** "2026-08-04" → "terça, 04 de agosto" */
export function dataPorExtenso(iso: string): string {
  const data = new Date(`${iso}T12:00:00-03:00`);
  const partes = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: FUSO,
  }).formatToParts(data);

  const pega = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${pega("weekday")}, ${pega("day")} de ${pega("month")}`;
}

/** 90 → "R$ 90,00" */
export function moeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
