import type { Booking, Service, TimeSlot } from "./types";

/** Dados de demonstração — serão substituídos por Firestore nos próximos épicos. */

export const barbershop = {
  name: "O Siqueira Barbearia",
  since: 2012,
  address: "Rua das Tesouras, 120 — Centro",
  whatsapp: "5511999999999",
  instagram: "@osiqueirabarbearia",
};

export const services: Service[] = [
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 15 },
  { id: "pezinho", name: "Pezinho", durationMin: 15, price: 15 },
  { id: "barba", name: "Barba", durationMin: 30, price: 35 },
  { id: "corte-infantil", name: "Corte infantil", durationMin: 30, price: 50 },
  {
    id: "corte-sobrancelha",
    name: "Corte + sobrancelha",
    durationMin: 30,
    price: 70,
  },
  {
    id: "barba-corte-infantil",
    name: "Barba + corte infantil",
    durationMin: 60,
    price: 80,
  },
  {
    id: "luzes",
    name: "Luzes",
    durationMin: 60,
    price: 80,
    priceFrom: true,
  },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 90 },
  {
    id: "alinhamento-fios",
    name: "Alinhamento dos fios",
    durationMin: 90,
    price: 100,
    priceFrom: true,
  },
  {
    id: "corte-barba-sobrancelha",
    name: "Corte + barba + sobrancelha",
    durationMin: 60,
    price: 100,
  },
  {
    id: "adulto-infantil",
    name: "Adulto + Infantil",
    durationMin: 60,
    price: 100,
  },
  {
    id: "adulto-corte-barba-infantil",
    name: "Adulto corte e barba + Infantil",
    durationMin: 90,
    price: 130,
  },
  {
    id: "adulto-corte-barba-2-infantil",
    name: "Adulto corte e barba + 2 Infantil",
    durationMin: 120,
    price: 170,
  },
];

export const nextBooking: Booking = {
  id: "bk_001",
  clientName: "João Damas",
  clientWhatsapp: "5511988887001",
  serviceIds: ["corte-barba"],
  date: "2026-08-02",
  time: "16:30",
  status: "confirmed",
  value: 90,
  paymentMethod: "pix",
};

export const loyalty = {
  stamps: 7,
  goal: 10,
  reward: "1 corte grátis",
};

/** Histórico de atendimentos concluídos deste cliente — usado na aba "Histórico" de Reservas. */
export const bookingHistory = [
  { id: "hist_1", serviceIds: ["corte-barba"], date: "2026-07-18", time: "16:00", value: 90, paymentMethod: "pix" as const },
  { id: "hist_2", serviceIds: ["barba"], date: "2026-07-04", time: "10:30", value: 35, paymentMethod: "local" as const },
  { id: "hist_3", serviceIds: ["corte-barba"], date: "2026-06-20", time: "15:30", value: 90, paymentMethod: "pix" as const },
  { id: "hist_4", serviceIds: ["corte-sobrancelha"], date: "2026-06-06", time: "17:00", value: 70, paymentMethod: "cartao" as const },
  { id: "hist_5", serviceIds: ["corte-barba"], date: "2026-05-23", time: "16:30", value: 90, paymentMethod: "pix" as const },
];

export function mockSlotsForDay(dayIndex: number): TimeSlot[] {
  const base: TimeSlot[] = [
    { time: "09:00", available: true },
    { time: "09:30", available: true },
    { time: "10:00", available: true },
    { time: "10:30", available: true },
    { time: "11:00", available: true },
    { time: "14:00", available: true },
    { time: "14:30", available: true },
    { time: "15:00", available: true },
    { time: "15:30", available: true },
    { time: "16:00", available: true },
    { time: "16:30", available: true },
    { time: "17:00", available: true },
  ];

  // Ocupa 2-3 horários por dia, deslocando o padrão conforme o dia — só para variar o mock.
  const occupiedIndexes = [
    (dayIndex * 2 + 2) % base.length,
    (dayIndex * 3 + 4) % base.length,
    (dayIndex * 5 + 7) % base.length,
  ];

  return base.map((slot, i) =>
    occupiedIndexes.includes(i)
      ? { ...slot, available: false, isFitIn: true }
      : slot
  );
}

