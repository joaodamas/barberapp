"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";

export type ItemDoMenu = {
  id: string;
  rotulo: string;
  aoEscolher: () => void;
  /** Ação que desfaz ou destrói algo: o texto vai em vermelho. */
  perigo?: boolean;
  /** A tecla de atalho, quando existe — aparece à direita, só no desktop. */
  atalho?: string;
};

const LARGURA = 220;
const ALTURA_DO_ITEM = 44;

/**
 * O "Mais" (⋯) de uma linha: tudo que não é a ação principal.
 *
 * Existe porque a linha da agenda tinha três botões contornados do mesmo peso
 * em TODA linha — uma parede de ruído em que a ação que o dono faz dez vezes
 * por dia não se distinguia da que ele faz uma por semana. Aqui cabe o que é
 * raro ou destrutivo, a um toque de distância.
 *
 * O menu sai num portal com `position: fixed`: as tabelas do painel rolam na
 * horizontal (`overflow-x-auto`), e um menu absoluto dentro delas era cortado
 * na última linha. Fecha ao rolar ou redimensionar, em vez de ficar solto no
 * lugar onde o botão estava.
 *
 * Teclado: abre com Enter/Espaço/↓, setas e Home/End andam, Esc fecha e devolve
 * o foco ao botão, Tab fecha. Alvo de 44px no celular.
 */
export function MenuMais({
  rotulo,
  itens,
  dica,
  className,
}: {
  /** Nome acessível do botão: diga DE QUEM é ("Mais ações de Carlos"). */
  rotulo: string;
  itens: ItemDoMenu[];
  /** Linha pequena no pé do menu — as dicas de teclado. Só no desktop. */
  dica?: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ top: number; left: number } | null>(null);
  const aberto = posicao !== null;

  function abrir() {
    const r = botaoRef.current?.getBoundingClientRect();
    if (!r) return;
    const alto = itens.length * ALTURA_DO_ITEM + 16 + (dica ? 40 : 0);
    const cabeAbaixo = r.bottom + 4 + alto <= window.innerHeight;
    setPosicao({
      top: cabeAbaixo ? r.bottom + 4 : Math.max(8, r.top - 4 - alto),
      left: Math.min(Math.max(8, r.right - LARGURA), window.innerWidth - LARGURA - 8),
    });
  }

  function fechar(devolverFoco = true) {
    setPosicao(null);
    if (devolverFoco) botaoRef.current?.focus();
  }

  /* Foco no primeiro item ao abrir. */
  useEffect(() => {
    if (!aberto) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [aberto]);

  /* Fora, rolagem e redimensionamento fecham. */
  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      const alvo = e.target as Node;
      if (menuRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return;
      setPosicao(null);
    }
    const fecharSemFoco = () => setPosicao(null);
    document.addEventListener("pointerdown", fora);
    window.addEventListener("resize", fecharSemFoco);
    window.addEventListener("scroll", fecharSemFoco, true);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("resize", fecharSemFoco);
      window.removeEventListener("scroll", fecharSemFoco, true);
    };
  }, [aberto]);

  function andar(delta: number | "inicio" | "fim") {
    const lista = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (lista.length === 0) return;
    const atual = lista.indexOf(document.activeElement as HTMLElement);
    const proximo =
      delta === "inicio" ? 0 : delta === "fim" ? lista.length - 1 : (atual + delta + lista.length) % lista.length;
    lista[proximo].focus();
  }

  function teclasDoMenu(e: React.KeyboardEvent) {
    switch (e.key) {
      case "Escape":
        /* Só o menu: o diálogo por baixo (a janela do atendimento) não pode
         * fechar junto. */
        e.stopPropagation();
        e.preventDefault();
        fechar();
        break;
      case "ArrowDown":
        e.preventDefault();
        andar(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        andar(-1);
        break;
      case "Home":
        e.preventDefault();
        andar("inicio");
        break;
      case "End":
        e.preventDefault();
        andar("fim");
        break;
      case "Tab":
        e.preventDefault();
        fechar();
        break;
    }
  }

  if (itens.length === 0) return null;

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => (aberto ? fechar(false) : abrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !aberto) {
            e.preventDefault();
            abrir();
          }
        }}
        className={cn(
          "alvo-toque inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-controle text-ink-muted transition-colors duration-150 hover:bg-surface-raised hover:text-ink md:h-9 md:w-9",
          aberto && "bg-surface-raised text-ink",
          className
        )}
      >
        <MoreHorizontal size={18} strokeWidth={1.75} aria-hidden />
      </button>
      {posicao &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={rotulo}
            onKeyDown={teclasDoMenu}
            style={{ top: posicao.top, left: posicao.left, width: LARGURA }}
            className="menu-entra fixed z-[70] rounded-superficie border border-border bg-surface p-1 shadow-md"
          >
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  fechar();
                  item.aoEscolher();
                }}
                className={cn(
                  "flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-controle px-3 text-left text-[14px] transition-colors duration-150 hover:bg-surface-raised focus-visible:bg-surface-raised md:min-h-[2.25rem] md:text-[13px]",
                  item.perigo ? "text-danger" : "text-ink"
                )}
              >
                <span>{item.rotulo}</span>
                {item.atalho && (
                  <kbd className="hidden font-sans text-[12px] text-ink-muted md:inline">{item.atalho}</kbd>
                )}
              </button>
            ))}
            {dica && (
              <div role="none" className="mt-1 hidden border-t border-border px-3 pb-1 pt-2 text-[12px] text-ink-muted md:block">
                {dica}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
