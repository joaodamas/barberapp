/**
 * Folha fixa POR MÊS — o salário que valia naquele mês, de quem estava na
 * equipe naquele mês (revisão financeira de 08/10).
 *
 * ## O defeito
 *
 * `folhaMensal(staff)` somava o salário ATUAL de quem está ativo HOJE, e o DRE
 * aplicava esse número a qualquer mês. Dar aumento em novembro reescrevia o
 * resultado de setembro; contratar alguém em novembro punha o salário dele em
 * setembro; desligar alguém tirava o salário dele de todos os meses em que ele
 * trabalhou. O DRE afirmava um custo que não aconteceu e escondia um que
 * aconteceu.
 *
 * ## O modelo (mínimo)
 *
 * Em `staff_pay/{id}` — o documento que só o dono lê, onde o salário já mora —
 * a tela de Equipe passa a gravar, junto da mudança:
 *
 * - `historicoSalario: [{ valorCentavos, desde: "AAAA-MM" }]` — cada valor vale
 *   a partir do mês `desde` até o próximo. Mudou duas vezes no mesmo mês, vale
 *   a última (é o valor com que o mês fecha).
 * - `historicoNaEquipe: [{ ativo, desde: "AAAA-MM" }]` — entrou/saiu. O mês da
 *   saída ainda conta: o barbeiro trabalhou parte dele, e o salário é devido.
 *
 * Na primeira mudança, o histórico nasce com o estado anterior desde o início
 * do registro (`createdAt`, quando existe). Sem `createdAt`, o estado anterior
 * vale "desde sempre" — é a mesma premissa que o produto já fazia, só que agora
 * ela para de mudar com o tempo.
 *
 * ## Dado antigo, sem histórico
 *
 * O salário atual vale a partir do mês de criação do registro (`createdAt`);
 * sem `createdAt`, vale em todo mês (o comportamento antigo — não há de onde
 * tirar outro). `semHistoricoDeSalario` conta esses casos para a tela dizer que
 * o número é o do cadastro de hoje.
 */

export type EntradaDeSalario = { valorCentavos: number; desde: string };
export type EntradaNaEquipe = { ativo: boolean; desde: string };

export type PessoaDaFolha = {
  active?: boolean;
  salary?: number | null;
  createdAt?: unknown;
  historicoSalario?: EntradaDeSalario[] | null;
  historicoNaEquipe?: EntradaNaEquipe[] | null;
};

/** "Desde sempre" — anterior a qualquer `AAAA-MM` real na comparação de texto. */
export const DESDE_SEMPRE = "0000-01";

const paraCentavos = (reais: unknown) => Math.round((Number(reais) || 0) * 100);

/** `AAAA-MM` do `createdAt` — Timestamp do Firestore, `{ seconds }`, Date ou ISO. */
export function mesDoRegistro(createdAt: unknown): string | null {
  if (!createdAt) return null;
  let d: Date | null = null;
  if (createdAt instanceof Date) d = createdAt;
  else if (typeof createdAt === "string") d = new Date(createdAt);
  else if (typeof createdAt === "object") {
    const c = createdAt as { toDate?: () => Date; seconds?: number };
    if (typeof c.toDate === "function") d = c.toDate();
    else if (typeof c.seconds === "number") d = new Date(c.seconds * 1000);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Lista ordenada por `desde`, sem duas entradas no mesmo mês (fica a última). */
function porMes<T extends { desde: string }>(lista: T[]): T[] {
  const m = new Map<string, T>();
  for (const e of lista) m.set(e.desde, e);
  return [...m.values()].sort((a, b) => a.desde.localeCompare(b.desde));
}

function vigente<T extends { desde: string }>(lista: T[], mes: string): T | null {
  let achado: T | null = null;
  for (const e of porMes(lista)) if (e.desde <= mes) achado = e;
  return achado;
}

/** O histórico de salário depois de gravar `novoReais` em `mes`. */
export function historicoAoMudarSalario(pessoa: PessoaDaFolha, novoReais: unknown, mes: string): EntradaDeSalario[] {
  const atual = pessoa.historicoSalario?.length
    ? [...pessoa.historicoSalario]
    : paraCentavos(pessoa.salary) > 0
      ? [{ valorCentavos: paraCentavos(pessoa.salary), desde: mesDoRegistro(pessoa.createdAt) ?? DESDE_SEMPRE }]
      : [];
  return porMes([...atual, { valorCentavos: paraCentavos(novoReais), desde: mes }]);
}

/** O histórico na equipe depois de ativar/desativar em `mes`. */
export function historicoAoMudarAtivo(pessoa: PessoaDaFolha, ativo: boolean, mes: string): EntradaNaEquipe[] {
  const atual = pessoa.historicoNaEquipe?.length
    ? [...pessoa.historicoNaEquipe]
    : [{ ativo: pessoa.active !== false, desde: mesDoRegistro(pessoa.createdAt) ?? DESDE_SEMPRE }];
  return porMes([...atual, { ativo, desde: mes }]);
}

/**
 * O que a tela de Equipe grava em `staff_pay` junto da mudança — ou nada,
 * quando o campo não mexe na folha.
 */
export function historicoDaMudanca(
  pessoa: PessoaDaFolha | undefined,
  campo: string,
  valor: unknown,
  mes: string
): { historicoSalario: EntradaDeSalario[] } | { historicoNaEquipe: EntradaNaEquipe[] } | null {
  if (!pessoa) return null;
  if (campo === "salary") return { historicoSalario: historicoAoMudarSalario(pessoa, valor, mes) };
  if (campo === "active") return { historicoNaEquipe: historicoAoMudarAtivo(pessoa, valor === true, mes) };
  return null;
}

/** Estava na equipe em `mes`? O mês da saída ainda conta. */
export function naEquipeNoMes(pessoa: PessoaDaFolha, mes: string): boolean {
  const inicio = mesDoRegistro(pessoa.createdAt);
  if (pessoa.historicoNaEquipe?.length) {
    const e = vigente(pessoa.historicoNaEquipe, mes);
    if (!e) return false;
    return e.ativo || e.desde === mes;
  }
  /* Sem histórico: o estado de hoje, a partir da criação do registro. */
  if (inicio && mes < inicio) return false;
  return pessoa.active !== false;
}

/** O salário que valia em `mes`, em CENTAVOS. */
export function salarioNoMesEmCentavos(pessoa: PessoaDaFolha, mes: string): number {
  if (pessoa.historicoSalario?.length) return vigente(pessoa.historicoSalario, mes)?.valorCentavos ?? 0;
  const inicio = mesDoRegistro(pessoa.createdAt);
  if (inicio && mes < inicio) return 0;
  return paraCentavos(pessoa.salary);
}

/** Folha fixa do mês, em reais. */
export function folhaDoMes(staff: PessoaDaFolha[], mes: string): number {
  const total = staff
    .filter((s) => naEquipeNoMes(s, mes))
    .reduce((t, s) => t + salarioNoMesEmCentavos(s, mes), 0);
  return total / 100;
}

/** Quantos salários ainda saem do cadastro de hoje (sem histórico gravado). */
export function semHistoricoDeSalario(staff: PessoaDaFolha[]): number {
  return staff.filter((s) => !s.historicoSalario?.length && paraCentavos(s.salary) > 0).length;
}
