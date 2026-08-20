"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { itemAtivo, painelNavItems, rotaAtiva } from "@/lib/nav-items";
import { SidebarUserFooter } from "@/components/sidebar-user-footer";
import { useAcesso, useTenant } from "@/lib/tenant-context";

export function PainelSidebarNav() {
  const pathname = usePathname();
  const { brand } = useTenant();
  /* O cadeado precisa vir de `useAcesso`, não de `tenant.features` cru.
     São duas respostas para a mesma pergunta e divergem justamente no caso que
     importa: numa barbearia suspensa ou com trial vencido, `features` gravado
     no documento continua dizendo `store: true`, e o menu mostrava Loja e
     Mensalistas destrancadas enquanto a própria tela as bloqueava. É o defeito
     que `tenant-context.tsx` descreve em `useFeature` — o menu era o que tinha
     sobrado dele. */
  const { features } = useAcesso();

  return (
    /* `overflow-hidden` no aside e rolagem no <nav>, e não o contrário.
       Com `overflow-y-auto` na coluna inteira, o menu crescido empurrava o
       rodapé de identidade para fora da área visível: no painel do dono ele
       aparecia cortado ao meio, com "Painel do dono" pela metade e o botão de
       sair inalcançável. Agora só a lista de navegação rola, e quem é dono do
       espaço restante é ela — o rodapé fica sempre ancorado embaixo. */
    <aside className="hidden shrink-0 bg-surface/60 md:flex md:h-full md:w-64 md:flex-col md:overflow-hidden md:border-r md:border-border md:shadow-[8px_0_32px_-24px_rgba(0,0,0,0.8)]">
      <Link
        href="/painel"
        className="flex items-center gap-3 px-6 pb-6 pt-8"
      >
        <Image src={brand.logo} alt="" width={38} height={38} priority />
        <div className="leading-tight">
          <p className="font-display text-base uppercase tracking-wider text-ink">
            {brand.shortName}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">
            {brand.panelLabel}
          </p>
        </div>
      </Link>

      <div className="mx-6 mb-6 h-px bg-gradient-to-r from-border via-border to-transparent" />

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-4 pb-2">
        {painelNavItems.map((item) => {
          /* A comparação era feita aqui, à mão, e valia só enquanto todo filho
             morasse debaixo do pai. Agora mora em `itemAtivo`, que também olha
             os filhos: sem isso, abrir Serviços — filho de Ajustes, mas fora do
             prefixo `/painel/configuracoes` — apagaria o menu inteiro. */
          const active = itemAtivo(item, pathname, painelNavItems);
          const Icon = item.icon;
          return (
            <div key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-gold/10 text-gold-strong"
                    : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gold transition-opacity duration-150",
                    active ? "opacity-100" : "opacity-0"
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                    active
                      ? "bg-gold/15 text-gold-strong"
                      : "text-ink-muted/80 group-hover:text-ink"
                  )}
                >
                  <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
                </span>
                {item.label}
                {item.feature && !features[item.feature] && (
                  <Lock
                    size={13}
                    className="ml-auto shrink-0 text-ink-muted/70"
                    aria-label="Não incluído no seu plano"
                  />
                )}
              </Link>

              {item.children && active && (
                <div className="ml-[19px] mt-1 flex flex-col gap-0.5 border-l border-border pl-4">
                  {item.children.map((child) => {
                    /* Igualdade, e não prefixo: filho é folha. Por prefixo, o
                       "Resumo" — que aponta para a rota do pai — ficaria aceso
                       junto com "Quanto sobrou" em `/painel/financeiro/dre`, e
                       o submenu mostraria dois lugares atuais ao mesmo tempo. */
                    const childActive = rotaAtiva(child.href, pathname, true);
                    const bloqueado = !!child.feature && !features[child.feature];
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors duration-150",
                          childActive
                            ? "font-medium text-gold-strong"
                            : "text-ink-muted hover:text-ink"
                        )}
                      >
                        {child.label}
                        {/* Quatro das cinco telas de Financeiro exigem plano, e
                            o menu não dizia: o dono descobria ao abrir. */}
                        {bloqueado && (
                          <Lock
                            size={12}
                            className="ml-auto shrink-0 text-ink-muted/70"
                            aria-label="Não incluído no seu plano"
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="shrink-0">
        <SidebarUserFooter caption={brand.panelLabel} fallbackName={brand.name} />
      </div>
    </aside>
  );
}
