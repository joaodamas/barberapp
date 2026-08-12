import { safeDiv, toISODate } from "@/lib/format";
import {
  isReceived,
  isRevenue,
  monthOf,
  OCCUPIES_SLOT,
  type BookingDoc,
  type ExpenseDoc,
  type InventoryMovementDoc,
  type CommissionDoc,
  type PaymentDoc,
  type ProductDoc,
  type StaffDoc,
  type SubscriberDoc,
} from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { TenantPolicies } from "@/lib/tenant";
import type { PaymentMethod } from "@/lib/types";

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
  /** Data de referência — decide se o retrato de mensalistas vale no período. */
  hoje?: Date;
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

  /* Mensalidade é cobrada por assinatura e não passa pelo balcão.
   *
   * `SubscriberDoc` guarda o estado de HOJE — tem `status`, não tem `createdAt`
   * nem `canceledAt`. Somar isso em qualquer período fazia o MRR atual aparecer
   * em todo mês do histórico: 40 assinantes de hoje viravam receita de um
   * janeiro que teve 5, e o comparativo de crescimento achatava porque os dois
   * meses carregavam a mesma constante.
   *
   * Enquanto `subscription_invoices` não for escrita, o retrato só vale no
   * período que contém a data de referência — o único em que ele é verdade. */
  const referencia = toISODate(params.hoje ?? new Date());
  const mensalistas = dentroDoPeriodo(referencia, periodo)
    ? subscribers.filter((s) => s.status === "ativo").reduce((s, sub) => s + sub.price, 0)
    : 0;

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
    /* Débito e crédito somam na coluna "cartão": o caixa diário responde por
     * onde o dinheiro entrou no balcão, e as duas maquininhas são a mesma fila.
     * A distinção existe onde importa — em `payments`, que congela a taxa de
     * cada uma e alimenta o custo de adquirência no DRE. */
    if (b.paymentMethod === "pix") d.pix += b.value;
    else if (b.paymentMethod === "debit" || b.paymentMethod === "credit") d.cartao += b.value;
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
/* Custo do trabalho                                                   */
/* ------------------------------------------------------------------ */

export type ComissaoDeBarbeiro = {
  staffId: string;
  nome: string;
  /** Faturamento de serviço que passou pela cadeira dele no período. */
  base: number;
  pct: number;
  valor: number;
  atendimentos: number;
};

/**
 * Quanto do faturamento de serviço vira pagamento de barbeiro.
 *
 * Esta é a MAIOR linha de custo de uma barbearia com equipe, e até 04/08/2026
 * ela não existia no DRE: a comissão era calculada só sobre o lucro da loja de
 * produtos. Com R$ 12.432 de serviço e 40% de rateio, o sistema lançava R$ 140
 * de custo de mão de obra em vez de R$ 5.113 — e informava 60% de margem para
 * um setor cuja margem real fica entre 15% e 30%.
 *
 * Cada reserva paga a taxa DO BARBEIRO que atendeu (`StaffDoc.commissionPct`),
 * não uma média: contratar alguém com percentual diferente muda o custo de
 * verdade, e um percentual único esconde exatamente a decisão que o dono
 * precisa tomar.
 *
 * O pagamento do dono-barbeiro entra aqui também, como comissão e não como
 * pró-labore no custo fixo. São duas escolhas contábeis defensáveis e o
 * resultado final é idêntico; esta evita um degrau absurdo no dia da primeira
 * contratação — a margem de contribuição cairia de 95% para 58% de um mês para
 * o outro sem nada ter piorado — e mantém o ponto de equilíbrio na definição
 * padrão (custo fixo ÷ margem de contribuição).
 */
