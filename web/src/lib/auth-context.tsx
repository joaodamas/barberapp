"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Claims = {
  /** Vínculo por barbearia: `{ "<barbershopId>": "owner" | "staff" }`. */
  barbershops?: Record<string, string>;
  /** Operador da plataforma (suporte). */
  platformAdmin?: boolean;
  /** @deprecated modelo single-tenant; sai quando os tokens renovarem. */
  role?: string;
};

type AuthState = {
  user: User | null;
  claims: Claims;
  loading: boolean;
};

const initialState: AuthState = { user: null, claims: {}, loading: true };

const AuthContext = createContext<AuthState>(initialState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  /* Um único objeto de estado, de propósito: usuário e permissões PRECISAM
   * chegar na mesma renderização. Se forem dois setState separados, existe um
   * instante com "logado, mas sem permissão ainda" — e quem lê `role` nesse
   * instante (o redirect do login, o AuthGuard) decide errado. */
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, claims: {}, loading: false });
        return;
      }
      const token = await user.getIdTokenResult();
      setState({
        user,
        claims: {
          barbershops: token.claims.barbershops as Record<string, string> | undefined,
          platformAdmin: token.claims.platformAdmin === true,
          role: token.claims.role as string | undefined,
        },
        loading: false,
      });
    });
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
