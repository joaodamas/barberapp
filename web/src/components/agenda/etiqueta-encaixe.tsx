/**
 * "Encaixe" com cor própria (pedido do dono, 01/10): na agenda tudo era
 * dourado e o encaixe não se distinguia. Mesma forma da etiqueta de
 * mensalista, em azul (`--color-encaixe`).
 */
export function EtiquetaEncaixe({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-medium   " +
        "bg-encaixe/10 text-encaixe " +
        className
      }
    >
      Encaixe
    </span>
  );
}
