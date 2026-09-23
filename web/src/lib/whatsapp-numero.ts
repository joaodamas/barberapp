/**
 * O formato de um número de WhatsApp.
 *
 * Vive fora de `db/perfil.ts` porque é regra de DOMÍNIO, não de banco: o
 * formato certo importa igual na tela de agendar, no perfil e em qualquer
 * lugar que venha depois. E porque `db/perfil.ts` importa o SDK do Firebase,
 * que valida as chaves do projeto no import — o que tornaria estas quatro
 * funções puras impossíveis de testar sem um ambiente configurado.
 *
 * A regra que elas protegem: a Cloud API do WhatsApp aceita vários formatos e
 * **falha em silêncio** em alguns — responde 200 e a mensagem nunca chega.
 * Número brasileiro sem o DDI 55 é o caso mais comum, e é exatamente o que a
 * pessoa digita.
 */

/**
 * Os dígitos NACIONAIS (DDD + número), ou "" se não formam um número.
 *
 * Decide pelo comprimento, não pelo prefixo. `^55` era removido sempre — e 55
 * também é DDD (Santa Maria e região, RS): "(55) 99999-1234" virava 9 dígitos,
 * o botão "Confirmar reserva" ficava desabilitado sem mensagem e o balcão
 * dizia "número incompleto" (rodada E2E de 23/09).
 *
 * - 10 ou 11 dígitos: já é nacional, mesmo começando com 55 (é o DDD).
 * - 12 ou 13 começando com 55: veio com o DDI brasileiro.
 */
export function nacionalDe(bruto: string): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d.slice(2);
  return "";
}

/**
 * Dígitos, com DDI 55.
 *
 * A Cloud API aceita vários formatos e **falha em silêncio** em alguns:
 * responde 200 e a mensagem nunca chega. Brasileiro sem o 55 é o caso mais
 * comum — e é exatamente o que a pessoa digita.
 */
export function normalizarWhatsapp(bruto: string): string {
  const nacional = nacionalDe(bruto);
  return nacional ? `55${nacional}` : "";
}

/**
 * O número está utilizável?
 *
 * 10 ou 11 dígitos nacionais (fixo antigo e celular com o 9), mais o DDI.
 * Recusar aqui é melhor que gravar um número que só falha na hora do envio,
 * quando ninguém mais está olhando.
 */
export function whatsappValido(bruto: string): boolean {
  return nacionalDe(bruto) !== "";
}

/** Máscara de leitura enquanto a pessoa digita. */
export function mascararWhatsapp(bruto: string): string {
  const todos = String(bruto ?? "").replace(/\D/g, "");
  /* Enquanto digita, até 11 dígitos são nacionais; acima disso, veio com DDI. */
  const d = (todos.length > 11 && todos.startsWith("55") ? todos.slice(2) : todos).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
