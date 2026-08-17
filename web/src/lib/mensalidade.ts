import type { SubscriptionInvoiceDoc } from "@/lib/domain";

/**
 * A régua de cobrança D-5 → D+5, derivada — G2.
 *
 * ## Por que derivada
 *
 * `dueStage` era campo gravado, e **ninguém nunca o escreveu**: a tela Mensal
 * contava assinantes por estágio e os sete baldes mostravam zero para sempre.
 * Derivar de `dueDate` mata o campo morto sem migração, e responde certo em
 * qualquer data — um estágio gravado ficaria velho no dia seguinte.
 *
 * ## Duas fontes para a mesma pergunta — e o que impede a divergência
 *
 * A mesma regra existe em `functions/src/mensalistas.ts`, porque o servidor
 * precisa dela para a régua de mensagens e o web para a tela. É exatamente o
 * padrão que esta auditoria mais encontrou — `slotsForDate` × `availableSlots`,
 * política cravada × política do tenant — e que sempre terminou com a correção
 * aplicada num lado só.
 *
 * Não há módulo compartilhado entre `web` e `functions` neste repositório. O que
 * segura a duplicação é a **tabela de casos idêntica** nos dois testes
 * (`lib/__tests__/mensalidade.test.ts` e `functions/src/__tests__/mensalistas.test.ts`):
 * mudar o corte de um lado quebra o outro no mesmo commit.
 */

export type EstagioDaRegua = "D-5" | "D-3" | "D-1" | "D0" | "D+1" | "D+3" | "D+5";

export const ESTAGIOS: EstagioDaRegua[] = ["D-5", "D-3", "D-1", "D0", "D+1", "D+3", "D+5"];

/**
 * Em que marco da régua esta data de vencimento está, hoje.
 *
 * Cada fatura cai no marco **já alcançado**: faltando 4 dias, o aviso de D-5 já
 * saiu e o de D-3 ainda não. É o que a operação pergunta — o que já foi avisado
 * e o que vem agora.
 */
export function estagioDaRegua(dueDate: string, hoje: string): EstagioDaRegua | null {
  const dias = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000
  );
  if (dias > 5) return null;
  if (dias > 3) return "D-5";
  if (dias > 1) return "D-3";
  if (dias > 0) return "D-1";
  if (dias === 0) return "D0";
  if (dias >= -2) return "D+1";
  if (dias >= -4) return "D+3";
  return "D+5";
}

/** Fatura paga ou cancelada sai da régua: ela é de cobrança. */
export function estagioDaFatura(
  fatura: Pick<SubscriptionInvoiceDoc, "dueDate" | "status">,
  hoje: string
): EstagioDaRegua | null {
  if (fatura.status !== "aberta") return null;
  return estagioDaRegua(fatura.dueDate, hoje);
}

/**
 * O que a tela Mensal precisa saber sobre a competência exibida.
 *
 * Separa deliberadamente **contratado** de **recebido**, porque somar os dois
 * foi exatamente o erro dos R$ 248: o produto afirmava um recebimento cuja
 * evidência era um status marcado.
 */
export function resumoDasFaturas(
  faturas: Array<Pick<SubscriptionInvoiceDoc, "competencia" | "status" | "amount" | "dueDate">>,
  competencia: string,
  hoje: string
) {
  const doMes = faturas.filter((f) => f.competencia === competencia && f.status !== "cancelada");
  const pagas = doMes.filter((f) => f.status === "paga");
  const abertas = doMes.filter((f) => f.status === "aberta");

  const porEstagio = Object.fromEntries(ESTAGIOS.map((e) => [e, 0])) as Record<
    EstagioDaRegua,
    number
  >;
  for (const f of abertas) {
    const estagio = estagioDaFatura(f, hoje);
    if (estagio) porEstagio[estagio]++;
  }

  return {
    /** Emitido no mês. Contrato, não receita. */
    faturado: doMes.reduce((s, f) => s + f.amount, 0),
    /** Confirmado como pago. É o único com lastro. */
    recebido: pagas.reduce((s, f) => s + f.amount, 0),
    emAberto: abertas.reduce((s, f) => s + f.amount, 0),
    quantidade: doMes.length,
    pagas: pagas.length,
    porEstagio,
  };
}