export const todayBookings: Booking[] = [
  {
    id: "bk_101",
    clientName: "Marcos Silva",
    clientWhatsapp: "5511988887002",
    serviceIds: ["corte-barba"],
    date: "2026-07-31",
    time: "09:00",
    status: "confirmed_by_client",
    value: 90,
    paymentMethod: "local",
  },
  {
    id: "bk_102",
    clientName: "Rafael Souza",
    clientWhatsapp: "5511988887003",
    serviceIds: ["barba"],
    date: "2026-07-31",
    time: "10:30",
    status: "confirmed",
    value: 35,
    paymentMethod: "pix",
  },
  {
    id: "bk_103",
    clientName: "Pedro Lima",
    clientWhatsapp: "5511988887004",
    serviceIds: ["corte-sobrancelha"],
    date: "2026-07-31",
    time: "14:00",
    status: "completed",
    value: 70,
    paymentMethod: "cartao",
  },
  {
    id: "bk_104",
    clientName: "Carlos Eduardo",
    clientWhatsapp: "5511988887005",
    serviceIds: ["alinhamento-fios"],
    date: "2026-07-31",
    time: "16:00",
    status: "fit_in_requested",
    value: 100,
    isFitIn: true,
    paymentMethod: "pix",
  },
];

export const todayKpis = {
  revenue: 195,
  appointments: 3,
  occupancyPct: 68,
  /** Total de horários da jornada de hoje (ver `mockSlotsForDay`). */
  totalSlots: 12,
};

/** Caixa do dia — separado do fechamento mensal (Financeiro). Vive na tela Hoje. */
export const cashToday = {
  pix: 120,
  cartao: 45,
  dinheiro: 30,
};

export function getServicesByIds(ids: string[]): Service[] {
  return ids
    .map((id) => services.find((s) => s.id === id))
    .filter((s): s is Service => Boolean(s));
}

export const needsYou = [
  {
    id: "fit-in",
    label: "1 encaixe aguardando resposta no WhatsApp",
    href: "/painel",
    tone: "gold" as const,
  },
  {
    id: "expense",
    label: "Julho ainda sem despesas manuais lançadas",
    href: "/painel/financeiro",
    tone: "danger" as const,
  },
];

/* ---- Regras de negócio compartilhadas (comissão, imposto, gateways) ----
 * Fonte única — Financeiro (DRE), Loja e a calculadora de precificação
 * todos leem daqui, pra nunca ficarem com números descolados um do outro. */

export const businessRates = {
  /** Comissão do profissional sobre o lucro da venda (produtos e serviços). */
  commissionRatePct: 15,
  /** Imposto (Simples Nacional, alíquota efetiva estimada) sobre o lucro. */
  taxRatePct: 6,
};

export const commissionRatePct = businessRates.commissionRatePct;

/* ---- Financeiro: gateways de pagamento ---- */

export const paymentGateways = [
  {
    id: "stone",
    name: "Stone",
    fees: [
      { method: "Pix", pct: 0.99 },
      { method: "Débito", pct: 1.99 },
      { method: "Crédito à vista", pct: 3.15 },
      { method: "Crédito parcelado (6x)", pct: 8.5 },
    ],
  },
  {
    id: "infinitepay",
    name: "InfinitePay",
    fees: [
      { method: "Pix", pct: 0.75 },
      { method: "Débito", pct: 1.55 },
      { method: "Crédito à vista", pct: 2.69 },
      { method: "Crédito parcelado (6x)", pct: 7.99 },
    ],
  },
];

/* ---- Loja ---- */

export const products = [
  { id: "prod_1", name: "Pomada modeladora", cost: 18, price: 45, stock: 3, minStock: 5 },
  { id: "prod_2", name: "Óleo para barba", cost: 22, price: 55, stock: 12, minStock: 4 },
  { id: "prod_3", name: "Shampoo anticaspa", cost: 15, price: 38, stock: 8, minStock: 5 },
  { id: "prod_4", name: "Balm pós-barba", cost: 20, price: 48, stock: 1, minStock: 4 },
];

/**
 * Movimentação de estoque no mês — o que foi comprado e o que foi vendido de
 * cada produto. Os totais batem de propósito com `dre.cmv` (soma de
 * purchaseCost) e com "Produtos (loja)" em `revenueBreakdown` (soma de
 * soldRevenue), pra o DRE detalhado abrir sem sobra nem furo.
 */
