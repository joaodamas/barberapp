"use client";

import { useEffect, useState } from "react";

/**
 * Registra o service worker e avisa quando há versão nova.
 *
 * O SW não faz `skipWaiting()` sozinho: ativar o build novo enquanto a aba
 * ainda executa o anterior faz ela pedir chunks que já não existem. Quem decide
 * a troca é o usuário, por este aviso.
 */
export function ServiceWorkerRegister() {
  const [temAtualizacao, setTemAtualizacao] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelado = false;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        if (cancelado) return;
        if (registration.waiting) setTemAtualizacao(true);

        registration.addEventListener("updatefound", () => {
          const instalando = registration.installing;
          if (!instalando) return;
          instalando.addEventListener("statechange", () => {
            if (instalando.state === "installed" && navigator.serviceWorker.controller) {
              setTemAtualizacao(true);
            }
          });
        });
      })
      .catch((err) => console.error("Falha ao registrar service worker", err));

    let recarregando = false;
    const aoTrocarControlador = () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", aoTrocarControlador);

    return () => {
      cancelado = true;
      navigator.serviceWorker.removeEventListener("controllerchange", aoTrocarControlador);
    };
  }, []);

  /**
   * Busca o worker em espera NA HORA do clique, em vez de usar uma referência
   * guardada no estado.
   *
   * Guardar a referência quebrava exatamente no caso que mais acontece: vários
   * deploys com a aba aberta. Cada novo build substitui o worker em espera, e o
   * que estava no estado vira `redundant` — `postMessage` nele não faz nada e o
   * botão parece morto.
   *
   * E se ainda assim não houver worker em espera, recarrega: é melhor um
   * recarregamento a mais do que um botão que não responde.
   */
  async function atualizar() {
    setAtualizando(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update().catch(() => undefined);

      const esperando = registration?.waiting;
      if (esperando) {
        esperando.postMessage("SKIP_WAITING");
        // Se o `controllerchange` não vier em 3s, força na mão.
        setTimeout(() => window.location.reload(), 3000);
        return;
      }
      window.location.reload();
    } catch {
      window.location.reload();
    }
  }

  if (!temAtualizacao) return null;

  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md items-center gap-3 border-t border-border bg-surface px-4 py-3 shadow-lg md:bottom-4 md:right-4 md:left-auto md:mx-0 md:max-w-sm md:rounded-2xl md:border"
    >
      <p className="flex-1 text-sm text-ivory">Nova versão disponível.</p>
      <button
        onClick={atualizar}
        disabled={atualizando}
        className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-ivory transition-colors hover:bg-gold-hover disabled:opacity-60"
      >
        {atualizando ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}
