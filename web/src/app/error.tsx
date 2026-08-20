"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * O limite de erro do produto — o que aparece quando uma tela quebra ao render.
 *
 * ## O que a auditoria encontrou
 *
 * Não existia `error.tsx` **nem** `global-error.tsx` no app inteiro. Qualquer
 * exceção não tratada durante o render caía no overlay do Next: preto, em
 * inglês, com stack trace em produção reduzido a *"Application error: a
 * client-side exception has occurred"*.
 *
 * O 404 tinha o mesmo problema e é o caso benigno — quem chega lá errou o
 * endereço. Aqui é o oposto: quem chega estava **no meio de uma tarefa**, e a
 * tela que sumiu pode ser a que ele acabou de usar para registrar dinheiro.
 *
 * ## Por que a primeira frase é sobre o dado, não sobre o erro
 *
 * A pergunta real de quem vê uma tela quebrar depois de clicar em "Confirmar
 * venda" não é *"o que houve?"*. É **"perdi o que eu tinha feito?"**. Essa
 * pergunta vem antes, e é a que o overlay do Next nunca respondeu.
 *
 * A resposta é honesta porque o produto foi construído para ela: toda escrita
 * financeira passa por Cloud Function com id derivado do fato. Se a gravação
 * aconteceu, ela sobreviveu à tela; se não aconteceu, não deixou meia
 * transação para trás. É a mesma garantia que `ErroAoCarregar` afirma com
 * "nada foi perdido", agora estendida ao caso em que a tela morre.
 *
 * ## Por que `reset()` e não `location.reload()`
 *
 * `reset()` remonta a subárvore sem recarregar a aplicação inteira, o que
 * preserva a sessão e não refaz o download. Recarregar continua disponível
 * pelo navegador para quem quiser o caminho mais bruto.
 */
export default function ErroDeTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    /* O `digest` é o único elo entre o que o dono viu e o que está no log do
     * servidor. Sem ele no console, um relato de "quebrou" é irrastreável. */
    console.error("[tela]", error.digest ?? "", error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <AlertTriangle size={28} className="text-danger" aria-hidden />
        <h1 className="font-display text-xl text-ivory">Esta tela não abriu</h1>
        <p className="max-w-sm text-sm text-ivory-muted">
          Alguma coisa quebrou ao montar a página.{" "}
          <strong className="text-ivory">O que você já tinha registrado está salvo</strong> —
          o que falhou foi mostrar, não gravar.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex min-h-11 items-center rounded-xl bg-gold px-5 text-sm font-semibold text-ivory transition-colors hover:bg-gold-hover"
        >
          Tentar de novo
        </button>
        <a
          href="/painel"
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm text-ivory transition-colors hover:bg-surface-raised"
        >
          Voltar ao painel
        </a>
      </div>

      {error.digest && (
        /* Some visualmente do fluxo principal e continua copiável: é o que o
         * dono manda no WhatsApp quando pede ajuda. */
        <p className="text-[11px] text-ivory-muted">
          Código para suporte: <span className="font-mono">{error.digest}</span>
        </p>
      )}
    </main>
  );
}
