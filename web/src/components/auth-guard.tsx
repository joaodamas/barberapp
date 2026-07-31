"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

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
  const router = useRouter();
  const authorized = !!user && (!requireOwner || claims.role === "owner");

  useEffect(() => {
    if (loading || authorized) return;
    // Sem conta → login. Com conta, mas sem permissão → área do cliente.
    router.replace(user ? "/" : "/login");
  }, [loading, authorized, user, router]);

  if (loading || !authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
