"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/cn";
import { clienteNavItems } from "@/lib/nav-items";

export function ClienteSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden shrink-0 bg-surface/60 md:flex md:h-full md:w-64 md:flex-col md:overflow-y-auto md:border-r md:border-border md:shadow-[8px_0_32px_-24px_rgba(0,0,0,0.8)]">
      <Link href="/" className="flex items-center gap-3 px-6 pb-6 pt-8">
        <Image src="/logo.svg" alt="" width={38} height={38} priority />
        <div className="leading-tight">
          <p className="font-display text-base uppercase tracking-wider text-ivory">
            O Siqueira
          </p>
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
            Sua barbearia
          </p>
        </div>
      </Link>

      <div className="mx-6 mb-6 h-px bg-gradient-to-r from-border via-border to-transparent" />

      <nav className="flex flex-1 flex-col gap-1 px-4">
        {clienteNavItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                active
                  ? "bg-gold/10 text-gold-light"
                  : "text-ivory-muted hover:bg-surface-raised hover:text-ivory"
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
                    ? "bg-gold/15 text-gold-light"
                    : "text-ivory-muted/80 group-hover:text-ivory"
                )}
              >
                <Icon size={17} strokeWidth={active ? 2.4 : 1.8} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/perfil"
        className="mx-4 mb-4 mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface-raised/60 px-3 py-3 transition-colors hover:border-gold/30"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xs text-gold-light">
          JD
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-xs font-medium text-ivory">João Damas</p>
          <p className="truncate text-[11px] text-ivory-muted">Ver perfil</p>
        </div>
        <span
          aria-label="Sair"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ivory-muted/70 transition-colors hover:bg-surface hover:text-ivory"
        >
          <LogOut size={14} />
        </span>
      </Link>
    </aside>
  );
}
