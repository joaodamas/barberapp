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

export type LinhaDaComissao = Pick<
  CommissionDoc,
  "date" | "origin" | "commissionPct" | "commissionBase" | "commissionAmount" | "bookingId" | "movementId" | "feeAmount"
> & { id: string };

export type ExtratoDaComissao = {
  atendimentos: number;
  vendas: number;
  /** Soma do que a comissão incidiu (valor cobrado / lucro da venda). SEM a caixinha. */
  base: number;
  /** O que o barbeiro tem a receber no período — estornos já descontados, caixinha líquida incluída. */
  total: number;
  /**
   * A parte do `total` que é caixinha (já líquida da taxa da maquininha, que é
   * dele). Separada de serviço e vendas: não é comissão, é gorjeta, e o barbeiro
   * precisa conseguir conferi-la à parte.
   */
  caixinha: number;
  linhas: LinhaDaComissao[];
};

function centavos(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * De que fato a linha veio: o atendimento (`bookingId`) ou a venda
 * (`movementId`). Linha antiga sem nenhum dos dois conta sozinha.
 */
function fatoDaLinha(l: LinhaDaComissao): string {
  if (l.origin === "produto") return l.movementId ? `venda:${l.movementId}` : `linha:${l.id}`;
  return l.bookingId ? `atendimento:${l.bookingId}` : `linha:${l.id}`;
}

/**
 * O extrato do mês. Comissão estornada vem como linha NEGATIVA (o servidor não
 * apaga o passado — P1-7), então somar é o certo.
 *
 * CONTAR é por fato, não por linha (08/10). A edição de cobrança grava o
 * estorno da comissão antiga (negativa) e a comissão nova (positiva) com o
 * MESMO `bookingId`: contar linhas positivas fazia um corte editado virar
 * dois atendimentos. Agora: atendimentos (e vendas) distintos cujo saldo no
 * período ficou positivo — o estorno total some da contagem, a edição conta
 * uma vez.
 */
export function extratoDaComissao(itens: LinhaDaComissao[]): ExtratoDaComissao {
  const linhas = [...itens].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const saldoPorFato = new Map<string, { produto: boolean; saldo: number }>();
  let base = 0;
  let total = 0;
  let caixinha = 0;
  for (const l of linhas) {
    const valor = Number(l.commissionAmount) || 0;
    /* Caixinha entra no total (é dinheiro dele), mas NÃO na base, nem na
     * contagem de atendimentos: ela acompanha o atendimento, não é outro. */
    if (l.origin === "caixinha") {
      caixinha += valor;
      total += valor;
      continue;
    }
    const chave = fatoDaLinha(l);
    const atual = saldoPorFato.get(chave) ?? { produto: l.origin === "produto", saldo: 0 };
    atual.saldo += valor;
    saldoPorFato.set(chave, atual);
    base += Number(l.commissionBase) || 0;
    total += valor;
  }
  let atendimentos = 0;
  let vendas = 0;
  for (const f of saldoPorFato.values()) {
    if (centavos(f.saldo) <= 0) continue;
    if (f.produto) vendas++;
    else atendimentos++;
  }
  return { atendimentos, vendas, base: centavos(base), total: centavos(total), caixinha: centavos(caixinha) + 0, linhas };
}

/**
 * O atendimento já começou? Mesma condição `jaChegou` da Agenda do dono
 * (08/10): dia que passou, ou hoje com o horário já alcançado.
 *
 * O painel do barbeiro mostrava "Concluir" e "Não veio" em qualquer dia,
 * inclusive no da semana que vem — e concluir é dizer que o corte aconteceu.
 * `agora` nulo (antes do relógio montar no navegador) só libera dia passado.
 */
export function atendimentoJaChegou(b: { date: string; time?: string | null }, hoje: string, agora: Date | null): boolean {
  if (b.date < hoje) return true;
  if (b.date > hoje || !agora) return false;
  const inicio = new Date(`${b.date}T${b.time || "00:00"}:00`);
  return inicio.getTime() <= agora.getTime();
}
