export function formatBRL(value: number) {
  return safeNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * "27,7%" — percentual em português, e nunca um zero falso.
 *
 * ## As duas coisas que ele conserta
 *
 * **O separador.** `toFixed(1)` devolve `27.7`, e o ponto é separador de
 * MILHAR em português: "27.7%" lê-se como vinte e sete mil e sete por cento
 * antes de o leitor perceber o engano. O DRE mostrava `27.7%` e `77.7%`, e o
 * Financeiro, `0.99% · 1.99% · 3.15% · 8.5%` — o último com uma casa entre
 * vizinhos de duas, o que faz a coluna deixar de alinhar. `formatBRL` já
 * resolvia isso para dinheiro há muito tempo; percentual nunca teve o par.
 *
 * **O arredondamento que apaga o fato.** `Math.round(1 / 464 * 100)` é `0`, e
 * foi assim que a tela Números exibiu `OCUPAÇÃO 0%` no mês em que houve um
 * atendimento — com o mapa de calor logo abaixo dizendo "100% de ocupação"
 * naquele horário. O número não estava errado por pouco: ele afirmava que nada
 * aconteceu. É a mesma classe de D3 — o produto transformando "quase nada" em
 * "nada", que é a única leitura que o dono não pode fazer.
 *
 * Por isso um valor diferente de zero nunca sai como zero: ele sai como
 * `< 0,1%`. O sinal é preservado (`> −0,1%`), porque uma margem levemente
 * negativa apresentada como levemente positiva é o defeito de novo, menor.
 */
export function formatPctPtBR(value: number, casas = 1) {
  const n = safeNumber(value);
  const limite = 1 / 10 ** casas;

  if (n !== 0 && Math.abs(n) < limite / 2) {
    const borda = limite.toLocaleString("pt-BR", {
      minimumFractionDigits: casas,
      maximumFractionDigits: casas,
    });
    return n > 0 ? `< ${borda}%` : `> −${borda}%`;
  }

  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  })}%`;
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

/**
 * Mês em `YYYY-MM`, `offset` meses antes de `hoje`.
 *
 * O dia 1 é fixado ANTES de mover o mês porque `setMonth` preserva o dia do
 * mês: em 31/03, voltar um mês pede "31 de fevereiro" e transborda de volta
 * para março. O dono clicava "mês anterior" no dia do fechamento e a tela não
 * saía do lugar, com fevereiro inalcançável — e na tela de Números os dois
 * meses comparados viravam o mesmo, exibindo variação zero contra si próprio.
 */
export function mesAtual(offset = 0, hoje = new Date()) {
  const d = new Date(hoje);
  d.setDate(1);
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
