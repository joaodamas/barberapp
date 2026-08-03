import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * Cartão de indicador do painel.
 *
 * Estava copiado byte a byte em Financeiro, DRE e Projeção — três lugares para
 * ajustar a cada mudança de tom ou espaçamento.
 */
export type KpiTone = "success" | "danger" | "neutral";

const toneBorder: Record<KpiTone, string> = {
  success: "border-t-success",
  danger: "border-t-danger",
  neutral: "border-t-gold",
};

const toneText: Record<KpiTone, string> = {
  success: "text-success",
  danger: "text-danger",
  neutral: "text-gold-light",
};

export function KpiTile({
  tone = "neutral",
  icon: Icon,
  label,
  value,
  caption,
  className,
}: {
  tone?: KpiTone;
  icon: LucideIcon;
  label: string;
  value: string;
  caption?: string;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-1 border-t-2 p-3 md:gap-1.5 md:p-5",
        toneBorder[tone],
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={toneText[tone]} aria-hidden />
        <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">
          {label}
        </p>
      </div>
      <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{value}</p>
      {caption && <p className="text-[11px] text-ivory-muted md:text-xs">{caption}</p>}
    </Card>
  );
}

/** Verde para positivo, vermelho para negativo — usado em todo o financeiro. */
export function signTone(value: number): KpiTone {
  return value >= 0 ? "success" : "danger";
}