export const productMovements = [
  { productId: "prod_1", purchased: 10, purchaseCost: 220, sold: 12, soldRevenue: 380 },
  { productId: "prod_2", purchased: 6, purchaseCost: 180, sold: 8, soldRevenue: 310 },
  { productId: "prod_3", purchased: 8, purchaseCost: 140, sold: 5, soldRevenue: 130 },
  { productId: "prod_4", purchased: 5, purchaseCost: 100, sold: 4, soldRevenue: 130 },
];

/* ---- Financeiro: despesas ---- */

export type ExpensePaymentMethod = "Pix" | "Boleto" | "Cartão" | "Transferência";

export const expenseCategories = [
  "Aluguel",
  "Energia/Água",
  "Insumos e produtos",
  "Marketing",
  "Manutenção de equipamentos",
  "Internet e telefonia",
  "Software e assinaturas",
  "Outras despesas",
];

export const monthExpenses = [
  {
    id: "exp_1",
    category: "Aluguel",
    description: "Aluguel do salão",
    supplier: "Imobiliária Central",
    value: 1800,
    date: "2026-07-05",
    payment: "Pix" as ExpensePaymentMethod,
    recurring: true,
  },
  {
    id: "exp_2",
    category: "Energia/Água",
    description: "Conta de energia",
    supplier: "Enel SP",
    value: 320,
    date: "2026-07-10",
    payment: "Boleto" as ExpensePaymentMethod,
    recurring: true,
  },
  {
    id: "exp_3",
    category: "Outras despesas",
    description: "Produtos de limpeza",
    supplier: "Distribuidora Sol",
    value: 90,
    date: "2026-07-12",
    payment: "Cartão" as ExpensePaymentMethod,
    recurring: false,
  },
  {
    id: "exp_4",
    category: "Insumos e produtos",
    description: "Toalhas e capas de corte",
    supplier: "Casa do Barbeiro SP",
    value: 340,
    date: "2026-07-08",
    payment: "Pix" as ExpensePaymentMethod,
    recurring: false,
  },
  {
    id: "exp_5",
    category: "Insumos e produtos",
    description: "Lâminas e navalhas",
    supplier: "Casa do Barbeiro SP",
    value: 180,
    date: "2026-07-15",
    payment: "Cartão" as ExpensePaymentMethod,
    recurring: false,
  },
  {
    id: "exp_6",
    category: "Manutenção de equipamentos",
    description: "Revisão da máquina de corte",
    supplier: "Assistência Técnica Rômulo",
    value: 150,
    date: "2026-07-18",
    payment: "Pix" as ExpensePaymentMethod,
    recurring: false,
  },
  {
    id: "exp_7",
    category: "Internet e telefonia",
    description: "Internet fibra + telefone",
    supplier: "Vivo Empresas",
    value: 150,
    date: "2026-07-08",
    payment: "Cartão" as ExpensePaymentMethod,
    recurring: true,
  },
  {
    id: "exp_8",
    category: "Marketing",
    description: "Impulsionamento Instagram",
    supplier: "Meta Platforms",
    value: 200,
    date: "2026-07-06",
    payment: "Cartão" as ExpensePaymentMethod,
    recurring: false,
  },
  {
    id: "exp_9",
    category: "Software e assinaturas",
    description: "Assinatura do sistema (app + painel)",
    supplier: "O Siqueira Tech",
    value: 149,
    date: "2026-07-01",
    payment: "Cartão" as ExpensePaymentMethod,
    recurring: true,
  },
  {
    id: "exp_10",
    category: "Outras despesas",
    description: "Café e água pros clientes",
    supplier: "Mercado do Bairro",
    value: 120,
    date: "2026-07-20",
    payment: "Pix" as ExpensePaymentMethod,
    recurring: false,
  },
];

/* ---- Financeiro: resultado do mês ---- */

const operatingExpenses = monthExpenses.reduce((sum, e) => sum + e.value, 0);
const cmvFromProducts = productMovements.reduce((s, m) => s + m.purchaseCost, 0);
const storeMarginPct = 0.6; // margem média dos produtos da loja (ver `products`)
const storeRevenueThisMonth = productMovements.reduce((s, m) => s + m.soldRevenue, 0);
const storeProfitThisMonth = storeRevenueThisMonth * storeMarginPct;

