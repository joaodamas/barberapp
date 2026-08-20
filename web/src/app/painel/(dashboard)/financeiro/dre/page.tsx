"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, SlidersHorizontal, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { apuracaoDe, NAO_APURADO, porQueNaoApurou, type FonteFinanceira } from "@/lib/apuracao";
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { cenarioDeCrescimento, composicaoDaReceita } from "@/lib/analytics";
import { detalheDoCustoDoVendido } from "@/lib/fontes-financeiras";
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
  /* `periodo` vem do hook, e não de `mes.startsWith(...)` montado aqui: é o
   * MESMO recorte que o motor usa para o cabeçalho. Dois filtros de período
   * escritos em lugares diferentes divergem na borda do mês, e a divergência
   * aparece como um filho a mais ou a menos sob um total que não mudou. */
  const { dre: r, receita, raw, status, periodo, fontesIlegiveis, erro } = useFinanceiro(mes);
  const dreTaxRatePct = tenant.policies.taxRatePct;

  /* D3 · o número só existe se as fontes dele puderam ser lidas.
   *
   * Com `expenses` ilegível esta tela mostrava `CUSTO FIXO TOTAL R$ 0,00` sob
   * a legenda "aluguel, contas e o que não varia com o movimento" e
   * `RESULTADO DO MÊS + R$ 30,39` onde o mês fechou em −R$ 769,61 — os
   * R$ 800,00 do aluguel que ninguém conseguiu ler. O banner de erro já estava
   * no topo; ele é uma tarja, e o número é o maior elemento da tela.
   *
   * A supressão é POR GRANDEZA e não pela tela inteira: a receita, o CMV e a
   * comissão não dependem de `expenses` e continuam sendo verdade. Apagar tudo
   * trocaria um número falso por nenhuma informação. Ver `lib/apuracao.ts`. */
  const apuracao = apuracaoDe(fontesIlegiveis);

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
   * o impacto real na margem antes de investir em crescimento.
   *
   * A fórmula saiu daqui e foi para `cenarioDeCrescimento` no motor: escrita na
   * tela, ela divergia do resultado que estava 200px acima — R$ 20,80 de
   * diferença com o slider em 0%, por não descontar imposto e arredondar em
   * reais. Ver o comentário da função. */
  const scenario = cenarioDeCrescimento({
    grossRevenue,
    variableCost: custoVariavelTotal,
    fixedCost: custoFixoTotal,
    taxRatePct: dreTaxRatePct,
    variacaoPct: scenarioPct,
  });


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

  /* O detalhe do CMV vem PRONTO do motor — `detalheDoCustoDoVendido`.
   *
   * Ele já morou aqui duas vezes e divergiu do cabeçalho as duas. Primeiro
   * listando `kind === "compra"`, e ficou órfão quando a 3.2 trocou a fonte do
   * total: R$ 18,00 no cabeçalho, R$ 180,00 no único filho. Depois recalculando
   * a venda por conta própria — mesma fonte, laço separado, arredondamento
   * próprio por filho enquanto o motor arredondava só o total.
   *
   * A causa das duas vezes é a mesma: DUAS contas para o mesmo número, e só a
   * do motor sob teste. Aqui a tela não calcula mais nada de dinheiro — só
   * resolve nome de produto e escreve a legenda. */
  const detalheCmv = detalheDoCustoDoVendido({ movements: raw.movements, periodo });

  const nomeDoProduto = (productId: string) =>
    products.find((p) => p.id === productId)?.name ??
    /* Produto apagado do cadastro continua tendo vendido no mês. Mostrar o id
     * cru do Firestore não diz nada ao dono; dizer que foi removido explica
     * por que o nome sumiu sem sumir com o custo. */
    "Produto removido do cadastro";

  const cmvTree: DreItem[] = detalheCmv.linhas.flatMap((l): DreItem[] => {
    const nome = nomeDoProduto(l.productId);

    /* A legenda mostra a CONTA, não só a quantidade. "1 un. vendida" ao lado de
     * R$ 18,00 não permite conferir nada — o dono precisa ver de onde saiu o
     * 18. Mesmo padrão da linha de comissão, que já mostra base e percentual.
     *
     * Com custos diferentes no mesmo mês não existe um "× R$ X" verdadeiro, e
     * anunciar um seria pedir uma multiplicação que não fecha: nesse caso a
     * legenda diz que o custo é médio. */
    const partes: string[] = [];
    if (l.unidadesVendidas > 0) {
      partes.push(
        l.custoUnitario !== null
          ? `${l.unidadesVendidas} un. × ${formatBRL(l.custoUnitario)}`
          : `${l.unidadesVendidas} un. · custo médio ${formatBRL(l.custoVendido / l.unidadesVendidas)}`
      );
    }
    /* A venda sem custo congelado some do total sem explicação nenhuma se a
     * tela não disser que ela existe — o dono lê um CMV menor e conclui que o
     * sistema perdeu a venda. */
    if (l.unidadesSemCusto > 0) {
      partes.push(`${l.unidadesSemCusto} un. sem custo registrado, fora do cálculo`);
    }

    const linhas: DreItem[] = [
      {
        key: `cmv.${l.productId}`,
        label: nome,
        value: l.custoVendido,
        caption: partes.join(" · ") || undefined,
      },
    ];

    /* Devolução é linha própria, com sinal — nunca abatida por dentro.
     *
     * Agregada, "vendeu 3 e devolveu 1" vira "2 un. vendidas": a devolução some
     * da tela e o número para de bater com a Loja, que mostra as 3 vendas. É o
     * contrato que `composicaoDaReceita` já usa um bloco acima, na mesma tela —
     * entradas primeiro, o que saiu delas por último. */
    if (l.unidadesDevolvidas > 0) {
      linhas.push({
        key: `cmv.${l.productId}.devolucao`,
        label: `Devolução · ${nome}`,
        value: -l.custoDevolvido,
        caption: `${l.unidadesDevolvidas} un. de volta na prateleira`,
      });
    }

    return linhas;
  });

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
      {status === "erro" && <ErroAoCarregar oQue="o resultado do mês" erro={erro} />}

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
      {/* Cada indicador consulta as PRÓPRIAS fontes. Numa falha de `expenses`,
          custo fixo e resultado deixam de ser afirmados e receita, custo
          variável e margem de contribuição continuam — eles não dependem da
          coleção que caiu, e suprimi-los seria esconder fato verdadeiro. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-4">
        <KpiTile
          tone="neutral"
          icon={Wallet}
          label="Receita realizada"
          value={apuracao.valor("receitaRealizada", formatBRL(grossRevenue))}
          caption={apuracao.legenda("receitaRealizada", "o que teve desfecho registrado")}
        />
        <KpiTile
          tone={apuracao.tom("custoVariavel", "danger")}
          icon={TrendingDown}
          label="Custo variável total"
          value={apuracao.valor("custoVariavel", formatBRL(custoVariavelTotal))}
          caption={apuracao.legenda("custoVariavel", "CMV + gateway + comissão")}
        />
        <KpiTile
          tone={apuracao.tom("margemDeContribuicao", signTone(margemContribuicao))}
          icon={TrendingUp}
          label="Margem de contribuição"
          value={apuracao.valor("margemDeContribuicao", formatBRL(margemContribuicao))}
          caption={apuracao.legenda(
            "margemDeContribuicao",
            formatPctPtBR(margemContribuicaoPct)
          )}
        />
        <KpiTile
          tone={apuracao.tom("custoFixo", "danger")}
          icon={TrendingDown}
          label="Custo fixo total"
          value={apuracao.valor("custoFixo", formatBRL(custoFixoTotal))}
          /* A legenda antiga — "aluguel, contas e o que não varia com o
             movimento" — NOMEAVA o fato que não pôde ser lido, embaixo de um
             R$ 0,00. Era a parte mais convincente do número falso. */
          caption={apuracao.legenda(
            "custoFixo",
            "aluguel, contas e o que não varia com o movimento"
          )}
        />
        <KpiTile
          tone={apuracao.tom("resultado", signTone(resultadoDoMes))}
          icon={TrendingUp}
          label="Resultado do mês"
          value={apuracao.valor("resultado", formatBRL(resultadoDoMes))}
          caption={apuracao.legenda("resultado")}
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
          {apuracao.ok("margemDeContribuicao") ? (
            <span className={signTone(margemContribuicao) === "success" ? "text-success" : "text-danger"}>
              {formatPctPtBR(margemContribuicaoPct)} · {formatBRL(margemContribuicao)}
            </span>
          ) : (
            <NaoApurado faltando={apuracao.faltando("margemDeContribuicao")} />
          )}
        </div>
        <ExpandableGroup
          label="(−) Despesas Fixas (recorrentes)"
          value={r.fixedExpenses}
          faltando={apuracao.faltando("despesasFixas")}
          items={fixasTree}
          open={open}
          toggle={toggle}
          groupKey="fixas"
          tone="danger"
        />
        <ExpandableGroup
          label="(−) Despesas Operacionais Eventuais"
          value={r.variableOperatingExpenses}
          faltando={apuracao.faltando("despesasEventuais")}
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
          {apuracao.ok("custoFixo") ? (
            <span className="text-ivory">{formatBRL(custoFixoTotal)}</span>
          ) : (
            <NaoApurado faltando={apuracao.faltando("custoFixo")} />
          )}
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2">
          <span className="text-ivory">(=) Resultado antes de impostos</span>
          {apuracao.ok("resultado") ? (
            <span className="text-ivory">{formatBRL(r.resultBeforeTax)}</span>
          ) : (
            <NaoApurado faltando={apuracao.faltando("resultado")} />
          )}
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
          {apuracao.ok("resultado") ? (
            <span
              className={`font-display font-semibold md:text-lg ${
                signTone(resultadoDoMes) === "success" ? "text-success" : "text-danger"
              }`}
            >
              {formatBRL(resultadoDoMes)}
            </span>
          ) : (
            <NaoApurado faltando={apuracao.faltando("resultado")} />
          )}
        </div>
      </Card>

      {/* O simulador projeta A PARTIR do custo fixo. Com `expenses` ilegível
          ele partia de zero e desenhava uma tabela inteira de cenários sobre um
          número que não existe — quatro linhas de dinheiro derivadas da mesma
          falha, embaixo do resultado que já tinha sido suprimido. */}
      {apuracao.ok("resultado") && (
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
      )}
      </>
      )}
    </div>
  );
}

