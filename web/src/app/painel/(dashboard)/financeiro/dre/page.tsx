"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { formatBRL } from "@/lib/format";
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { composicaoDaReceita } from "@/lib/analytics";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { useFeature, useTenant } from "@/lib/tenant-context";
import { RecursoBloqueado } from "@/components/recurso-bloqueado";
import { Voltar } from "@/components/ui/voltar";
import { BloqueioPlano } from "@/components/ui/bloqueio-plano";
import { useAcesso } from "@/lib/tenant-context";

type DreItem = {
  key: string;
  label: string;
  value: number;
  caption?: string;
  children?: DreItem[];
};

function signTone(value: number): "success" | "danger" {
  return value >= 0 ? "success" : "danger";
}

/* O gate mora num componente à parte, e não num retorno antecipado dentro do
 * conteúdo: os hooks do conteúdo passariam a ser chamados condicionalmente. */
export default function DrePage() {
  const liberado = useFeature("advancedFinance");

  if (!liberado) {
    return (
      <RecursoBloqueado
        titulo="Quanto sobrou"
        oQueFaz="Monta o resultado do mês linha a linha: receita, comissão, custo de produto, despesa fixa, imposto e o que sobra."
        porQueVale="É a diferença entre saber quanto entrou e saber quanto ficou. Sem ele, o mês fecha no positivo no extrato e no negativo na conta."
      />
    );
  }

  return <DreConteudo />;
}

