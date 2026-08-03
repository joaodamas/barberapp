import { safeDiv } from "@/lib/format";
import {
  isReceived,
  isRevenue,
  monthOf,
  OCCUPIES_SLOT,
  type BookingDoc,
  type ExpenseDoc,
  type InventoryMovementDoc,
  type ProductDoc,
  type SubscriberDoc,
} from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { TenantPolicies } from "@/lib/tenant";

/**
 * Derivações financeiras a partir do dado bruto.
 *
 * O mock guardava resultado pronto — `dre`, `dailyCashHistory`, `monthKpis`,
 * `cashProjection` eram todos literais que precisavam bater entre si na mão, e
 * não batiam. Aqui tudo desce de duas fontes: reservas e despesas. Se dois
 * números divergirem, é bug de cálculo num lugar só, não de dado em quatro.
 *
 * Funções puras de propósito: recebem os documentos e devolvem números, sem
 * tocar em Firestore. É o que as torna testáveis sem emulador.
 */

export type Periodo = { inicio: string; fim: string };

/** Primeiro e último dia de um mês `YYYY-MM`. */
export function mesPeriodo(mes: string): Periodo {
  const [ano, m] = mes.split("-").map(Number);
  const ultimo = new Date(ano, m, 0).getDate();
  return { inicio: `${mes}-01`, fim: `${mes}-${String(ultimo).padStart(2, "0")}` };
}

export function dentroDoPeriodo(data: string, periodo: Periodo) {
  return data >= periodo.inicio && data <= periodo.fim;
}

/* ------------------------------------------------------------------ */
/* Receita                                                             */
/* ------------------------------------------------------------------ */

export type ReceitaDoMes = {
  servicos: number;
  encaixes: number;
  produtos: number;
  mensalistas: number;
  bruta: number;
  /** O que entra pelo balcão — tudo menos mensalidade. */
  caixa: number;
  atendimentos: number;
};

export function receitaDoMes(params: {
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  periodo: Periodo;
}): ReceitaDoMes {
  const { bookings, movements, subscribers, periodo } = params;

  const atendidos = bookings.filter(
    (b) => isRevenue(b) && dentroDoPeriodo(b.date, periodo)
  );

  const servicos = atendidos.filter((b) => !b.isFitIn).reduce((s, b) => s + b.value, 0);
  const encaixes = atendidos.filter((b) => b.isFitIn).reduce((s, b) => s + b.value, 0);

  const produtos = movements
    .filter((m) => m.kind === "venda" && dentroDoPeriodo(m.date, periodo))
    .reduce((s, m) => s + m.value, 0);

  // Mensalidade é cobrada por assinatura e não passa pelo balcão.
  const mensalistas = subscribers
    .filter((s) => s.status === "ativo")
    .reduce((s, sub) => s + sub.price, 0);

  const caixa = servicos + encaixes + produtos;

  return {
    servicos,
    encaixes,
    produtos,
    mensalistas,
    caixa,
    bruta: caixa + mensalistas,
    atendimentos: atendidos.length,
  };
}

/* ------------------------------------------------------------------ */
/* Caixa dia a dia                                                     */
/* ------------------------------------------------------------------ */

export type DiaDeCaixa = {
  date: string;
  pix: number;
  cartao: number;
  dinheiro: number;
  total: number;
  appointments: number;
};

