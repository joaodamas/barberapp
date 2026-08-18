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
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { paymentGateways } from "@/lib/business-rules";
import { composicaoDaReceita } from "@/lib/analytics";

const REVENUE_BAR_SHADES = ["bg-gold", "bg-gold/75", "bg-gold/50", "bg-gold/30"];

export default function FinanceiroPage() {
  const [gatewayId, setGatewayId] = useState(paymentGateways[0].id);
  const gateway = paymentGateways.find((g) => g.id === gatewayId) ?? paymentGateways[0];

  const mes = mesAtual();
  const { dre: r, receita, caixa, projecao, raw, status } = useFinanceiro(mes);

  /* Sem mensalistas: esta é a composição da receita REALIZADA, e mensalidade
   * não tem lastro de recebimento enquanto não houver cobrança. Ela aparece
   * logo abaixo, com nome próprio. */
  const revenueBreakdown = composicaoDaReceita(receita);

  const mrr = {
    billed: receita.mensalistas,
    contracted: raw.subscribers
      .filter((s) => s.status !== "cancelado")
      .reduce((t, s) => t + s.price, 0),
  };
  const ativos = raw.subscribers.filter((s) => s.status === "ativo");
  const commercialStats = {
    newSubscribers: ativos.length,
    cancellations: raw.subscribers.filter((s) => s.status === "cancelado").length,
    defaultAmount: raw.subscribers
      .filter((s) => s.status === "suspenso")
      .reduce((t, s) => t + s.price, 0),
    storeRevenue: receita.produtos,
    activeSubscribers: ativos.length,
  };

  const operatingResult = r.result;
  const marginPct = Math.round(r.marginPct);
  const totalExpenses = r.totalCost;
  const breakEvenPct = r.breakEvenDay ? Math.round(safePct(r.breakEvenDay, r.diasNoMes)) : 100;

  const netGrowth = commercialStats.newSubscribers - commercialStats.cancellations;
  const cashFlowMonthTotal = caixa.reduce((s, d) => s + d.total, 0);
  const expensesTotal = raw.expenses.reduce((s, e) => s + e.value, 0);
  const projectedResult = projecao.at(-1)?.cumulative ?? 0;
  const activeSubscriberCount = commercialStats.activeSubscribers;

  return (
    <div className="flex flex-col gap-8 pt-1 md:gap-12 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Fechamento de {rotuloDoMes(mes)}</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Financeiro</h1>
        </div>
        <Link href="/painel/financeiro/dre" className="hidden md:inline-flex">
          <Button variant="secondary">
            <FileDown size={16} />
            Fechamento do mês
          </Button>
        </Link>
      </div>

      {status === "carregando" && <LoadingRows rows={4} />}
      {status === "erro" && <ErroAoCarregar oQue="o resumo financeiro" />}

      {status === "pronto" && receita.bruta === 0 && raw.expenses.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Seu resultado aparece assim que houver movimento"
          description="Marque um atendimento como concluído na tela Hoje e lance suas despesas fixas. Com essas duas coisas, o DRE e o ponto de equilíbrio se montam sozinhos."
          actionLabel="Lançar despesas"
          actionHref="/painel/financeiro/despesas"
        />
      )}

      {(receita.bruta > 0 || raw.expenses.length > 0) && (
      <>
      {/* ---- Seção: Financeiro ---- */}
      <section className="flex flex-col gap-5 md:gap-6">
        <SectionHeader dot="bg-success" title="Financeiro" subtitle="Caixa e resultado do mês" />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
          <KpiTile
            tone="neutral"
            icon={Wallet}
            label="Receita realizada"
            value={formatBRL(r.grossRevenue)}
            caption={
              mrr.billed > 0
                ? `${formatBRL(mrr.billed)} de mensalidade contratada não entram aqui`
                : "atendimentos e vendas com desfecho registrado"
            }
          />
          {/* "Despesas" descrevia outra coisa: o valor é o CUSTO TOTAL — CMV,
              taxas, comissões, folha e imposto incluídos. O dono pensa em
              aluguel e luz, que somam bem menos. O número está certo para o que
              é, e agora o rótulo diz o que ele é.
              A legenda enumera as SEIS parcelas de `totalCost`, e não cinco: a
              folha fixa entra por `folhaMensal(staff)` e some da conta de quem
              lê. Uma enumeração incompleta seria o mesmo defeito num tamanho
              menor. `rodada-1.test.ts` prova que as seis fecham o total. */}
          <KpiTile
            tone="danger"
            icon={TrendingDown}
            label="Custo total"
            value={formatBRL(totalExpenses)}
            caption="comissões, folha, taxas, produto, despesas e imposto"
          />
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
                ? `Ponto de equilíbrio no dia ${r.breakEvenDay} de ${r.diasNoMes}`
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
          {/* A frase de fechamento saiu daqui.
           *
           * Ela dizia "{receita} de receita contra {custo total} de custo total
           * — sobra {resultado} ({margem}% de margem)": os QUATRO números dos
           * quatro `KpiTile` que estão 40px acima, na MESMA ordem em que eles
           * aparecem. Quatro repetições literais, nenhum quinto número.
           *
           * Nada saiu da tela: Receita realizada, Custo total, Resultado e
           * Margem continuam onde estavam. O que saiu foi a segunda impressão
           * deles — a régua da §2 é que a tela mostre o que o dono precisa
           * decidir, e ler o mesmo número duas vezes não é uma decisão a mais.
           *
           * O que este cartão responde e nenhum outro elemento responde
           * continua aqui: em que DIA do mês o faturamento cobriu o custo. */}
        </Card>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            De onde vem o dinheiro
          </h3>
          <Card className="flex flex-col gap-3 md:p-6">
            {/* O percentual vem PRONTO de `composicaoDaReceita`, calculado sobre
                a receita bruta. A tela chegou a fazer a conta sozinha com a
                receita líquida no denominador, e as fatias somavam 123% num mês
                com devolução. Decisão de número mora no motor. */}
            {revenueBreakdown.map((item, i) => (
              <div key={item.label} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className={item.deducao ? "text-ivory-muted" : "text-ivory"}>
                    {item.label}
                  </span>
                  <span
                    className={`font-medium ${item.deducao ? "text-danger" : "text-ivory"}`}
                  >
                    {formatBRL(item.value)} · {item.pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
                  {/* A dedução não ganha barra: barra mede fatia, e devolução
                      não é fatia da receita — é o que saiu dela. */}
                  {!item.deducao && (
                    <div
                      className={`h-full rounded-full ${REVENUE_BAR_SHADES[i] ?? "bg-gold/20"}`}
                      style={{ width: `${item.pct}%` }}
                    />
                  )}
                </div>
              </div>
            ))}
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
              label="Quanto sobrou"
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
              caption={`${raw.expenses.length} lançamentos`}
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
            caption={`comissão sobre o lucro da loja: ${formatBRL(r.commissionsLoja)}`}
          />
        </div>
      </section>

      </>
      )}

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
