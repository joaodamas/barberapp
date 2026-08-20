import type { Doc } from "@/lib/db/repository";
import type { CashEntryDoc } from "@/lib/domain";

/**
 * O que a tela mostra do livro caixa — D25.
 *
 * Tudo DERIVADO. Nada aqui decide sinal nem direção: os dois nascem no
 * servidor, resolvidos pelo tipo do movimento. A tela lê o fato.
 *
 * **Esta camada não sabe somar o Fluxo de Caixa.** Ela conhece só os
 * lançamentos independentes — sangria, troco, aporte, pagamento de comissão,
 * ajuste. Atendimento, venda e mensalidade entram no Fluxo por derivação dos
 * próprios fatos, e juntar as duas metades é a Rodada 3.2. Fazer isso aqui
 * seria escrever a fórmula antes de ter a decisão.
 */

export const ROTULO_DO_TIPO: Record<CashEntryDoc["kind"], string> = {
  sangria: "Sangria",
  troco_inicial: "Troco inicial",
  aporte: "Aporte do dono",
  pagamento_comissao: "Pagamento de comissão",
  ajuste: "Ajuste de caixa",
};

/** O que cada tipo significa, para quem nunca leu a documentação. */
export const EXPLICACAO_DO_TIPO: Record<CashEntryDoc["kind"], string> = {
  sangria: "Dinheiro retirado da gaveta — depósito, cofre, pagamento em espécie",
  troco_inicial: "Fundo de troco colocado na gaveta na abertura",
  aporte: "Dinheiro do próprio dono entrando no caixa",
  pagamento_comissao: "Acerto pago ao barbeiro",
  ajuste: "Correção de contagem — sobra ou falta encontrada ao conferir",
};

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * O saldo dos lançamentos independentes.
 *
 * Soma direta: o sinal já está no fato. Uma leitura que precisasse de um
 * `switch` sobre `kind` erraria no dia em que um tipo novo aparecesse.
 */
export function saldoDosLancamentos(entradas: Doc<CashEntryDoc>[]): number {
  return centavos(entradas.reduce((s, e) => s + (Number(e.amount) || 0), 0));
}

export type ResumoDoCaixa = {
  entradas: number;
  saidas: number;
  saldo: number;
  quantidade: number;
};

/**
 * Entradas e saídas separadas, mais o saldo.
 *
 * Separadas de propósito: um saldo de R$ 170 pode ser R$ 170 de aporte ou
 * R$ 1.000 de aporte com R$ 830 de sangria — e o dono precisa da diferença.
 * É a mesma decisão de `resumoDasFaturas` (faturado × recebido × em aberto).
 *
 * `saidas` sai POSITIVO: é o número que o dono lê como "saiu tanto". O sinal
 * serve para somar, não para exibir.
 */
export function resumoDoCaixa(
  entradas: Doc<CashEntryDoc>[],
  competencia?: string
): ResumoDoCaixa {
  const doPeriodo = competencia
    ? entradas.filter((e) => String(e.date).startsWith(competencia))
    : entradas;

  let dentro = 0;
  let fora = 0;
  for (const e of doPeriodo) {
    const v = Number(e.amount) || 0;
    if (v >= 0) dentro += v;
    else fora += -v;
  }

  return {
    entradas: centavos(dentro),
    saidas: centavos(fora),
    saldo: centavos(dentro - fora),
    quantidade: doPeriodo.length,
  };
}

/** Os lançamentos do período, mais recentes primeiro. */
export function lancamentosDoPeriodo(
  entradas: Doc<CashEntryDoc>[],
  competencia?: string,
  limite = 20
): Doc<CashEntryDoc>[] {
  return entradas
    .filter((e) => !competencia || String(e.date).startsWith(competencia))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, limite);
}
