import Image from "next/image";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { DemoBanner } from "@/components/demo-banner";
import { redirect } from "next/navigation";
import { getTenant, isPlatformRoot } from "@/lib/tenant-server";
import { ClienteBottomNav } from "@/components/cliente-bottom-nav";
import { ClienteSidebarNav } from "@/components/cliente-sidebar-nav";

export default async function ClienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Domínio raiz não tem barbearia: quem chega ali quer conhecer o produto,
   * não entrar na conta de um salão. Sem este desvio a landing existe e
   * ninguém acha — e o visitante cai numa tela de login sem contexto. */
  if (await isPlatformRoot()) redirect("/landing");

  const { brand } = await getTenant();

  return (
    <AuthGuard>
        {/* Sem isto, quem navega por teclado passa por toda a sidebar
            antes de chegar ao conteúdo. */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ivory"
        >
          Pular para o conteúdo
        </a>
        <DemoBanner />
      <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col md:h-full md:max-w-none md:flex-row md:overflow-hidden">
        <ClienteSidebarNav />
        <div className="flex min-h-full w-full flex-1 flex-col md:h-full md:overflow-hidden">
          <header className="safe-top flex items-center gap-2.5 px-4 pb-3 pt-4 md:hidden">
            <Link href="/" className="flex items-center gap-2.5">
              <Image src={brand.logo} alt="" width={32} height={32} priority />
              <span className="font-display text-sm uppercase tracking-wider text-ivory">
                {brand.shortName}
              </span>
            </Link>
          </header>
          <main id="conteudo" tabIndex={-1} className="flex-1 px-4 pb-6 md:overflow-y-auto md:px-10 md:py-10 lg:px-14 xl:px-16">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
          <ClienteBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
