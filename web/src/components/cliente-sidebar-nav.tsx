"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { clienteNavItems } from "@/lib/nav-items";
import { SidebarUserFooter } from "@/components/sidebar-user-footer";
import { OwnerPanelLink } from "@/components/owner-panel-link";
import { useTenant } from "@/lib/tenant-context";

export function ClienteSidebarNav() {
  const pathname = usePathname();
  const { brand } = useTenant();

  return (
    <aside className="hidden shrink-0 bg-surface/60 md:flex md:h-full md:w-64 md:flex-col md:overflow-y-auto md:border-r md:border-border md:shadow-[8px_0_32px_-24px_rgba(0,0,0,0.8)]">
      <Link href="/" className="flex items-center gap-3 px-6 pb-6 pt-8">
        <Image src={brand.logo} alt="" width={38} height={38} priority />
        <div className="leading-tight">
          <p className="font-display text-base uppercase tracking-wider text-ivory">
            {brand.shortName}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
            {brand.clientTagline}
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

      <OwnerPanelLink className="mx-4 mt-4" />

      <SidebarUserFooter
        href="/perfil"
        caption="Ver perfil"
        fallbackName="Cliente"
      />
    </aside>
  );
}
