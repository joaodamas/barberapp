import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AuthProvider } from "@/lib/auth-context";
import { TenantProvider } from "@/lib/tenant-context";
import { getTenant, resolverTenant } from "@/lib/tenant-server";
import { tenantCssVars } from "@/lib/tenant";
import "./globals.css";

/* Fontes AUTO-HOSPEDADAS, e não `next/font/google`.
 *
 * O `next/font/google` baixa o arquivo EM TEMPO DE BUILD. Em 11/08 o
 * `fonts.gstatic.com` devolveu 404 e derrubou uma publicação real: com uma
 * barbearia em operação, a correção urgente de um bug ficaria refém de um
 * serviço de terceiro estar de pé. Servidas por nós, publicar depende só de nós.
 *
 * De quebra, o IP de cada visitante deixa de ir para a Google a cada visita —
 * o que conversa direto com a política de privacidade.
 *
 * Os dois arquivos são as MESMAS fontes variáveis que a Google servia, no
 * subconjunto latino: 118 KB de Fraunces e 24 KB de Manrope. Auto-hospedar não
 * engorda nada; tira uma resolução de DNS e um handshake de outro domínio do
 * caminho crítico.
 */

/* Fraunces é a voz da MARCA — landing, assinatura, títulos de campanha.
 * Nenhum concorrente usa serifada, então ela separa antes de o texto ser lido,
 * e conversa com a paleta creme/dourado, que já é editorial.
 *
 * `preload: false` de propósito: a Fraunces só aparece na landing e na
 * assinatura da marca. Pré-carregá-la no layout raiz custaria 118 KB no
 * celular de quem só quer marcar um corte, para uma fonte que não pinta um
 * caractere naquela tela.
 *
 * O eixo óptico continua valendo: o arquivo é a variável inteira, e
 * `font-optical-sizing: auto` — padrão do navegador — ajusta o contraste pelo
 * corpo sozinho. É o que faz serifada de display não parecer serifada de texto
 * ampliada. */
const fraunces = localFont({
  src: "../assets/fontes/fraunces-latin-var.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
  preload: false,
});

/* Manrope é a voz do PRODUTO: painel, app do cliente, tudo. Esta carrega em
 * toda rota, e por isso é a que vale pré-carregar. */
const manrope = localFont({
  src: "../assets/fontes/manrope-latin-var.woff2",
  variable: "--font-manrope",
  weight: "400 700",
  display: "swap",
});

/* Título, descrição e nome do app instalado saem da barbearia do subdomínio. */
export async function generateMetadata(): Promise<Metadata> {
  const { brand } = await getTenant();
  return {
    title: {
      default: brand.name,
      template: `%s · ${brand.shortName}`,
    },
    description: `Agende seu horário, acompanhe sua fidelidade e assine um plano na ${brand.name}.`,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brand.shortName,
    },
    icons: {
      icon: [
        { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: brand.logo, type: "image/svg+xml" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  /* `maximumScale: 1` bloqueava o pinch-zoom e reprovava no WCAG 1.4.4.
   * Impedir zoom nunca foi requisito — era herança de template. */
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /* O ESTADO da resolução, não só o resultado.
   *
   * `getTenant()` devolve `DEFAULT_TENANT` em qualquer falha, e continua certo
   * para tudo que só quer marca — metadata, manifest, cor. O que faltava era o
   * sinal de que aquilo é um substituto: sem ele, a tela de LOGIN exibia
   * "CorteHub" e o logo da plataforma para um cliente de outra barbearia, e
   * pedia a senha dele assim mesmo.
   *
   * Verificado em 18/08: mesma URL, Firestore no ar → "O Siqueira Barbearia";
   * Firestore fora → "CorteHub". Nada mais mudava. */
  const { estado, tenant } = await resolverTenant();

  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
      /* A cor de destaque da barbearia entra como variável CSS no servidor —
       * assim a marca já chega pintada no primeiro HTML, sem piscar. */
      style={tenantCssVars(tenant)}
    >
      {/* `md:overflow-hidden` existe para o layout do app: a sidebar fica
          fixa e o conteúdo rola dentro do <main>. Toda página FORA desses
          layouts (login, comecar, offline) precisa do próprio
          `overflow-y-auto`, senão herda a trava e não desce — foi o que
          aconteceu com o onboarding, que ficou com o botão inalcançável. */}
      <body className="min-h-full flex flex-col bg-bg text-ivory md:h-full md:overflow-hidden">
        <TenantProvider tenant={tenant} indisponivel={estado === "indisponivel"}>
          <AuthProvider>{children}</AuthProvider>
        </TenantProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
