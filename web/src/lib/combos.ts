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
 * Função pura e idêntica em `functions/src/combos.ts` — a tela mostra o mesmo
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
  return {
    ids: r.itens,
    valor: centavos(r.valor),
    duracao: r.itens.reduce((t, id) => t + (Number(porId.get(id)?.durationMin) || 0), 0),
    combos: r.itens.filter((id) => ehCombo(porId.get(id) ?? { id })).map((id) => String(porId.get(id)?.name ?? id)),
  };
}
