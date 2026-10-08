import type { RefundDoc, SubscriptionInvoiceDoc } from "@/lib/domain";

type Devolucao = Pick<RefundDoc, "origin" | "invoiceId" | "grossAmount">;

/**
 * Quanto voltou ao cliente, por fatura (08/10). A devolução de mensalidade não
 * muda o status da fatura — ela continua "paga", porque o pagamento aconteceu
 * —, e o dinheiro que voltou mora em `refunds` (D22).
 */
export function devolvidoPorFatura(refunds: readonly Devolucao[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of refunds ?? []) {
    if (r.origin !== "mensalidade" || !r.invoiceId) continue;
    m.set(r.invoiceId, Math.round(((m.get(r.invoiceId) ?? 0) + (Number(r.grossAmount) || 0)) * 100) / 100);
  }
  return m;
}

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
  faturas: Array<Pick<SubscriptionInvoiceDoc, "competencia" | "status" | "amount" | "dueDate"> & { id?: string }>,
  competencia: string,
  hoje: string,
  /**
   * Devoluções (08/10). "Recebido" abate o que voltou ao cliente: a fatura
   * devolvida continua "paga", e somá-la cheia afirmava um recebimento que o
   * caixa já tinha devolvido. Ausentes (sem acesso a `refunds`), nada é abatido.
   */
  refunds?: readonly Devolucao[]
) {
  const doMes = faturas.filter((f) => f.competencia === competencia && f.status !== "cancelada");
  const pagas = doMes.filter((f) => f.status === "paga");
  const porFatura = devolvidoPorFatura(refunds);
  const devolvido = Math.round(
    pagas.reduce((s, f) => s + Math.min(f.amount, (f.id && porFatura.get(f.id)) || 0), 0) * 100
  ) / 100;
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
    /** Confirmado como pago, MENOS o que foi devolvido. É o único com lastro. */
    recebido: Math.max(0, Math.round((pagas.reduce((s, f) => s + f.amount, 0) - devolvido) * 100) / 100),
    /** O que voltou ao cliente das faturas pagas do mês. */
    devolvido,
    emAberto: abertas.reduce((s, f) => s + f.amount, 0),
    quantidade: doMes.length,
    pagas: pagas.length,
    porEstagio,
  };
}

/**
 * Mensalidades em aberto de competências ANTERIORES à vista (02/10).
 *
 * A tela mostrava só a competência do mês corrente. Virou outubro, outubro
 * ainda não tinha sido emitido, e as faturas abertas de setembro sumiram da
 * tela — o barbeiro ficou sem onde dar baixa de quem pagou atrasado. Dívida
 * velha não pode desaparecer só porque o calendário andou.
 *
 * Competência é `AAAA-MM`: a comparação de texto é a comparação de datas.
 * Ordem: a que venceu primeiro vem primeiro.
 */
export function abertasDeMesesAnteriores<
  T extends Pick<SubscriptionInvoiceDoc, "competencia" | "status" | "dueDate">,
>(faturas: T[], competencia: string): T[] {
  return faturas
    .filter((f) => f.status === "aberta" && f.competencia < competencia)
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
}

/** `AAAA-MM` deslocado em meses — o seletor de competência da tela. */
export function mesVizinho(competencia: string, delta: number): string {
  const [a, m] = competencia.split("-").map(Number);
  const total = a * 12 + (m - 1) + delta;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

/**
 * A situação da mensalidade em português de balcão (02/10).
 *
 * A régua (D-5 … D+5) é do motor de lembretes; na tela ela dizia "D+5" para
 * uma mensalidade vencida havia 27 dias — o dono não sabia ler, e o número
 * escondia o tamanho do atraso. Aqui a frase diz os dias de verdade.
 */
export function situacaoDaFatura(
  fatura: Pick<SubscriptionInvoiceDoc, "dueDate" | "status"> & { amount?: number },
  hoje: string,
  /** Quanto desta fatura foi devolvido (`devolvidoPorFatura`). */
  devolvido = 0
): { texto: string; tom: "success" | "neutral" | "gold" | "danger" } {
  if (fatura.status === "paga") {
    /* Devolvida não é "Paga" em verde (08/10): o dinheiro voltou ao cliente. */
    if (devolvido > 0 && devolvido >= (Number(fatura.amount) || 0)) return { texto: "Devolvida", tom: "neutral" };
    if (devolvido > 0) return { texto: "Paga · parte devolvida", tom: "gold" };
    return { texto: "Paga", tom: "success" };
  }
  if (fatura.status === "cancelada") return { texto: "Não cobrada", tom: "neutral" };
  const dias = Math.round(
    (Date.parse(`${fatura.dueDate}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000
  );
  if (dias === 0) return { texto: "Vence hoje", tom: "gold" };
  if (dias === 1) return { texto: "Vence amanhã", tom: "gold" };
  if (dias > 1) return { texto: `Vence em ${dias} dias`, tom: dias <= 5 ? "gold" : "neutral" };
  if (dias === -1) return { texto: "Atrasada · 1 dia", tom: "danger" };
  return { texto: `Atrasada · ${-dias} dias`, tom: "danger" };
}
