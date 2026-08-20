import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  CommissionDoc,
  ExpenseDoc,
  InventoryMovementDoc,
  PaymentDoc,
  ProductDoc,
  StaffDoc,
  SubscriberDoc,
} from "@/lib/domain";

/**
 * A massa conhecida da Fase 2 — os EVENTOS, não os resultados.
 *
 * Espelha `docs/LEDGER-DE-VALIDACAO.md` §2. Este arquivo descreve o que
 * aconteceu na barbearia; o que isso **deveria** produzir está no ledger, foi
 * calculado à mão e vive em `reconciliacao.test.ts` como constante — nunca
 * derivado daqui, senão o teste passaria a conferir o sistema contra si mesmo.
 *
 * Os documentos congelados (`commissions`, `payments`) são montados como
 * `materializeFinancialsOnCompletion` os gravaria na conclusão de cada
 * atendimento: é o estado real do banco depois de um mês de operação, e é sobre
 * ele que as seis telas leem.
 */

export const MES = "2026-09";

/* ------------------------------------------------------------------ */
/* Cadastro                                                            */
/* ------------------------------------------------------------------ */

export const STAFF: Doc<StaffDoc>[] = [
  { id: "b-rafael", name: "Rafael", active: true, commissionPct: 40 },
  { id: "b-leo", name: "Léo", active: true, commissionPct: 50 },
];

export const PRODUTOS: Doc<ProductDoc>[] = [
  // Estoque final esperado: 10 compradas − 4 vendidas = 6.
  { id: "pomada", name: "Pomada modeladora", cost: 18, price: 45, stock: 6, minStock: 3 },
  // Abertura de 5, vendeu 2, sem compra no período.
  { id: "shampoo", name: "Shampoo", cost: 22, price: 55, stock: 3, minStock: 2 },
];

/* ------------------------------------------------------------------ */
/* Atendimentos                                                        */
/* ------------------------------------------------------------------ */

type Atendimento = {
  id: string;
  date: string;
  staffId: string;
  serviceIds: string[];
  value: number;
  durationMin: number;
  status: BookingDoc["status"];
  paymentMethod: BookingDoc["paymentMethod"];
  /** Percentual congelado na conclusão — o de quem atendeu. */
  pct?: number;
  /** Taxa congelada, em % — a do instrumento usado. */
  feePct?: number;
};

const ATENDIMENTOS: Atendimento[] = [
  { id: "A01", date: "2026-09-01", staffId: "b-rafael", serviceIds: ["corte"], value: 50, durationMin: 30, status: "completed", paymentMethod: "pix", pct: 40, feePct: 0 },
  { id: "A02", date: "2026-09-02", staffId: "b-rafael", serviceIds: ["corte"], value: 50, durationMin: 30, status: "completed", paymentMethod: "pix", pct: 40, feePct: 0 },
  { id: "A03", date: "2026-09-03", staffId: "b-leo", serviceIds: ["corte", "barba"], value: 90, durationMin: 60, status: "completed", paymentMethod: "credit", pct: 50, feePct: 3.49 },
  { id: "A04", date: "2026-09-05", staffId: "b-leo", serviceIds: ["barba"], value: 35, durationMin: 30, status: "completed", paymentMethod: "debit", pct: 50, feePct: 1.99 },
  { id: "A05", date: "2026-09-08", staffId: "b-rafael", serviceIds: ["corte"], value: 50, durationMin: 30, status: "completed", paymentMethod: "cash", pct: 40, feePct: 0 },
  { id: "A06", date: "2026-09-10", staffId: "b-leo", serviceIds: ["corte"], value: 50, durationMin: 30, status: "completed", paymentMethod: "pix", pct: 50, feePct: 0 },
  { id: "A07", date: "2026-09-12", staffId: "b-rafael", serviceIds: ["sobrancelha"], value: 15, durationMin: 20, status: "completed", paymentMethod: "debit", pct: 40, feePct: 1.99 },
  { id: "A08", date: "2026-09-15", staffId: "b-leo", serviceIds: ["corte"], value: 50, durationMin: 30, status: "completed", paymentMethod: "pix", pct: 50, feePct: 0 },
  // Sem método: não houve pagamento. É o que o ledger prova.
  { id: "A09", date: "2026-09-18", staffId: "b-rafael", serviceIds: ["corte"], value: 50, durationMin: 30, status: "no_show", paymentMethod: null },
  { id: "A10", date: "2026-09-20", staffId: "b-leo", serviceIds: ["corte"], value: 50, durationMin: 30, status: "cancelled_by_client", paymentMethod: null },
];

const NOME_DO_BARBEIRO: Record<string, string> = {
  "b-rafael": "Rafael",
  "b-leo": "Léo",
};

