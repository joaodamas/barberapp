"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/cn";

/**
 * Atalho para o painel — só aparece para quem é dono. Sem isso, um dono que
 * caia no app do cliente não tem como voltar sem digitar a URL na mão.
 */
export function OwnerPanelLink({ className }: { className?: string }) {
  const { claims } = useAuth();
  const tenant = useTenant();
  const papel = claims.barbershops?.[tenant.id] ?? claims.role;
  if (papel !== "owner") return null;

  return (
    <Link
      href="/painel"
      className={cn(
        "flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm font-medium text-gold-strong transition-colors hover:bg-gold/10",
        className
      )}
    >
      <LayoutDashboard size={17} />
      Painel da barbearia
    </Link>
  );
}
