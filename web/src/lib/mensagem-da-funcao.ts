/**
 * A mensagem de uma Cloud Function para quem está na tela.
 *
 * O `HttpsError` que NÓS lançamos já vem em português de balcão
 * ("Este convite venceu…") e deve aparecer como está. O resto — "internal",
 * "deadline-exceeded", erro de rede — é jargão, e vira a frase padrão.
 */
const CODIGOS_NOSSOS = new Set([
  "functions/invalid-argument",
  "functions/failed-precondition",
  "functions/permission-denied",
  "functions/not-found",
  "functions/unauthenticated",
  "functions/already-exists",
  "functions/resource-exhausted",
]);

export function mensagemDaFuncao(e: unknown, padrao: string): string {
  const err = e as { code?: unknown; message?: unknown } | null;
  const codigo = typeof err?.code === "string" ? err.code : "";
  const mensagem = typeof err?.message === "string" ? err.message.trim() : "";
  if (CODIGOS_NOSSOS.has(codigo) && mensagem) return mensagem;
  if (/network|offline|unavailable|deadline/i.test(`${codigo} ${mensagem}`)) {
    return "Sem conexão agora. Tente de novo em alguns segundos.";
  }
  return padrao;
}
