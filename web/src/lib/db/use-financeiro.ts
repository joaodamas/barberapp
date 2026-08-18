"use client";

import { useTenant } from "@/lib/tenant-context";
import {
  useBookings, useExpenses, useInventoryMovements,
  useCommissions, usePayments, useProducts, useServices, useStaff,
  useSubscribers, useRefunds, useSubscriptionInvoices, combineStatus,
} from "@/lib/db/use-shop-data";
import {
  caixaDiario, capacidadeDiaria, folhaMensal, horariosDaJornada, indicadores,
  taxasDePagamento, HORIZONTES,
  mapaDeCalor, mesPeriodo, projecaoDeCaixa, receitaDoMes,
  recorrenciaDeClientes, resultadoDoMes, topServicos,
} from "@/lib/analytics";
import type { Horizonte } from "@/lib/analytics";

/**
 * Tudo que o financeiro precisa, calculado a partir do dado bruto.
 *
 * As telas de Financeiro, DRE, Fluxo, Projeção e Números liam cinco literais
 * pré-agregados do mock que precisavam bater entre si na mão — e não batiam.
 * Agora todas descem daqui, e um número divergente é bug de cálculo num lugar
 * só.
 */
/* `HORIZONTES` mudou para `analytics.ts` e volta reexportado, como `mesAtual` e
 * `rotuloDoMes` no fim deste arquivo.
 *
 * O motivo é P1-14: enquanto a tabela morava aqui, importá-la puxava junto o
 * cliente do Firebase, e nenhum teste puro conseguia afirmar nada sobre ela — a
 * alternativa seria copiar os números para dentro do teste, que é exatamente o
 * erro que a correção de D6 tirou do `seis-visoes.test.ts`. Ela é dado de
 * análise, não estado de hook; ao lado de `projecaoDeCaixa` é o lugar dela. */
export { HORIZONTES } from "@/lib/analytics";
export type { Horizonte } from "@/lib/analytics";

export function useFinanceiro(mes: string, horizonte: Horizonte = "mensal") {
  const diasDeProjecao = HORIZONTES[horizonte].dias;
  const tenant = useTenant();
  const bookings = useBookings();
  const expenses = useExpenses();
  const movements = useInventoryMovements();
  const subscribers = useSubscribers();
  const services = useServices();
  const staff = useStaff();
  const commissions = useCommissions();
  const payments = usePayments();
  const refunds = useRefunds();
  const invoices = useSubscriptionInvoices();
  const products = useProducts();

  const periodo = mesPeriodo(mes);
  const status = combineStatus(
    bookings, expenses, movements, subscribers, services, products, staff,
    commissions, payments, refunds, invoices
  );

  const receita = receitaDoMes({
    bookings: bookings.items,
    movements: movements.items,
    subscribers: subscribers.items,
    periodo,
    hoje: new Date(),
    /* Rodada 3.2 · a receita passa a sair dos FATOS.
     *
     * Pagamento congelado quando existe; documento original como fallback
     * histórico. A fatura PAGA vira receita de mensalista (D20), e o estorno
     * é deduzido sem apagar o pagamento (D22). */
    payments: payments.items,
    refunds: refunds.items,
    invoices: invoices.items,
  });

  const dre = resultadoDoMes({
    receita,
    expenses: expenses.items,
    movements: movements.items,
    periodo,
    policies: tenant.policies,
    /* `payroll` era um parâmetro opcional que nenhum chamador preenchia, e a
     * comissão usava o percentual único da barbearia mesmo com `commissionPct`
     * gravado por profissional. Com a equipe e as reservas aqui, a linha de
     * mão de obra do DRE deixa de ser R$ 0,00 estrutural e passa a respeitar o
     * que cada barbeiro combinou — defeito corrigido em 05/08/2026. */
    payroll: folhaMensal(staff.items),
    staff: staff.items,
    bookings: bookings.items,
    /* Congeladas vencem sobre a derivação. Atendimentos anteriores ao trigger
     * não têm comissão gravada e continuam derivando — sem esse fallback o
     * histórico apareceria zerado no dia em que o trigger entrou. */
    commissions: commissions.items,
    /* A taxa da maquininha finalmente entra no resultado: era um parâmetro que
     * nenhum chamador preenchia, e o DRE debitava zero. */
    gatewayFeesTotal: taxasDePagamento(payments.items, periodo),
  });

  const caixa = caixaDiario({
    bookings: bookings.items,
    movements: movements.items,
    periodo,
  });

  const diasAbertos = tenant.schedule.weekdays.length;
  /* Capacidade do mês × barbeiros ativos. Sem isso, a ocupação de uma equipe
   * de três sai três vezes maior que a real — e o dono decide preço e horário
   * em cima de um número inventado. */
  const barbeirosAtivos = Math.max(staff.items.filter((b) => b.active !== false).length, 1);
  const capacidadeMes =
    capacidadeDiaria(tenant.schedule) * diasAbertos * 4.3 * barbeirosAtivos;

  const kpis = indicadores({
    bookings: bookings.items,
    receita,
    periodo,
    capacidade: Math.round(capacidadeMes),
  });

  const nomePorId = new Map(services.items.map((s) => [s.id, s.name]));

  const tops = topServicos({ bookings: bookings.items, nomePorId, periodo });

  return {
    status,
    periodo,
    receita,
    dre,
    caixa,
    kpis,
    tops,
    recorrencia: recorrenciaDeClientes({ bookings: bookings.items, hoje: new Date() }),
    heatmap: mapaDeCalor({
      bookings: bookings.items,
      periodo,
      horarios: horariosDaJornada(tenant.schedule),
    }),
    projecao: projecaoDeCaixa({
      bookings: bookings.items,
      expenses: expenses.items,
      subscribers: subscribers.items,
      historico: caixa,
      openWeekdays: tenant.schedule.weekdays,
      inicio: new Date(),
      dias: diasDeProjecao,
    }),
    /** Dados crus, para as telas que precisam da lista e não do agregado. */
    raw: {
      bookings: bookings.items,
      expenses: expenses.items,
      movements: movements.items,
      subscribers: subscribers.items,
      services: services.items,
      products: products.items,
      tops,
    },
  };
}

/* Vivem em `format.ts` — módulo puro, testável sem montar hook. Reexportadas
 * aqui porque as telas do financeiro já as importam deste caminho. */
export { mesAtual, rotuloDoMes } from "@/lib/format";
