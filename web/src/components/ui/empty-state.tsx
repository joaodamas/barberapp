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

/**
 * Esqueleto de TABELA financeira.
 *
 * Enquanto os dados eram constantes no código, a tela nascia pronta. Com o
 * Firestore, cada tabela tem o seu tempo de carga — e sem esqueleto o conteúdo
 * entra de uma vez e empurra tudo para baixo. Salto de layout lê como produto
 * frágil mesmo quando é rápido, e é a primeira coisa que o dono vê ao abrir o
 * financeiro no celular, em pé, no salão.
 *
 * As larguras são desiguais de propósito: barra toda do mesmo tamanho parece
 * animação de espera; desigual parece texto carregando.
 */
export function LoadingTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  const larguras = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-4/5", "w-1/3"];
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="h-3 flex-1 animate-pulse rounded bg-surface-raised" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex-1">
              <div
                className={`h-4 animate-pulse rounded bg-surface-raised ${
                  larguras[(r + c) % larguras.length]
                }`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Esqueleto de um cartão de número (KPI).
 *
 * Reserva a MESMA altura do cartão real. É isso que impede o salto: ocupar o
 * espaço antes de ter o que colocar nele.
 */
export function LoadingKpis({ count = 4 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-busy="true"
      aria-label="Carregando"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-2">
          <div className="h-3 w-2/3 animate-pulse rounded bg-surface-raised" />
          <div className="h-7 w-1/2 animate-pulse rounded bg-surface-raised" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-surface-raised" />
        </Card>
      ))}
    </div>
  );
}
