"use client";

import { useEffect, useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";

type EstadoDaEntrada = "nenhuma" | "entrando" | "falhou";

function codigoNaUrl(): string | null {
  if (typeof window === "undefined") return null;
  return /(?:^#|&)entrada=([0-9a-f]{48})/.exec(window.location.hash)?.[1] ?? null;
}

/**
 * Entra com o código de uso único que `criar-conta` manda no fragmento da URL.
 *
 * A sessão do Firebase não atravessa do domínio da plataforma para o da
 * barbearia, e o dono recém-cadastrado caía no login — ver
 * `functions/src/entrada.ts`. O fragmento é apagado da barra na hora, para o
 * código não ficar no histórico nem ser copiado junto com o link.
 */
export function useEntradaPorCodigo(slug: string): EstadoDaEntrada {
  const [estado, setEstado] = useState<EstadoDaEntrada>(() =>
    codigoNaUrl() ? "entrando" : "nenhuma"
  );

  useEffect(() => {
    const codigo = codigoNaUrl();
    if (!codigo) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    let cancelado = false;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const { token } = await callFunction<{ codigo: string; slug: string }, { token: string }>(
          "trocarCodigoDeEntrada",
          { codigo, slug }
        );
        await signInWithCustomToken(auth, token);
        if (!cancelado) setEstado("nenhuma");
      } catch (e) {
        console.error("[entrada] não deu para entrar com o código", e);
        if (!cancelado) setEstado("falhou");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [slug]);

  return estado;
}
