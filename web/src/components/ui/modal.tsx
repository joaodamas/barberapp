"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();

  /* `onClose` numa ref, e FORA das dependências do efeito — este é o conserto
   * do bug que fazia todo campo de modal aceitar UM caractere só.
   *
   * Todo consumidor passa `onClose={() => setAlgo(false)}`: uma função nova a
   * cada render. Com ela na lista de dependências, digitar uma letra disparava
   * a cadeia inteira:
   *
   *   setState do formulário → re-render do pai → `onClose` muda de identidade
   *     → cleanup do efeito → `previouslyFocused.focus()`  (foco SAI do modal)
   *     → efeito roda de novo → `dialogRef.focus()`        (foca o container)
   *
   * O caractere entrava, o foco era arrancado do campo, e o seguinte ia para o
   * nada. O efeito existe para montar focus trap e travar o scroll — coisas que
   * dependem de `open`, não de qual função fecha o diálogo. */
  const onCloseRef = useRef(onClose);
  /* A escrita vai num efeito próprio, e não no corpo do componente: mexer em
   * ref durante o render é impuro, e `react-hooks/refs` recusa — com razão. Este
   * efeito roda a cada mudança de `onClose`, mas não faz nada além de guardar a
   * referência: não toca em foco, em scroll nem em listener. */
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Trava o scroll do fundo: sem isso a página rola atrás do diálogo.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco inicial dentro do diálogo, senão o teclado continua no fundo.
    dialogRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;

      // Focus trap: Tab não escapa do diálogo.
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
    /* Só `open`. Ver o comentário da ref acima: incluir `onClose` remontava o
     * focus trap a cada tecla. */
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        // `aria-labelledby` em vez de `aria-label`: aponta para o título que
        // está VISÍVEL na tela. Com o rótulo duplicado numa string, mudar o
        // `<h2>` e esquecer a prop faz o leitor de tela anunciar um nome que
        // não está mais escrito em lugar nenhum — e ninguém percebe, porque a
        // tela continua certa para quem enxerga.
        aria-labelledby={`${id}-titulo`}
        aria-describedby={description ? `${id}-descricao` : undefined}
        tabIndex={-1}
        padding="lg"
        className={cn("max-h-[90vh] w-full max-w-lg overflow-y-auto", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-titulo`} className="text-lg font-semibold text-ivory">
              {title}
            </h2>
            {description && (
              <p id={`${id}-descricao`} className="mt-0.5 text-sm text-ivory-muted">
                {description}
              </p>
            )}
          </div>
          {/* `alvo-toque`: no desktop o botão encolhe para 32px de desenho, e
              num notebook com tela sensível ao toque isso é um alvo de 32px
              real. O pseudo-elemento devolve os 44px sem alargar o cabeçalho. */}
          <button
            aria-label={`Fechar ${title}`}
            onClick={onClose}
            className="alvo-toque flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ivory-muted transition-colors hover:bg-surface-raised hover:text-ivory md:h-8 md:w-8"
          >
            <X size={16} />
          </button>
        </div>

        {children}

        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </Card>
    </div>
  );
}
