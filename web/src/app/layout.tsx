import type { Metadata, Viewport } from "next";
import { Oswald, Manrope } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { AuthProvider } from "@/lib/auth-context";
import { TenantProvider } from "@/lib/tenant-context";
import { getTenant } from "@/lib/tenant-server";
import { tenantCssVars } from "@/lib/tenant";
import "./globals.css";

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
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
  const tenant = await getTenant();

  return (
    <html
      lang="pt-BR"
      className={`${oswald.variable} ${manrope.variable} h-full antialiased`}
      /* A cor de destaque da barbearia entra como variável CSS no servidor —
       * assim a marca já chega pintada no primeiro HTML, sem piscar. */
      style={tenantCssVars(tenant)}
    >
      <body className="min-h-full flex flex-col bg-bg text-ivory md:h-full md:overflow-hidden">
        <TenantProvider tenant={tenant}>
          <AuthProvider>{children}</AuthProvider>
        </TenantProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
