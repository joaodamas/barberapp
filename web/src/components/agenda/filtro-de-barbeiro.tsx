"use client";

import { useSyncExternalStore } from "react";
import { filtroValido } from "@/lib/grade-por-barbeiro";

/**
 * Filtro por barbeiro da Agenda e do Hoje (auditoria de 09/10): chips
 * "Todos / Fulano / Ciclano", lembrados por aparelho.
 *
 * O dono de três cadeiras abre a agenda querendo ver UMA — a da cadeira que ele
 * cobre hoje, ou a do barbeiro que ligou perguntando. Sem o filtro, achar o
 * horário de um era caçar o nome em cada cartão.
 */

const CHAVE = "topete:filtro-de-barbeiro";

/* Se o armazenamento do aparelho estiver bloqueado (aba privada, política do
 * navegador), o filtro continua funcionando na sessão: a escolha vale na
 * memória, só não sobrevive ao fechar. Um chip que não responde seria botão
 * decorativo. */
let emMemoria: string | null | undefined;
const ouvintes = new Set<() => void>();

function ler(): string | null {
  if (emMemoria !== undefined) return emMemoria;
  try {
    return window.localStorage.getItem(CHAVE) || null;
  } catch {
    return null;
  }
}

function assinar(aviso: () => void) {
  ouvintes.add(aviso);
  return () => {
    ouvintes.delete(aviso);
  };
}

function gravar(id: string | null) {
  emMemoria = id;
  try {
    if (id) window.localStorage.setItem(CHAVE, id);
    else window.localStorage.removeItem(CHAVE);
  } catch {
    /* só na memória */
  }
  ouvintes.forEach((f) => f());
}

/**
 * O barbeiro filtrado, já validado contra a equipe: quem saiu (ou foi
 * desativado) depois de o filtro ser guardado volta a "Todos" em vez de deixar
 * a agenda vazia sem explicação.
 */
export function useFiltroDeBarbeiro(
  equipe: Array<{ id: string; active?: boolean }>
): [string | null, (id: string | null) => void] {
  const guardado = useSyncExternalStore(assinar, ler, () => null);
  return [filtroValido(guardado, equipe), gravar];
}

export function FiltroDeBarbeiro({
  equipe,
  valor,
  aoMudar,
  className = "",
}: {
  equipe: Array<{ id: string; name: string; active?: boolean }>;
  valor: string | null;
  aoMudar: (id: string | null) => void;
  className?: string;
}) {
  const ativos = equipe.filter((b) => b.active !== false);
  /* Com uma cadeira só não há o que filtrar. */
  if (ativos.length < 2) return null;

  const opcoes: Array<{ id: string | null; rotulo: string }> = [
    { id: null, rotulo: "Todos" },
    ...ativos.map((b) => ({ id: b.id, rotulo: b.name })),
  ];

  return (
    <div
      role="group"
      aria-label="Filtrar por barbeiro"
      className={"flex gap-1.5 overflow-x-auto pb-1 " + className}
    >
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id ?? "todos"}
            type="button"
            aria-pressed={ativo}
            onClick={() => aoMudar(o.id)}
            className={
              "min-h-11 shrink-0 rounded-full border px-4 text-sm transition-colors " +
              (ativo
                ? "border-gold bg-gold/10 font-medium text-ink"
                : "border-border bg-surface text-ink-muted hover:border-gold/60")
            }
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
