"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";

type Claims = {
  /** Vínculo por barbearia: `{ "<barbershopId>": "owner" | "staff" }`. */
  barbershops?: Record<string, string>;
  /** A cadeira do barbeiro por barbearia: `{ "<barbershopId>": "<staffId>" }` (05/10). */
  equipe?: Record<string, string>;
  /** Operador da plataforma (suporte). */
  platformAdmin?: boolean;
  /** Conta criada por nós com senha provisória: prende na tela de troca. */
  mustChangePassword?: boolean;
};

type AuthState = {
  user: User | null;
  claims: Claims;
  loading: boolean;
  /**
   * A conta não pôde ser confirmada: o token não veio (rede caiu no meio) ou
   * o Auth não respondeu no tempo-limite. Estado TERMINAL, com saída — antes
   * era uma rodinha para sempre (Loja do painel e agendar, 28/09).
   */
  semResposta: boolean;
};

const initialState: AuthState = { user: null, claims: {}, loading: true, semResposta: false };

/* Sem conta, o Auth responde em milissegundos; com conta, é um pedido de token.
 * 15s é folga para 3G ruim e ainda é menos do que alguém espera olhando uma
 * rodinha antes de desistir do app. */
const TEMPO_LIMITE_MS = 15_000;

const AuthContext = createContext<AuthState>(initialState);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  /* Um único objeto de estado, de propósito: usuário e permissões PRECISAM
   * chegar na mesma renderização. Se forem dois setState separados, existe um
   * instante com "logado, mas sem permissão ainda" — e quem lê `role` nesse
   * instante (o redirect do login, o AuthGuard) decide errado. */
  const [state, setState] = useState<AuthState>(initialState);

  /* `onIdTokenChanged`, e não `onAuthStateChanged`.
   *
   * `onAuthStateChanged` só dispara quando QUEM está logado muda. Na troca da
   * senha provisória a tela entra de novo com a MESMA conta — o token novo
   * já não tem `mustChangePassword`, mas o contexto continuava com as
   * permissões antigas, e o painel devolvia para /trocar-senha num laço
   * (24/09, primeiro acesso real de um dono em produção). O mesmo valia para
   * qualquer permissão concedida depois do login. `onIdTokenChanged` dispara
   * em entrada, saída e todo token novo — as permissões seguem o token. */
  useEffect(() => {
    let respondeu = false;
    const relogio = setTimeout(() => {
      if (!respondeu) setState((s) => (s.loading ? { ...s, loading: false, semResposta: true } : s));
    }, TEMPO_LIMITE_MS);

    const cancelar = onIdTokenChanged(auth, async (user) => {
      respondeu = true;
      if (!user) {
        setState({ user: null, claims: {}, loading: false, semResposta: false });
        return;
      }
      let token;
      try {
        token = await user.getIdTokenResult();
      } catch (err) {
        console.error("[auth] não foi possível ler o token da conta", err);
        setState({ user, claims: {}, loading: false, semResposta: true });
        return;
      }
      setState({
        user,
        claims: {
          barbershops: token.claims.barbershops as Record<string, string> | undefined,
          equipe: token.claims.equipe as Record<string, string> | undefined,
          platformAdmin: token.claims.platformAdmin === true,
          mustChangePassword: token.claims.mustChangePassword === true,
        },
        loading: false,
        semResposta: false,
      });
    });
    return () => {
      clearTimeout(relogio);
      cancelar();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
