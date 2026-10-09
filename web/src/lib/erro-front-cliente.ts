"use client";

import { criarRelator, type RelatorDeErros } from "@/lib/erro-front";

/**
 * O relator da aba — um só por carregamento, para o limite e a deduplicação
 * valerem entre `error.tsx`, `global-error.tsx` e os ouvintes globais.
 */
let relator: RelatorDeErros | null = null;

function obter(): RelatorDeErros {
  relator ??= criarRelator(
    (erro) => {
      const corpo = JSON.stringify(erro);
      try {
        // `sendBeacon` sobrevive à navegação; `fetch` com keepalive é o plano B.
        const blob = new Blob([corpo], { type: "application/json" });
        if (navigator.sendBeacon?.("/api/erro", blob)) return;
        void fetch("/api/erro", { method: "POST", body: corpo, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      } catch {
        /* Relatar erro nunca pode gerar outro erro. */
      }
    },
    { rota: () => location.pathname, userAgent: () => navigator.userAgent },
  );
  return relator;
}

/** Manda um erro ao servidor; ignora o que repete ou passa do limite. */
export function relatarErro(tipo: string, erro: unknown, digest?: string): void {
  try {
    const mensagem = erro instanceof Error ? erro.message : String(erro ?? "");
    obter()({ tipo, mensagem, digest: digest ?? "" });
  } catch {
    /* idem */
  }
}
