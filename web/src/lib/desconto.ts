import type { BookingDoc, MotivoDoDesconto, TipoDeDesconto } from "@/lib/domain";
import { dentroDoPeriodo, type Periodo } from "@/lib/analytics-periodo";

/**
 * Desconto no fechamento do atendimento — pedido do dono em 28/09.
 *
 * *"Quando ele for concluir o pagamento ter um campo de desconto pra ele
 * colocar… dá opção de desconto em R$ ou %."*
 *
 * ## Quem decide o quê
 *
 * Aqui mora a CONVERSÃO: o dono digita "10" com "%" ligado, e o que vai para a
 * reserva é `discountAmount` em reais, já arredondado em centavo. É o número
 * que ele viu na tela ("Cobrar R$ 45,00") — o servidor não refaz a conta do
 * percentual, só limita o valor ao bruto do fato.
 *
 * ⚠️ PAR com `functions/src/desconto.ts`, que limita e decide a cortesia do
 * lado do servidor. `functions/` não importa de `web/`: a duplicação é
 * estrutural, e cada lado tem teste que fixa a mesma regra.
 *
 * ## As decisões do dono que este arquivo sustenta
 *
 * 1. R$ ou %, com o "Cobrar R$ X" em tempo real.
 * 2. 100% é CORTESIA: conclui sem pedir forma de pagamento.
 * 3. A comissão e a taxa são sobre o COBRADO (isso é do servidor).
 * 4. Sem teto de desconto — só o dono dá —, mas nunca acima do valor.
 */

export const MOTIVOS_DE_DESCONTO: readonly { id: MotivoDoDesconto; label: string }[] = [
  { id: "primeira_vez", label: "Primeira vez" },
  { id: "fidelidade", label: "Fidelidade" },
  { id: "amigo_familia", label: "Amigo/Família" },
  { id: "cortesia", label: "Cortesia" },
  { id: "outro", label: "Outro" },
];

/** Arredonda para centavo — a mesma conta de `centavos` no servidor. */
function centavos(valor: number) {
  return Math.round(valor * 100) / 100;
}

/**
 * Lê o que o dono digitou, em português.
 *
 * "10,50" é dez reais e cinquenta — o teclado numérico do celular brasileiro
 * põe vírgula, e `Number("10,50")` é `NaN`. Ponto de milhar não é aceito de
 * propósito: "1.000" num campo de desconto de corte é muito mais provável de
 * ser engano do que mil reais, e ler como 1 seria pior. Vazio, negativo ou
 * ilegível devolve `null` — a tela trata como "sem desconto ainda".
 */
