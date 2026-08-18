"use client";

import { Calendar, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { KpiTile } from "@/components/ui/kpi-tile";
import { formatBRL, formatWeekdayAndDay, safeDiv, safePct } from "@/lib/format";
import { useFinanceiro, mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { BarChart } from "@/components/ui/chart";
import { Voltar } from "@/components/ui/voltar";
import { BloqueioPlano } from "@/components/ui/bloqueio-plano";
import { useAcesso } from "@/lib/tenant-context";
import { LivroCaixa } from "@/components/livro-caixa";

/**
 * As saídas, com o nome que o dono usa e a explicação do que são.
 *
 * "Compra de estoque" precisa da frase: é a única saída que NÃO é custo do mês,
 * e sem dizer isso o dono soma tudo e conclui que gastou mais do que gastou.
 */
const SAIDAS_DO_FLUXO = [
  { chave: "despesa" as const, label: "Despesas", explicacao: "Aluguel, contas, fornecedores" },
  {
    chave: "compra" as const,
    label: "Compra de estoque",
    explicacao: "Sai do caixa hoje; vira custo quando a mercadoria for vendida",
  },
  { chave: "estorno" as const, label: "Devoluções", explicacao: "Dinheiro devolvido ao cliente" },
  {
    chave: "caixa" as const,
    label: "Retiradas e acertos",
    explicacao: "Sangria, pagamento de comissão e ajustes de contagem",
  },
];

export default function FluxoCaixaPage() {
  const mes = mesAtual();
  const { caixa: dailyCashHistory, fluxo, status } = useFinanceiro(mes);
  const total = dailyCashHistory.reduce((s, d) => s + d.total, 0);
  /* `avgPerDay` e `bestDay` saíram com os KPIs de entrada. Eram recortes de
   * "quanto entrou" — a pergunta que a tela já respondia quatro vezes — e o que
   * faltava era "quanto sobrou". Mantê-los calculados sem uso deixaria duas
   * derivações vivas esperando alguém reintroduzi-las sem pensar. */
  const totalAppointments = dailyCashHistory.reduce((s, d) => s + d.appointments, 0);
  const maxTotal = Math.max(...dailyCashHistory.map((d) => d.total), 1);
  const totals = dailyCashHistory.reduce(
    (acc, d) => ({
      pix: acc.pix + d.pix,
      cartao: acc.cartao + d.cartao,
      dinheiro: acc.dinheiro + d.dinheiro,
    }),
    { pix: 0, cartao: 0, dinheiro: 0 }
  );

  /* O financeiro avançado é o que separa o plano Gestão dos outros.
   * A saída fica DEPOIS dos hooks: React não aceita hook condicional, e
   * a tela precisa dos mesmos dados para o caso liberado. */
  const acesso = useAcesso();
  if (!acesso.features.advancedFinance) {
    return <BloqueioPlano titulo="Fluxo de caixa" descricao="Quanto entrou por dia e por meio de pagamento, com o formato do mês em um gráfico." />;
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <Voltar />

      <div>
        {/* A tela não dizia de que mês eram os números. */}
        <p className="text-sm text-ivory-muted md:text-base">
          Histórico diário · {rotuloDoMes(mes)}
        </p>
        <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Fluxo de Caixa</h1>
        {/* A legenda anterior dizia "só o que entra pelo balcão — mensalidades
            aparecem no Financeiro". Virou falsa na Rodada 3.2: a mensalidade
            paga gera pagamento e ENTRA aqui, e o fluxo passou a ter saídas.
            Deixar a frase seria afirmar o que não é. */}
        <p className="mt-1 text-xs text-ivory-muted md:text-sm">
          O dinheiro que entrou e saiu da conta, pelo valor líquido — a taxa da
          maquininha já vem descontada, como no extrato. Não é o mesmo que o
          resultado do mês: comprar estoque tira dinheiro hoje e vira custo só
          quando a mercadoria for vendida.
        </p>
      </div>

      {/* D8/D11 · o número que não existia em lugar nenhum do produto.
          A tela mostrava quatro recortes de ENTRADA e chamava isso de fluxo de
          caixa. "Quanto sobrou" era impossível de responder. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <KpiTile icon={TrendingUp} label="Entrou" value={formatBRL(fluxo.entradas)} />
        <KpiTile icon={TrendingDown} label="Saiu" value={formatBRL(fluxo.saidas)} />
        <KpiTile
          icon={Wallet}
          label="Sobrou no caixa"
          value={formatBRL(fluxo.saldo)}
          caption={fluxo.saldo < 0 ? "saiu mais do que entrou" : undefined}
        />
        <KpiTile
          icon={Calendar}
          label="Atendimentos"
          value={String(totalAppointments)}
          caption={`${dailyCashHistory.length} ${dailyCashHistory.length === 1 ? "dia" : "dias"} com movimento`}
        />
      </div>

      {/* Para onde o dinheiro foi. Sem isto, "saiu R$ 730" é um número que o
          dono não consegue conferir nem questionar. */}
      {fluxo.saidas > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Para onde o dinheiro foi
          </h2>
          <Card className="flex flex-col divide-y divide-border p-0">
            {SAIDAS_DO_FLUXO.filter((o) => fluxo.porOrigem[o.chave] < 0).map((o) => (
              <div key={o.chave} className="flex items-center justify-between px-3 py-2.5 md:px-4">
                <div className="min-w-0">
                  <p className="text-sm text-ivory">{o.label}</p>
                  <p className="text-[11px] text-ivory-muted">{o.explicacao}</p>
                </div>
                <span className="shrink-0 font-display text-sm font-semibold text-danger">
                  − {formatBRL(-fluxo.porOrigem[o.chave])}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {status === "carregando" && <LoadingRows rows={4} />}
      {status === "erro" && <ErroAoCarregar oQue="o caixa do período" />}
      {status === "pronto" && dailyCashHistory.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="Nenhum movimento neste mês"
          /* Dizia só "cada atendimento concluído entra aqui". Virou promessa
             parcial na Rodada 3.2: venda, mensalidade, compra, devolução e
             sangria também entram. Prometer menos do que se faz é o mesmo
             defeito de prometer mais — o dono conclui que falta registrar algo
             que o sistema já registra. */
          description="Atendimento concluído, venda, mensalidade paga, compra de estoque, devolução e retirada — tudo entra aqui automaticamente. Comece marcando um atendimento como concluído."
          actionLabel="Ir para Hoje"
          actionHref="/painel"
        />
      )}
      {dailyCashHistory.length > 0 && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium text-ivory">Entrada por dia</p>
            <p className="font-display text-lg text-ivory">{formatBRL(total)}</p>
          </div>
          {/* Trinta linhas de tabela não mostram o formato do mês: onde estão os
              picos, quais dias morreram. Uma barra por dia mostra. */}
          <BarChart
            label={`Entrada de caixa por dia em ${rotuloDoMes(mes)}.`}
            data={dailyCashHistory.map((d) => ({
              label: formatWeekdayAndDay(d.date),
              value: d.total,
            }))}
          />
        </Card>
      )}

      {dailyCashHistory.length > 0 && (
      <Card className="table-scroll overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
              <th className="px-4 py-3 font-medium md:px-6">Dia</th>
              <th className="px-4 py-3 text-right font-medium">Atendimentos</th>
              <th className="px-4 py-3 text-right font-medium">Ticket médio</th>
              <th className="px-4 py-3 text-right font-medium">Pix</th>
              <th className="px-4 py-3 text-right font-medium">Cartão</th>
              <th className="px-4 py-3 text-right font-medium">Dinheiro</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium md:px-6">&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            {dailyCashHistory.map((d) => (
              <tr
                key={d.date}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-ivory md:px-6">
                  {formatWeekdayAndDay(d.date)}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{d.appointments}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">
                  {formatBRL(safeDiv(d.total, d.appointments))}
                </td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.pix)}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.cartao)}</td>
                <td className="px-4 py-2.5 text-right text-ivory-muted">{formatBRL(d.dinheiro)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-ivory">
                  {formatBRL(d.total)}
                </td>
                <td className="px-4 py-2.5 md:px-6">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-gold"
                      style={{ width: `${safePct(d.total, maxTotal)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-medium">
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-ivory-muted md:px-6">
                Total
              </td>
              <td className="px-4 py-3 text-right text-ivory">{totalAppointments}</td>
              <td className="px-4 py-3 text-right text-ivory">
                {formatBRL(safeDiv(total, totalAppointments))}
              </td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.pix)}</td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.cartao)}</td>
              <td className="px-4 py-3 text-right text-ivory">{formatBRL(totals.dinheiro)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-display font-semibold text-ivory">
                {formatBRL(total)}
              </td>
              <td className="md:px-6" />
            </tr>
          </tfoot>
        </table>
      </Card>
      )}

      {/* D25 · o livro caixa, ao lado — e não dentro — do que a tela já mostra.
          O gráfico acima deriva dos pagamentos; isto registra o dinheiro que
          se move SEM outro fato por trás. Somar as duas metades num número só
          é a Rodada 3.2, e fazê-lo aqui seria escrever a fórmula antes de a
          decisão existir. */}
      <LivroCaixa competencia={mes} />
    </div>
  );
}
