/**
 * Desconto no fechamento do atendimento — pedido do dono em 28/09.
 *
 * *"Quando ele for concluir o pagamento ter um campo de desconto pra ele
 * colocar… dá opção de desconto em R$ ou %."*
 *
 * ## Quem calcula o quê
 *
 * A TELA converte o que o dono digitou (R$ ou %) em reais e grava
 * `discountAmount` na MESMA escrita da conclusão — a regra do Firestore confere
 * `0 ≤ discountAmount ≤ value`. O SERVIDOR não confia no número mesmo assim: ele
 * limita de novo contra o bruto do FATO (que numa reconclusão é o congelado, e
 * não o `value` de hoje) e é daqui que sai o valor cobrado — base do pagamento,
 * da taxa da maquininha e da comissão (decisão 3 do dono).
 *
 * ⚠️ PAR com `web/src/lib/desconto.ts`. `functions/` não importa de `web/`: a
 * conversão R$/% mora lá, o limite mora aqui, e os dois arredondam em centavo
 * do mesmo jeito. Cada lado tem teste que fixa a regra.
 */

/** Arredonda para centavo — a mesma conta de `centavos` em `financial-events`. */
function centavos(valor: number) {
  return Math.round(valor * 100) / 100;
}

/**
 * O desconto que VALE, limitado ao bruto do atendimento.
 *
 * Decisão 4 do dono: sem teto de percentual (só o dono dá desconto), mas o
 * desconto nunca passa do valor. Número inválido, negativo ou ausente vale
 * zero — reserva anterior ao campo não tem desconto nenhum.
 */
export function descontoAplicavel(params: { valor: number; discountAmount: unknown }): number {
  const valor = Math.max(0, Number(params.valor) || 0);
  const pedido = Number(params.discountAmount);
  if (!Number.isFinite(pedido) || pedido <= 0) return 0;
  return centavos(Math.min(pedido, valor));
}

/**
 * Desconto de 100% é CORTESIA — decisão 2 do dono.
 *
 * Não entrou dinheiro, e por isso não existe pagamento nem receita. A marca
 * precisa ser explícita porque, sem ela, "concluído sem método" é o caminho do
 * MENSALISTA (`metodo: null` → o plano decide a cobertura): uma cortesia a um
 * cliente com plano consumiria uma vaga da cota que ele pagou, e uma cortesia a
 * cliente sem plano viraria "pagamento com método desconhecido" de R$ 0,00.
 *
 * Valor zero sem desconto NÃO é cortesia: é um serviço cadastrado sem preço, e
 * continua no caminho de sempre.
 */
export function ehCortesia(params: { valor: number; desconto: number }): boolean {
  const valor = Number(params.valor) || 0;
  return params.desconto > 0 && params.desconto >= valor;
}