export const dre = {
  grossRevenue: 12480,
  gatewayFees: 210,
  /** CMV = soma do custo de compra dos produtos vendidos (ver `productMovements`). */
  cmv: cmvFromProducts,
  /** Comissão = lucro da loja × comissão do profissional — nunca hardcoded. */
  commissions: Math.round(storeProfitThisMonth * (businessRates.commissionRatePct / 100)),
  operatingExpenses,
};

export const breakEven = { day: 14, totalDays: 31 };

/* ---- Séries por período (para os filtros de DRE e Números) ----
 *
 * O mês base (offset 0) é julho/2026 — todos os números acima descrevem ele.
 * Meses anteriores são derivados por um fator de receita determinístico: custo
 * variável acompanha a receita (é variável, por definição) e custo fixo não
 * muda. Assim navegar entre meses altera o resultado de forma coerente, sem
 * precisar de um dataset inteiro por mês. */

const MONTH_REVENUE_FACTORS = [
  1, 0.89, 0.94, 1.07, 0.82, 0.91, 0.97, 1.12, 0.86, 0.93, 1.04, 0.88,
];

/** Fator de receita de um mês relativo a julho/2026. `offset` 0 = julho, 1 = junho... */
export function monthRevenueFactor(offset: number) {
  const i = Math.abs(Math.round(offset)) % MONTH_REVENUE_FACTORS.length;
  return MONTH_REVENUE_FACTORS[i];
}

const BASE_MONTH = { year: 2026, month: 7 };

