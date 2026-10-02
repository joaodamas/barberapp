import { isPlatformRoot } from "@/lib/tenant-server";
import { SITE_URL } from "@/lib/seo";

/* Depende do domínio (02/10): no raiz, o Google recebe o sitemap da
 * plataforma; nas barbearias (*.topete.com.br), a vitrine pode ser lida, mas
 * sem sitemap — elas não são páginas do produto. Painel, conta e API ficam de
 * fora em qualquer domínio. */
export const dynamic = "force-dynamic";

const FECHADO = ["/painel", "/api", "/login", "/criar-conta", "/trocar-senha", "/comecar", "/offline", "/perfil", "/reservas"];

export async function GET() {
  const linhas = ["User-agent: *", "Allow: /", ...FECHADO.map((p) => `Disallow: ${p}`)];
  if (await isPlatformRoot()) linhas.push("", `Sitemap: ${SITE_URL}/sitemap.xml`);
  return new Response(linhas.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
