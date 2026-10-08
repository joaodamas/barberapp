"use client";

import Link from "next/link";
import { CalendarDays, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/cn";

/**
 * Atalho para a área de quem trabalha na barbearia. Sem isso, quem caia no
 * app do cliente não tinha como voltar sem digitar a URL na mão.
 *
 * - dono → "Painel da barbearia";
 * - barbeiro → "Minha agenda" (08/10): ele abria o app instalado, caía no
 *   início do cliente e não achava a agenda dele.
 *
 * O papel vem SÓ do vínculo por barbearia. O `claims.role` global saiu em
 * 08/10: mostrava o atalho do painel em qualquer barbearia a quem o tivesse.
 */
export function OwnerPanelLink({ className }: { className?: string }) {
  const { claims } = useAuth();
  const tenant = useTenant();
  const papel = claims.barbershops?.[tenant.id];
  if (papel !== "owner" && papel !== "staff") return null;
  const dono = papel === "owner";
  const Icone = dono ? LayoutDashboard : CalendarDays;

  return (
    <Link
      href={dono ? "/painel" : "/barbeiro"}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/5 px-3 py-2.5 text-sm font-medium text-gold-strong transition-colors hover:bg-gold/10",
        className
      )}
    >
      <Icone size={17} />
      {dono ? "Painel da barbearia" : "Minha agenda"}
    </Link>
  );
}
