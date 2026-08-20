"use client";

import { useEffect, useState } from "react";

/**
 * Registra o service worker e resolve a troca de versão.
 *
 * O SW não faz `skipWaiting()` sozinho: ativar o build novo enquanto a aba
 * ainda executa o anterior faz ela pedir chunks que já não existem.
 *
 * Quem decide a troca depende de haver algo a perder:
 *
 * - **Antes do primeiro toque** a atualização se aplica sozinha. A pessoa
 *   acabou de chegar, não há formulário preenchido nem rolagem a perder, e o
 *   recarregamento é invisível. É o caso do dono que abre o painel de manhã
 *   depois de uma publicação da véspera.
 * - **Depois do primeiro toque**, pergunta. Recarregar por baixo de quem está
 *   no meio de uma tarefa é perder o que ela estava fazendo.
 *
 * A URL leva o build (`/sw.js?v=…`) porque é isso que faz o navegador enxergar
 * worker novo: ele só procura atualização quando o byte do script muda, e
 * `sw.js` é estático. Sem a query, nenhum deploy dispara `updatefound` — este
 * aviso existia desde sempre e nunca teve como aparecer.
 */
export function ServiceWorkerRegister() {
  const [temAtualizacao, setTemAtualizacao] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelado = false;

    let interagiu = false;
    const marcarInteracao = () => {
      interagiu = true;
    };
    const eventosDeInteracao = ["pointerdown", "keydown"] as const;
    for (const evento of eventosDeInteracao) {
      window.addEventListener(evento, marcarInteracao, { once: true, passive: true });
    }

    /* Worker novo pronto para assumir. Sem interação, troca calada — o
     * `controllerchange` abaixo recarrega e a aba volta com o build novo. */
    function resolverTroca(worker: ServiceWorker) {
      if (cancelado) return;
      if (interagiu) setTemAtualizacao(true);
      else worker.postMessage("SKIP_WAITING");
    }

    navigator.serviceWorker
      /* `updateViaCache: "none"` para o próprio script nunca sair de cache
       * HTTP: a checagem de versão não pode depender de uma resposta velha. */
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`, {
        updateViaCache: "none",
      })
      .then((registration) => {
        if (cancelado) return;
        // Já estava esperando de uma sessão anterior.
        if (registration.waiting) resolverTroca(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const instalando = registration.installing;
          if (!instalando) return;
          instalando.addEventListener("statechange", () => {
            /* Sem `controller` é a primeira instalação da vida: não há versão
             * anterior para trocar, e avisar seria ruído. */
            if (instalando.state === "installed" && navigator.serviceWorker.controller) {
              resolverTroca(instalando);
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
      for (const evento of eventosDeInteracao) {
        window.removeEventListener(evento, marcarInteracao);
      }
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
      <p className="flex-1 text-sm text-ink">Nova versão disponível.</p>
      <button
        onClick={atualizar}
        disabled={atualizando}
        className="min-h-11 rounded-xl bg-gold px-4 text-sm font-semibold text-ink transition-colors hover:bg-gold-hover disabled:opacity-60"
      >
        {atualizando ? "Atualizando…" : "Atualizar"}
      </button>
    </div>
  );
}
