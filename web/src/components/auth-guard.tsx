"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { isOnboardingComplete } from "@/lib/tenant";

/**
 * Porta de entrada das áreas logadas. O login é um só (`/login`) — o que
 * separa cliente de dono é a permissão da conta, não a tela.
 */
export function AuthGuard({
  children,
  requireOwner,
}: {
  children: React.ReactNode;
  requireOwner?: boolean;
}) {
  const { user, claims, loading } = useAuth();
  const tenant = useTenant();
  const router = useRouter();

  /* O vínculo agora é por barbearia. `claims.role` é o modelo single-tenant
   * antigo, mantido enquanto houver token não renovado em circulação. */
  const papel = claims.barbershops?.[tenant.id] ?? claims.role;
  const isOwner = papel === "owner";
  const authorized = !!user && (!requireOwner || isOwner);

  // Dono com onboarding pela metade não deve cair num painel vazio.
  const precisaOnboarding = isOwner && !isOnboardingComplete(tenant.onboarding);

  useEffect(() => {
    if (loading) return;
    if (precisaOnboarding) {
      router.replace("/comecar");
      return;
    }
    if (authorized) return;
    // Sem conta → login. Com conta, mas sem permissão → área do cliente.
    router.replace(user ? "/" : "/login");
  }, [loading, authorized, user, router, precisaOnboarding]);

  if (loading || !authorized || precisaOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