export function comissoesDeServico(params: {
  bookings: Doc<BookingDoc>[];
  staff: Doc<StaffDoc>[];
  periodo: Periodo;
  policies: TenantPolicies;
  /**
   * Comissões congeladas na conclusão do atendimento. Quando existe uma para a
   * reserva, ela VENCE — é o valor que de fato foi acertado com o barbeiro
   * naquele dia, e reler o cadastro atual faria o mês fechado se reescrever
   * sozinho toda vez que alguém mudasse um percentual.
   *
   * Atendimentos anteriores ao trigger de materialização não têm comissão
   * gravada; sem a derivação como fallback, o histórico inteiro apareceria
   * zerado no dia em que o trigger entrou.
   */
  commissions?: Doc<CommissionDoc>[];
}): { total: number; porBarbeiro: ComissaoDeBarbeiro[] } {
  const { bookings, staff, periodo, policies } = params;
  const padrao = policies.commissionSplit.barberPct;
  const porId = new Map(staff.map((s) => [s.id, s]));
  const acc = new Map<string, ComissaoDeBarbeiro>();

  /* Só as de serviço: a comissão de produto tem outra base — o lucro da venda,
   * não o faturamento — e é somada separadamente. Sem este filtro, uma comissão
   * de produto que compartilhasse `bookingId` entraria com a base errada. */
  const congelada = new Map(
    (params.commissions ?? [])
      .filter((c) => c.origin === "servico" && dentroDoPeriodo(c.date, periodo))
      .map((c) => [c.bookingId, c])
  );

  for (const b of bookings) {
    if (!isRevenue(b) || !dentroDoPeriodo(b.date, periodo)) continue;

    const pessoa = porId.get(b.staffId);
    const doDia = congelada.get(b.id);

    /* Reserva órfã ainda custa dinheiro: o corte aconteceu e alguém recebeu.
     * Cair no percentual da barbearia é melhor que somar zero — mas o nome
     * fica explícito para o dono ver que há dado a corrigir. */
    const pct = doDia?.commissionPct ?? pessoa?.commissionPct ?? padrao;
    const base = doDia?.commissionBase ?? b.value;
    const valor = doDia?.commissionAmount ?? Math.round((base * pct) / 100);

    let linha = acc.get(b.staffId);
    if (!linha) {
      linha = {
        staffId: b.staffId,
        nome: doDia?.staffName ?? pessoa?.name ?? "Barbeiro não identificado",
        base: 0,
        pct,
        valor: 0,
        atendimentos: 0,
      };
      acc.set(b.staffId, linha);
    }
    linha.base += base;
    linha.valor += valor;
    linha.atendimentos += 1;
  }

  /* O percentual exibido é recalculado do que foi somado, e não copiado do
   * cadastro: num mês em que a taxa do barbeiro mudou, parte dos atendimentos
   * está congelada na taxa antiga e parte na nova. Mostrar só uma delas seria
   * uma legenda que não explica o próprio número ao lado. */
  const porBarbeiro = [...acc.values()]
    .map((l) => ({ ...l, pct: Math.round(safeDiv(l.valor, l.base) * 1000) / 10 }))
    .sort((a, b) => b.valor - a.valor);

  return {
    total: porBarbeiro.reduce((s, l) => s + l.valor, 0),
    porBarbeiro,
  };
}

/* ------------------------------------------------------------------ */
/* DRE                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Despesas recorrentes que já valem numa data — uma por compromisso.
 *
 * `recurring` é um booleano num documento de data única: nada gera a ocorrência
 * do mês seguinte. As duas telas que leem esse campo discordavam sobre ele — o
 * DRE filtrava por período e perdia a despesa no mês seguinte ao lançamento,
 * enquanto a Projeção pegava todos os lançamentos de todos os meses e cobrava
 * seis aluguéis no mesmo dia depois de seis meses de uso.
 *
 * Aqui o compromisso vale a partir do lançamento e segue valendo. Quando o dono
 * relançou a mesma despesa na mão, a chave `categoria|descrição` reconhece que
 * é o mesmo compromisso e vale a versão mais recente — o reajuste do aluguel
 * substitui o valor velho em vez de somar com ele.
 */
