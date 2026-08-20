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
import { formatBRL, formatPctPtBR, safePct } from "@/lib/format";
import { apuracaoDe } from "@/lib/apuracao";
import { contar, plural } from "@/lib/plural";
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
  /* `caixa` saiu da desestruturação junto com o `cashFlowMonthTotal`: ele era
   * a soma das ENTRADAS, e o atalho que o usava passou a mostrar o saldo. */
  const { dre: r, receita, fluxo, projecao, raw, status, fontesIlegiveis, erro } =
    useFinanceiro(mes);
  const apuracao = apuracaoDe(fontesIlegiveis);

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
  const marginPct = r.marginPct;
  const totalExpenses = r.totalCost;

  /* A9 · a barra media a coisa errada e por isso ficava VERDE E CHEIA embaixo
   * de "Ponto de equilíbrio não atingido no mês", ao lado da pílula "no
   * vermelho". O `: 100` era literal: não atingir o equilíbrio pintava 100% da
   * barra. O texto dizia uma coisa, a cor dizia o contrário, e a cor ganha.
   *
   * Agora a barra mede sempre a MESMA grandeza — quanto do custo do mês a
   * receita já cobriu. Atingido o equilíbrio ela fecha em 100% no tom de
   * sucesso; não atingido, ela para onde parou, em vermelho. E o percentual
   * vai escrito ao lado, porque a `UI-UX-GUIDELINES` §3 proíbe elemento que
   * dependa só de cor. */
  const coberturaDoCustoPct = safePct(r.grossRevenue, r.totalCost);
  const equilibrioAtingido = r.breakEvenDay !== null;

  const netGrowth = commercialStats.newSubscribers - commercialStats.cancellations;
  /* A19/Q24 · o atalho mostrava `caixa.total` — só a perna de ENTRADA — com a
   * legenda "histórico diário completo", e levava a uma tela cujo indicador de
   * topo diz "SOBROU NO CAIXA −R$ 664,71". R$ 180,29 prometendo o oposto do
   * destino. Os outros três cartões desta grade já mostram o número-título da
   * tela para onde apontam; este era o único que mostrava outro. */
  const cashFlowSaldo = fluxo.saldo;
  /* O cartão de Despesas somava o HISTÓRICO INTEIRO embaixo de um cabeçalho
   * que diz "Fechamento de {mês}" — e levava a uma tela cujo rodapé mostra o
   * total DO MÊS. É o mesmo defeito que os KPIs da tela de Despesas já tinham
   * corrigido internamente; o atalho ficou para trás com a versão antiga. */
  const expensesDoMes = raw.expenses.filter((e) => e.date.startsWith(mes));
  const expensesTotalDoMes = expensesDoMes.reduce((s, e) => s + e.value, 0);
  const projectedResult = projecao.at(-1)?.cumulative ?? 0;
  const activeSubscriberCount = commercialStats.activeSubscribers;

  return (
    <div className="flex flex-col gap-8 pt-1 md:gap-12 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted md:text-base">Fechamento de {rotuloDoMes(mes)}</p>
          <h1 className="text-xl text-ink md:text-4xl md:tracking-tight">Financeiro</h1>
        </div>
        {/* Dizia "Fechamento do mês" e levava à tela que o menu chama "Quanto
            sobrou" — o terceiro nome para o mesmo destino, e o mais confuso
            dos três porque "fechamento" já é o subtítulo DESTA tela. */}
        <Link href="/painel/financeiro/dre" className="hidden md:inline-flex">
          <Button variant="secondary">
            <FileDown size={16} />
            Ver quanto sobrou
          </Button>
        </Link>
      </div>

      {status === "carregando" && <LoadingRows rows={4} oQue="o resumo financeiro" />}
      {status === "erro" && <ErroAoCarregar oQue="o resumo financeiro" erro={erro} />}

      {status === "pronto" && receita.bruta === 0 && raw.expenses.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Seu resultado aparece assim que houver movimento"
          /* Dizia "o DRE e o ponto de equilíbrio se montam sozinhos". "DRE" é
             a palavra que o produto deixou de usar quando o menu virou "Quanto
             sobrou" — e o estado vazio, que é a PRIMEIRA tela que um dono novo
             vê aqui, era onde ele aprendia o termo do contador. */
          description="Marque um atendimento como concluído na tela Hoje e lance suas despesas fixas. Com essas duas coisas, o resultado do mês e o ponto de equilíbrio se montam sozinhos."
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
            value={apuracao.valor("receitaRealizada", formatBRL(r.grossRevenue))}
            caption={apuracao.legenda(
              "receitaRealizada",
              mrr.billed > 0
                ? `${formatBRL(mrr.billed)} de mensalidade contratada não entram aqui`
                : "atendimentos e vendas com desfecho registrado"
            )}
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
            tone={apuracao.tom("custoTotal", "danger")}
            icon={TrendingDown}
            label="Custo total"
            value={apuracao.valor("custoTotal", formatBRL(totalExpenses))}
            caption={apuracao.legenda(
              "custoTotal",
              "comissões, folha, taxas, produto, despesas e imposto"
            )}
          />
          <KpiTile
            tone={apuracao.tom("resultado", signTone(operatingResult))}
            icon={TrendingUp}
            label="Resultado"
            value={apuracao.valor("resultado", formatBRL(operatingResult))}
            caption={apuracao.legenda("resultado")}
          />
          <KpiTile
            tone={apuracao.tom("margem", signTone(marginPct))}
            icon={TrendingUp}
            label="Margem"
            value={apuracao.valor("margem", formatPctPtBR(marginPct))}
            caption={apuracao.legenda("margem")}
          />
        </div>

        {apuracao.ok("pontoDeEquilibrio") && (
        <Card className="flex flex-col gap-2 md:p-6">
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ink-muted">
              {equilibrioAtingido
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
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={`h-full rounded-full transition-[width] duration-300 ${
                  equilibrioAtingido ? "bg-success" : "bg-danger"
                }`}
                style={{ width: `${coberturaDoCustoPct}%` }}
              />
            </div>
            {/* O número ao lado da barra não é enfeite: sem ele, "quanto do
                custo já foi coberto" existe só como comprimento — e comprimento
                é exatamente o que a versão anterior errava. */}
            <span className="shrink-0 text-xs text-ink-muted">
              {formatPctPtBR(coberturaDoCustoPct, 0)} do custo coberto
            </span>
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
        )}

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
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
                  <span className={item.deducao ? "text-ink-muted" : "text-ink"}>
                    {item.label}
                  </span>
                  <span
                    className={`font-medium ${item.deducao ? "text-danger" : "text-ink"}`}
                  >
                    {formatBRL(item.value)} · {formatPctPtBR(item.pct, 0)}
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
              Taxas por método
            </h3>
            <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
              {paymentGateways.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGatewayId(g.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    g.id === gatewayId ? "bg-gold text-ink" : "text-ink-muted hover:text-ink"
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
                <span className="text-ink-muted">{f.method}</span>
                {/* `0.99% · 1.99% · 3.15% · 8.5%` — ponto decimal em quatro
                    linhas empilhadas, e a última com uma casa entre vizinhas de
                    duas, o que desalinhava a coluna. Duas casas fixas porque é
                    tabela de taxa: elas se comparam entre si. */}
                <span className="font-medium text-ink">{formatPctPtBR(f.pct, 2)}</span>
              </div>
            ))}
            {/* R1.1 · a promessa de versionamento caiu, e este texto era um dos
                três lugares que a faziam.
                Ela contradizia o próprio modal de conclusão, que já dizia a
                verdade: "A taxa da maquininha é registrada com o valor de hoje
                e não muda depois." A taxa é CONGELADA no fato quando ele nasce,
                e a correção de pagamento aplica a tabela vigente hoje — não há
                vigência por data em lugar nenhum do produto. */}
            <p className="border-t border-border pt-2 text-xs text-ink-muted">
              Referência de mercado, não o que você paga. A taxa que entra nos
              seus números é a que você cadastra em Configurações: ela é
              registrada no atendimento no momento em que ele é concluído e não
              muda depois.
            </p>
          </Card>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Relatórios detalhados
          </h3>
          {/* Os quatro rótulos são os do MENU, palavra por palavra. Três
              divergiam: "Fluxo de Caixa" com caixa alta onde o menu escreve
              "Fluxo de caixa", e "Projeção" onde o menu diz "Projeção de
              caixa" — que é justamente a palavra que ensina a diferença entre
              o caixa que passou e o que vem. Cartão e item de menu levam à
              mesma tela; dois nomes ensinam que são dois lugares. */}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <QuickLinkCard
              href="/painel/financeiro/dre"
              icon={TrendingUp}
              label="Quanto sobrou"
              value={apuracao.valor("resultado", formatBRL(operatingResult))}
              caption={apuracao.legenda("resultado", "resultado do mês, item a item") ?? ""}
            />
            <QuickLinkCard
              href="/painel/financeiro/fluxo-caixa"
              icon={Wallet}
              label="Fluxo de caixa"
              value={apuracao.valor("caixaDoMes", formatBRL(cashFlowSaldo))}
              caption={apuracao.legenda("caixaDoMes", "o que entrou menos o que saiu") ?? ""}
            />
            <QuickLinkCard
              href="/painel/financeiro/despesas"
              icon={Receipt}
              label="Despesas"
              value={apuracao.valor("despesasDoMes", formatBRL(expensesTotalDoMes))}
              caption={
                apuracao.legenda(
                  "despesasDoMes",
                  contar(expensesDoMes.length, "lançamento", "lançamentos")
                ) ?? ""
              }
            />
            <QuickLinkCard
              href="/painel/financeiro/projecao"
              icon={CalendarClock}
              label="Projeção de caixa"
              value={apuracao.valor("projecao", formatBRL(projectedResult))}
              caption={apuracao.legenda("projecao", "próximos 30 dias") ?? ""}
            />
          </div>
        </div>
      </section>

      {/* ---- Seção: Comercial ---- */}
      <section className="flex flex-col gap-5 pb-2 md:gap-6">
        <SectionHeader dot="bg-gold-strong" title="Comercial" subtitle="Mensalistas e loja" />

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
          <KpiTile
            tone={signTone(netGrowth)}
            icon={Users}
            label="Crescimento líquido de mensalistas"
            value={`${netGrowth >= 0 ? "+" : ""}${netGrowth}`}
            /* A palavra "novos" NÃO foi corrigida de propósito: `newSubscribers`
               recebe `ativos.length`, ou seja, TODOS os mensalistas ativos — e
               não os que entraram no mês. Escrever aqui um rótulo verdadeiro
               ("ativos") deixaria a legenda honesta embaixo de um KPI que
               continua chamando `ativos − cancelados` de "crescimento líquido",
               e esconderia o defeito em vez de resolvê-lo. É dado, não
               linguagem — reportado como STOP em `docs/VOCABULARIO.md`. */
            caption={`+${commercialStats.newSubscribers} novos · −${contar(commercialStats.cancellations, "cancelamento", "cancelamentos")}`}
          />
          <KpiTile
            tone="neutral"
            icon={TrendingUp}
            label="Mensalidade média"
            value={formatBRL(Math.round(safeAvg(mrr.billed, activeSubscriberCount)))}
            caption={`${contar(activeSubscriberCount, "mensalista", "mensalistas")} ${plural(activeSubscriberCount, "ativo", "ativos")}`}
          />
          <KpiTile
            tone={commercialStats.defaultAmount > 0 ? "danger" : "success"}
            icon={AlertCircle}
            label="Inadimplência"
            value={formatBRL(commercialStats.defaultAmount)}
            caption={`${formatPctPtBR(safePct(commercialStats.defaultAmount, mrr.contracted), 0)} do contratado`}
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
          Ver quanto sobrou
        </Button>
      </Link>
    </div>
  );
}

function SectionHeader({ dot, title, subtitle }: { dot: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
      <h2 className="font-display text-lg text-ink md:text-2xl">{title}</h2>
      <span className="text-sm text-ink-muted md:text-base">· {subtitle}</span>
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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-strong">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="truncate text-xs text-ink-muted">{caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-right">
          <span className="font-display text-sm font-semibold text-gold-strong">{value}</span>
          <ArrowRight size={14} className="text-ink-muted" />
        </div>
      </Card>
    </Link>
  );
}

function safeAvg(total: number, count: number) {
  return count > 0 ? total / count : 0;
}
