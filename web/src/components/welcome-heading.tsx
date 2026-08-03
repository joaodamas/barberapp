"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * Saudação da home.
 *
 * A home é o único Server Component de tela do projeto, então não consegue ler
 * `useAuth` — e por isso continuou saudando "João" no código mesmo depois que
 * Perfil e sidebars passaram a mostrar o usuário real.
 */
export function WelcomeHeading() {
  const { user, loading } = useAuth();

  const firstName =
    user?.displayName?.split(/\s+/)[0] || user?.email?.split("@")[0] || "por aqui";

  return (
    <div>
      <p className="text-sm text-ivory-muted md:text-base">Bem-vindo de volta,</p>
      <h1 className="text-2xl text-ivory md:text-4xl md:tracking-tight">
        {loading ? <span className="inline-block h-8 w-32 animate-pulse rounded bg-surface-raised" /> : firstName}
      </h1>
    </div>
  );
}