export const BOOKINGS: Doc<BookingDoc>[] = ATENDIMENTOS.map((a) => ({
  id: a.id,
  clientId: `cliente-${a.id}`,
  clientName: `Cliente ${a.id}`,
  clientWhatsapp: "5511900000000",
  staffId: a.staffId,
  serviceIds: a.serviceIds,
  date: a.date,
  time: "10:00",
  durationMin: a.durationMin,
  status: a.status,
  value: a.value,
  paymentOrigin: "in_person",
  paymentMethod: a.paymentMethod,
}));

/** Ao centavo, como `financial-events.ts` congela. */
const centavos = (v: number) => Math.round(v * 100) / 100;

const CONCLUIDOS = ATENDIMENTOS.filter((a) => a.status === "completed");

/**
 * Comissões congeladas, como o gatilho as grava. O percentual é o de quem
 * atendeu **no dia** — mudar o cadastro depois não pode reescrever isto.
 */
export const COMMISSIONS: Doc<CommissionDoc>[] = CONCLUIDOS.map((a) => ({
  id: `comissao_${a.id}`,
  bookingId: a.id,
  staffId: a.staffId,
  uid: null,
  staffName: NOME_DO_BARBEIRO[a.staffId],
  date: a.date,
  origin: "servico",
  commissionPct: a.pct!,
  commissionBase: a.value,
  commissionAmount: centavos((a.value * a.pct!) / 100),
}));

/** Pagamentos congelados, com a taxa do instrumento usado. */
export const PAYMENTS: Doc<PaymentDoc>[] = CONCLUIDOS.map((a) => {
  const feeAmount = centavos((a.value * a.feePct!) / 100);
  return {
    id: `pagamento_${a.id}`,
    bookingId: a.id,
    clientId: `cliente-${a.id}`,
    date: a.date,
    paymentOrigin: "in_person" as const,
    paymentMethod: a.paymentMethod,
    grossAmount: a.value,
    feePct: a.feePct!,
    feeAmount,
    netAmount: centavos(a.value - feeAmount),
  };
});

/* ------------------------------------------------------------------ */
/* Loja                                                                */
/* ------------------------------------------------------------------ */

/**
 * Movimentos de estoque.
 *
 * `unitCost` e `unitPrice` CONGELADOS desde a Rodada 3.2.
 *
 * A massa foi escrita antes de G1, quando o movimento não sabia guardar o
 * custo — e por isso o CMV só podia ser calculado somando as compras do
 * período, que é o D3. Com o custo no fato, o CMV do sistema passa a ser
 * `4 pomadas × 18 + 2 shampoos × 22 = 116`, exatamente o número que o ledger
 * humano sempre disse.
 *
 * O meio de pagamento ainda vive em `MEIO_DA_VENDA`, fora do documento — G1 já
 * criou o campo, mas ligá-lo ao caixa por instrumento é a Rodada 3.3.
 */
export const MOVEMENTS: Doc<InventoryMovementDoc>[] = [
  { id: "C01", productId: "pomada", kind: "compra", quantity: 10, unitCost: 18, unitPrice: 0, value: 180, date: "2026-09-01" },
  { id: "V01", productId: "pomada", kind: "venda", quantity: 1, unitPrice: 45, unitCost: 18, value: 45, staffId: "b-rafael", date: "2026-09-04" },
  { id: "V02", productId: "pomada", kind: "venda", quantity: 1, unitPrice: 45, unitCost: 18, value: 45, staffId: "b-rafael", date: "2026-09-07" },
  { id: "V03", productId: "shampoo", kind: "venda", quantity: 1, unitPrice: 55, unitCost: 22, value: 55, staffId: "b-rafael", date: "2026-09-11" },
  { id: "V04", productId: "pomada", kind: "venda", quantity: 2, unitPrice: 45, unitCost: 18, value: 90, staffId: "b-rafael", date: "2026-09-14" },
  { id: "V05", productId: "shampoo", kind: "venda", quantity: 1, unitPrice: 55, unitCost: 22, value: 55, staffId: "b-rafael", date: "2026-09-19" },
];

/**
 * Comissão de PRODUTO materializada — Rodada 3.1.
 *
 * Antes ela era um agregado do mês (`lucroLoja × política de hoje`), e por isso
 * não existia na massa. Desde a 3.1 cada venda carrega a própria, com o
 * percentual congelado — e é dela que o DRE tira a linha.
 *
 * A base é o LUCRO da venda, não o faturamento: 40% sobre (45−18) e (55−22).
 * Somadas dão R$ 69,60, exatamente o que o ledger humano calculou.
 */