/** Rótulo do mês ("Julho de 2026") a partir do offset em meses para trás. */
export function monthLabelFor(offset: number) {
  const d = new Date(BASE_MONTH.year, BASE_MONTH.month - 1 - offset, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Quantos meses para trás o mock cobre (0 = só o mês atual). */
export const MAX_MONTH_OFFSET = MONTH_REVENUE_FACTORS.length - 1;

/** Multiplicador de um período inteiro em relação a um mês. */
export const PERIOD_MONTHS = {
  mes: 1,
  trimestre: 3,
  semestre: 6,
  ano: 12,
} as const;

export type PeriodKey = keyof typeof PERIOD_MONTHS;

/**
 * Soma os fatores dos meses que compõem um período, para agregar qualquer
 * métrica acumulável (receita, atendimentos) de mês para trimestre/ano.
 */
export function periodFactor(period: PeriodKey, offset: number) {
  const months = PERIOD_MONTHS[period];
  const start = offset * months;
  let total = 0;
  for (let i = 0; i < months; i++) total += monthRevenueFactor(start + i);
  return total;
}


export const revenueBreakdown = [
  { label: "Serviços avulsos", value: 10200 },
  { label: "Produtos (loja)", value: 950 },
  { label: "Mensalistas", value: 894 },
  { label: "Encaixes", value: 436 },
];

export const sixMonthFlow = [
  { month: "Fev", receita: 8200, despesa: 2200 },
  { month: "Mar", receita: 8900, despesa: 2350 },
  { month: "Abr", receita: 9600, despesa: 2450 },
  { month: "Mai", receita: 10400, despesa: 2600 },
  { month: "Jun", receita: 11200, despesa: 2850 },
  { month: "Jul", receita: 12480, despesa: 3060 },
];

/** Histórico diário de caixa — base pra filtros e conferência dia a dia (fechado aos domingos). */
export const dailyCashHistory: Array<{
  date: string;
  pix: number;
  cartao: number;
  dinheiro: number;
  total: number;
  appointments: number;
}> = [];

for (let day = 1; day <= 31; day++) {
  const date = `2026-07-${String(day).padStart(2, "0")}`;
  const dow = new Date(`${date}T00:00:00`).getDay();
  if (dow === 0) continue; // fechado aos domingos
  const weekendBoost = dow === 5 || dow === 6 ? 120 : 0;
  const base = 150 + weekendBoost + (day % 5) * 20;
  const pix = Math.round(base * 0.55);
  const cartao = Math.round(base * 0.3);
  const dinheiro = base - pix - cartao;
  const appointments = 2 + (dow === 5 || dow === 6 ? 2 : 0) + (day % 3);
  dailyCashHistory.push({ date, pix, cartao, dinheiro, total: pix + cartao + dinheiro, appointments });
}

/* ---- Operacional (mês) ---- */

export const operationalStats = {
  occupancyPct: 61,
  activeHours: 172,
  revenue: 12480,
};

export const hourlyHeatmap = {
  days: ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
  hours: ["9h", "10h", "11h", "14h", "15h", "16h", "17h"],
  values: [
    [30, 40, 35, 45, 55, 40, 20],
    [25, 35, 30, 40, 60, 65, 30],
    [35, 45, 40, 50, 65, 55, 25],
    [20, 30, 25, 35, 50, 60, 35],
    [45, 55, 50, 70, 85, 90, 60],
    [60, 70, 65, 80, 95, 90, 75],
  ],
};

/* ---- Comercial (mensalistas + loja, visão consolidada) ---- */

export const commercialStats = {
  newSubscribers: 3,
  cancellations: 1,
  avgTicket: 129,
  defaultAmount: 0,
  storeRevenue: storeRevenueThisMonth,
};

/* ---- Números ---- */

export const monthKpis = {
  revenue: 12480,
  appointments: 168,
  avgTicket: 74,
  occupancyPct: 61,
  noShowPct: 4.2,
};

/** Mesmos indicadores no período anterior — só pra calcular a variação (▲/▼). */
export const previousMonthKpis = {
  revenue: 11100,
  appointments: 156,
  avgTicket: 71,
  occupancyPct: 57,
  noShowPct: 6.1,
};

export const noShowStats = {
  noShowCount: 7,
  lateCancelCount: 3,
  totalBookings: 168,
};

export const topServices = [
  { name: "Corte + barba", count: 52, revenue: 4680 },
  { name: "Corte + sobrancelha", count: 31, revenue: 2170 },
  { name: "Barba", count: 28, revenue: 980 },
  { name: "Luzes", count: 9, revenue: 810 },
  { name: "Sobrancelha", count: 18, revenue: 270 },
];

export type ClientRecurrenceStatus = "em_dia" | "esfriando" | "sumiu";

/** Recorrência real de cada cliente — mais acionável que só ranquear por gasto. */
export const clientRecurrence: Array<{
  name: string;
  visits: number;
  spent: number;
  lastVisitDaysAgo: number;
  avgIntervalDays: number;
  status: ClientRecurrenceStatus;
}> = [
  { name: "João Damas", visits: 6, spent: 540, lastVisitDaysAgo: 5, avgIntervalDays: 12, status: "em_dia" },
  { name: "Marcos Silva", visits: 5, spent: 450, lastVisitDaysAgo: 9, avgIntervalDays: 14, status: "em_dia" },
  { name: "Rafael Souza", visits: 4, spent: 280, lastVisitDaysAgo: 22, avgIntervalDays: 15, status: "esfriando" },
  { name: "Fábio Nunes", visits: 8, spent: 90, lastVisitDaysAgo: 62, avgIntervalDays: 20, status: "sumiu" },
  { name: "André Prado", visits: 3, spent: 70, lastVisitDaysAgo: 74, avgIntervalDays: 25, status: "sumiu" },
];

/** Meses disponíveis pra navegação de período (mock — 12 meses fixos). */
export const availableMonths = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
  "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12",
];

/* ---- Mensal (mensalistas) ---- */

export const mrr = { billed: 894, contracted: 1043 };

export type SubscriberStatus = "ativo" | "suspenso" | "cancelado";

export const subscribers: Array<{
  id: string;
  name: string;
  plan: string;
  status: SubscriberStatus;
  nextCharge: string;
  dueStage?: "D-5" | "D-3" | "D-1" | "D0" | "D+1" | "D+3" | "D+5";
}> = [
  { id: "sub_1", name: "João Damas", plan: "Corte ilimitado", status: "ativo", nextCharge: "2026-08-05" },
  { id: "sub_2", name: "Marcos Silva", plan: "2 cortes + 1 barba", status: "ativo", nextCharge: "2026-08-02", dueStage: "D-3" },
  { id: "sub_3", name: "Rafael Souza", plan: "Barba semanal", status: "suspenso", nextCharge: "2026-07-28", dueStage: "D+5" },
  { id: "sub_4", name: "Carlos Eduardo", plan: "Corte ilimitado", status: "cancelado", nextCharge: "—" },
];

/* ---- Planos (cliente) ---- */

export const plans = [
  {
    id: "plan_ilimitado",
    name: "Corte ilimitado",
    price: 149,
    priceAvulso: 90,
    description: "Cortes ilimitados no mês, sem contar hora",
    highlight: true,
    unlimited: true,
  },
  {
    id: "plan_corte_barba",
    name: "2 cortes + 1 barba",
    price: 119,
    priceAvulso: 215,
    description: "2 cortes e 1 barba por mês",
    highlight: false,
  },
  {
    id: "plan_barba",
    name: "Barba semanal",
    price: 99,
    priceAvulso: 140,
    description: "4 barbas por mês, uma por semana",
    highlight: false,
  },
];

/* ---- Financeiro: projeção de caixa (próximos 30 dias) ---- */

/** Marcações avulsas já confirmadas na agenda pra agosto — dado real, não estimativa. */
export const upcomingBookings = [
  { date: "2026-08-01", clientName: "Pedro Lima", service: "Corte + sobrancelha", value: 70 },
  { date: "2026-08-03", clientName: "Fábio Nunes", service: "Corte + barba", value: 90 },
  { date: "2026-08-04", clientName: "André Prado", service: "Barba", value: 35 },
  { date: "2026-08-07", clientName: "Pedro Lima", service: "Barba", value: 35 },
  { date: "2026-08-08", clientName: "Rafael Souza", service: "Corte + barba", value: 90 },
  { date: "2026-08-10", clientName: "Fábio Nunes", service: "Sobrancelha", value: 15 },
];

// Média histórica de faturamento avulso por dia da semana, a partir do fluxo de caixa real de julho.
const avgRevenueByWeekday: Record<number, number> = {};
{
  const sums: Record<number, { total: number; count: number }> = {};
  for (const d of dailyCashHistory) {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    sums[dow] = sums[dow] ?? { total: 0, count: 0 };
    sums[dow].total += d.total;
    sums[dow].count += 1;
  }
  for (const key in sums) {
    const dow = Number(key);
    avgRevenueByWeekday[dow] = Math.round(sums[dow].total / sums[dow].count);
  }
}

const activeSubscribers = subscribers.filter((s) => s.status === "ativo");
function subscriptionChargeForDate(date: string): number {
  return activeSubscribers
    .filter((s) => s.nextCharge === date)
    .reduce((sum, s) => sum + (plans.find((p) => p.name === s.plan)?.price ?? 0), 0);
}

const recurringExpenses = monthExpenses.filter((e) => e.recurring);
function fixedExpenseForDay(dayOfMonth: number): number {
  return recurringExpenses
    .filter((e) => Number(e.date.split("-")[2]) === dayOfMonth)
    .reduce((sum, e) => sum + e.value, 0);
}

export const cashProjection: Array<{
  date: string;
  isClosed: boolean;
  isEstimate: boolean;
  bookingRevenue: number;
  subscriptionCharge: number;
  fixedExpense: number;
  net: number;
  cumulative: number;
}> = [];

{
  let cumulative = 0;
  for (let day = 1; day <= 30; day++) {
    const date = `2026-08-${String(day).padStart(2, "0")}`;
    const dow = new Date(`${date}T00:00:00`).getDay();
    const isClosed = dow === 0;

    const confirmed = upcomingBookings
      .filter((b) => b.date === date)
      .reduce((s, b) => s + b.value, 0);
    const isEstimate = !isClosed && confirmed === 0;
    const bookingRevenue = isClosed ? 0 : confirmed || avgRevenueByWeekday[dow] || 0;

    const subscriptionCharge = subscriptionChargeForDate(date);
    const fixedExpense = fixedExpenseForDay(day);
    const net = bookingRevenue + subscriptionCharge - fixedExpense;
    cumulative += net;

    cashProjection.push({
      date,
      isClosed,
      isEstimate,
      bookingRevenue,
      subscriptionCharge,
      fixedExpense,
      net,
      cumulative,
    });
  }
}
