import type { CommissionDoc } from "@/lib/domain";

/**
 * O painel do barbeiro (05/10) — as contas, sem tela.
 *
 * O barbeiro vê SÓ o que é dele (decisão do dono): a agenda da própria cadeira
 * e a própria comissão. As regras do Firestore garantem; aqui ficam as contas
 * que a tela mostra.
 */

/** `AAAA-MM` → primeiro e último dia, inclusive. */
export function intervaloDoMes(competencia: string): { de: string; ate: string } {
  const [a, m] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { de: `${competencia}-01`, ate: `${competencia}-${String(ultimo).padStart(2, "0")}` };
}

/** `AAAA-MM-DD` deslocado em dias, sem fuso (data de calendário). */
export function diaVizinho(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type ExtratoDaComissao = {
  atendimentos: number;
  vendas: number;
  /** Soma do que a comissão incidiu (valor cobrado / lucro da venda). */
  base: number;
  /** O que o barbeiro tem a receber no período — estornos já descontados. */
  total: number;
  linhas: Array<Pick<CommissionDoc, "date" | "origin" | "commissionPct" | "commissionBase" | "commissionAmount"> & { id: string }>;
};

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * O extrato do mês. Comissão estornada vem como linha NEGATIVA (o servidor não
 * apaga o passado — P1-7), então somar é o certo; contar atendimento só conta
 * as linhas positivas, para o estorno não virar "um atendimento a menos" duas
 * vezes.
 */
export function extratoDaComissao(
  itens: Array<Pick<CommissionDoc, "date" | "origin" | "commissionPct" | "commissionBase" | "commissionAmount"> & { id: string }>
): ExtratoDaComissao {
  const linhas = [...itens].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  let atendimentos = 0;
  let vendas = 0;
  let base = 0;
  let total = 0;
  for (const l of linhas) {
    const valor = Number(l.commissionAmount) || 0;
    if (valor > 0) {
      if (l.origin === "produto") vendas++;
      else atendimentos++;
    }
    base += Number(l.commissionBase) || 0;
    total += valor;
  }
  return { atendimentos, vendas, base: centavos(base), total: centavos(total), linhas };
}
