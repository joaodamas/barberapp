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