export const COMMISSIONS_PRODUTO: Doc<CommissionDoc>[] = MOVEMENTS.filter(
  (m) => m.kind === "venda" && m.staffId
).map((m) => {
  const lucro = Math.max((m.unitPrice ?? 0) - (m.unitCost ?? 0), 0) * m.quantity;
  return {
    id: `comissao_venda_${m.id}`,
    movementId: m.id,
    staffId: m.staffId!,
    uid: null,
    staffName: NOME_DO_BARBEIRO[m.staffId!],
    date: m.date,
    origin: "produto" as const,
    commissionPct: 40,
    commissionBase: centavos(lucro),
    commissionAmount: centavos((lucro * 40) / 100),
  };
});

/** O meio de pagamento que o modelo de estoque não guarda — premissa N12. */
export const MEIO_DA_VENDA: Record<string, "pix" | "cash" | "debit" | "credit"> = {
  V01: "pix",
  V02: "cash",
  V03: "credit",
  V04: "debit",
  V05: "pix",
};

/**
 * Pagamentos de PRODUTO — G1.6.
 *
 * A venda passou a gerar `PaymentDoc` com a taxa congelada. Antes disso
 * `gatewayFeesTotal` só via os pagamentos de serviço, e a maquininha não
 * cobrava nada sobre produto no DRE — era o D7, com causa localizada em D21.
 *
 * Somadas dão R$ 3,71 de taxa, exatamente o que o ledger humano calculou:
 * só o crédito (55) e o débito (90) pagam; Pix e dinheiro são zero.
 */
export const PAYMENTS_PRODUTO: Doc<PaymentDoc>[] = MOVEMENTS.filter(
  (m) => m.kind === "venda"
).map((m) => {
  const metodo = MEIO_DA_VENDA[m.id];
  /* Literais em vez de `POLICIES.paymentFees`: aquela constante é declarada
   * mais abaixo no arquivo, e referenciá-la aqui estoura no import. Os valores
   * são os mesmos, e o teste de coerência logo abaixo prova que continuam. */
  const feePct = { pix: 0, cash: 0, debit: 1.99, credit: 3.49 }[metodo];
  const feeAmount = centavos((m.value * feePct) / 100);
  return {
    id: `pagamento_venda_${m.id}`,
    origin: "produto" as const,
    movementId: m.id,
    clientId: null,
    date: m.date,
    paymentOrigin: "in_person" as const,
    paymentMethod: metodo,
    grossAmount: m.value,
    feePct,
    feeAmount,
    netAmount: centavos(m.value - feeAmount),
  };
});

/** Estoque de abertura, em valor. O shampoo veio de período anterior. */
export const ESTOQUE_INICIAL = 5 * 22;

/* ------------------------------------------------------------------ */
/* Despesas e mensalistas                                              */
/* ------------------------------------------------------------------ */

export const EXPENSES: Doc<ExpenseDoc>[] = [
  { id: "D01", category: "Aluguel", description: "Aluguel", supplier: "Imobiliária", value: 2000, date: "2026-09-05", payment: "Boleto", recurring: true },
  { id: "D02", category: "Energia/Água", description: "Energia", supplier: "Concessionária", value: 350, date: "2026-09-10", payment: "Boleto", recurring: true },
  { id: "D03", category: "Marketing", description: "Impulsionamento no Instagram", supplier: "Meta", value: 200, date: "2026-09-16", payment: "Cartão", recurring: false },
];

/** Ativos, e sem nenhum recebimento registrado — é o ponto da premissa N6. */
export const SUBSCRIBERS: Doc<SubscriberDoc>[] = [
  { id: "M01", clientId: "c-joao", name: "João Mensal", planId: "ilimitado", planName: "Ilimitado", price: 149, status: "ativo", nextCharge: "2026-09-20" },
  { id: "M02", clientId: "c-pedro", name: "Pedro Mensal", planId: "duplo", planName: "2 cortes", price: 99, status: "ativo", nextCharge: "2026-09-25" },
];

/* ------------------------------------------------------------------ */
/* Políticas da barbearia                                              */
/* ------------------------------------------------------------------ */

export const POLICIES = {
  cancellation: { fullRefundHours: 24, partialRefundHours: 6, cancellationFeePct: 25 },
  reschedule: { minHoursBefore: 6, maxPerBooking: 2 },
  booking: {
    minAdvanceMinutes: 60,
    maxAdvanceDays: 60,
    visibleDays: 10,
    slotMinutes: 30,
    fitInExpirationMinutes: 45,
    lateToleranceMinutes: 15,
  },
  loyalty: { stampsForReward: 10, reward: "1 corte grátis" },
  commissionSplit: { barberPct: 40, shopPct: 60 },
  taxRatePct: 6,
  openWeekdays: [1, 2, 3, 4, 5, 6],
  paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
} as const;
