"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  FileDown,
  Receipt,
  Store,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { KpiTile, signTone } from "@/components/ui/kpi-tile";
import { formatBRL, safePct } from "@/lib/format";
import { computeDre, DRE_DAYS_IN_MONTH } from "@/lib/dre";
import {
  cashProjection,
  commercialStats,
  dailyCashHistory,
  monthExpenses,
  mrr,
  paymentGateways,
  revenueBreakdown,
} from "@/lib/mock-data";

const REVENUE_BAR_SHADES = ["bg-gold", "bg-gold/75", "bg-gold/50", "bg-gold/30"];

export default function FinanceiroPage() {
  const [gatewayId, setGatewayId] = useState(paymentGateways[0].id);
  const gateway = paymentGateways.find((g) => g.id === gatewayId) ?? paymentGateways[0];

  /* Mesmo cálculo que a tela de DRE usa — as duas liam a mesma base e faziam a
   * conta cada uma do seu jeito. */
  const r = computeDre();
  const operatingResult = r.result;
  const marginPct = Math.round(r.marginPct);
  const totalExpenses = r.totalCost;
  const breakEvenPct = r.breakEvenDay
    ? Math.round(safePct(r.breakEvenDay, DRE_DAYS_IN_MONTH))
    : 100;

  const totalRevenueBreakdown = revenueBreakdown.reduce((s, item) => s + item.value, 0);
  const netGrowth = commercialStats.newSubscribers - commercialStats.cancellations;
  const cashFlowMonthTotal = dailyCashHistory.reduce((s, d) => s + d.total, 0);
  const expensesTotal = monthExpenses.reduce((s, e) => s + e.value, 0);
  const projectedResult = cashProjection.at(-1)?.cumulative ?? 0;
  const activeSubscriberCount = commercialStats.activeSubscribers;

  return (
    <div className="flex flex-col gap-8 pt-1 md:gap-12 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Fechamento de julho</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Financeiro</h1>
        </div>
        <Link href="/painel/financeiro/dre" className="hidden md:inline-flex">
          <Button variant="secondary">
            <FileDown size={16} />
            Fechamento do mês
          </Button>
        </Link>
      </div>

      {/* ---- Seção: Financeiro ---- */}
      <section className="flex flex-col gap-5 md:gap-6">
        <SectionHeader dot="bg-success" title="Financeiro" subtitle="Caixa e resultado do mês" />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
          <KpiTile
            tone="neutral"
            icon={Wallet}
            label="Receita bruta"
            value={formatBRL(r.grossRevenue)}
            caption={`caixa ${formatBRL(cashFlowMonthTotal)} + mensalistas ${formatBRL(mrr.billed)}`}
          />
          <KpiTile tone="danger" icon={TrendingDown} label="Despesas" value={formatBRL(totalExpenses)} />
          <KpiTile
            tone={signTone(operatingResult)}
            icon={TrendingUp}
            label="Resultado"
            value={formatBRL(operatingResult)}
          />
          <KpiTile tone={signTone(marginPct)} icon={TrendingUp} label="Margem" value={`${marginPct}%`} />
        </div>

        <Card className="flex flex-col gap-2 md:p-6">
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ivory-muted">
              {r.breakEvenDay
                ? `Ponto de equilíbrio no dia ${r.breakEvenDay} de ${DRE_DAYS_IN_MONTH}`
                : "Ponto de equilíbrio não atingido no mês"}
            </span>
            <Pill tone={operatingResult >= 0 ? "success" : "danger"}>
              {operatingResult >= 0 ? (
                <>
                  <TrendingUp size={12} /> no verde
                </>
              ) : (
                <>
                  <TrendingDown size={12} /> no vermelho
                </>
              )}
            </Pill>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-300"
              style={{ width: `${breakEvenPct}%` }}
            />
          </div>
          <p className="text-xs text-ivory-muted md:text-sm">
            {formatBRL(r.grossRevenue)} de receita contra {formatBRL(totalExpenses)} de
            custo total — sobra {formatBRL(operatingResult)} ({marginPct}% de margem).
          </p>
        </Card>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            De onde vem o dinheiro
          </h3>
          <Card className="flex flex-col gap-3 md:p-6">
            {revenueBreakdown.map((item, i) => {
              const pct = Math.round(safePct(item.value, totalRevenueBreakdown));
              return (
                <div key={item.label} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ivory">{item.label}</span>
                    <span className="font-medium text-ivory">
                      {formatBRL(item.value)} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className={`h-full rounded-full ${REVENUE_BAR_SHADES[i] ?? "bg-gold/20"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
              Taxas por método
            </h3>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
              {paymentGateways.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGatewayId(g.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    g.id === gatewayId ? "bg-gold text-ivory" : "text-ivory-muted hover:text-ivory"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>
          <Card className="flex flex-col gap-3 md:p-6">
            {gateway.fees.map((f) => (
              <div key={f.method} className="flex items-center justify-between text-sm">
                <span className="text-ivory-muted">{f.method}</span>
                <span className="font-medium text-ivory">{f.pct}%</span>
              </div>
            ))}
            <p className="border-t border-border pt-2 text-xs text-ivory-muted">
              Cada barbearia pode operar com mais de um gateway — as taxas são
              versionadas por data de vigência e não afetam transações já
              registradas.
            </p>
          </Card>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Relatórios detalhados
          </h3>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <QuickLinkCard
              href="/painel/financeiro/dre"
              icon={TrendingUp}
              label="DRE Gerencial"
              value={formatBRL(operatingResult)}
              caption="resultado do mês, item a item"
            />
            <QuickLinkCard
              href="/painel/financeiro/fluxo-caixa"
              icon={Wallet}
              label="Fluxo de Caixa"
              value={formatBRL(cashFlowMonthTotal)}
              caption="histórico diário completo"
            />
            <QuickLinkCard
              href="/painel/financeiro/despesas"
              icon={Receipt}
              label="Despesas"
              value={formatBRL(expensesTotal)}
              caption={`${monthExpenses.length} lançamentos`}
            />
            <QuickLinkCard
              href="/painel/financeiro/projecao"
              icon={CalendarClock}
              label="Projeção"
              value={formatBRL(projectedResult)}
              caption="próximos 30 dias"
            />
          </div>
        </div>
      </section>

      {/* ---- Seção: Comercial ---- */}
      <section className="flex flex-col gap-5 pb-2 md:gap-6">
        <SectionHeader dot="bg-gold-light" title="Comercial" subtitle="Mensalistas e loja" />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
          <KpiTile
            tone={signTone(netGrowth)}
            icon={Users}
            label="Crescimento líquido de mensalistas"
            value={`${netGrowth >= 0 ? "+" : ""}${netGrowth}`}
            caption={`+${commercialStats.newSubscribers} novos · −${commercialStats.cancellations} cancelamento(s)`}
          />
          <KpiTile
            tone="neutral"
            icon={TrendingUp}
            label="Mensalidade média"
            value={formatBRL(Math.round(safeAvg(mrr.billed, activeSubscriberCount)))}
            caption={`${activeSubscriberCount} mensalista(s) ativo(s)`}
          />
          <KpiTile
            tone={commercialStats.defaultAmount > 0 ? "danger" : "success"}
            icon={AlertCircle}
            label="Inadimplência"
            value={formatBRL(commercialStats.defaultAmount)}
            caption={`${Math.round(safePct(commercialStats.defaultAmount, mrr.contracted))}% do contratado`}
          />
          <KpiTile
            tone="neutral"
            icon={Store}
            label="Faturamento da loja"
            value={formatBRL(commercialStats.storeRevenue)}
            caption={`comissão do profissional: ${formatBRL(r.commissions)}`}
          />
        </div>
      </section>

      <Link href="/painel/financeiro/dre" className="md:hidden">
        <Button variant="secondary" className="w-full">
          <FileDown size={16} />
          Ver fechamento do mês
        </Button>
      </Link>
    </div>
  );
}

function SectionHeader({ dot, title, subtitle }: { dot: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <h2 className="font-display text-lg text-ivory md:text-2xl">{title}</h2>
      <span className="text-sm text-ivory-muted md:text-base">· {subtitle}</span>
    </div>
  );
}

function QuickLinkCard({
  href,
  icon: Icon,
  label,
  value,
  caption,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Link href={href}>
      <Card interactive className="flex items-center gap-3 md:p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-light">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ivory">{label}</p>
          <p className="truncate text-xs text-ivory-muted">{caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-right">
          <span className="font-display text-sm font-semibold text-gold-light">{value}</span>
          <ArrowRight size={14} className="text-ivory-muted" />
        </div>
      </Card>
    </Link>
  );
}

function safeAvg(total: number, count: number) {
  return count > 0 ? total / count : 0;
}
