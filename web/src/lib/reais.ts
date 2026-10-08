/**
 * Lê um valor em reais digitado por gente — o único leitor dos campos de valor.
 *
 * ## O defeito que este arquivo existe para corrigir
 *
 * Cada tela lia o campo do seu jeito, e quase todas com `Number(texto)` ou
 * `Number(texto.replace(",", "."))`. Para quem escreve como brasileiro, isso é
 * uma armadilha silenciosa:
 *
 * ```
 * "1.500"    →  Number("1.500")  =  1,5      (o aluguel virou R$ 1,50)
 * "1.500,50" →  Number("1.500.50") = NaN     (o salário virou 0 e foi gravado)
 * ```
 *
 * O dono não vê erro nenhum: a despesa entra com R$ 1,50 e o resultado do mês
 * fica R$ 1.498,50 melhor do que é. Só a tela de mensalistas já tirava o ponto
 * de milhar — e por isso o leitor dela é a base deste.
 *
 * ## O que é aceito
 *
 * - vírgula é sempre decimal, e ponto antes dela é milhar: `1.500,50`, `150,5`;
 * - sem vírgula, ponto seguido de exatamente três dígitos é milhar (`1.500`,
 *   `12.000.000`); com um ou dois dígitos é decimal (`150.50`), que é como o
 *   teclado numérico de alguns celulares escreve e como o valor salvo volta
 *   para o campo;
 * - `R$` e espaços são ignorados.
 *
 * Qualquer outra coisa devolve `null` — e quem chama mostra o erro em vez de
 * gravar. Adivinhar um número a partir de "abc" é exatamente o que gravava 0
 * por cima do salário de alguém.
 */
export function lerReais(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) && texto >= 0 ? centavos(texto) : null;
  const limpo = String(texto ?? "")
    .replace(/R\$/gi, "")
    .replace(/[\s ]/g, "");
  if (limpo === "") return null;

  // Vírgula decimal, com ou sem milhar por ponto.
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(limpo) || /^\d+,\d{1,2}$/.test(limpo)) {
    return centavos(Number(limpo.replace(/\./g, "").replace(",", ".")));
  }
  // Só milhar por ponto: "1.500", "12.000.000".
  if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    return centavos(Number(limpo.replace(/\./g, "")));
  }
  // Ponto decimal (um ou dois dígitos depois) ou número inteiro.
  if (/^\d+(\.\d{1,2})?$/.test(limpo)) {
    return centavos(Number(limpo));
  }
  return null;
}

/**
 * O valor salvo de volta no campo, do jeito que o dono escreveria.
 *
 * `String(1500.5)` dá "1500.5", que o leitor entende — mas o dono, ao editar,
 * acrescentaria um zero e escreveria "1500.50" achando que era vírgula de
 * milhar. Com vírgula não há dúvida.
 */
export function reaisParaCampo(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "";
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(".", ",");
}

/** A mensagem única de campo de valor ilegível. */
export const VALOR_ILEGIVEL = "Não entendi o valor. Use só números, como 1.500 ou 1.500,50.";

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}