/**
 * O lugar do número que não pôde ser determinado — D3.
 *
 * Ocupa a mesma posição do valor, no tom neutro. Não é "—": o travessão é o
 * que a tela de Despesas mostrava na maior categoria com a coleção ilegível, e
 * ele se lê como "nada", que é a conclusão errada. Aqui o texto diz que o
 * número não existe, e a linha abaixo diz por quê.
 */
function NaoApurado({ faltando }: { faltando: readonly FonteFinanceira[] }) {
  return (
    <span className="text-right">
      <span className="font-medium text-ivory-muted">{NAO_APURADO}</span>
      <span className="block text-xs text-ivory-muted">{porQueNaoApurou(faltando)}</span>
    </span>
  );
}

function ExpandableGroup({
  label,
  value,
  faltando,
  items,
  open,
  toggle,
  groupKey,
  tone,
  strong,
}: {
  label: string;
  value: number;
  /**
   * As fontes que não puderam ser lidas. Vazio quando o número é apurável.
   *
   * Com fonte faltando o grupo perde o valor E a seta: expandir mostraria uma
   * lista vazia, e lista vazia embaixo de um cabeçalho é exatamente como o
   * dono conclui "não houve lançamento nenhum".
   */
  faltando?: readonly FonteFinanceira[];
  items: DreItem[];
  open: Set<string>;
  toggle: (k: string) => void;
  groupKey: string;
  tone: "success" | "danger";
  strong?: boolean;
}) {
  const naoApurado = !!faltando?.length;
  const isOpen = open.has(groupKey) && !naoApurado;
  const valueClass = tone === "success" ? "text-success" : "text-danger";
  return (
    <div>
      <button
        type="button"
        onClick={() => !naoApurado && toggle(groupKey)}
        disabled={naoApurado}
        className="flex w-full items-center justify-between py-1.5 text-left transition-colors hover:text-ivory disabled:cursor-default"
      >
        <span className={`flex items-center gap-1.5 ${strong ? "font-semibold text-ivory" : "text-ivory"}`}>
          {naoApurado ? (
            <span className="inline-block w-3.5 shrink-0" />
          ) : (
            <ChevronDown
              size={14}
              className={`text-ivory-muted transition-transform ${isOpen ? "" : "-rotate-90"}`}
            />
          )}
          {label}
        </span>
        {naoApurado ? (
          <NaoApurado faltando={faltando!} />
        ) : (
          <span className={`font-semibold ${valueClass}`}>{formatBRL(value)}</span>
        )}
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
  /* Meio CENTAVO, não meio real.
   *
   * Com `< 0.5` a coluna DIFERENÇA escrevia "—" nas linhas de Custo Variável e
   * Margem que divergiam em R$ 0,21 — omitindo diferença real de dinheiro
   * exatamente onde ela seria conferida, e ao mesmo tempo dando ao dono a
   * impressão de que o cenário batia. Os dois lados agora vêm arredondados ao
   * centavo pelo motor; a régua tem de ser da mesma ordem. */
  const isZero = Math.abs(diff) < 0.005;
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
