"use client";

import { useTenant } from "@/lib/tenant-context";
import {
  useBookings, useExpenses, useInventoryMovements,
  useProducts, useServices, useStaff, useSubscribers, combineStatus,
} from "@/lib/db/use-shop-data";
import {
  caixaDiario, capacidadeDiaria, horariosDaJornada, indicadores,
  mapaDeCalor, mesPeriodo, projecaoDeCaixa, receitaDoMes,
  recorrenciaDeClientes, resultadoDoMes, topServicos,
} from "@/lib/analytics";

/**
 * Tudo que o financeiro precisa, calculado a partir do dado bruto.
 *
 * As telas de Financeiro, DRE, Fluxo, Projeção e Números liam cinco literais
 * pré-agregados do mock que precisavam bater entre si na mão — e não batiam.
 * Agora todas descem daqui, e um número divergente é bug de cálculo num lugar
 * só.
 */
/**
 * Horizontes de projeção.
 *
 * Quanto mais longe, menos "previsão" e mais "modelo": ninguém marca corte
 * para daqui a seis meses, então além de ~60 dias praticamente todo dia é
 * estimativa em cima da média histórica por dia da semana. A tela precisa
 * DIZER isso — projeção anual apresentada com a mesma confiança da mensal é
 * número bonito que induz decisão errada.
 */
export const HORIZONTES = {
  mensal: { dias: 30, rotulo: "Mensal", porMes: false },
  trimestral: { dias: 91, rotulo: "Trimestral", porMes: true },
  semestral: { dias: 182, rotulo: "Semestral", porMes: true },
  anual: { dias: 365, rotulo: "Anual", porMes: true },
} as const;

export type Horizonte = keyof typeof HORIZONTES;

export function useFinanceiro(mes: string, horizonte: Horizonte = "mensal") {
  const diasDeProjecao = HORIZONTES[horizonte].dias;
  const tenant = useTenant();
  const bookings = useBookings();
  const expenses = useExpenses();
  const movements = useInventoryMovements();
  const subscribers = useSubscribers();
  const services = useServices();
  const staff = useStaff();
  const products = useProducts();

  const periodo = mesPeriodo(mes);
  const status = combineStatus(bookings, expenses, movements, subscribers, services, products);

  const receita = receitaDoMes({
    bookings: bookings.items,
    movements: movements.items,
    subscribers: subscribers.items,
    periodo,
  });

  const dre = resultadoDoMes({
    receita,
    expenses: expenses.items,
    movements: movements.items,
    periodo,
    policies: tenant.policies,
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

/** Mês corrente em `YYYY-MM`. */
export function mesAtual(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "Julho de 2026" a partir de `YYYY-MM`. */
export function rotuloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  const label = new Date(ano, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