export function despesasRecorrentesVigentes(
  expenses: Doc<ExpenseDoc>[],
  ateData: string
): Doc<ExpenseDoc>[] {
  const porCompromisso = new Map<string, Doc<ExpenseDoc>>();

  for (const e of expenses) {
    if (!e.recurring || e.date > ateData) continue;
    const chave = `${e.category}|${e.description}`.trim().toLowerCase();
    const atual = porCompromisso.get(chave);
    if (!atual || e.date > atual.date) porCompromisso.set(chave, e);
  }

  return [...porCompromisso.values()];
}

/**
 * Folha mensal da equipe.
 *
 * Quem está fora do quadro não entra: o cadastro é preservado para o histórico
 * e para um eventual retorno, mas o salário não é mais devido. Sem salário
 * definido conta zero — o arranjo mais comum em barbearia é só comissão.
 */
export function folhaMensal(staff: Doc<StaffDoc>[]) {
  return staff
    .filter((s) => s.active !== false)
    .reduce((soma, s) => soma + (s.salary ?? 0), 0);
}

/**
 * Taxa de maquininha do período, somada dos pagamentos congelados.
 *
 * `gatewayFeesTotal` era um parâmetro que nenhum chamador preenchia, então o
 * DRE debitava zero de taxa: numa barbearia que passa metade do faturamento no
 * crédito, some cerca de 1,5% do faturamento total do resultado.
 */
export function taxasDePagamento(
  payments: Doc<PaymentDoc>[],
  periodo: Periodo
) {
  return Math.round(
    payments
      .filter((p) => dentroDoPeriodo(p.date, periodo))
      .reduce((soma, p) => soma + (p.feeAmount ?? 0), 0)
  );
}

export type ResultadoDoMes = ReturnType<typeof resultadoDoMes>;

