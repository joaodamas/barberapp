/**
 * Combos (pedido do dono, 01/10/2026): "se o cara marcou corte e fez corte e
 * barba, o valor é o do combo corte + barba" — e vale para TUDO: o cliente
 * marcando pelo link, o balcão, o horário fixo e o "Adicionar serviço".
 *
 * Um serviço é combo quando tem `composicao`: os ids dos serviços que ele
 * junta (repetir id = mais de um, ex.: 2 cortes infantis). A regra:
 *   1. abre tudo o que foi escolhido nas peças (combo escolhido vira as peças);
 *   2. procura a combinação de combos + peças avulsas de MENOR preço;
 *   3. empate fica com menos itens (o combo).
 *
 * Função pura e idêntica em `web/src/lib/combos.ts` — a tela mostra o mesmo
 * preço que o servidor grava (teste de paridade nos dois lados).
 */

export type ServicoDoCatalogo = {
  id: string;
  name?: string;
  price?: number;
  durationMin?: number;
  composicao?: string[];
  active?: boolean;
};

export type ResultadoDoCombo = {
  ids: string[];
  valor: number;
  duracao: number;
  /** Nomes dos combos que entraram, para a tela dizer "virou Corte + barba". */
  combos: string[];
};

const preco = (s: ServicoDoCatalogo | undefined) => (Number(s?.price) || 0);
const centavos = (v: number) => Math.round(v * 100) / 100;

export function ehCombo(s: ServicoDoCatalogo): boolean {
  return Array.isArray(s.composicao) && s.composicao.length >= 2;
}

