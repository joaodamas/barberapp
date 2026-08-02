import Image from "next/image";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { DemoBanner } from "@/components/demo-banner";
import { PainelBottomNav } from "@/components/painel-bottom-nav";
import { PainelSidebarNav } from "@/components/painel-sidebar-nav";

export default function PainelDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireOwner>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ivory"
      >
        Pular para o conteúdo
      </a>
      <DemoBanner />
      <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col md:h-full md:max-w-none md:flex-row md:overflow-hidden">
        <PainelSidebarNav />
        <div className="flex min-h-full w-full flex-1 flex-col md:h-full md:overflow-hidden">
          <header className="safe-top flex items-center gap-2.5 px-4 pb-3 pt-4 md:hidden">
            <Link href="/painel" className="flex items-center gap-2.5">
              <Image src="/logo.svg" alt="" width={32} height={32} priority />
              <div className="leading-tight">
                <p className="font-display text-sm uppercase tracking-wider text-ivory">
                  O Siqueira
                </p>
                <p className="text-[11px] text-ivory-muted">Painel do dono</p>
              </div>
            </Link>
          </header>
          <main id="conteudo" tabIndex={-1} className="flex-1 px-4 pb-6 md:overflow-y-auto md:px-10 md:py-10 lg:px-14 xl:px-16">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
          <PainelBottomNav />
        </div>
      </div>
    </AuthGuard>
  );
}
