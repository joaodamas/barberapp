"use client";

import { X } from "lucide-react";

/**
 * O que a tela sabe de um envio que está esperando o prazo (ou que falhou).
 * A fila em si mora em `lib/envio-adiado.ts`; aqui é só o que se desenha.
 */
export type AvisoAdiado = {
  id: string;
  /** "Concluído · R$ 60,00 · Pix" — dito no passado, como o dono lê o resultado. */
  texto: string;
  /** O que a LINHA mostra no lugar das ações enquanto isto não terminou. */
  linha: string;
  /** `espera` ainda desfaz; `enviando` já saiu; `erro` voltou e pede leitura. */
  estado: "espera" | "enviando" | "erro";
  erro?: string;
  esperaMs: number;
};

/**
 * O aviso do rodapé: confirma o gesto e oferece "Desfazer" por alguns segundos.
 *
 * Não afirma gravação — afirma o gesto. Enquanto o prazo corre, a gravação não
 * aconteceu (é por isso que desfazer funciona); a barra fina mostra quanto
 * falta, e ao zerar o envio sai. Se o servidor recusar, o aviso VIRA o erro e
 * fica até alguém fechar: perder uma conclusão em silêncio é o pior desfecho
 * possível desta tela.
 *
 * Escuro de propósito: é o único elemento que flutua sobre a lista inteira, e
 * precisa se separar dela sem depender de sombra.
 */
export function AvisosAdiados({
  avisos,
  aoDesfazer,
  aoFechar,
}: {
  avisos: AvisoAdiado[];
  aoDesfazer: (id: string) => void;
  aoFechar: (id: string) => void;
}) {
  if (avisos.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {avisos.map((a) => (
        <div
          key={a.id}
          role={a.estado === "erro" ? "alert" : "status"}
          className="aviso-entra pointer-events-auto relative w-full max-w-md overflow-hidden rounded-superficie bg-ink text-surface shadow-lg"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 text-[14px] leading-snug">
              {a.estado === "erro" ? (
                <>
                  <span className="font-semibold">Não foi salvo.</span> {a.erro}
                </>
              ) : (
                a.texto
              )}
            </p>
            {a.estado === "espera" && (
              <button
                type="button"
                onClick={() => aoDesfazer(a.id)}
                className="alvo-toque -my-1 shrink-0 cursor-pointer rounded-controle px-3 py-2 text-[14px] font-semibold text-surface underline underline-offset-4 transition-colors duration-150 hover:bg-surface/10 focus-visible:outline-surface"
              >
                Desfazer
              </button>
            )}
            {a.estado === "enviando" && <span className="shrink-0 text-[13px] text-surface/70">Salvando…</span>}
            {a.estado === "erro" && (
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => aoFechar(a.id)}
                className="alvo-toque -my-1 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-controle text-surface transition-colors duration-150 hover:bg-surface/10 focus-visible:outline-surface"
              >
                <X size={16} strokeWidth={1.75} aria-hidden />
              </button>
            )}
          </div>
          {a.estado === "espera" && (
            <div
              aria-hidden
              className="aviso-tempo absolute inset-x-0 bottom-0 h-0.5 bg-surface/60"
              style={{ "--aviso-duracao": `${a.esperaMs}ms` } as React.CSSProperties}
            />
          )}
        </div>
      ))}
    </div>
  );
}
