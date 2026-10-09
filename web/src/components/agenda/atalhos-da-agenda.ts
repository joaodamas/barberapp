"use client";

import { useEffect, useRef, useState } from "react";

export type LinhaDoAtalho = {
  id: string;
  /** Pode concluir (ou "veio depois"): já chegou e não terminou. */
  podeConcluir: boolean;
  /** Passou da tolerância: a regra de "não veio" é a mesma do botão. */
  atrasado: boolean;
  /** Ainda vai acontecer: pode remarcar. */
  emAberto: boolean;
};

/**
 * Atalhos de teclado da lista do dia (desktop).
 *
 * ↑/↓ andam pela lista, Enter conclui, N marca "não veio", R remarca, Esc
 * limpa. Cada atalho chama o MESMO handler do botão — com as mesmas condições
 * (`podeConcluir`, `atrasado`, `emAberto`): o teclado nunca oferece o que o
 * mouse não oferece.
 *
 * Quando NÃO intercepta, de propósito:
 * - foco em campo de texto, select ou contenteditable (digitar um "n" no campo
 *   de busca não pode marcar falta em ninguém);
 * - diálogo ou menu aberto (as teclas são deles);
 * - com Ctrl/Meta/Alt (atalhos do navegador);
 * - Enter com foco num botão ou link (Enter já ativa o controle focado);
 * - telas estreitas (celular não tem teclado, e a lista vira cartões).
 *
 * ↑/↓ seguram a rolagem da página enquanto a lista existe — por isso Esc sai e
 * devolve a rolagem, e a linha escolhida é trazida para a vista.
 */
export function useAtalhosDaAgenda(params: {
  linhas: LinhaDoAtalho[];
  ativo: boolean;
  aoConcluir: (id: string) => void;
  aoNaoVeio: (id: string) => void;
  aoRemarcar: (id: string) => void;
}) {
  const [escolhida, setEscolhida] = useState<string | null>(null);
  /* A escolha some sozinha se a linha sumiu (concluiu, mudou o dia). */
  const selecionadoId = params.linhas.some((l) => l.id === escolhida) ? escolhida : null;

  const ultimo = useRef({ ...params, selecionadoId });
  useEffect(() => {
    ultimo.current = { ...params, selecionadoId };
  });

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const { linhas, ativo, selecionadoId: atual, aoConcluir, aoNaoVeio, aoRemarcar } = ultimo.current;
      if (!ativo || linhas.length === 0) return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!window.matchMedia("(min-width: 768px)").matches) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      if (alvo?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const indice = linhas.findIndex((l) => l.id === atual);
      const linha = indice >= 0 ? linhas[indice] : null;

      if (tecla === "Escape") {
        if (atual) setEscolhida(null);
        return;
      }
      if (tecla === "ArrowDown" || tecla === "ArrowUp") {
        e.preventDefault();
        const passo = tecla === "ArrowDown" ? 1 : -1;
        const proximo =
          indice < 0
            ? tecla === "ArrowDown"
              ? 0
              : linhas.length - 1
            : Math.min(linhas.length - 1, Math.max(0, indice + passo));
        const id = linhas[proximo].id;
        setEscolhida(id);
        document
          .querySelector(`[data-linha-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (!linha) return;
      if (tecla === "Enter") {
        if (alvo?.closest('button, a, [role="menuitem"]')) return;
        if (linha.podeConcluir) {
          e.preventDefault();
          aoConcluir(linha.id);
        }
      } else if (tecla === "n" && linha.atrasado) {
        e.preventDefault();
        aoNaoVeio(linha.id);
      } else if (tecla === "r" && linha.emAberto) {
        e.preventDefault();
        aoRemarcar(linha.id);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return { selecionadoId, selecionar: setEscolhida };
}