export function caixaDiario(params: {
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
}): DiaDeCaixa[] {
  const porDia = new Map<string, DiaDeCaixa>();

  const dia = (date: string) => {
    let d = porDia.get(date);
    if (!d) {
      d = { date, pix: 0, cartao: 0, dinheiro: 0, total: 0, appointments: 0 };
      porDia.set(date, d);
    }
    return d;
  };

  for (const b of params.bookings) {
    if (!isRevenue(b) || !dentroDoPeriodo(b.date, params.periodo)) continue;
    const d = dia(b.date);
    if (b.paymentMethod === "pix") d.pix += b.value;
    else if (b.paymentMethod === "cartao") d.cartao += b.value;
    else d.dinheiro += b.value;
    d.total += b.value;
    d.appointments += 1;
  }

  // Venda de produto entra no caixa do dia, sem contar como atendimento.
  for (const m of params.movements) {
    if (m.kind !== "venda" || !dentroDoPeriodo(m.date, params.periodo)) continue;
    const d = dia(m.date);
    d.dinheiro += m.value;
    d.total += m.value;
  }

  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

export type ResultadoDoMes = ReturnType<typeof resultadoDoMes>;

export function resultadoDoMes(params: {
  receita: ReceitaDoMes;
  expenses: Doc<ExpenseDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
  policies: TenantPolicies;
  gatewayFeesTotal?: number;
  payroll?: number;
}) {
  const { receita, expenses, movements, periodo, policies } = params;

  const doPeriodo = expenses.filter((e) => dentroDoPeriodo(e.date, periodo));
  const fixedExpenses = doPeriodo.filter((e) => e.recurring).reduce((s, e) => s + e.value, 0);
  const variableOperatingExpenses = doPeriodo
    .filter((e) => !e.recurring)
    .reduce((s, e) => s + e.value, 0);

  // CMV = custo de compra do que foi vendido no período.
  const cmv = movements
    .filter((m) => m.kind === "compra" && dentroDoPeriodo(m.date, periodo))
    .reduce((s, m) => s + m.value, 0);

  const gatewayFees = params.gatewayFeesTotal ?? 0;

  // Comissão sobre o lucro bruto da loja, no rateio do tenant.
  const lucroLoja = Math.max(receita.produtos - cmv, 0);
  const commissions = Math.round((lucroLoja * policies.commissionSplit.barberPct) / 100);

  const variableCost = cmv + gatewayFees + commissions;
  const contributionMargin = receita.bruta - variableCost;
  const contributionMarginPct = safeDiv(contributionMargin, receita.bruta) * 100;

  const payroll = params.payroll ?? 0;
  const fixedCost = fixedExpenses + variableOperatingExpenses + payroll;

  const resultBeforeTax = contributionMargin - fixedCost;
  const tax = resultBeforeTax > 0 ? Math.round((resultBeforeTax * policies.taxRatePct) / 100) : 0;
  const result = resultBeforeTax - tax;

  const totalCost = variableCost + fixedCost + tax;
  const marginPct = safeDiv(result, receita.bruta) * 100;

  const diasNoMes = Number(periodo.fim.slice(-2));
  const breakEvenDay = breakEvenDayFor(receita.bruta, totalCost, diasNoMes);

  return {
    grossRevenue: receita.bruta,
    cmv,
    gatewayFees,
    commissions,
    variableCost,
    contributionMargin,
    contributionMarginPct,
    fixedExpenses,
    variableOperatingExpenses,
    payroll,
    fixedCost,
    resultBeforeTax,
    tax,
    result,
    totalCost,
    marginPct,
    breakEvenDay,
    diasNoMes,
  };
}

function breakEvenDayFor(receita: number, custo: number, diasNoMes: number) {
  if (receita <= 0) return null;
  const dia = Math.ceil(safeDiv(custo, receita / diasNoMes));
  return dia > 0 && dia <= diasNoMes ? dia : null;
}

/* ------------------------------------------------------------------ */
/* Indicadores operacionais                                            */
/* ------------------------------------------------------------------ */

export type Indicadores = {
  revenue: number;
  appointments: number;
  avgTicket: number;
  occupancyPct: number;
  noShowPct: number;
  noShowCount: number;
  lateCancelCount: number;
  totalBookings: number;
};

export function indicadores(params: {
  bookings: Doc<BookingDoc>[];
  receita: ReceitaDoMes;
  periodo: Periodo;
  /** Horários oferecidos no período — capacidade da jornada. */
  capacidade: number;
}): Indicadores {
  const doPeriodo = params.bookings.filter((b) => dentroDoPeriodo(b.date, params.periodo));
  const ocupados = doPeriodo.filter((b) => OCCUPIES_SLOT.includes(b.status));
  const noShow = doPeriodo.filter((b) => b.status === "no_show");
  const cancelados = doPeriodo.filter((b) => b.status === "cancelled_by_client");

  return {
    revenue: params.receita.bruta,
    appointments: params.receita.atendimentos,
    avgTicket: Math.round(safeDiv(params.receita.bruta, params.receita.atendimentos)),
    occupancyPct: Math.min(Math.round(safeDiv(ocupados.length, params.capacidade) * 100), 100),
    noShowPct: Math.round(safeDiv(noShow.length, doPeriodo.length) * 1000) / 10,
    noShowCount: noShow.length,
    lateCancelCount: cancelados.length,
    totalBookings: doPeriodo.length,
  };
}

/** Serviços mais vendidos no período. */
export function topServicos(params: {
  bookings: Doc<BookingDoc>[];
  nomePorId: Map<string, string>;
  periodo: Periodo;
  limite?: number;
}) {
  const acc = new Map<string, { name: string; count: number; revenue: number }>();

  for (const b of params.bookings) {
    if (!isRevenue(b) || !dentroDoPeriodo(b.date, params.periodo)) continue;
    // Combo de dois serviços rateia o valor entre eles.
    const fatia = safeDiv(b.value, b.serviceIds.length);
    for (const id of b.serviceIds) {
      const name = params.nomePorId.get(id) ?? id;
      const atual = acc.get(id) ?? { name, count: 0, revenue: 0 };
      atual.count += 1;
      atual.revenue += fatia;
      acc.set(id, atual);
    }
  }

  return [...acc.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, params.limite ?? 5)
    .map((s) => ({ ...s, revenue: Math.round(s.revenue) }));
}

/** Recorrência dos clientes — mais acionável que ranquear por gasto. */
export type StatusRecorrencia = "em_dia" | "esfriando" | "sumiu";

export function recorrenciaDeClientes(params: {
  bookings: Doc<BookingDoc>[];
  hoje: Date;
  limite?: number;
}) {
  const porCliente = new Map<string, { name: string; datas: string[]; spent: number }>();

  for (const b of params.bookings) {
    if (!isRevenue(b)) continue;
    const atual = porCliente.get(b.clientId) ?? { name: b.clientName, datas: [], spent: 0 };
    atual.datas.push(b.date);
    atual.spent += b.value;
    porCliente.set(b.clientId, atual);
  }

  const hojeMs = params.hoje.getTime();

  return [...porCliente.entries()]
    .map(([clientId, c]) => {
      const datas = [...c.datas].sort();
      const ultima = datas[datas.length - 1];
      const lastVisitDaysAgo = Math.floor(
        (hojeMs - new Date(`${ultima}T00:00:00`).getTime()) / 86_400_000
      );

      const intervalos: number[] = [];
      for (let i = 1; i < datas.length; i++) {
        intervalos.push(
          Math.round(
            (new Date(`${datas[i]}T00:00:00`).getTime() -
              new Date(`${datas[i - 1]}T00:00:00`).getTime()) /
              86_400_000
          )
        );
      }
      const avgIntervalDays = intervalos.length
        ? Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
        : 0;

      /* "Sumiu" é relativo ao hábito DELE: quem vem a cada 30 dias e sumiu há
       * 40 não é o mesmo caso de quem vem a cada 7. Sem histórico de intervalo,
       * cai num limite absoluto. */
      const limiteEsfriando = avgIntervalDays > 0 ? avgIntervalDays * 1.5 : 30;
      const limiteSumiu = avgIntervalDays > 0 ? avgIntervalDays * 3 : 60;
      const status: StatusRecorrencia =
        lastVisitDaysAgo >= limiteSumiu
          ? "sumiu"
          : lastVisitDaysAgo >= limiteEsfriando
            ? "esfriando"
            : "em_dia";

      return {
        clientId,
        name: c.name,
        visits: datas.length,
        spent: c.spent,
        lastVisitDaysAgo,
        avgIntervalDays,
        status,
      };
    })
    .sort((a, b) => b.spent - a.spent)
    .slice(0, params.limite ?? 8);
}

/** Ocupação por dia da semana × hora — o mapa de calor. */
export function mapaDeCalor(params: {
  bookings: Doc<BookingDoc>[];
  periodo: Periodo;
  horarios: string[];
}) {
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const horas = params.horarios;

  const contagem = dias.map(() => horas.map(() => 0));
  const semanas = new Set<string>();

  for (const b of params.bookings) {
    if (!OCCUPIES_SLOT.includes(b.status) || !dentroDoPeriodo(b.date, params.periodo)) continue;
    const dow = new Date(`${b.date}T00:00:00`).getDay();
    if (dow === 0) continue; // domingo não entra na grade
    const i = dow - 1;
    const j = horas.indexOf(b.time);
    if (i < 0 || i >= dias.length || j < 0) continue;
    contagem[i][j] += 1;
    semanas.add(`${b.date.slice(0, 4)}-${semanaDoAno(b.date)}`);
  }

  const totalSemanas = Math.max(semanas.size, 1);
  const values = contagem.map((linha) =>
    linha.map((n) => Math.min(Math.round((n / totalSemanas) * 100), 100))
  );

  return { days: dias, hours: horas, values };
}

function semanaDoAno(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const inicio = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inicio.getTime()) / 86_400_000 + inicio.getDay() + 1) / 7);
}