export function resultadoDoMes(params: {
  receita: ReceitaDoMes;
  expenses: Doc<ExpenseDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  periodo: Periodo;
  policies: TenantPolicies;
  /** Salário fixo, para quem não trabalha por comissão. Ainda sem tela. */
  payroll?: number;
  /**
   * Equipe e reservas do período — juntas, permitem ratear a comissão por quem
   * atendeu e cobrar a taxa de recebimento por meio. Ausentes, a comissão cai
   * no percentual único da barbearia, que é o comportamento correto para
   * operação solo.
   */
  staff?: Doc<StaffDoc>[];
  bookings?: Doc<BookingDoc>[];
  /** Congeladas na conclusão — vencem sobre a derivação quando existem. */
  commissions?: Doc<CommissionDoc>[];
  /** Soma de `taxasDePagamento` sobre os pagamentos congelados do período. */
  gatewayFeesTotal?: number;
}) {
  const { receita, expenses, movements, periodo, policies } = params;

  /* Custo fixo é o que está VIGENTE no período, não o que foi lançado nele.
   * O filtro por período fazia o aluguel marcado como recorrente em agosto
   * sumir do DRE de setembro: o mês seguinte nascia com custo fixo R$ 0,00 e
   * lucro inflado no valor da conta, até o dono relançar tudo na mão. */
  const fixedExpenses = despesasRecorrentesVigentes(expenses, periodo.fim).reduce(
    (s, e) => s + e.value,
    0
  );
  const variableOperatingExpenses = expenses
    .filter((e) => !e.recurring && dentroDoPeriodo(e.date, periodo))
    .reduce((s, e) => s + e.value, 0);

  // CMV = custo de compra do que foi vendido no período.
  const cmv = movements
    .filter((m) => m.kind === "compra" && dentroDoPeriodo(m.date, periodo))
    .reduce((s, m) => s + m.value, 0);

  /* Vem somado de `taxasDePagamento`, sobre os pagamentos CONGELADOS, e não
   * derivado das reservas com a taxa vigente hoje: mudar a taxa da maquininha
   * não pode reescrever o que já foi pago. Provado em produção — 1,99/3,49 →
   * 2,99/4,99 não alterou pagamento anterior nenhum. */
  const gatewayFees = params.gatewayFeesTotal ?? 0;

  /* Comissão do profissional.
   *
   * A base era só o lucro de revenda de produto — o serviço, que é o negócio
   * inteiro de uma barbearia, ficava de fora. Numa loja de 400 cortes a R$ 50,
   * a comissão real de 40% é R$ 8.000 no mês e o DRE mostrava R$ 0,00: o maior
   * custo variável da operação, invisível na tela que existe para decidir se
   * contrata ou demite barbeiro.
   *
   * Duas bases diferentes, de propósito — ver `commissionSplit`. Serviço paga
   * sobre o faturamento, rateado POR RESERVA e respeitando o percentual de cada
   * um; produto paga sobre o lucro, porque o custo de compra não é receita de
   * ninguém.
   *
   * Sem a lista de profissionais não há a quem ratear: cai no percentual da
   * barbearia aplicado ao total, que é o certo enquanto todos ganham igual. O
   * DRE perde só o detalhe por pessoa, não o custo. */
  const receitaDeServico = receita.servicos + receita.encaixes;
  const padraoPct = policies.commissionSplit.barberPct;

  const servico = params.staff
    ? comissoesDeServico({
        bookings: params.bookings ?? [],
        staff: params.staff,
        periodo,
        policies,
        commissions: params.commissions,
      })
    : {
        total: Math.round((receitaDeServico * padraoPct) / 100),
        porBarbeiro: [] as ComissaoDeBarbeiro[],
      };

  const lucroLoja = Math.max(receita.produtos - cmv, 0);
  const commissionsLoja = Math.round((lucroLoja * padraoPct) / 100);
  const commissions = servico.total + commissionsLoja;

  /* Simples Nacional (Anexo III) incide sobre RECEITA BRUTA, e é devido mesmo
   * no mês em que a barbearia dá prejuízo. Cobrar a alíquota sobre o resultado
   * subestimava o imposto em cerca de 3× — R$ 360 em vez de R$ 1.200 num mês
   * de R$ 20.000 faturados — e o dono planejava com dinheiro que é do governo.
   *
   * Fica fora de `variableCost` para a escada do DRE continuar legível, e a
   * identidade `grossRevenue − totalCost === result` segue valendo. */
  const tax = Math.round((receita.bruta * policies.taxRatePct) / 100);

  const variableCost = cmv + gatewayFees + commissions;
  const contributionMargin = receita.bruta - variableCost;
  const contributionMarginPct = safeDiv(contributionMargin, receita.bruta) * 100;

  const payroll = params.payroll ?? 0;
  const fixedCost = fixedExpenses + variableOperatingExpenses + payroll;

  const resultBeforeTax = contributionMargin - fixedCost;
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
    /** Só a parte de serviço, aberta por pessoa — é o que a tela detalha. */
    commissionsServico: servico.total,
    commissionsLoja,
    comissaoPorBarbeiro: servico.porBarbeiro,
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
  /* Um compromisso recorrente por conta, não um por lançamento.
   *
   * Era `expenses.filter(e => e.recurring)` sobre o histórico inteiro: depois
   * de seis meses de uso havia seis documentos "Aluguel", e a projeção cobrava
   * os seis no mesmo dia — R$ 12.000 num dia 5 que devia ser R$ 2.000. O erro
   * crescia a cada mês em que o produto era usado. */
  const recorrentes = despesasRecorrentesVigentes(
    params.expenses,
    toISODate(params.inicio)
  );

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

    /* Mensalidade é RECORRENTE, não um evento único.
     *
     * A regra antiga era `nextCharge === date`: casa uma vez e nunca mais. Em
     * 30 dias isso passa despercebido, porque a próxima cobrança de todo mundo
     * cai dentro da janela. Em 6 ou 12 meses vira erro grosseiro — cada
     * mensalista pagaria UMA vez no ano inteiro, e a projeção subestimaria a
     * receita recorrente em mais de 90%.
     *
     * Agora cobra todo mês no mesmo dia da próxima cobrança, e só a partir
     * dela: mensalista com cobrança dia 20 não gera receita no dia 20 de um mês
     * anterior ao contrato. Dia 31 em mês de 30 cai no último dia — é o que os
     * meios de pagamento fazem. */
    const diaDaCobranca = (iso: string) => Number(iso.slice(-2));
    const ultimoDiaDoMes = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const subscriptionCharge = ativos
      .filter((sub) => {
        if (!sub.nextCharge || sub.nextCharge > date) return false;
        const alvoDia = Math.min(diaDaCobranca(sub.nextCharge), ultimoDiaDoMes);
        return alvoDia === d.getDate();
      })
      .reduce((s, sub) => s + sub.price, 0);

    /* Mesma regra de dia da cobrança do mensalista, agora para a conta a pagar:
     * o dia do lançamento é o do vencimento, e o que cai no 31 vence no último
     * dia de um mês de 30 — antes nunca era cobrado nesses meses. */
    const fixedExpense = recorrentes
      .filter((e) => Math.min(Number(e.date.slice(-2)), ultimoDiaDoMes) === d.getDate())
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
  const soma = (metodos: PaymentMethod[]) =>
    recebidas
      .filter((b) => b.paymentMethod && metodos.includes(b.paymentMethod))
      .reduce((s, b) => s + b.value, 0);

  return {
    pix: soma(["pix"]),
    cartao: soma(["debit", "credit"]),
    dinheiro: soma(["cash"]),
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

/** Uma linha de projeção agregada por mês. */
export type MesProjetado = {
  /** `AAAA-MM`. */
  mes: string;
  rotulo: string;
  bookingRevenue: number;
  subscriptionCharge: number;
  fixedExpense: number;
  net: number;
  cumulative: number;
  /** Quanto da receita do mês é estimativa, de 0 a 1. */
  fracaoEstimada: number;
};

/**
 * Agrupa a projeção diária por mês.
 *
 * 365 barras não são um gráfico, são ruído — e 365 linhas de tabela ninguém
 * lê. Além de uns dois meses, o que o dono decide é por mês: "dezembro fecha
 * no vermelho?", não "dia 14 de dezembro fecha no vermelho?".
 *
 * `fracaoEstimada` viaja junto de propósito. Ela é o que separa projeção de
 * chute com aparência de projeção: em janeiro pode ser 20%, em dezembro é
 * 100%, e a tela precisa mostrar essa diferença em vez de apresentar os dois
 * números com a mesma cara.
 */
export function agruparProjecaoPorMes(dias: DiaProjetado[]): MesProjetado[] {
  const porMes = new Map<string, MesProjetado>();

  for (const d of dias) {
    const mes = d.date.slice(0, 7);
    let m = porMes.get(mes);
    if (!m) {
      m = {
        mes,
        rotulo: new Date(`${mes}-01T12:00:00`).toLocaleDateString("pt-BR", {
          month: "short",
          year: "2-digit",
        }),
        bookingRevenue: 0,
        subscriptionCharge: 0,
        fixedExpense: 0,
        net: 0,
        // O acumulado é o do ÚLTIMO dia do mês, não a soma dos acumulados
        // diários — somar acumulado é contar o mesmo dinheiro várias vezes.
        cumulative: 0,
        fracaoEstimada: 0,
      };
      porMes.set(mes, m);
    }
    m.bookingRevenue += d.bookingRevenue;
    m.subscriptionCharge += d.subscriptionCharge;
    m.fixedExpense += d.fixedExpense;
    m.net += d.net;
    m.cumulative = d.cumulative;
    if (d.isEstimate) m.fracaoEstimada += d.bookingRevenue;
  }

  for (const m of porMes.values()) {
    m.fracaoEstimada = m.bookingRevenue > 0 ? m.fracaoEstimada / m.bookingRevenue : 0;
  }
  return [...porMes.values()];
}
