import { jornadaDoDia, paraMinutos, type EntradaDeJornada } from "@/lib/jornada";

/**
 * A grade do dia por barbeiro (auditoria de 09/10).
 *
 * A grade era UMA coluna para a loja inteira: dois barbeiros com cliente às 10h
 * viravam duas faixas lado a lado — o mesmo desenho do encaixe sobreposto —, o
 * cartão não dizia de quem era, e "Livre" só aparecia quando NINGUÉM estava
 * ocupado. Numa barbearia de três cadeiras isso escondia as vagas reais.
 *
 * Aqui mora só a conta, sem React: quem trabalha no dia, onde cada atendimento
 * cai, e o que está livre PARA CADA barbeiro. O componente só desenha.
 *
 * Quem trabalha no dia segue o servidor (`functions/src/availability.ts`):
 * jornada do barbeiro campo a campo, herdando o que ele não declara da loja, e
 * quem decide a precedência entre exceção, dia da semana e padrão é
 * `jornadaDoDia`, e só ela.
 */

export type BarbeiroDaGrade = {
  id: string;
  name: string;
  active?: boolean;
  /** Jornada própria. Ausente (ou campos ausentes) = herda a da barbearia. */
  schedule?: Partial<EntradaDeJornada> | null;
};

export type ReservaDaGrade = {
  id: string;
  staffId?: string | null;
  staffName?: string | null;
  time: string;
  durationMin?: number;
};

export type FaixaDaGrade<B extends ReservaDaGrade> = {
  booking: B;
  inicio: number;
  fim: number;
  faixa: number;
};

export type ColunaDaGrade<B extends ReservaDaGrade> = {
  /** `null` na coluna única que reúne todos (celular em "Todos"). */
  id: string | null;
  nome: string;
  /** Escolhido no filtro, mas não trabalha neste dia e não tem atendimento. */
  folga: boolean;
  abre: number;
  fecha: number;
  pausas: Array<readonly [number, number]>;
  faixas: FaixaDaGrade<B>[];
  nFaixas: number;
  /** Início (em minutos) de cada linha livre desta coluna. */
  livres: number[];
  /** Início de cada linha de intervalo SEM atendimento por cima. */
  intervalos: number[];
};

export type GradeMontada<B extends ReservaDaGrade> = {
  grade: number;
  abre: number;
  fecha: number;
  linhas: number[];
  colunas: ColunaDaGrade<B>[];
};

const ABRE_PADRAO = 540;
const FECHA_PADRAO = 1140;

/** Barbeiros que podem aparecer: ativos, e (se houver filtro) só o escolhido. */
export function barbeirosDoFiltro(equipe: BarbeiroDaGrade[], filtro: string | null) {
  return equipe.filter((b) => b.active !== false && (filtro === null || b.id === filtro));
}

/** Filtro guardado que não existe mais na equipe vira "Todos". */
export function filtroValido(filtro: string | null, equipe: Array<{ id: string; active?: boolean }>): string | null {
  return filtro !== null && equipe.some((b) => b.id === filtro && b.active !== false) ? filtro : null;
}

/** Só as reservas do barbeiro escolhido; sem filtro, todas. */
export function reservasDoFiltro<B extends { staffId?: string | null }>(reservas: B[], filtro: string | null): B[] {
  return filtro === null ? reservas : reservas.filter((b) => b.staffId === filtro);
}

/** A jornada do barbeiro no dia: o que ele declara, herdando o resto da loja. */
function jornadaDe(
  loja: EntradaDeJornada | null | undefined,
  barbeiro: BarbeiroDaGrade | null,
  dia: string,
  openWeekdays?: number[]
) {
  const dele = barbeiro?.schedule ?? {};
  const daLoja = loja ?? {};
  return jornadaDoDia({
    schedule: {
      weekdays: dele.weekdays ?? openWeekdays ?? daLoja.weekdays,
      opensAt: dele.opensAt ?? daLoja.opensAt,
      closesAt: dele.closesAt ?? daLoja.closesAt,
      breaks: dele.breaks ?? daLoja.breaks,
      perDay: dele.perDay ?? daLoja.perDay,
      exceptions: dele.exceptions ?? daLoja.exceptions,
    },
    weekday: new Date(`${dia}T12:00:00`).getDay(),
    date: dia,
  });
}

