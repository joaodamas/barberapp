"use client";

import { criarRelator, deveIgnorarErro, type RelatorDeErros } from "@/lib/erro-front";

/**
 * O relator da aba — um só por carregamento, para o limite e a deduplicação
 * valerem entre `error.tsx`, `global-error.tsx` e os ouvintes globais.
 */
let relator: RelatorDeErros | null = null;

function obter(): RelatorDeErros {
  relator ??= criarRelator(
    (erro) => {
      const corpo = JSON.stringify(erro);
      // `sendBeacon` sobrevive à navegação; `text/plain` é tipo "safelisted", sem
      // pré-voo nem recusa. Se lançar ou devolver false, `fetch` com keepalive.
      let enviado = false;
      try {
        enviado = navigator.sendBeacon?.("/api/erro", new Blob([corpo], { type: "text/plain" })) ?? false;
      } catch {
        enviado = false;
      }
      if (enviado) return;
      try {
        void fetch("/api/erro", { method: "POST", body: corpo, headers: { "Content-Type": "text/plain" }, keepalive: true }).catch(() => {});
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
    if (deveIgnorarErro(mensagem, erro)) return;
    obter()({ tipo, mensagem, digest: digest ?? "" });
  } catch {
    /* idem */
  }
}
