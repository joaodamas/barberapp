import type { MetadataRoute } from "next";
import { isPlatformRoot } from "@/lib/tenant-server";
import { SITE_URL } from "@/lib/seo";

/* Convenção de metadados do Next (02/10). A primeira versão era uma rota em
 * `app/robots.txt/route.ts`: funcionava no `next dev`, mas no build de
 * produção o Next reserva `/robots.txt` para este arquivo e respondia 404.
 *
 * Depende do domínio: no raiz, o Google recebe o sitemap da plataforma; nas
 * barbearias (*.topete.com.br), a vitrine pode ser lida, mas sem sitemap.
 * Painel, conta e API ficam de fora em qualquer domínio. `headers()` (dentro
 * de `isPlatformRoot`) torna a rota dinâmica — sem isso o build congelaria a
 * resposta de um domínio só. */
export const dynamic = "force-dynamic";

const FECHADO = ["/painel", "/api", "/login", "/criar-conta", "/trocar-senha", "/comecar", "/offline", "/perfil", "/reservas"];

export default async function robots(): Promise<MetadataRoute.Robots> {
  const raiz = await isPlatformRoot();
  return {
    rules: { userAgent: "*", allow: "/", disallow: FECHADO },
    ...(raiz ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
