"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";

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
}: {
  /** Para onde leva o clique no bloco de identidade (perfil, configurações...). */
  href?: string;
  caption: string;
  fallbackName: string;
}) {
  const router = useRouter();
  const { user } = useAuth();

  const name = user?.displayName || user?.email?.split("@")[0] || fallbackName;
  const initials = initialsOf(name) || "?";

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  const identity = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 font-display text-xs text-gold-light">
        {initials}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-xs font-medium text-ivory">{name}</p>
        <p className="truncate text-[11px] text-ivory-muted">{caption}</p>
      </div>
    </>
  );

  return (
    <div className="mx-4 mb-4 mt-2 flex items-center gap-3 rounded-xl border border-border bg-surface-raised/60 px-3 py-3 transition-colors hover:border-gold/30">
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
        className="flex h-11 w-11 shrink-0 items-center justify-center md:h-8 md:w-8 rounded-lg text-ivory-muted/70 transition-colors hover:bg-surface hover:text-ivory"
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}
