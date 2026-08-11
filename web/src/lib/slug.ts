/**
 * Validação do endereço da barbearia — espelho de `functions/src/signup.ts`.
 *
 * Duplicar a regra é deliberado: a do servidor é a que vale, e ela continua
 * rodando. Esta existe para o campo responder enquanto a pessoa digita, em vez
 * de só na hora de enviar. Um endereço é irreversível — descobrir que "Barbearia
 * do Zé" não pode ter espaço depois de preencher o formulário inteiro é o tipo
 * de atrito que faz abandonar cadastro.
 *
 * Se as duas divergirem, o servidor recusa e a tela mostra o motivo dele. Nunca
 * o contrário.
 */

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail",
  "painel", "login", "cadastro", "comecar", "assets", "static", "cdn",
]);

export type SlugCheck = { available: boolean; reason?: string };

export function validateSlug(raw: string): SlugCheck {
  const slug = String(raw ?? "").trim().toLowerCase();
  if (!slug) return { available: false, reason: "Escolha um endereço." };
  if (slug.length < 3) return { available: false, reason: "Use pelo menos 3 caracteres." };
  if (slug.length > 30) return { available: false, reason: "Use no máximo 30 caracteres." };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      available: false,
      reason:
        "Use apenas letras minúsculas, números e hífen — sem acento, espaço ou hífen nas pontas.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, reason: `"${slug}" é reservado pela plataforma.` };
  }
  return { available: true };
}

/**
 * Sugere um endereço a partir do nome da barbearia.
 *
 * O dono digita "Barbearia do Zé" e recebe "barbearia-do-ze" pronto, em vez de
 * ter que inventar um endereço e descobrir as regras por tentativa e erro.
 */
export function slugSugerido(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // tira o acento, preservando a letra
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, ""); // o corte em 30 pode ter deixado hífen na ponta
}
