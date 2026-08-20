"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { itemAtivo, menuDoCelular, rotaAtiva, type NavItem } from "@/lib/nav-items";
import { useAcesso } from "@/lib/tenant-context";

/**
 * Navegação do celular.
 *
 * A barra divide a largura igualmente entre os itens, então cada item a mais
 * encolhe todos: num aparelho de 360px, sete itens deixam ~51px cada e o rótulo
 * transborda. Acima de `MAX_VISIVEL`, o excedente vai para uma folha "Mais" em
 * vez de ser espremido — ou pior, escondido, já que a barra lateral só existe
 * no desktop e o item viraria inalcançável no aparelho onde o dono trabalha.
 *
 * O corte e o conteúdo da folha moram em `menuDoCelular`, não aqui: é a regra
 * que decide o que o dono consegue alcançar em pé, no balcão, e uma regra
 * dessas precisa de teste — dentro do componente ela só teria prova visual.
 */
const MAX_VISIVEL = 5;

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);
  /* Mesma fonte que as telas usam para bloquear (`useAcesso`), e não o
     `tenant.features` cru: senão o menu promete o que a tela nega. */
  const { features } = useAcesso();

  const { barra, mais } = menuDoCelular(items, MAX_VISIVEL);
  const algumNoMaisAtivo = mais.some((d) => rotaAtiva(d.href, pathname, d.exato));

  return (
    <>
      {maisAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMaisAberto(false)}
          className="fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      <nav className="safe-bottom sticky bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {maisAberto && (
          <ul className="mx-auto flex max-h-[60vh] max-w-md flex-col overflow-y-auto border-b border-border px-2 py-2">
            {mais.map((destino) => {
              const active = rotaAtiva(destino.href, pathname, destino.exato);
              const Icon = destino.icon;
              const bloqueado = !!destino.feature && !features[destino.feature];
              return (
                <li key={destino.href}>
                  <Link
                    href={destino.href}
                    aria-current={active ? "page" : undefined}
                    // Fecha no clique, não num efeito sobre `pathname`: a folha
                    // ficaria aberta por um render sobre a tela nova.
                    onClick={() => setMaisAberto(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                      // O filho é identificado pelo recuo e pela ausência de
                      // ícone — o mesmo desenho que a barra lateral já usa para
                      // submenu no desktop. Não é padrão novo.
                      destino.filho && "pl-11 text-ink-muted",
                      active ? "bg-gold/10 text-gold-strong" : "text-ink-muted"
                    )}
                  >
                    {Icon && <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />}
                    {destino.label}
                    {/* A lateral mostrava cadeado e a barra de baixo não: o
                        mesmo item dizia duas coisas diferentes conforme o
                        tamanho da tela. */}
                    {bloqueado && (
                      <Lock
                        size={13}
                        className="ml-auto shrink-0 text-ink-muted/70"
                        aria-label="Não incluído no seu plano"
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
          {barra.map((item) => {
            const active = itemAtivo(item, pathname, items);
            const Icon = item.icon;
            const bloqueado = !!item.feature && !features[item.feature];
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-gold-strong" : "text-ink-muted"
                  )}
                >
                  <span className="relative">
                    <Icon
                      size={22}
                      strokeWidth={active ? 2.4 : 1.8}
                      className={active ? "text-gold-strong" : "text-ink-muted"}
                    />
                    {bloqueado && (
                      <Lock
                        size={11}
                        className="absolute -right-1.5 -top-0.5 text-ink-muted/70"
                        aria-label="Não incluído no seu plano"
                      />
                    )}
                  </span>
                  <span className="whitespace-nowrap">{item.shortLabel ?? item.label}</span>
                </Link>
              </li>
            );
          })}

          {mais.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMaisAberto((v) => !v)}
                aria-expanded={maisAberto}
                aria-label={maisAberto ? "Fechar mais opções" : "Mais opções"}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  maisAberto || algumNoMaisAtivo ? "text-gold-strong" : "text-ink-muted"
                )}
              >
                <MoreHorizontal
                  size={22}
                  strokeWidth={maisAberto || algumNoMaisAtivo ? 2.4 : 1.8}
                />
                <span className="whitespace-nowrap">Mais</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
