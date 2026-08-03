import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Estado vazio que ensina, em vez de tabela em branco.
 *
 * Um tenant novo abre toda tela financeira sem nada. Mostrar "R$ 0,00" em toda
 * célula não diz o que fazer — e é a primeira impressão do produto.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const acao = actionLabel && (
    <Button onClick={onAction}>{actionLabel}</Button>
  );

  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center md:py-16">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-light">
        <Icon size={22} aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ivory md:text-base">{title}</p>
        <p className="mt-1 text-xs text-ivory-muted md:text-sm">{description}</p>
      </div>
      {actionHref ? <Link href={actionHref}>{acao}</Link> : acao}
    </Card>
  );
}

/** Esqueleto de carregamento — evita o pisca-vazio antes do dado chegar. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-raised" />
      ))}
    </div>
  );
}
