import { dentroDoPeriodo, type Periodo } from "@/lib/analytics-periodo";
import type { CommissionDoc } from "@/lib/domain";
import { lerReais } from "@/lib/reais";

/**
 * Caixinha (gorjeta) no fechamento do atendimento — pedido do dono.
 *
 * O cliente dá a mais, e esse a mais é 100% do barbeiro que atendeu. A conta
 * (taxa da maquininha do barbeiro, repasse, fora da receita) é do servidor:
 * `calcularCaixinha`, em `functions/src/payments.ts`. Aqui mora só o que a TELA
 * decide — ler o campo digitado e dizer se ele vale.
 */

/**
 * O teto que a regra do Firestore também aplica (`caixinhaDoFechamentoValida`).
 * PAR OBRIGATÓRIO com `firestore.rules`: digitar "1000" onde se queria "10,00"
 * não pode virar repasse de milhares.
 */
export const TETO_DA_CAIXINHA = 1000;

export type LeituraDaCaixinha =
  /** Campo vazio (ou zero): sem caixinha, e a escrita fica idêntica à de antes. */
  | { estado: "vazia"; valor: 0 }
  | { estado: "ok"; valor: number }
  /** Texto que não é valor em reais — a tela avisa e NÃO conclui. */
  | { estado: "ilegivel"; valor: 0 }
  | { estado: "acima_do_teto"; valor: 0 };

/** Lê o campo com o leitor único de reais (`reais.ts`): "1.500" nunca vira R$ 1,50. */
export function lerCaixinha(texto: string): LeituraDaCaixinha {
  if (texto.trim() === "") return { estado: "vazia", valor: 0 };
  const v = lerReais(texto);
  if (v === null) return { estado: "ilegivel", valor: 0 };
  if (v === 0) return { estado: "vazia", valor: 0 };
  if (v > TETO_DA_CAIXINHA) return { estado: "acima_do_teto", valor: 0 };
  return { estado: "ok", valor: v };
}

/**
 * O que vai para a reserva, NA MESMA escrita da conclusão.
 *
 * Só com forma de pagamento escolhida: cortesia e "concluir sem cobrar" do
 * mensalista não receberam dinheiro, logo não têm caixinha (a regra do
 * Firestore também recusa `tipAmount` sem forma). Qualquer coisa que não seja
 * uma leitura `ok` não grava campo nenhum.
 */
export function camposDaCaixinha(
  leitura: LeituraDaCaixinha,
  temForma: boolean
): { tipAmount: number } | Record<string, never> {
  return temForma && leitura.estado === "ok" ? { tipAmount: leitura.valor } : {};
}

/** O que o cliente paga no total: cobrado + caixinha. */
export function totalComCaixinha(cobrado: number, leitura: LeituraDaCaixinha): number {
  return Math.round((cobrado + leitura.valor) * 100) / 100;
}

export type CaixinhaDoBarbeiro = {
  staffId: string;
  nome: string;
  /** O que os clientes deram, já descontados os estornos. */
  bruto: number;
  /** A taxa da maquininha sobre a caixinha — dele, não da casa. */
  taxa: number;
  /** O que a casa repassa: bruto − taxa. */
  liquido: number;
};

/**
 * Quanto de caixinha a casa repassa a cada barbeiro no período.
 *
 * O DRE deixa a caixinha de fora de propósito (não é receita nem despesa da
 * casa), e a comissão por barbeiro que ele mostra é só a de serviço e produto.
 * Sem esta conta, o dono acertava a comissão e esquecia a gorjeta: o dinheiro
 * entrou na maquininha e nenhuma tela dele dizia a quem pertence.
 *
 * Soma as linhas `origin: "caixinha"` como elas estão — a original, o estorno
 * de uma conclusão desfeita e o ajuste de taxa de uma correção de meio —, a
 * mesma soma que o extrato do barbeiro faz. Barbeiro com saldo zero sai.
 */
export function caixinhasDoPeriodo(params: {
  commissions: Pick<CommissionDoc, "origin" | "staffId" | "staffName" | "date" | "commissionBase" | "commissionAmount" | "feeAmount">[];
  periodo: Periodo;
  nomes?: Map<string, string>;
}): { total: number; porBarbeiro: CaixinhaDoBarbeiro[] } {
  const c = (v: number) => Math.round(v * 100) / 100;
  const por = new Map<string, CaixinhaDoBarbeiro>();
  for (const l of params.commissions) {
    if (l.origin !== "caixinha" || !dentroDoPeriodo(l.date, params.periodo)) continue;
    const id = String(l.staffId ?? "");
    const atual = por.get(id) ?? {
      staffId: id,
      nome: params.nomes?.get(id) ?? l.staffName ?? "Sem barbeiro",
      bruto: 0,
      taxa: 0,
      liquido: 0,
    };
    atual.bruto = c(atual.bruto + (Number(l.commissionBase) || 0));
    atual.taxa = c(atual.taxa + (Number(l.feeAmount) || 0));
    atual.liquido = c(atual.liquido + (Number(l.commissionAmount) || 0));
    por.set(id, atual);
  }
  const porBarbeiro = [...por.values()]
    .filter((b) => b.liquido !== 0)
    .sort((a, b) => b.liquido - a.liquido);
  return { total: c(porBarbeiro.reduce((s, b) => s + b.liquido, 0)), porBarbeiro };
}
