"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Os modais abertos, do mais antigo ao mais novo. O listener de teclado vive no
 * `document`, então com dois modais empilhados (um formulário e, por cima, a
 * confirmação) um Esc fechava OS DOIS. Só o de cima responde.
 */
const pilhaDeModais: string[] = [];

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  protegerFechamento = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /**
   * Há algo digitado/escolhido que se perderia ao fechar. Com `true`, fechar
   * pelo fundo, pelo Esc ou pelo X pede confirmação DENTRO do modal em vez de
   * descartar em silêncio (o toque sem querer no fundo apagava o formulário do
   * balcão inteiro). Botões do próprio consumidor ("Voltar", "Cancelar") seguem
   * chamando `onClose` direto: ali a pessoa já decidiu.
   */
  protegerFechamento?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const id = useId();
  /* O id na pilha vai por ref: o efeito do foco só pode depender de `open`. */
  const idNaPilha = useRef(id);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  /* Refs pelo mesmo motivo de `onCloseRef`: o efeito do foco só depende de
   * `open`, e precisa enxergar o valor de agora. */
  const protegerRef = useRef(protegerFechamento);
  const confirmandoRef = useRef(confirmandoSaida);
  useEffect(() => {
    protegerRef.current = protegerFechamento;
    confirmandoRef.current = confirmandoSaida;
  }, [protegerFechamento, confirmandoSaida]);

  /* Fundo, X e Esc passam por aqui. */
  function pedirParaFechar() {
    if (protegerFechamento) setConfirmandoSaida(true);
    else onClose();
  }

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

    pilhaDeModais.push(idNaPilha.current);

    function onKeyDown(e: KeyboardEvent) {
      // Empilhado: quem não está por cima não reage (nem Esc, nem Tab).
      if (pilhaDeModais[pilhaDeModais.length - 1] !== idNaPilha.current) return;
      if (e.key === "Escape") {
        if (confirmandoRef.current) setConfirmandoSaida(false);
        else if (protegerRef.current) setConfirmandoSaida(true);
        else onCloseRef.current();
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
      const posicao = pilhaDeModais.lastIndexOf(idNaPilha.current);
      if (posicao >= 0) pilhaDeModais.splice(posicao, 1);
      // Reaberto, o modal não pode voltar já perguntando se quer descartar.
      setConfirmandoSaida(false);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
    /* Só `open`. Ver o comentário da ref acima:
     * incluir `onClose` remontava o focus trap a cada tecla. */
  }, [open]);

  if (!open) return null;

  /* No celular o diálogo é uma GAVETA: encosta embaixo e sobe, e não flutua no
   * meio da tela. É onde o polegar já está — o botão de confirmar fica ao
   * alcance da mão que segura o aparelho — e é o mesmo gesto do "Mais", que
   * sobe da barra. Do `sm` para cima volta a ser o cartão centralizado.
   *
   * Só a ENTRADA é animada (`modal-gaveta` e `fundo-escurece`, em
   * `globals.css`). A saída pediria manter o diálogo montado depois do
   * `open={false}`, e todo consumidor desmonta no fechar; fechar seco é o
   * comportamento de antes e não engana ninguém. */
  return (
    <div
      className="fundo-escurece fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={pedirParaFechar}
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
        className={cn(
          "modal-gaveta max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-b-none rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-h-[90vh] sm:rounded-2xl sm:pb-4 md:pb-6",
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={`${id}-titulo`} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description && (
              <p id={`${id}-descricao`} className="mt-0.5 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          {/* `alvo-toque`: no desktop o botão encolhe para 32px de desenho, e
              num notebook com tela sensível ao toque isso é um alvo de 32px
              real. O pseudo-elemento devolve os 44px sem alargar o cabeçalho. */}
          <button
            aria-label={`Fechar ${title}`}
            onClick={pedirParaFechar}
            className="alvo-toque flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink md:h-8 md:w-8"
          >
            <X size={16} />
          </button>
        </div>

        {children}

        {confirmandoSaida ? (
          <div
            role="alert"
            className="mt-5 flex flex-col gap-3 rounded-xl border border-gold/40 bg-surface-raised p-4"
          >
            <div>
              <p className="text-sm font-medium text-ink">Descartar o que você preencheu?</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Se fechar agora, o que foi escolhido ou digitado aqui se perde.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button autoFocus variant="secondary" onClick={() => setConfirmandoSaida(false)}>
                Continuar editando
              </Button>
              <Button variant="danger" onClick={onClose}>
                Descartar
              </Button>
            </div>
          </div>
        ) : (
          footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>
        )}
      </Card>
    </div>
  );
}
