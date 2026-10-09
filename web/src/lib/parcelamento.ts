/**
 * Lançamento parcelado — a conta, em funções puras.
 *
 * Um parcelado é N documentos, um por mês, cada um com o valor DA PARCELA e a
 * data em que ela pesa (vencimento = competência). Nenhum documento guarda o
 * "valor total": ele é a soma do grupo, e guardá-lo seria uma segunda verdade
 * para o mesmo número, que divergiria no primeiro "alterar valor das próximas".
 *
 * Nada aqui toca o Firestore nem o relógio; quem chama passa `hoje`.
 */

/** O que cada documento-parcela carrega para o grupo se reconhecer. */
export type ParcelaInfo = {
  /** 1..total */
  numero: number;
  total: number;
  /** Id comum às N parcelas. Também prefixa o id de cada documento. */
  grupoId: string;
};

export const PARCELAS_MIN = 2;
export const PARCELAS_MAX = 48;

export type EscopoDoGrupo = "so_esta" | "esta_e_proximas" | "todas";

const centavosDe = (reais: number) => Math.round(reais * 100);
const reaisDe = (centavos: number) => centavos / 100;

export function parcelasValidas(n: number): boolean {
  return Number.isInteger(n) && n >= PARCELAS_MIN && n <= PARCELAS_MAX;
}

/**
 * Divide um total em N parcelas, em centavos, com a sobra na PRIMEIRA.
 *
 * R$ 1.000,00 em 3 → 333,34 + 333,33 + 333,33. Dividir em reais e arredondar
 * cada parcela perde ou inventa centavos (3 × 333,33 = 999,99): a soma tem de
 * fechar com o total que o dono pagou.
 */
export function dividirEmCentavos(total: number, n: number): number[] {
  const cents = centavosDe(total);
  const base = Math.floor(cents / n);
  const sobra = cents - base * n;
  return Array.from({ length: n }, (_, i) => reaisDe(i === 0 ? base + sobra : base));
}

