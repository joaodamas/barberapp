"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/nav-items";

/**
 * Navegação do celular.
 *
 * A barra divide a largura igualmente entre os itens, então cada item a mais
 * encolhe todos: num aparelho de 360px, sete itens deixam ~51px cada e o rótulo
 * transborda. Acima de `maxVisible`, o excedente vai para uma folha "Mais" em
 * vez de ser espremido — ou pior, escondido, já que a barra lateral só existe
 * no desktop e o item viraria inalcançável no aparelho onde o dono trabalha.
 */
const MAX_VISIVEL = 5;

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  const precisaAgrupar = items.length > MAX_VISIVEL;
  const visiveis = precisaAgrupar ? items.slice(0, MAX_VISIVEL - 1) : items;
  const noMais = precisaAgrupar ? items.slice(MAX_VISIVEL - 1) : [];

  const estaAtivo = (item: NavItem) =>
    item.href === "/"
      ? pathname === "/"
      : pathname === item.href || pathname.startsWith(`${item.href}/`);

  const algumNoMaisAtivo = noMais.some(estaAtivo);

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
          <ul className="mx-auto flex max-w-md flex-col border-b border-border px-2 py-2">
            {noMais.map((item) => {
              const active = estaAtivo(item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    // Fecha no clique, não num efeito sobre `pathname`: a folha
                    // ficaria aberta por um render sobre a tela nova.
                    onClick={() => setMaisAberto(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                      active ? "bg-gold/10 text-gold-light" : "text-ivory-muted"
                    )}
                  >
                    <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
          {visiveis.map((item) => {
            const active = estaAtivo(item);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-gold-light" : "text-ivory-muted"
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={active ? 2.4 : 1.8}
                    className={active ? "text-gold-light" : "text-ivory-muted"}
                  />
                  <span className="whitespace-nowrap">{item.shortLabel ?? item.label}</span>
                </Link>
              </li>
            );
          })}

          {precisaAgrupar && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMaisAberto((v) => !v)}
                aria-expanded={maisAberto}
                aria-label={maisAberto ? "Fechar mais opções" : "Mais opções"}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  maisAberto || algumNoMaisAtivo ? "text-gold-light" : "text-ivory-muted"
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
