/**
 * Para onde ir depois de entrar — só caminho do próprio site.
 *
 * A checagem era de texto: começa com "/" e não com "//". O navegador trata
 * "\" como "/", e `/login?next=/%5Cexample.com` virava "/\example.com", que
 * passava pela checagem e resolvia para `https://example.com/`: quem já
 * estava logado era mandado para fora na hora, sob o domínio da barbearia —
 * phishing com o endereço certo na barra (rodada E2E de 23/09, reproduzido).
 *
 * Agora a URL é RESOLVIDA como o navegador resolveria, e só vale se a origem
 * continuar a mesma. Barra invertida e caracteres de controle nem entram.
 */
export function destinoInterno(valor: string | null, origem: string): string | null {
  if (!valor) return null;
  if (/[\\\u0000-\u001f\u007f]/.test(valor)) return null;
  if (!valor.startsWith("/") || valor.startsWith("//")) return null;
  try {
    const url = new URL(valor, origem);
    if (url.origin !== new URL(origem).origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
