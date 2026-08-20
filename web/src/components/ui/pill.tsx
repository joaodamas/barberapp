import { type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "gold" | "success" | "danger" | "neutral";

/**
 * Etiqueta de estado — "Paga · Pix", "Em aberto", "Cancelado".
 *
 * ## O defeito que a superfície opaca corrige
 *
 * As três etiquetas com tom pintavam o texto do tom sobre uma TINTA do mesmo
 * tom (`bg-success/15 text-success`). Medido em `contraste-de-tokens.test.ts`:
 *
 * ```
 *              antes, sobre cartão   antes, sobre realce   agora
 * dourada             4,42:1                4,04:1         4,60:1
 * positiva            4,24:1                4,08:1         4,63:1
 * negativa            4,15:1                4,04:1         4,60:1
 * ```
 *
 * As três reprovavam os 4,5:1 de AA, e nenhum token estava errado: `--color-
 * success` sobre o cartão dá 5,14:1 com folga. Quem derrubava era a própria
 * etiqueta — texto e fundo eram a MESMA cor, então escurecer o fundo escurecia
 * junto o que precisava se destacar dele. Não existe opacidade que resolva
 * isso: a razão fica presa perto de 4,4 e piora conforme a tinta engrossa.
 *
 * ## Por que opaco, e não uma tinta mais fraca
 *
 * Tinta translúcida não tem cor própria — tem a cor do que estiver atrás. A
 * mesma etiqueta lia 4,42:1 sobre um cartão e 4,04:1 dentro de um bloco
 * elevado, e nada no código dizia qual dos dois ia acontecer. Com
 * `bg-surface-raised`, o fundo é o mesmo em qualquer lugar da tela e o
 * contraste passa a ser uma propriedade da etiqueta, não do lugar onde alguém
 * a colou.
 *
 * E resolve o white-label junto: `--color-gold` é sobrescrito por barbearia em
 * tempo de execução, então a etiqueta dourada media uma coisa diferente em cada
 * cliente — a barbearia que escolhesse um dourado mais escuro recebia uma
 * etiqueta ainda pior, e isso não apareceria em nenhum build. Agora o fundo é
 * um token da plataforma e só o texto acompanha a marca.
 *
 * O tom continua legível de relance: ele está no texto, que é o elemento com
 * contraste medido, e a borda o acompanha. A palavra dentro da etiqueta é que
 * carrega o significado — cor nenhuma responde sozinha "pago" ou "atrasado".
 */
const tones: Record<Tone, string> = {
  gold: "bg-surface-raised text-gold-strong border-gold/50",
  success: "bg-surface-raised text-success border-success/50",
  danger: "bg-surface-raised text-danger border-danger/50",
  neutral: "bg-surface-raised text-ink-muted border-border",
};

export function Pill({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