/* ------------------------------------------------------------------ */
/* Projeção de caixa                                                   */
/* ------------------------------------------------------------------ */

export type DiaProjetado = {
  date: string;
  isClosed: boolean;
  isEstimate: boolean;
  bookingRevenue: number;
  subscriptionCharge: number;
  fixedExpense: number;
  net: number;
  cumulative: number;
};

export function projecaoDeCaixa(params: {
  bookings: Doc<BookingDoc>[];
  expenses: Doc<ExpenseDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  historico: DiaDeCaixa[];
  openWeekdays: number[];
  inicio: Date;
  dias?: number;
}): DiaProjetado[] {
  const dias = params.dias ?? 30;

  // Média histórica por dia da semana — base para os dias sem marcação.
  const soma: Record<number, { total: number; n: number }> = {};
  for (const d of params.historico) {
    const dow = new Date(`${d.date}T00:00:00`).getDay();
    soma[dow] ??= { total: 0, n: 0 };
    soma[dow].total += d.total;
    soma[dow].n += 1;
  }
  const media = (dow: number) => (soma[dow] ? Math.round(soma[dow].total / soma[dow].n) : 0);

  const ativos = params.subscribers.filter((s) => s.status === "ativo");
  const recorrentes = params.expenses.filter((e) => e.recurring);

  const resultado: DiaProjetado[] = [];
  let cumulative = 0;

  for (let i = 0; i < dias; i++) {
    const d = new Date(params.inicio);
    d.setDate(params.inicio.getDate() + i);
    d.setHours(0, 0, 0, 0);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    const dow = d.getDay();
    const isClosed = !params.openWeekdays.includes(dow);

    const confirmado = params.bookings
      .filter((b) => b.date === date && OCCUPIES_SLOT.includes(b.status))
      .reduce((s, b) => s + b.value, 0);

    const isEstimate = !isClosed && confirmado === 0;
    const bookingRevenue = isClosed ? 0 : confirmado || media(dow);

    const subscriptionCharge = ativos
      .filter((s) => s.nextCharge === date)
      .reduce((s, sub) => s + sub.price, 0);

    const fixedExpense = recorrentes
      .filter((e) => Number(e.date.slice(-2)) === d.getDate())
      .reduce((s, e) => s + e.value, 0);

    const net = bookingRevenue + subscriptionCharge - fixedExpense;
    cumulative += net;

    resultado.push({
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

  return resultado;
}

/* ------------------------------------------------------------------ */
/* Loja                                                                */
/* ------------------------------------------------------------------ */

export function estoqueBaixo(products: Doc<ProductDoc>[]) {
  return products.filter((p) => p.stock < p.minStock);
}

/** Caixa do dia por meio de pagamento — a tela Hoje. */
export function caixaDoDia(bookings: Doc<BookingDoc>[]) {
  const recebidas = bookings.filter(isReceived);
  const por = (m: string) =>
    recebidas.filter((b) => b.paymentMethod === m).reduce((s, b) => s + b.value, 0);
  return {
    pix: por("pix"),
    cartao: por("cartao"),
    dinheiro: por("local"),
    total: recebidas.reduce((s, b) => s + b.value, 0),
  };
}

/** Quantos horários a jornada oferece por dia. */
export function capacidadeDiaria(schedule: {
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
}) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const inicio = min(schedule.opensAt);
  const fim = min(schedule.closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return 0;

  let total = 0;
  for (let t = inicio; t + schedule.slotMinutes <= fim; t += schedule.slotMinutes) {
    const emIntervalo = schedule.breaks.some((b) => t >= min(b.from) && t < min(b.to));
    if (!emIntervalo) total += 1;
  }
  return total;
}

/** Horários da jornada, para o mapa de calor e a grade. */
export function horariosDaJornada(schedule: {
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
}) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const fmt = (v: number) =>
    `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;

  const inicio = min(schedule.opensAt);
  const fim = min(schedule.closesAt);
  if (!Number.isFinite(inicio) || !Number.isFinite(fim) || fim <= inicio) return [];

  const horarios: string[] = [];
  for (let t = inicio; t + schedule.slotMinutes <= fim; t += schedule.slotMinutes) {
    const emIntervalo = schedule.breaks.some((b) => t >= min(b.from) && t < min(b.to));
    if (!emIntervalo) horarios.push(fmt(t));
  }
  return horarios;
}

export { monthOf };
