import { isPlatformRoot } from "@/lib/tenant-server";
import { PAGINAS_DO_SITEMAP, SITE_URL } from "@/lib/seo";

/* Só no domínio raiz (02/10). Barbearia não tem sitemap: o subdomínio é
 * vitrine do dono, não página do produto — pedido do Hub para o Google achar
 * "Topete" sem misturar as barbearias. */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isPlatformRoot())) return new Response("Not found", { status: 404 });
  const urls = PAGINAS_DO_SITEMAP.map(
    (p) => `  <url><loc>${SITE_URL}${p === "/" ? "/" : p}</loc><changefreq>${p === "/" ? "weekly" : "yearly"}</changefreq><priority>${p === "/" ? "1.0" : "0.3"}</priority></url>`
  ).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, {
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