/** `AAAA-MM-DD` da parcela `indice` (0 = a primeira). Dia 31 vira o último dia do mês. */
export function dataDaParcela(primeira: string, indice: number): string {
  const [ano, mes, dia] = primeira.split("-").map(Number);
  const alvo = new Date(Date.UTC(ano, mes - 1 + indice, 1));
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(dia, ultimoDia);
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type PlanoDeParcelas = {
  valores: number[];
  datas: string[];
  /** Soma das parcelas. */
  total: number;
};

/**
 * `modo: "total"` divide o valor informado; `modo: "parcela"` repete o valor da
 * parcela N vezes (o total é consequência).
 */
export function planejarParcelas(params: {
  modo: "total" | "parcela";
  valor: number;
  n: number;
  primeira: string;
}): PlanoDeParcelas {
  const { modo, valor, n, primeira } = params;
  const valores =
    modo === "total"
      ? dividirEmCentavos(valor, n)
      : Array.from({ length: n }, () => reaisDe(centavosDe(valor)));
  return {
    valores,
    datas: Array.from({ length: n }, (_, i) => dataDaParcela(primeira, i)),
    total: reaisDe(valores.reduce((s, v) => s + centavosDe(v), 0)),
  };
}

/** Toda parcela tem de valer pelo menos 1 centavo (R$ 0,05 em 10x daria parcela zero). */
export function parcelasComCentavo(plano: PlanoDeParcelas): boolean {
  return plano.valores.every((v) => centavosDe(v) >= 1);
}

/** "Máquina Wahl · 3/10" */
export function descricaoDaParcela(base: string, numero: number, total: number): string {
  return `${base} · ${numero}/${total}`;
}

/** Tira o " · 3/10" do fim, para reeditar a descrição-base do grupo. */
export function baseDaDescricao(descricao: string): string {
  return descricao.replace(/\s·\s\d+\/\d+$/, "");
}

/** Id do documento da parcela: determinístico, para repetir a gravação não duplicar. */
export function idDaParcela(grupoId: string, numero: number): string {
  return `${grupoId}_${String(numero).padStart(2, "0")}`;
}

type ComParcela = { id: string; parcela?: ParcelaInfo | null; date: string; description?: string; value?: number };

/** As parcelas de um grupo, em ordem. */
export function parcelasDoGrupo<T extends ComParcela>(itens: T[], grupoId: string): T[] {
  return itens
    .filter((i) => i.parcela?.grupoId === grupoId)
    .sort((a, b) => (a.parcela!.numero - b.parcela!.numero));
}

/** Quais parcelas o escopo alcança, a partir da parcela `numero`. */
export function alcance<T extends ComParcela>(grupo: T[], numero: number, escopo: EscopoDoGrupo): T[] {
  if (escopo === "todas") return grupo;
  if (escopo === "so_esta") return grupo.filter((p) => p.parcela!.numero === numero);
  return grupo.filter((p) => p.parcela!.numero >= numero);
}

/** Parcela com data depois de hoje: "a vencer". O modelo não guarda "paga". */
export function aVencer(date: string, hoje: string): boolean {
  return date > hoje;
}

export type AtualizacaoDeParcela = { id: string; dados: Record<string, unknown> };
export type PlanoDeExclusao = { excluir: string[]; atualizar: AtualizacaoDeParcela[] };

/**
 * Excluir parcelas.
 *
 * "Só esta" deixa o buraco na numeração (1/10, 3/10…): a parcela 2 de fato não
 * existe mais, e renumerar mentiria sobre o parcelamento original. Já "esta e
 * as próximas" encerra o parcelamento ali, então as que ficam passam a dizer o
 * novo total (3/3, e não 3/10).
 */
export function planoDeExclusao<T extends ComParcela>(
  grupo: T[],
  numero: number,
  escopo: EscopoDoGrupo
): PlanoDeExclusao {
  const sai = alcance(grupo, numero, escopo);
  const saiIds = new Set(sai.map((p) => p.id));
  const fica = grupo.filter((p) => !saiIds.has(p.id));
  const atualizar: AtualizacaoDeParcela[] = [];
  if (escopo === "esta_e_proximas" && fica.length > 0) {
    const novoTotal = Math.max(...fica.map((p) => p.parcela!.numero));
    for (const p of fica) {
      if (novoTotal === p.parcela!.total) continue;
      atualizar.push({
        id: p.id,
        dados: {
          parcela: { ...p.parcela!, total: novoTotal },
          description: descricaoDaParcela(baseDaDescricao(p.description ?? ""), p.parcela!.numero, novoTotal),
        },
      });
    }
  }
  return { excluir: [...saiIds], atualizar };
}

/** Descrição-base e/ou categoria do grupo inteiro. */
export function planoDeEdicaoDoGrupo<T extends ComParcela>(
  grupo: T[],
  mudancas: { descricaoBase?: string; categoria?: string }
): AtualizacaoDeParcela[] {
  return grupo.map((p) => ({
    id: p.id,
    dados: {
      ...(mudancas.descricaoBase !== undefined
        ? { description: descricaoDaParcela(mudancas.descricaoBase, p.parcela!.numero, p.parcela!.total) }
        : {}),
      ...(mudancas.categoria !== undefined ? { category: mudancas.categoria } : {}),
    },
  }));
}

/** Novo valor DA PARCELA nesta e nas próximas; as anteriores não mudam. */
export function planoDeNovoValor<T extends ComParcela>(
  grupo: T[],
  numero: number,
  novoValor: number
): AtualizacaoDeParcela[] {
  return alcance(grupo, numero, "esta_e_proximas").map((p) => ({
    id: p.id,
    dados: { value: reaisDe(centavosDe(novoValor)) },
  }));
}

/** "09/10/2026" — com o ano, porque um parcelamento atravessa o fim do ano. */
export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * A frase que o formulário mostra antes de salvar:
 * "10x de R$ 300,00 · de 09/10/2026 a 09/07/2027 · total R$ 3.000,00".
 * Quando a divisão não é exata, diz a primeira à parte ("1ª de R$ 333,34 e 2x
 * de R$ 333,33") — a sobra tem que ser visível antes, não descoberta depois.
 */
export function previaDoParcelamento(plano: PlanoDeParcelas, formatar: (v: number) => string): string {
  const n = plano.valores.length;
  const primeira = plano.valores[0];
  const demais = plano.valores[1];
  const valores =
    n > 1 && primeira !== demais
      ? `1ª de ${formatar(primeira)} e ${n - 1}x de ${formatar(demais)}`
      : `${n}x de ${formatar(primeira)}`;
  return `${valores} · de ${dataCurta(plano.datas[0])} a ${dataCurta(plano.datas[n - 1])} · total ${formatar(plano.total)}`;
}