export function aplicarCombos(escolhidos: string[], catalogo: ServicoDoCatalogo[]): ResultadoDoCombo {
  const porId = new Map(catalogo.map((s) => [s.id, s]));
  const combos = catalogo.filter((s) => s.active !== false && ehCombo(s));

  // 1. Peças: combo escolhido vira o que ele junta (um nível só).
  const pecas: string[] = [];
  for (const id of escolhidos) {
    const s = porId.get(id);
    if (s && ehCombo(s) && s.composicao!.every((p) => porId.has(p))) pecas.push(...s.composicao!);
    else pecas.push(id);
  }

  const contar = (lista: string[]) => {
    const m = new Map<string, number>();
    for (const id of lista) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const chave = (m: Map<string, number>) =>
    [...m.entries()].filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join("|");

  // 2. Melhor cobertura — busca exaustiva com memória (pedidos têm poucos itens).
  const memo = new Map<string, { valor: number; itens: string[] }>();
  function melhor(resto: Map<string, number>): { valor: number; itens: string[] } {
    const k = chave(resto);
    if (!k) return { valor: 0, itens: [] };
    const guardado = memo.get(k);
    if (guardado) return guardado;
    // Opção A: a primeira peça vai avulsa.
    const primeira = k.split("|")[0].split(":")[0];
    const semPrimeira = new Map(resto);
    semPrimeira.set(primeira, (semPrimeira.get(primeira) ?? 0) - 1);
    const a = melhor(semPrimeira);
    let resposta = { valor: preco(porId.get(primeira)) + a.valor, itens: [primeira, ...a.itens] };
    // Opção B: algum combo que contenha a primeira peça e caiba no resto.
    for (const c of combos) {
      if (!c.composicao!.includes(primeira)) continue;
      const precisa = contar(c.composicao!);
      if (![...precisa.entries()].every(([id, n]) => (resto.get(id) ?? 0) >= n)) continue;
      const depois = new Map(resto);
      for (const [id, n] of precisa) depois.set(id, (depois.get(id) ?? 0) - n);
      const b = melhor(depois);
      const valor = preco(c) + b.valor;
      const itens = [c.id, ...b.itens];
      if (valor < resposta.valor - 0.001 || (Math.abs(valor - resposta.valor) <= 0.001 && itens.length < resposta.itens.length)) {
        resposta = { valor, itens };
      }
    }
    memo.set(k, resposta);
    return resposta;
  }

  const r = melhor(contar(pecas));
  /* A busca percorre as peças em ordem alfabética; a reserva mostra na ordem
   * que a pessoa escolheu. Cada item vai para a posição da sua primeira peça. */
  const posicao = (id: string) => {
    const s = porId.get(id);
    const alvo = s && ehCombo(s) ? s.composicao! : [id];
    return Math.min(...alvo.map((p) => (pecas.indexOf(p) < 0 ? Infinity : pecas.indexOf(p))));
  };
  r.itens = [...r.itens].map((id, i) => ({ id, i, p: posicao(id) })).sort((a, b) => a.p - b.p || a.i - b.i).map((x) => x.id);
  return {
    ids: r.itens,
    valor: centavos(r.valor),
    duracao: r.itens.reduce((t, id) => t + (Number(porId.get(id)?.durationMin) || 0), 0),
    combos: r.itens.filter((id) => ehCombo(porId.get(id) ?? { id })).map((id) => String(porId.get(id)?.name ?? id)),
  };
}

/* ------------------------------------------------------------------ */
/* Somar a uma reserva que já existe — preço congelado                 */
/* ------------------------------------------------------------------ */

export type ReservaComServicos = {
  serviceIds?: unknown;
  serviceNames?: unknown;
  value?: unknown;
  durationMin?: unknown;
};

export type ResultadoComExtras = ResultadoDoCombo & { nomes: string[] };

/**
 * O atendimento depois de somar `extras` a uma reserva que JÁ tem preço
 * (revisão financeira de 08/10).
 *
 * `aplicarCombos([...atuais, ...extras], catalogo)` reprecificava a reserva
 * inteira pelo catálogo de HOJE: o corte marcado a R$ 60 que hoje custa R$ 65
 * subia junto com a barba somada; e um serviço que saiu do catálogo depois da
 * marcação valia R$ 0,00 e virava "Serviço" (o `preco` de ausente é zero). O
 * barbeiro tocava em "+ barba" e o cliente pagava a barba MENOS o corte.
 *
 * A regra agora:
 *
 *  1. O que já estava na reserva vale o que a reserva diz (`value`), repartido
 *     entre os serviços dela na proporção do catálogo — é só a repartição; a
 *     soma é exatamente o `value` gravado. Serviço que sumiu do catálogo fica
 *     com o nome gravado e com o que sobra do `value`.
 *  2. Só o extra entra pelo preço de hoje.
 *  3. Os combos são procurados com esses preços: se a barba somada fecha um
 *     "Corte + barba" mais barato que corte congelado + barba de hoje, vale o
 *     combo (a regra de sempre — o menor preço); se não, fica a soma. Nunca sai
 *     mais caro que `value + extras`.
 *
 * O mesmo id na reserva e no extra (o segundo corte) não tem como ser separado
 * numa lista de ids: o preço por unidade é a média ponderada entre o congelado
 * e o de hoje — a soma sem combo continua sendo `value + extra de hoje`.
 *
 * Pura e idêntica nos dois lados: a tela ("Fica R$ X") e o servidor
 * (`adicionarServicosAoAtendimento`) chamam esta mesma conta.
 */
export function aplicarCombosComCongelados(
  reserva: ReservaComServicos,
  extras: string[],
  catalogo: ServicoDoCatalogo[]
): ResultadoComExtras {
  const atuais = Array.isArray(reserva.serviceIds) ? reserva.serviceIds.map(String) : [];
  const nomesGravados = Array.isArray(reserva.serviceNames) ? reserva.serviceNames.map(String) : [];
  const porId = new Map(catalogo.map((s) => [s.id, s]));
  const valorAtual = Math.max(0, Number(reserva.value) || 0);
  const duracaoAtual = Math.max(0, Number(reserva.durationMin) || 0);

  /* O nome gravado de cada id da reserva (a primeira ocorrência). */
  const nomeGravado = new Map<string, string>();
  atuais.forEach((id, i) => {
    if (!nomeGravado.has(id) && nomesGravados[i]) nomeGravado.set(id, nomesGravados[i]);
  });

  /* Reparte `total` entre as ocorrências de `atuais`, na proporção de `base`.
   * Devolve o TOTAL de cada id (somando as ocorrências), para a média ponderada
   * com o extra logo abaixo. */
  const repartir = (total: number, base: (s: ServicoDoCatalogo | undefined) => number) => {
    const doId = new Map<string, number>();
    const somar = (id: string, v: number) => doId.set(id, (doId.get(id) ?? 0) + v);
    const conhecidos = atuais.filter((id) => porId.has(id));
    const faltando = atuais.length - conhecidos.length;
    const somaConhecida = conhecidos.reduce((t, id) => t + base(porId.get(id)), 0);
    if (faltando === 0) {
      for (const id of atuais) {
        somar(id, somaConhecida > 0 ? (base(porId.get(id)) * total) / somaConhecida : total / atuais.length);
      }
      return doId;
    }
    /* Algum id saiu do catálogo: os conhecidos ficam com o preço deles (ou
     * menos, se o `value` não alcança), e quem sumiu fica com o resto. */
    const fator = somaConhecida > total && somaConhecida > 0 ? total / somaConhecida : 1;
    const resto = Math.max(0, total - somaConhecida * fator);
    for (const id of atuais) {
      somar(id, porId.has(id) ? base(porId.get(id)) * fator : resto / faltando);
    }
    return doId;
  };
  const precoCongelado = repartir(valorAtual, preco);
  const duracaoCongelada =
    duracaoAtual > 0 ? repartir(duracaoAtual, (s) => Number(s?.durationMin) || 0) : null;

  const vezes = (lista: string[], id: string) => lista.filter((x) => x === id).length;
  const valendo: ServicoDoCatalogo[] = catalogo.map((s) => {
    const n = vezes(atuais, s.id);
    if (n === 0) return s;
    const m = vezes(extras, s.id);
    const durHoje = Number(s.durationMin) || 0;
    return {
      ...s,
      name: nomeGravado.get(s.id) ?? s.name,
      price: ((precoCongelado.get(s.id) ?? 0) + preco(s) * m) / (n + m),
      durationMin: duracaoCongelada
        ? ((duracaoCongelada.get(s.id) ?? 0) + durHoje * m) / (n + m)
        : s.durationMin,
      /* O que o atendimento JÁ foi continua valendo, mesmo desativado depois
       * (a mesma regra de `servicosDaEdicao`). */
      active: true,
    };
  });
  for (const id of new Set(atuais)) {
    if (porId.has(id)) continue;
    const n = vezes(atuais, id);
    valendo.push({
      id,
      name: nomeGravado.get(id) ?? "Serviço",
      price: (precoCongelado.get(id) ?? 0) / n,
      durationMin: duracaoCongelada ? (duracaoCongelada.get(id) ?? 0) / n : 0,
      active: true,
    });
  }

  const r = aplicarCombos([...atuais, ...extras], valendo);
  const nomes = new Map(valendo.map((s) => [s.id, String(s.name ?? "Serviço")]));
  return {
    ...r,
    duracao: Math.round(r.duracao),
    nomes: r.ids.map((id) => nomes.get(id) ?? "Serviço"),
  };
}
