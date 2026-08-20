/**
 * Concordância de número — a regra em um lugar só.
 *
 * ## Por que existe
 *
 * A tela de Fluxo de Caixa exibiu **"1 dias com movimento"** na verificação de
 * 17/08. A correção foi feita no ponto onde apareceu, com um ternário inline —
 * e essa é exatamente a razão de este arquivo existir: o mesmo ternário já
 * estava escrito à mão em Clientes (duas vezes), em Vender produto e em
 * Desfazer venda, cada um do seu jeito, e em outros onze lugares ninguém tinha
 * escrito nada. A correção pontual conserta a tela; ela não impede que o
 * defeito volte pela próxima tela que alguém escrever.
 *
 * O outro sintoma da mesma desistência é o **`(s)`** — "3 mensalidade(s)",
 * "1 serviço(s) visível(is)", "2 cadastrado(s)". Não é economia de esforço: é
 * o produto se recusando a concordar e devolvendo a conta para quem lê. As
 * `docs/UI-UX-GUIDELINES.md` §9 são explícitas: *"Concordância importa: '1 un.
 * voltou', '2 un. voltaram'"*.
 *
 * ## A regra
 *
 * ```
 * n === 1   →  singular
 * qualquer outro n  →  plural   (inclusive 0 e negativos)
 * ```
 *
 * **Zero é plural em português.** "0 dias", nunca "0 dia". É o oposto da regra
 * do inglês em nada e igual à do inglês aqui, mas a coincidência não vale como
 * justificativa: quem escrever `n < 2` acerta o zero por acidente e erra o
 * negativo.
 *
 * **Negativo concorda pela grandeza**, não pelo sinal: "−1 dia", "−2 dias".
 * Aparece em saldo e em variação, onde o número já vem com sinal.
 *
 * ## As duas formas são sempre explícitas
 *
 * Nenhuma função aqui **deduz** o plural. Português não deixa: mês → meses,
 * visível → visíveis, lançamento → lançamentos, un. → un. Um deduplicador que
 * acerta 80% dos casos produz "mêss" e "visívels" nos outros 20%, e o defeito
 * que ele cria é pior que o que resolve — passa despercebido na revisão porque
 * *parece* automatizado.
 *
 * ## O que NÃO passa por aqui
 *
 * Abreviação de unidade é **invariável**: "un.", "min", "h", "%", "R$". O que
 * concorda é o verbo ou o adjetivo ao lado dela — `"1 un. voltou"`,
 * `"2 un. voltaram"` — e é assim que `plural` é usada nesses casos.
 */

/**
 * A forma que concorda com `n`.
 *
 * Devolve **só a palavra**, sem o número. É a função para quando o número já
 * está na frase por outro caminho — ao lado de uma abreviação invariável, ou
 * dentro de uma tabela onde a contagem mora em outra célula.
 *
 * ```ts
 * `${qtd} un. ${plural(qtd, "voltou", "voltaram")} para o estoque`
 * ```
 */
export function plural(n: number, singular: string, pluralForma: string): string {
  return Math.abs(n) === 1 ? singular : pluralForma;
}

/**
 * O número e a forma que concorda com ele.
 *
 * É a função para a esmagadora maioria dos casos — a que substitui tanto o
 * `${n} dias` quanto o `${n} dia(s)`.
 *
 * ```ts
 * contar(1, "dia", "dias")   // "1 dia"
 * contar(2, "dia", "dias")   // "2 dias"
 * contar(0, "dia", "dias")   // "0 dias"
 * ```
 */
export function contar(n: number, singular: string, pluralForma: string): string {
  return `${n} ${plural(n, singular, pluralForma)}`;
}

/**
 * "1 de 3 serviços" · "1 de 1 serviço".
 *
 * O caso que quase todo mundo erra, e por isso tem função própria: **o
 * substantivo concorda com o TOTAL, não com a parte.** "Atende 1 de 3
 * serviços" está certo; "Atende 1 de 3 serviço" e "Atende 1 de 1 serviços"
 * estão errados, e o segundo é o que sai de quem pluraliza pela parte.
 *
 * A barbearia de um serviço só não é hipótese de laboratório: é o estado
 * inicial de toda barbearia que acaba de entrar.
 */
export function contarDeTotal(
  parte: number,
  total: number,
  singular: string,
  pluralForma: string
): string {
  return `${parte} de ${total} ${plural(total, singular, pluralForma)}`;
}
