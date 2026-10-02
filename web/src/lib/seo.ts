import type { Metadata } from "next";
import { ROOT_DOMAIN } from "@/lib/tenant";

/* O endereço que o Google deve guardar para a página de vendas (02/10).
 *
 * Quem recebe a mensagem da prospecção pesquisa "Topete" e precisa achar a
 * marca. A raiz já mostrava a landing, mas o <title> e a descrição vinham da
 * vitrine genérica de barbearia ("Agende seu horário…") — para o Google, a
 * raiz parecia um salão, não o produto. */
export const SITE_URL = `https://${ROOT_DOMAIN}`;

/* Páginas da plataforma que valem indexar. As barbearias (*.topete.com.br)
 * NÃO entram: cada uma é vitrine do seu dono, não página do produto. */
export const PAGINAS_DO_SITEMAP = ["/", "/termos", "/privacidade"] as const;

const TITULO = "Topete — agenda e gestão para barbearias";
const DESCRICAO =
  "O cliente marca sozinho pelo link da sua barbearia. Encaixe com aprovação, caixa do dia, mensalistas com horário fixo e o lucro do mês — no celular e no computador. Sem taxa de implantação.";

export const METADATA_DA_PLATAFORMA: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { absolute: TITULO },
  description: DESCRICAO,
  /* `/landing` e a raiz mostram a mesma página: o canônico é a raiz. */
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: "Topete",
    title: TITULO,
    description: DESCRICAO,
    images: [{ url: "/og/topete.png", width: 1200, height: 630, alt: "Topete: a agenda da barbearia no notebook e no celular" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO,
    images: ["/og/topete.png"],
  },
};
