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
 * Dígitos, com DDI 55 quando o número é brasileiro e veio sem ele.
 *
 * A Cloud API aceita vários formatos e **falha em silêncio** em alguns:
 * responde 200 e a mensagem nunca chega. Brasileiro sem o 55 é o caso mais
 * comum — e é exatamente o que a pessoa digita.
 */
export function normalizarWhatsapp(bruto: string): string {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return "";
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

/**
 * O número está utilizável?
 *
 * 10 ou 11 dígitos nacionais (fixo antigo e celular com o 9), mais o DDI.
 * Recusar aqui é melhor que gravar um número que só falha na hora do envio,
 * quando ninguém mais está olhando.
 */
export function whatsappValido(bruto: string): boolean {
  const nacional = String(bruto ?? "").replace(/\D/g, "").replace(/^55/, "");
  return nacional.length === 10 || nacional.length === 11;
}

/** Máscara de leitura enquanto a pessoa digita. */
export function mascararWhatsapp(bruto: string): string {
  const d = String(bruto ?? "").replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
