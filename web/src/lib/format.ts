export function formatBRL(value: number) {
  return safeNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/** "domingo, 05 de julho" — data por extenso, com dia da semana. */
export function formatDatePtBR(iso: string) {
  return parseISODate(iso).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

/**
 * "05 de julho" — a data sem o dia da semana.
 *
 * Existe porque `formatDatePtBR(...).split(",")[0]` devolve o DIA DA SEMANA,
 * não a data: as tabelas de Despesas e Projeção chegaram a exibir só
 * "domingo", "segunda-feira". Toda coluna de data usa esta função ou
 * `formatWeekdayAndDay`.
 */
export function formatDateShortPtBR(iso: string) {
  return parseISODate(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

const DOW_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** "Sex 05" — dia da semana abreviado + número, para o fluxo de caixa. */
export function formatWeekdayAndDay(iso: string) {
  const date = parseISODate(iso);
  return `${DOW_NAMES[date.getDay()]} ${String(date.getDate()).padStart(2, "0")}`;
}

/** Interpreta um ISO `YYYY-MM-DD` no fuso local, não em UTC. */
export function parseISODate(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

/** `Date` → `YYYY-MM-DD` no fuso local (o inverso de `parseISODate`). */
export function toISODate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Divisão que nunca produz `NaN` nem `Infinity` na interface — os dois já
 * vazaram para a tela como `width: NaN%` e "R$ ∞".
 */
export function safeDiv(numerator: number, denominator: number, fallback = 0) {
  if (!denominator || !Number.isFinite(denominator) || !Number.isFinite(numerator)) {
    return fallback;
  }
  return numerator / denominator;
}

/** Percentual seguro, já limitado a [0, max]. Para barras de progresso. */
export function safePct(part: number, total: number, max = 100) {
  return Math.min(Math.max(safeDiv(part, total) * 100, 0), max);
}

function safeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

/**
 * "5511961733047" → "(11) 96173-3047"
 *
 * O número é gravado só com dígitos e DDI (é o formato que a Cloud API do
 * WhatsApp exige). Mostrar assim ao dono é ilegível — ele reconhece o cliente
 * pelo DDD e pelos quatro últimos dígitos, não por uma sequência de treze.
 */
export function formatPhonePtBR(bruto: string): string {
  const d = String(bruto ?? "").replace(/\D/g, "");
  const nacional = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (nacional.length === 11) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  // Formato desconhecido: devolver como veio é melhor que recortar errado.
  return bruto;
}
