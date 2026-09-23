import type { MetadataRoute } from "next";
import { getTenant } from "@/lib/tenant-server";
import { iconesDaMarca } from "@/lib/monograma";

/**
 * Manifest por barbearia.
 *
 * É o que faz o ícone e o nome na tela inicial serem os do cliente, e não os
 * da plataforma — 90% do valor de um app white-label sem passar por loja de
 * aplicativo. Por depender do host, a rota é dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { brand } = await getTenant();
  const icones = iconesDaMarca(brand);

  return {
    name: brand.name,
    short_name: brand.shortName,
    description: `Agende seu horário, acompanhe sua fidelidade e assine um plano na ${brand.name}.`,
    start_url: "/",
    display: "standalone",
    /* Sem trava de orientação: o produto tem layout desktop/tablet completo
     * com sidebar, e "portrait" prendia o tablet instalado no layout mobile. */
    background_color: brand.themeColor,
    theme_color: brand.themeColor,
    lang: "pt-BR",
    /* Os PNG de `/icons` eram do piloto e iam para o manifest de todas. */
    icons: [
      { src: icones.i192, sizes: "192x192", type: "image/png" },
      { src: icones.i512, sizes: "512x512", type: "image/png" },
      { src: icones.m192, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: icones.m512, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
