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

/**
 * A caixa do indicador, compartilhada com o esqueleto.
 *
 * Está numa constante e não repetida nos dois porque o esqueleto SÓ serve se
 * ocupar a mesma altura do cartão real — é isso que impede o salto de layout
 * quando o dado chega. E era exatamente onde os dois tinham divergido: o
 * esqueleto usava o respiro padrão do `Card` e não desenhava a borda de topo,
 * então reservava alguns pixels a menos e a tela pulava assim que o Firestore
 * respondia. O comentário do esqueleto prometia "a MESMA altura" e o código não
 * cumpria.
 */
const CAIXA = "flex flex-col gap-1 border-t-2 md:gap-1.5";

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
    <Card padding="sm" className={cn(CAIXA, toneBorder[tone], className)}>
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

/**
 * Os indicadores enquanto o número não chegou.
 *
 * Mora ao lado de `KpiTile` de propósito: quem mudar o respiro ou o tamanho do
 * valor precisa ver, na mesma tela do editor, que existe um esqueleto obrigado
 * a acompanhar. Enquanto estava em `empty-state.tsx` — um arquivo cujo nome diz
 * "vazio", que é justamente o estado OPOSTO a "carregando" — ninguém o
 * encontrava, e ele ficou sem uso e fora de medida.
 *
 * A grade padrão é a mesma dos indicadores reais no painel. Telas com outra
 * quantidade de colunas passam a sua em `className`.
 */
export function LoadingKpis({
  count = 4,
  oQue,
  className,
}: {
  count?: number;
  /** O que está sendo carregado, para quem ouve a tela em vez de vê-la. */
  oQue?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}
      role="status"
      aria-busy="true"
      aria-label={oQue ? `Carregando ${oQue}` : "Carregando"}
    >
      {Array.from({ length: count }).map((_, i) => (
        // A borda de topo precisa OCUPAR os 2px que o cartão real ocupa, mas no
        // tom neutro: verde ou vermelho aqui seria afirmar o resultado antes de
        // ter o número.
        <Card key={i} padding="sm" className={cn(CAIXA, "border-t-border")}>
          <div className="h-4 w-2/3 animate-pulse rounded bg-surface-raised" />
          <div className="h-7 w-1/2 animate-pulse rounded bg-surface-raised md:h-8" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-surface-raised" />
        </Card>
      ))}
    </div>
  );
}

/** Verde para positivo, vermelho para negativo — usado em todo o financeiro. */
export function signTone(value: number): KpiTone {
  return value >= 0 ? "success" : "danger";
}