export function lerNumeroDigitado(texto: string): number | null {
  const limpo = String(texto ?? "").trim().replace(/^R\$\s*/i, "").replace(/%$/, "").trim();
  if (!limpo) return null;
  /* "5," e ",5" passam: são o meio da digitação, e acusar erro a cada vírgula
   * faria o aviso piscar enquanto o dono ainda está escrevendo. */
  if (!/^(\d+([.,]\d*)?|[.,]\d+)$/.test(limpo)) return null;
  const n = Number(limpo.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type CalculoDoDesconto = {
  /** Em reais, arredondado em centavo, nunca acima do valor. */
  desconto: number;
  /** O que o cliente paga. */
  cobrar: number;
  /** 100%: não entra dinheiro — conclui sem forma de pagamento. */
  cortesia: boolean;
  /**
   * O dono digitou mais do que o atendimento vale (R$ acima do valor, ou % acima
   * de 100). A tela AVISA e não conclui: limitar em silêncio seria gravar um
   * número diferente do que ele digitou sem ele saber.
   */
  excedeu: boolean;
};

/**
 * Converte a entrada em reais e diz quanto cobrar.
 *
 * Desconto zero é "sem desconto", não cortesia — um serviço de R$ 0,00 sem
 * desconto nenhum continua pedindo a forma de pagamento como sempre.
 */
export function calcularDesconto(params: {
  valor: number;
  tipo: TipoDeDesconto;
  /** Já lido por `lerNumeroDigitado`. `null` = campo vazio. */
  entrada: number | null;
}): CalculoDoDesconto {
  const valor = Math.max(0, Number(params.valor) || 0);
  const entrada = params.entrada ?? 0;
  const bruto =
    params.tipo === "pct" ? centavos((valor * Math.min(entrada, 100)) / 100) : centavos(entrada);
  const excedeu = params.tipo === "pct" ? entrada > 100 : entrada > valor;
  const desconto = Math.min(Math.max(0, bruto), valor);
  return {
    desconto,
    cobrar: centavos(valor - desconto),
    cortesia: desconto > 0 && desconto >= valor,
    excedeu,
  };
}

/**
 * Os campos que vão para a reserva, NA MESMA escrita da conclusão.
 *
 * Sem desconto, nenhum campo — a escrita fica idêntica à de antes do recurso, e
 * a regra do Firestore nem é consultada sobre desconto. `discountAt` não sai
 * daqui: é o `serverTimestamp()` que a tela acrescenta, porque a regra o
 * confere contra `request.time` e o relógio do celular não serve de prova.
 */
export function camposDoDesconto(params: {
  calculo: CalculoDoDesconto;
  tipo: TipoDeDesconto;
  entrada: number | null;
  motivo: MotivoDoDesconto | null;
  /** Quem está concluindo. A regra exige que seja o próprio dono logado. */
  uid: string;
}): Pick<BookingDoc, "discountAmount" | "discountInput" | "discountReason" | "discountBy"> | null {
  if (params.calculo.excedeu || params.calculo.desconto <= 0) return null;
  return {
    discountAmount: params.calculo.desconto,
    discountInput: { tipo: params.tipo, valor: params.entrada ?? 0 },
    discountReason: params.motivo,
    discountBy: params.uid,
  };
}

/**
 * Quanto o cliente pagou por este atendimento — o valor menos o desconto.
 *
 * É o substituto de `booking.value` em toda leitura que fala de DINHEIRO que
 * entrou (o fallback da receita, a base da comissão sem fato materializado, o
 * gasto do cliente). `value` continua sendo o preço — é o que a agenda mostra
 * antes da conclusão, e é o bruto de tabela depois dela.
 */
export function valorCobrado(booking: Pick<BookingDoc, "value" | "discountAmount">): number {
  const valor = Math.max(0, Number(booking.value) || 0);
  const desconto = Math.min(Math.max(0, Number(booking.discountAmount) || 0), valor);
  return centavos(valor - desconto);
}

/**
 * Este atendimento foi uma cortesia?
 *
 * Lê o fato do servidor (`cobertura.motivo`) e, enquanto o gatilho ainda não
 * escreveu, o próprio desconto — que foi gravado na mesma escrita da conclusão.
 * Sem a segunda leitura, a agenda passaria alguns segundos dizendo "Não
 * informado" para um atendimento que o dono acabou de fechar como cortesia.
 */
export function ehCortesia(
  booking: Pick<BookingDoc, "value" | "discountAmount" | "cobertura">
): boolean {
  if (booking.cobertura?.tipo === "avulso" && booking.cobertura.motivo === "cortesia") return true;
  if (booking.cobertura?.tipo === "plano") return false;
  const desconto = Number(booking.discountAmount) || 0;
  return desconto > 0 && desconto >= (Number(booking.value) || 0);
}

/**
 * "Descontos do mês" — o que a casa deixou de cobrar no período.
 *
 * Lê a RESERVA, e não o pagamento, porque a cortesia não tem pagamento — e é
 * justamente o desconto que mais custa. Só atendimento concluído entra (o
 * desconto só existe no fechamento), e o coberto pelo plano fica de fora: o
 * servidor ignora desconto ali, e somá-lo aqui afirmaria um desconto que não
 * aconteceu.
 */
export function descontosDoPeriodo(
  bookings: readonly Pick<BookingDoc, "status" | "date" | "value" | "discountAmount" | "cobertura">[],
  periodo: Periodo
): { total: number; quantidade: number; cortesias: number } {
  let total = 0;
  let quantidade = 0;
  let cortesias = 0;
  for (const b of bookings) {
    if (b.status !== "completed" || !dentroDoPeriodo(b.date, periodo)) continue;
    if (b.cobertura?.tipo === "plano") continue;
    const valor = Math.max(0, Number(b.value) || 0);
    const desconto = Math.min(Math.max(0, Number(b.discountAmount) || 0), valor);
    if (desconto <= 0) continue;
    total += desconto;
    quantidade++;
    if (ehCortesia(b)) cortesias++;
  }
  return { total: centavos(total), quantidade, cortesias };
}