function DreConteudo() {
  const [scenarioPct, setScenarioPct] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set(["receita", "cmv"]));

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const tenant = useTenant();
  const mes = mesAtual(monthOffset);
  const { dre: r, receita, raw, status } = useFinanceiro(mes);
  const dreTaxRatePct = tenant.policies.taxRatePct;

  const monthExpenses = raw.expenses.filter((e) => e.date.startsWith(mes));
  const products = raw.products;
  const nomeProduto = new Map(raw.services.map((s) => [s.id, s.name]));

  /* A composição vem de `composicaoDaReceita`, a mesma que o Financeiro usa.
   *
   * Aqui a lista era montada à mão e incluía "Mensalistas": os filhos somavam
   * 928 sob um cabeçalho de 680, e quem expandisse e somasse não fechava. A
   * mensalidade não sumiu — ela aparece logo abaixo, no cartão de receita
   * CONTRATADA, que é onde ela é verdade. */
  const revenueBreakdown = composicaoDaReceita(receita);

  const topServices = raw.tops;
  const {
    grossRevenue,
    variableCost: custoVariavelTotal,
    contributionMargin: margemContribuicao,
    contributionMarginPct: margemContribuicaoPct,
    fixedCost: custoFixoTotal,
    payroll,
    result: resultadoDoMes,
  } = r;

  /* Simulação: escala receita e custo variável, mantém o fixo. É o que revela
   * o impacto real na margem antes de investir em crescimento. */
  const fator = 1 + scenarioPct / 100;
  const scenario = {
    grossRevenue: Math.round(grossRevenue * fator),
    variableCost: Math.round(custoVariavelTotal * fator),
    contributionMargin: Math.round(grossRevenue * fator - custoVariavelTotal * fator),
    fixedCost: custoFixoTotal,
    result: Math.round(grossRevenue * fator - custoVariavelTotal * fator - custoFixoTotal),
  };


  const servicosAvulsos = receita.servicos;
  const outrosServicos = Math.max(servicosAvulsos - topServices.reduce((s, t) => s + t.revenue, 0), 0);

  const receitaTree: DreItem[] = revenueBreakdown.map((r) => {
    if (r.label === "Serviços avulsos") {
      return {
        key: "receita.servicos",
        label: r.label,
        value: r.value,
        children: [
          ...topServices.map((s) => ({
            key: `receita.servicos.${s.name}`,
            label: s.name,
            value: s.revenue,
            caption: `${s.count} atendimentos`,
          })),
          {
            key: "receita.servicos.outros",
            label: "Outros serviços",
            value: outrosServicos,
          },
        ],
      };
    }
    if (r.label === "Produtos (loja)") {
      return {
        key: "receita.produtos",
        label: r.label,
        value: r.value,
        children: raw.movements
          .filter((m) => m.kind === "venda" && m.date.startsWith(mes))
          .map((m) => ({
            key: `receita.produtos.${m.id}`,
            label: products.find((p) => p.id === m.productId)?.name ?? nomeProduto.get(m.productId) ?? m.productId,
            value: m.value,
            caption: `${m.quantity} un.`,
          })),
      };
    }
    return { key: `receita.${r.label}`, label: r.label, value: r.value };
  });

  /* O detalhe do CMV, por produto — do que foi VENDIDO.
   *
   * Listava as COMPRAS do mês, e ficou órfão quando a Rodada 3.2 trocou a fonte
   * do total. O efeito, visto na tela: cabeçalho R$ 18,00 e um único filho de
   * R$ 180,00 embaixo. O dono que expandisse para conferir não fechava — é o
   * D6/P1-2 outra vez, agora dentro do CMV.
   *
   * Agora agrupa venda por produto, com o `unitCost` congelado de cada uma, e
   * subtrai a devolução: a mercadoria que voltou para a prateleira não foi
   * consumida. Mesma conta de `custoDoVendido`, aberta por produto. */
  const cmvTree: DreItem[] = (() => {
    const porProduto = new Map<string, { custo: number; unidades: number }>();

    for (const m of raw.movements) {
      if (!m.date.startsWith(mes)) continue;
      const custo = Number(m.unitCost);
      if (!Number.isFinite(custo)) continue;

      const devolucao = m.kind === "ajuste" && m.refundOf;
      if (m.kind !== "venda" && !devolucao) continue;

      const sinal = devolucao ? -1 : 1;
      const atual = porProduto.get(m.productId) ?? { custo: 0, unidades: 0 };
      atual.custo += sinal * custo * m.quantity;
      atual.unidades += sinal * m.quantity;
      porProduto.set(m.productId, atual);
    }

    return [...porProduto.entries()]
      .filter(([, v]) => v.unidades !== 0)
      .map(([productId, v]) => ({
        key: `cmv.${productId}`,
        label: products.find((p) => p.id === productId)?.name ?? productId,
        value: Math.round(v.custo * 100) / 100,
        caption: `${v.unidades} un. ${v.unidades === 1 ? "vendida" : "vendidas"}`,
      }));
  })();

  /* Comissão aberta POR PESSOA, e não numa linha só.
   *
   * É a maior despesa de uma barbearia com equipe, e o total agregado não
   * responde a pergunta que o dono realmente faz — "quanto o Léo me custou, e
   * quanto ele trouxe". Cada linha mostra a base e o percentual DELE, porque
   * cada barbeiro pode ter o seu. */
  const variaveisTree: DreItem[] = [
    { key: "var.gateway", label: "Taxas de gateway", value: r.gatewayFees },
    {
      key: "var.comissao",
      label: "Comissões de profissionais",
      value: r.commissions,
      children: [
        ...r.comissaoPorBarbeiro.map((b) => ({
          key: `var.comissao.${b.staffId}`,
          label: b.nome,
          value: b.valor,
          caption: `${b.pct}% sobre ${formatBRL(b.base)} · ${b.atendimentos} atendimentos`,
        })),
        ...(r.commissionsLoja > 0
          ? [
              {
                key: "var.comissao.loja",
                label: "Loja",
                value: r.commissionsLoja,
                caption: "sobre o lucro do produto, não sobre a venda",
              },
            ]
          : []),
      ],
    },
  ];

  /* Despesa fixa = recorrente. Antes TODA despesa entrava como fixa, inclusive
   * impulsionamento no Instagram e revisão de máquina — o custo fixo ficava 45%
   * inflado e o ponto de equilíbrio, errado. */
  const fixasTree: DreItem[] = monthExpenses
    .filter((e) => e.recurring)
    .map((e) => ({
      key: `fixa.${e.id}`,
      label: e.description,
      value: e.value,
      caption: e.category,
    }));

  const eventuaisTree: DreItem[] = monthExpenses
    .filter((e) => !e.recurring)
    .map((e) => ({
      key: `eventual.${e.id}`,
      label: e.description,
      value: e.value,
      caption: e.category,
    }));

  /* O financeiro avançado é o que separa o plano Gestão dos outros.
   * A saída fica DEPOIS dos hooks: React não aceita hook condicional, e
   * a tela precisa dos mesmos dados para o caso liberado. */
  const acesso = useAcesso();
  if (!acesso.features.advancedFinance) {
    return <BloqueioPlano titulo="Quanto sobrou" descricao="Veja quanto sobra depois de comissão, custo fixo e imposto — com margem de contribuição e ponto de equilíbrio calculados do seu custo real." />;
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <Voltar />

      <div className="flex items-center justify-between gap-3">
        <div>
          {/* O menu passou a dizer "Quanto sobrou" e a tela continuava dizendo
              "DRE Gerencial": o dono clicava num nome e chegava em outro. UX-01
              declarou a pendência ao renomear; fechada aqui.
              "Demonstração de resultado" fica no subtítulo — quem conhece o
              termo o reconhece, e quem não conhece não precisa dele para
              entender a tela. */}
          <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Quanto sobrou</h1>
          <p className="text-xs text-ivory-muted md:text-sm">
            Demonstração de resultado — o que entrou, o que custou e o que
            sobrou no mês
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm text-ivory-muted">
          <button
            aria-label="Mês anterior"
            disabled={monthOffset >= 11}
            onClick={() => setMonthOffset((o) => Math.min(o + 1, 11))}
            className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-32 text-center font-medium text-ivory">
            {rotuloDoMes(mes)}
          </span>
          <button
            aria-label="Próximo mês"
            disabled={monthOffset <= 0}
            onClick={() => setMonthOffset((o) => Math.max(o - 1, 0))}
            className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg transition-colors hover:bg-surface-raised hover:text-ivory disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {status === "carregando" && <LoadingRows rows={5} />}
      {status === "erro" && <ErroAoCarregar oQue="o resultado do mês" />}

      {status === "pronto" && grossRevenue === 0 && monthExpenses.length === 0 && (
        <EmptyState
          icon={Wallet}
          title={`Sem movimento em ${rotuloDoMes(mes)}`}
          description="O DRE se monta a partir dos atendimentos concluídos e das despesas lançadas. Faltam os dois neste mês."
          actionLabel="Lançar despesas"
          actionHref="/painel/financeiro/despesas"
        />
      )}

      {(grossRevenue > 0 || monthExpenses.length > 0) && (
      <>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-4">
        <KpiTile
          tone="neutral"
          icon={Wallet}
          label="Receita realizada"
          value={formatBRL(grossRevenue)}
          caption="o que teve desfecho registrado"
        />
        <KpiTile
          tone="danger"
          icon={TrendingDown}
          label="Custo variável total"
          value={formatBRL(custoVariavelTotal)}
          caption="CMV + gateway + comissão"
        />
        <KpiTile
          tone={signTone(margemContribuicao)}
          icon={TrendingUp}
          label="Margem de contribuição"
          value={formatBRL(margemContribuicao)}
          caption={`${margemContribuicaoPct.toFixed(1)}%`}
        />
        <KpiTile
          tone="danger"
          icon={TrendingDown}
          label="Custo fixo total"
          value={formatBRL(custoFixoTotal)}
          caption="aluguel, contas e o que não varia com o movimento"
        />
        <KpiTile
          tone={signTone(resultadoDoMes)}
          icon={TrendingUp}
          label="Resultado do mês"
          value={formatBRL(resultadoDoMes)}
        />
      </div>

      {/* A mensalidade fica FORA do DRE e ganha um cartão próprio.
          Enquanto não houver cobrança, o único lastro de um mensalista "ativo"
          é uma caixinha marcada — somar isso à receita seria o sistema
          afirmando um recebimento que ninguém confirmou. E como o Simples
          incide sobre a receita, o dono separava imposto por esse dinheiro. */}
      {receita.mensalistas > 0 && (
        <Card className="flex flex-col gap-1 text-sm md:p-6">
          <div className="flex items-baseline justify-between">
            <span className="text-ivory">Receita contratada</span>
            <span className="font-display text-lg text-ivory-muted">
              {formatBRL(receita.mensalistas)}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ivory-muted">
            Mensalidades de planos ativos. <strong className="text-ivory">Não entra</strong>{" "}
            no resultado nem no imposto acima: o sistema ainda não cobra
            mensalidade, então não tem como saber se ela foi paga. Quando a
            cobrança existir, o valor recebido passa a compor a receita.
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-0.5 text-sm md:p-6 md:text-base">
        <ExpandableGroup
          label="Receita realizada"
          value={grossRevenue}
          items={receitaTree}
          open={open}
          toggle={toggle}
          groupKey="receita"
          tone="success"
          strong
        />
        <ExpandableGroup
          label="(−) Custo de Mercadoria Vendida"
          value={r.cmv}
          items={cmvTree}
          open={open}
          toggle={toggle}
          groupKey="cmv"
          tone="danger"
        />
        <ExpandableGroup
          label="(−) Despesas Variáveis"
          value={r.gatewayFees + r.commissions}
          items={variaveisTree}
          open={open}
          toggle={toggle}
          groupKey="variaveis"
          tone="danger"
        />
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <span className="text-ivory">(=) Custo Variável Total</span>
          <span className="text-ivory">{formatBRL(custoVariavelTotal)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
          <span className="text-ivory">(=) Margem de Contribuição</span>
          <span className={signTone(margemContribuicao) === "success" ? "text-success" : "text-danger"}>
            {margemContribuicaoPct.toFixed(1)}% · {formatBRL(margemContribuicao)}
          </span>
        </div>
        <ExpandableGroup
          label="(−) Despesas Fixas (recorrentes)"
          value={r.fixedExpenses}
          items={fixasTree}
          open={open}
          toggle={toggle}
          groupKey="fixas"
          tone="danger"
        />
        <ExpandableGroup
          label="(−) Despesas Operacionais Eventuais"
          value={r.variableOperatingExpenses}
          items={eventuaisTree}
          open={open}
          toggle={toggle}
          groupKey="eventuais"
          tone="danger"
        />
        {/* A folha só aparece quando existe. A linha era renderizada sempre,
            eternamente em R$ 0,00, dizendo "(operação solo)" — o que fazia
            parecer que mão de obra estava contabilizada e custava nada. Hoje o
            pagamento de barbeiro é comissão, e vive no custo variável. */}
        {payroll > 0 && (
          <div className="flex items-center justify-between py-1.5 pl-5">
            <span className="text-ivory-muted">
              (−) Salário fixo <span className="text-xs">(quem não recebe por comissão)</span>
            </span>
            <span className="font-medium text-danger">{formatBRL(payroll)}</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <span className="text-ivory">(=) Custo Fixo Total</span>
          <span className="text-ivory">{formatBRL(custoFixoTotal)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <span className="text-ivory">(=) Resultado antes de impostos</span>
          <span className="text-ivory">{formatBRL(r.resultBeforeTax)}</span>
        </div>
        <div className="flex items-center justify-between py-1.5 pl-5">
          <span className="text-ivory-muted">
            (−) Impostos{" "}
            <span className="text-xs">(Simples, {dreTaxRatePct}% sobre o faturamento)</span>
          </span>
          <span className="font-medium text-danger">{formatBRL(r.tax)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="font-semibold text-ivory">Resultado do Mês</span>
          <span
            className={`font-display font-semibold md:text-lg ${
              signTone(resultadoDoMes) === "success" ? "text-success" : "text-danger"
            }`}
          >
            {formatBRL(resultadoDoMes)}
          </span>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 md:p-6">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-ivory md:text-base">
            <SlidersHorizontal size={14} className="text-gold-light" />
            Simulação de cenário de crescimento
          </h4>
          <p className="text-xs text-ivory-muted md:text-sm">
            O custo variável escala proporcionalmente com a receita; o custo
            fixo permanece igual — assim você vê o impacto real na margem
            antes de investir em crescimento.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-ivory-muted md:text-sm">
            <span>Variação de faturamento</span>
            <span className="font-semibold text-gold-light">
              {scenarioPct > 0 ? "+" : ""}
              {scenarioPct}%
            </span>
          </div>
          <input
            type="range"
            min={-50}
            max={100}
            step={5}
            value={scenarioPct}
            onChange={(e) => setScenarioPct(Number(e.target.value))}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-raised accent-gold"
          />
          <div className="flex justify-between text-[11px] text-ivory-muted">
            <span>-50%</span>
            <span>0%</span>
            <span>+100%</span>
          </div>
        </div>

        <div className="table-scroll overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
                <th className="pb-2 font-medium">Indicador</th>
                <th className="pb-2 text-right font-medium">Atual</th>
                <th className="pb-2 text-right font-medium">Cenário simulado</th>
                <th className="pb-2 text-right font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              <ScenarioRow label="Receita" atual={grossRevenue} simulado={scenario.grossRevenue} />
              <ScenarioRow
                label="Custo Variável Total"
                atual={custoVariavelTotal}
                simulado={scenario.variableCost}
                invert
              />
              <ScenarioRow label="Margem de Contribuição" atual={margemContribuicao} simulado={scenario.contributionMargin} />
              <ScenarioRow label="Custo Fixo Total" atual={custoFixoTotal} simulado={scenario.fixedCost} invert />
              <ScenarioRow
                label="Resultado do Mês"
                atual={resultadoDoMes}
                simulado={scenario.result}
                strong
              />
            </tbody>
          </table>
        </div>
      </Card>
      </>
      )}
    </div>
  );
}

function ExpandableGroup({
  label,
  value,
  items,
  open,
  toggle,
  groupKey,
  tone,
  strong,
}: {
  label: string;
  value: number;
  items: DreItem[];
  open: Set<string>;
  toggle: (k: string) => void;
  groupKey: string;
  tone: "success" | "danger";
  strong?: boolean;
}) {
  const isOpen = open.has(groupKey);
  const valueClass = tone === "success" ? "text-success" : "text-danger";
  return (
    <div>
      <button
        type="button"
        onClick={() => toggle(groupKey)}
        className="flex w-full items-center justify-between py-1.5 text-left transition-colors hover:text-ivory"
      >
        <span className={`flex items-center gap-1.5 ${strong ? "font-semibold text-ivory" : "text-ivory"}`}>
          <ChevronDown
            size={14}
            className={`text-ivory-muted transition-transform ${isOpen ? "" : "-rotate-90"}`}
          />
          {label}
        </span>
        <span className={`font-semibold ${valueClass}`}>{formatBRL(value)}</span>
      </button>
      {isOpen && (
        <div className="pb-1">
          {items.map((item) => (
            <DreDetailRow key={item.key} item={item} depth={1} open={open} toggle={toggle} tone={tone} />
          ))}
        </div>
      )}
    </div>
  );
}

function DreDetailRow({
  item,
  depth,
  open,
  toggle,
  tone,
}: {
  item: DreItem;
  depth: number;
  open: Set<string>;
  toggle: (k: string) => void;
  tone: "success" | "danger";
}) {
  const hasChildren = !!item.children?.length;
  const isOpen = open.has(item.key);
  const valueClass = tone === "success" ? "text-success" : "text-danger";
  return (
    <>
      <div
        className="flex items-center justify-between py-1 text-sm"
        style={{ paddingLeft: depth * 20 }}
      >
        <button
          type="button"
          onClick={() => hasChildren && toggle(item.key)}
          disabled={!hasChildren}
          className={`flex items-center gap-1.5 text-left text-ivory-muted ${hasChildren ? "hover:text-ivory" : ""}`}
        >
          {hasChildren ? (
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
            />
          ) : (
            <span className="inline-block w-3 shrink-0" />
          )}
          <span>
            {item.label}
            {item.caption && <span className="ml-1.5 text-xs">({item.caption})</span>}
          </span>
        </button>
        <span className={`font-medium ${valueClass}`}>{formatBRL(item.value)}</span>
      </div>
      {hasChildren &&
        isOpen &&
        item.children!.map((child) => (
          <DreDetailRow key={child.key} item={child} depth={depth + 1} open={open} toggle={toggle} tone={tone} />
        ))}
    </>
  );
}

function ScenarioRow({
  label,
  atual,
  simulado,
  invert,
  strong,
}: {
  label: string;
  atual: number;
  simulado: number;
  invert?: boolean;
  strong?: boolean;
}) {
  const diff = simulado - atual;
  const isZero = Math.abs(diff) < 0.5;
  const isGood = invert ? diff <= 0 : diff >= 0;
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className={`py-2 ${strong ? "font-semibold text-ivory" : "text-ivory"}`}>{label}</td>
      <td className="py-2 text-right text-ivory-muted">{formatBRL(atual)}</td>
      <td className={`py-2 text-right ${strong ? "font-semibold text-ivory" : "text-ivory"}`}>
        {formatBRL(simulado)}
      </td>
      <td className={`py-2 text-right ${isZero ? "text-ivory-muted" : isGood ? "text-success" : "text-danger"}`}>
        {isZero ? "—" : `${diff > 0 ? "+" : ""}${formatBRL(diff)}`}
      </td>
    </tr>
  );
}
