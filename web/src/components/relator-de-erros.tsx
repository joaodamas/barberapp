"use client";

import { useEffect } from "react";
import { relatarErro } from "@/lib/erro-front-cliente";

/**
 * Liga `window.onerror` e `unhandledrejection` ao coletor de erros. Não
 * renderiza nada. O limite por sessão e a deduplicação ficam no relator.
 */
export function RelatorDeErros() {
  useEffect(() => {
    const aoErro = (e: ErrorEvent) => relatarErro("onerror", e.error ?? e.message);
    const aoRejeitar = (e: PromiseRejectionEvent) => relatarErro("promessa", e.reason);
    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, []);
  return null;
}
