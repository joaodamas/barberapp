import Image from "next/image";
import Link from "next/link";
import { AuthGuard } from "@/components/auth-guard";
import { AvisoModoLeitura } from "@/components/ui/bloqueio-plano";
import { AvisoDeTrial } from "@/components/acesso";
import { resolverTenant } from "@/lib/tenant-server";
import { TenantLive } from "@/lib/tenant-live";
import { PainelBottomNav } from "@/components/painel-bottom-nav";
import { PainelSidebarNav } from "@/components/painel-sidebar-nav";

export default async function PainelDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* D30 · o estado da resolução importa, não só o resultado.
   *
   * `getTenant()` devolvia o tenant padrão quando o Firestore não respondia, e
   * o `AuthGuard` — lendo o claim do dono sob o id trocado — concluía que ele
   * não pertencia àquele painel e o mandava para a vitrine. O dono perdia o
   * produto inteiro com a mesma experiência de quem nunca teve conta.
   *
   * Ligado aqui, e não dentro do guard, porque este é o único componente de
   * SERVIDOR entre a resolução e ele: o estado nasce no servidor e só chega ao
   * cliente por prop. */
  const { estado, tenant } = await resolverTenant();
  const { brand } = tenant;

  /* Não há corte de acesso aqui, e é decisão de produto: trial vencido e conta
   * suspensa caem em MODO LEITURA, não em porta fechada. Barbearia que perde a
   * agenda no meio de um sábado não volta para negociar — cria caso. O dono
   * continua vendo tudo, o cliente continua agendando pelo link, e o que trava
   * é editar. Quem decide isso é `acessoDaBarbearia`, uma vez, e as telas leem
   * o resultado por `useAcesso`. Ver `docs/COBRANCA-E-ENTRADA.md`.
   *
   * Daqui para dentro, a ficha da barbearia vem do Firestore em tempo real, e
   * não do cache de 300s do servidor: este é o único lugar do produto onde
   * alguém EDITA a ficha, e ver o valor antigo depois de salvar é a interface
   * mentindo sobre o que foi gravado. A vitrine pública segue cacheada. */
  return (
    <TenantLive inicial={tenant} indisponivel={estado === "indisponivel"}>
    <AuthGuard requireOwner>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ivory"
      >
        Pular para o conteúdo
      </a>
      {/* Os dois se completam e nunca aparecem juntos: o de trial avisa nos
          últimos dias, o de leitura explica depois que venceu. */}
      <AvisoDeTrial tenant={tenant} />
      <AvisoModoLeitura />
      <div className="mx-auto flex min-h-full w-full max-w-md flex-1 flex-col md:h-full md:max-w-none md:flex-row md:overflow-hidden">
        <PainelSidebarNav />
        <div className="flex min-h-full w-full flex-1 flex-col md:h-full md:overflow-hidden">
          <header className="safe-top flex items-center gap-2.5 px-4 pb-3 pt-4 md:hidden">
            <Link href="/painel" className="flex items-center gap-2.5">
              <Image src={brand.logo} alt="" width={32} height={32} priority />
              <div className="leading-tight">
                <p className="font-display text-sm uppercase tracking-wider text-ivory">
                  {brand.shortName}
                </p>
                <p className="text-[11px] text-ivory-muted">{brand.panelLabel}</p>
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
    </TenantLive>
  );
}
