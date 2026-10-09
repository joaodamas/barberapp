import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Os quatro papéis de um botão, e os dois tamanhos.
 *
 * `danger` não é estilo novo: é o que duas telas já escreviam à mão, byte a
 * byte, no botão de confirmar destruição — cancelar reserva
 * (`(cliente)/reservas`) e apagar despesa (`financeiro/despesas`):
 *
 * ```
 * className="bg-danger text-white hover:bg-danger/90"
 * ```
 *
 * Duas cópias é a definição de componente segundo a régua do produto. E a cópia
 * tinha custo real: `--color-danger` é o token de "erro, perda, ação
 * destrutiva", e quem escrevesse a terceira tela de confirmação escolheria o
 * tom de novo, do zero.
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary:
    "bg-gold text-ink font-semibold hover:bg-gold-hover active:scale-[0.98]",
  secondary:
    "bg-surface-raised text-ink border border-border hover:border-gold/60",
  ghost: "text-ink-muted hover:text-ink",
  // Branco sobre `--color-danger` dá 5.57:1, e 4.65:1 no hover a 90% — a tinta
  // do hover CLAREIA o vermelho, então é o hover que define o piso, não o
  // estado de repouso. Medido em `contraste-de-tokens.test.ts`.
  danger: "bg-danger text-white font-semibold hover:bg-danger/90",
};

/**
 * `sm` é o botão de AÇÃO DE LINHA — "Dar entrada", "Registrar movimento",
 * "Tentar de novo". Nove lugares o escreviam como `min-h-9 px-3 text-xs`, o que
 * dá 36px de alvo e reprova o mínimo de 44px que a régua declara inegociável.
 *
 * Aqui ele mantém os 36px de DESENHO — cinco botões de 44px numa linha de
 * agendamento tomam a linha inteira — e recupera os 44px de ÁREA pela classe
 * `alvo-toque`, que estende a região sensível com um pseudo-elemento sem pintar
 * nada. Ver `globals.css`.
 */
type Size = "md" | "sm";

const sizes: Record<Size, string> = {
  md: "min-h-11 px-5 text-sm",
  sm: "alvo-toque min-h-9 px-3 text-xs",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        // `cursor-pointer` explícito: o navegador desenha a seta de texto em
        // `<button>`, e o produto já compensava isso à mão em `Segmented` e em
        // `.card-interactive`. Faltava justamente no botão — o controle mais
        // clicado do painel era o único sem a afordância.
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        sizes[size],
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
