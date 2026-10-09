/**
 * "Recebido até agora" do Hoje: o que entrou no caixa hoje MENOS o que voltou
 * para o cliente hoje (auditoria de 09/10).
 *
 * É a mesma conta do fechamento do Telegram (`totalDoFechamento`, em
 * `functions/src/telegram/gatilhos.ts`): pagamentos do dia menos os estornos
 * LANÇADOS no dia. `refunds.date` é o dia em que o dinheiro voltou, não o do
 * atendimento — devolver hoje um corte de ontem reduz o caixa de hoje. Sem
 * isto, o dono que devolveu R$ 50 de manhã lia no painel um total maior do que
 * o da gaveta e do aviso das 21h.
 */
export function recebidoDoDia(
  brutoDoDia: number,
  estornos: Array<{ date?: string; grossAmount?: unknown }>,
  hoje: string
): { recebido: number; estornado: number } {
  const estornado =
    Math.round(
      estornos
        .filter((e) => e.date === hoje)
        .reduce((t, e) => t + (Number(e.grossAmount) || 0), 0) * 100
    ) / 100;
  return { recebido: Math.round((brutoDoDia - estornado) * 100) / 100, estornado };
}
