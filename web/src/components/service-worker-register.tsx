"use client";

import { useEffect, useState } from "react";

/**
 * Registra o service worker e avisa quando há versão nova.
 *
 * O SW não faz mais `skipWaiting()` sozinho: ativar o build novo enquanto a
 * aba ainda executa o anterior faz ela pedir chunks que já não existem. Quem
 * decide a troca é o usuário, por este aviso.
 */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (cancelled) return;
        if (registration.waiting) setWaiting(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaiting(installing);
            }
          });
        });
      })
      .catch((err) => {
        console.error("Falha ao registrar service worker", err);
      });

    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;

  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md items-center gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg md:bottom-4 md:right-4 md:left-auto md:mx-0 md:max-w-sm md:rounded-2xl md:border"
    >
      <p className="flex-1 text-sm text-ivory">Nova versão disponível.</p>
      <button
        onClick={() => waiting.postMessage("SKIP_WAITING")}
        className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-ivory transition-colors hover:bg-gold-hover"
      >
        Atualizar
      </button>
    </div>
  );
}
