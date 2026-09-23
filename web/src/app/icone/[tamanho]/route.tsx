import { ImageResponse } from "next/og";
import { getTenant } from "@/lib/tenant-server";
import { corValida, iniciaisDe, tintaSobre } from "@/lib/monograma";

/**
 * Ícones PNG do PWA gerados a partir do monograma.
 *
 * Os PNG estáticos de `/icons` eram do piloto e iam para o manifest de TODA
 * barbearia — o ícone na tela inicial do cliente da "Navalha" era o d'O
 * Siqueira. A tela inicial do celular e o iOS exigem PNG, por isso o SVG de
 * `/marca.svg` não basta aqui.
 *
 * `?m=1` é a versão maskable: fundo cheio e iniciais dentro da zona segura
 * (80%), porque o Android recorta o ícone no formato que quiser.
 */
export const dynamic = "force-dynamic";

const TAMANHOS = new Set([32, 180, 192, 512]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ tamanho: string }> }
) {
  const { tamanho } = await params;
  const lado = Number(tamanho);
  if (!TAMANHOS.has(lado)) return new Response("Tamanho inválido", { status: 404 });

  const maskable = new URL(request.url).searchParams.get("m") === "1";
  const { brand } = await getTenant();
  const fundo = corValida(brand.accentColor);
  const iniciais = iniciaisDe(brand.name);
  const fonte = Math.round(lado * (iniciais.length > 1 ? 0.36 : 0.44) * (maskable ? 0.8 : 1));

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: fundo,
          /* Ícone comum redondo; maskable quadrado cheio — quem recorta é o sistema. */
          borderRadius: maskable ? 0 : lado / 2,
          color: tintaSobre(fundo),
          fontSize: fonte,
          fontWeight: 700,
          letterSpacing: -lado * 0.01,
        }}
      >
        {iniciais}
      </div>
    ),
    {
      width: lado,
      height: lado,
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=86400" },
    }
  );
}
