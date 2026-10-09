"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { sairDaConta } from "@/components/sign-out-button";

function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function SidebarUserFooter({
  href,
  caption,
  fallbackName,
  discreto = false,
}: {
  /** Sem cartão: só uma divisória, nome e sair. O painel usa; o app do cliente não. */
  discreto?: boolean;
  /** Para onde leva o clique no bloco de identidade (perfil, configurações...). */
  href?: string;
  caption: string;
  fallbackName: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { id: barbershopId } = useTenant();

  const name = user?.displayName || user?.email?.split("@")[0] || fallbackName;
  const initials = initialsOf(name) || "?";

  async function handleSignOut() {
    await sairDaConta(barbershopId);
    router.replace("/login");
  }

  const identity = (
    <>
      <div
        className={
          discreto
            ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[12.5px] font-medium text-ink-muted"
            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xs text-gold-strong"
        }
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className={discreto ? "truncate text-[13px] text-ink" : "truncate text-xs font-medium text-ink"}>{name}</p>
        <p className={discreto ? "truncate text-[12.5px] text-ink-muted" : "truncate text-[11px] text-ink-muted"}>{caption}</p>
      </div>
    </>
  );

  return (
    <div
      className={
        discreto
          ? "mx-4 mb-3 mt-2 flex items-center gap-3 border-t border-border px-1 pt-3"
          : "mx-4 mb-4 mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface-raised/60 px-3 py-3 transition-colors hover:border-gold/30"
      }
    >
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
          {identity}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
      )}
      <button
        onClick={handleSignOut}
        aria-label="Sair"
        className="flex h-11 w-11 shrink-0 items-center justify-center md:h-8 md:w-8 rounded-lg text-ink-muted/70 transition-colors hover:bg-surface hover:text-ink"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
