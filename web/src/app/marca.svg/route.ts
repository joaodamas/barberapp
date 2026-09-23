import { getTenant } from "@/lib/tenant-server";
import { svgDoMonograma } from "@/lib/monograma";

/**
 * O monograma da barbearia do subdomínio — ver `lib/monograma.ts`.
 *
 * Dinâmico porque depende do host. Cache curto: se o dono trocar o nome ou a
 * cor, o topo do app acompanha em minutos, não na próxima semana.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { brand } = await getTenant();
  return new Response(svgDoMonograma(brand.name, brand.accentColor), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
    },
  });
}
