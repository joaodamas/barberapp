"use client";

import { useSyncExternalStore } from "react";

/**
 * `prefers-reduced-motion` como estado do React, sem efeito.
 *
 * `useSyncExternalStore` lê a preferência na hora do render e acompanha se a
 * pessoa mudar o ajuste do sistema com a página aberta. No servidor não há
 * preferência para ler: assume movimento normal, e o CSS (`motion-reduce:`)
 * cobre o primeiro quadro.
 */
const CONSULTA = "(prefers-reduced-motion: reduce)";

function assinar(aoMudar: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

export function useMenosMovimento(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false
  );
}
