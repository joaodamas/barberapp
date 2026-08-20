import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * O respiro do cartão, em quatro passos nomeados.
 *
 * O padrão `p-4` do componente quase nunca era o que a tela queria: quinze
 * cartões acrescentavam `md:p-6` à mão, dois `md:p-7`, um `md:p-5`, e as listas
 * zeravam com `p-0` para desenhar o próprio recheio. Ou seja, a decisão mais
 * repetida do produto — quanto um cartão respira — estava sendo tomada de novo
 * em cada arquivo, e três telas de análise lado a lado podiam ter três
 * espessuras diferentes de moldura.
 *
 * Os valores não são novos: cada passo é um que já existe no código hoje.
 * O que é novo é serem QUATRO, e terem nome.
 *
 * ```
 * none   listas que desenham o próprio recheio (divide-y)
 * sm     bloco denso — cartão de indicador, tela de operação
 * md     padrão
 * lg     tela de análise, que o dono lê sentado e que pede mais ar
 * ```
 *
 * Espaço é o principal recurso de elegância do produto e é de graça — mas só
 * funciona se for o MESMO espaço em toda parte. Generoso e inconsistente lê
 * como desalinhado, não como generoso.
 */
type Padding = "none" | "sm" | "md" | "lg";

const paddings: Record<Padding, string> = {
  none: "p-0",
  sm: "p-3 md:p-5",
  md: "p-4",
  lg: "p-4 md:p-6",
};

export const Card = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { interactive?: boolean; padding?: Padding }
>(function Card({ className, interactive, padding = "md", ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        "card-elevated rounded-2xl border border-border bg-surface",
        paddings[padding],
        interactive && "card-interactive",
        className
      )}
      {...props}
    />
  );
});
