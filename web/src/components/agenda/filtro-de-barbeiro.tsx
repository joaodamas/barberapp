"use client";

import { useRef, useSyncExternalStore } from "react";
import { filtroValido } from "@/lib/grade-por-barbeiro";
import { filtroAposClique, proximoChip } from "@/lib/barra-da-agenda";

/**
 * Filtro por barbeiro da Agenda e do Hoje (auditoria de 09/10): chips
 * "Todos / Fulano / Ciclano", lembrados por aparelho.
 *
 * O dono de três cadeiras abre a agenda querendo ver UMA — a da cadeira que ele
 * cobre hoje, ou a do barbeiro que ligou perguntando. Sem o filtro, achar o
 * horário de um era caçar o nome em cada cartão.
 */

/* Uma chave por tela: o filtro escolhido na Agenda não pode deixar o Hoje
 * filtrado sem o dono ter pedido. */
export type EscopoDoFiltro = "agenda" | "hoje";
const chaveDe = (e: EscopoDoFiltro) => `topete:filtro-de-barbeiro:${e}`;

/* Se o armazenamento do aparelho estiver bloqueado (aba privada, política do
 * navegador), o filtro continua funcionando na sessão: a escolha vale na
 * memória, só não sobrevive ao fechar. Um chip que não responde seria botão
 * decorativo. */
const emMemoria = new Map<EscopoDoFiltro, string | null>();
const ouvintes = new Set<() => void>();

function ler(escopo: EscopoDoFiltro): string | null {
  const lembrado = emMemoria.get(escopo);
  if (lembrado !== undefined) return lembrado;
  try {
    return window.localStorage.getItem(chaveDe(escopo)) || null;
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

function gravar(escopo: EscopoDoFiltro, id: string | null) {
  emMemoria.set(escopo, id);
  try {
    if (id) window.localStorage.setItem(chaveDe(escopo), id);
    else window.localStorage.removeItem(chaveDe(escopo));
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
  equipe: Array<{ id: string; active?: boolean }>,
  escopo: EscopoDoFiltro
): [string | null, (id: string | null) => void] {
  const guardado = useSyncExternalStore(
    assinar,
    () => ler(escopo),
    () => null
  );
  return [filtroValido(guardado, equipe), (id) => gravar(escopo, id)];
}

/**
 * Troca o filtro SEM a tela pular. Trocar de 6 colunas para 1 muda a altura do
 * conteúdo, e o navegador, para manter o scroll dentro do limite, joga a página
 * para cima — a barra saía de debaixo do cursor. Aqui medimos onde a barra está
 * antes e, depois da troca, devolvemos o scroll para que ela fique no mesmo lugar.
 */
function trocarSemPular(barra: HTMLElement | null, trocar: () => void) {
  if (!barra) return trocar();
  let rolagem: HTMLElement | null = barra.parentElement;
  while (rolagem && !/(auto|scroll)/.test(getComputedStyle(rolagem).overflowY)) rolagem = rolagem.parentElement;
  const antes = barra.getBoundingClientRect().top;
  trocar();
  /* Dois quadros: o primeiro aplica o estado, o segundo já tem a altura nova. */
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const delta = barra.getBoundingClientRect().top - antes;
      if (Math.abs(delta) < 1) return;
      if (rolagem) rolagem.scrollTop += delta;
      else window.scrollBy(0, delta);
    })
  );
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
  const grupo = useRef<HTMLDivElement>(null);
  const ativos = equipe.filter((b) => b.active !== false);
  /* Com uma cadeira só não há o que filtrar. */
  if (ativos.length < 2) return null;

  const opcoes: Array<{ id: string | null; rotulo: string }> = [
    { id: null, rotulo: "Todos" },
    ...ativos.map((b) => ({ id: b.id, rotulo: b.name })),
  ];

  const escolher = (id: string | null) => {
    /* Clicar no que já está marcado não faz nada: só "Todos" volta para Todos. */
    if (filtroAposClique(valor, id) === valor) return;
    trocarSemPular(grupo.current, () => aoMudar(id));
  };

  return (
    <div
      ref={grupo}
      role="group"
      aria-label="Filtrar por barbeiro"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
        const atual = Math.max(0, opcoes.findIndex((o) => o.id === valor));
        const alvo = proximoChip(opcoes.length, atual, e.key);
        e.preventDefault();
        escolher(opcoes[alvo].id);
        grupo.current?.querySelectorAll<HTMLButtonElement>("button")[alvo]?.focus();
      }}
      className={"flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden " + className}
    >
      {opcoes.map((o) => {
        const ativo = o.id === valor;
        return (
          <button
            key={o.id ?? "todos"}
            type="button"
            aria-pressed={ativo}
            /* Roving tabindex: um Tab entra no grupo, as setas andam dentro. */
            tabIndex={ativo ? 0 : -1}
            onClick={() => escolher(o.id)}
            className={
              "min-h-11 shrink-0 rounded-controle border px-4 text-sm transition-colors duration-150 md:min-h-10 " +
              (ativo
                ? "border-gold bg-gold font-semibold text-ink"
                : "border-border bg-surface text-ink-muted hover:border-gold/60 hover:text-ink")
            }
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}