type Rascunho<B extends ReservaDaGrade> = {
  id: string | null;
  nome: string;
  folga: boolean;
  aberto: boolean;
  abre: number;
  fecha: number;
  pausas: Array<readonly [number, number]>;
  reservas: B[];
};

export function montarGrade<B extends ReservaDaGrade>(params: {
  dia: string;
  schedule: EntradaDeJornada | null | undefined;
  equipe: BarbeiroDaGrade[];
  /** Atendimentos que ocupam horário (sem cancelados nem pedidos de encaixe). */
  reservas: B[];
  /** Pedidos de encaixe: só esticam a janela da grade. */
  pedidos?: B[];
  /** Barbeiro escolhido no filtro; `null` = Todos. */
  filtro: string | null;
  /** "colunas": uma por barbeiro. "unica": todos juntos (celular em "Todos"). */
  modo: "colunas" | "unica";
  /** `policies.openWeekdays`: o servidor o consulta antes dos dias da loja. */
  openWeekdays?: number[];
}): GradeMontada<B> {
  const { dia, schedule, equipe, filtro, modo } = params;
  const grade = Number(schedule?.slotMinutes) || 30;
  const reservas = reservasDoFiltro(params.reservas, filtro);
  const pedidos = reservasDoFiltro(params.pedidos ?? [], filtro);
  const janelaDe = (b: ReservaDaGrade) => {
    const ini = paraMinutos(b.time) ?? 0;
    return [ini, ini + (Number(b.durationMin) || grade)] as const;
  };

  const rascunho = (b: BarbeiroDaGrade | null, nome: string): Omit<Rascunho<B>, "reservas" | "folga"> => {
    const j = jornadaDe(schedule, b, dia, params.openWeekdays);
    return {
      id: b?.id ?? null,
      nome,
      aberto: j.aberto,
      abre: j.aberto ? paraMinutos(j.opensAt) ?? ABRE_PADRAO : ABRE_PADRAO,
      fecha: j.aberto ? paraMinutos(j.closesAt) ?? FECHA_PADRAO : FECHA_PADRAO,
      pausas: j.aberto ? j.breaks.map((p) => [paraMinutos(p.from) ?? 0, paraMinutos(p.to) ?? 0] as const) : [],
    };
  };

  /* Quem tem coluna: ativos que abrem no dia, mais QUALQUER um com atendimento
   * (barbeiro desativado ou de folga com cliente marcado não pode sumir da
   * grade), mais o escolhido no filtro. */
  const rascunhos: Rascunho<B>[] = [];
  const conhecidos = new Set<string>();
  for (const b of barbeirosDoFiltro(equipe, filtro)) {
    const r = rascunho(b, b.name);
    const dele = reservas.filter((x) => x.staffId === b.id);
    if (!r.aberto && dele.length === 0 && filtro !== b.id) continue;
    rascunhos.push({ ...r, folga: !r.aberto && dele.length === 0, reservas: dele });
    conhecidos.add(b.id);
  }
  for (const b of equipe) {
    if (conhecidos.has(b.id)) continue;
    const dele = reservas.filter((x) => x.staffId === b.id);
    if (dele.length === 0) continue;
    /* Desativado com atendimento marcado: a coluna existe, mas não vende vaga. */
    rascunhos.push({ ...rascunho(b, b.name), aberto: false, folga: false, reservas: dele });
    conhecidos.add(b.id);
  }
  /* Atendimento de quem não está na equipe (ficha apagada): coluna pelo nome
   * gravado, para o atendimento não sumir. */
  const orfas = reservas.filter((x) => !x.staffId || !conhecidos.has(x.staffId));
  if (orfas.length > 0) {
    const nomes = new Map<string, string>();
    for (const o of orfas) {
      const chave = o.staffId ?? "";
      if (!nomes.has(chave)) nomes.set(chave, o.staffName || "Sem barbeiro");
    }
    for (const [chave, nome] of nomes) {
      rascunhos.push({
        ...rascunho(null, nome),
        aberto: false,
        id: chave || null,
        folga: false,
        reservas: orfas.filter((o) => (o.staffId ?? "") === chave),
      });
    }
  }
  /* Barbearia sem barbeiro ativo cadastrado: a jornada da loja, uma coluna só
   * — o comportamento de antes. Com equipe e todos de folga, a grade fica
   * vazia: oferecer "Livre" sem ninguém para atender seria mentira. */
  if (rascunhos.length === 0 && !equipe.some((b) => b.active !== false)) {
    const r = rascunho(null, "");
    if (r.aberto || pedidos.length > 0) rascunhos.push({ ...r, folga: false, reservas: [] });
  }

  const unir = (rs: Rascunho<B>[]): Rascunho<B>[] => {
    if (modo !== "unica" || rs.length === 0) return rs;
    const abertas = rs.filter((r) => r.aberto);
    const base = abertas.length > 0 ? abertas : rs;
    /* Pausa só vale para a coluna única se TODOS param naquele horário. */
    const pausas = base[0].pausas.filter(([de, ate]) =>
      base.every((r) => r.pausas.some(([d, a]) => d <= de && ate <= a))
    );
    return [
      {
        id: null,
        nome: "",
        folga: false,
        aberto: abertas.length > 0,
        abre: Math.min(...base.map((r) => r.abre)),
        fecha: Math.max(...base.map((r) => r.fecha)),
        pausas,
        reservas: rs.flatMap((r) => r.reservas),
      },
    ];
  };
  const finais = unir(rascunhos);

  /* A janela da grade: a união das jornadas, esticada por atendimento ou
   * pedido fora dela (o balcão pode lançar depois do expediente). */
  const abertas = finais.filter((r) => r.aberto);
  let abre = abertas.length > 0 ? Math.min(...abertas.map((r) => r.abre)) : ABRE_PADRAO;
  let fecha = abertas.length > 0 ? Math.max(...abertas.map((r) => r.fecha)) : FECHA_PADRAO;
  for (const b of [...reservas, ...pedidos]) {
    const [i, f] = janelaDe(b);
    abre = Math.min(abre, i - (i % grade));
    fecha = Math.max(fecha, f);
  }
  const linhas: number[] = [];
  for (let t = abre; t < fecha; t += grade) linhas.push(t);

  const colunas = finais.map((r): ColunaDaGrade<B> => {
    /* Faixas: a primeira que não colide. Encaixe aprovado por cima de outro
     * atendimento DA MESMA coluna abre a segunda faixa. */
    const faixas: FaixaDaGrade<B>[] = [];
    for (const b of [...r.reservas].sort((x, y) => x.time.localeCompare(y.time))) {
      const [inicio, fim] = janelaDe(b);
      let faixa = 0;
      while (faixas.some((f) => f.faixa === faixa && f.inicio < fim && inicio < f.fim)) faixa++;
      faixas.push({ booking: b, inicio, fim, faixa });
    }
    const comAtendimento = (t: number) => faixas.some((f) => f.inicio < t + grade && t < f.fim);
    const livres: number[] = [];
    const intervalos: number[] = [];
    for (const t of linhas) {
      const pausa = r.pausas.some(([de, ate]) => de <= t && t < ate);
      const ocupadoPorPausa = r.pausas.some(([de, ate]) => de < t + grade && t < ate);
      const atendimento = comAtendimento(t);
      /* Atendimento lançado dentro do intervalo (o balcão pode): o cartão dele
       * é o que importa ali. */
      if (pausa && !atendimento) intervalos.push(t);
      if (!r.aberto || t < r.abre || t >= r.fecha) continue;
      if (!atendimento && !ocupadoPorPausa) livres.push(t);
    }
    return {
      id: r.id,
      nome: r.nome,
      folga: r.folga,
      abre: r.abre,
      fecha: r.fecha,
      pausas: r.pausas,
      faixas,
      nFaixas: Math.max(1, ...faixas.map((f) => f.faixa + 1)),
      livres,
      intervalos: r.aberto ? intervalos : [],
    };
  });

  return { grade, abre, fecha, linhas, colunas };
}
