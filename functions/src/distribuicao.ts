/**
 * "Qualquer barbeiro" — quem atende quando o cliente não escolhe (05/10).
 *
 * O dono escolhe a regra em Ajustes (`policies.distribuicao`):
 *
 * | Regra        | Quem leva o cliente                                              |
 * |--------------|------------------------------------------------------------------|
 * | `equilibrio` | o barbeiro livre com MENOS atendimentos no dia (padrão)          |
 * | `rodizio`    | o próximo da fila depois do último sorteado, pulando quem está ocupado |
 * | `prioridade` | o primeiro livre na ordem que o dono definiu                     |
 *
 * Só o SERVIDOR decide: a escolha acontece dentro da transação que trava o
 * horário (`gravarComTravaDeHorario`), com a agenda lida naquele instante. A
 * tela só mostra a união dos horários livres e, depois de gravar, quem ficou.
 * O único par no web é a ORDEM da equipe (`porOrdem` ↔ `emOrdem`), que a tela
 * de Ajustes mostra e precisa ser a mesma fila daqui.
 */

export type RegraDeDistribuicao = "equilibrio" | "rodizio" | "prioridade";

export const REGRAS_DE_DISTRIBUICAO: RegraDeDistribuicao[] = ["equilibrio", "rodizio", "prioridade"];

/** O valor que a tela manda no lugar do id de um barbeiro. */
export const QUALQUER_BARBEIRO = "qualquer";

/** Regra gravada, ou o padrão — valor estranho no banco não pode quebrar a reserva. */
export function regraDaBarbearia(policies: unknown): RegraDeDistribuicao {
  const valor = (policies as { distribuicao?: unknown } | null | undefined)?.distribuicao;
  return REGRAS_DE_DISTRIBUICAO.includes(valor as RegraDeDistribuicao)
    ? (valor as RegraDeDistribuicao)
    : "equilibrio";
}

/**
 * O barbeiro faz TODOS os serviços pedidos?
 *
 * Lista vazia (ou ausente) é "faz tudo" — a mesma leitura de `validarPedido`:
 * barbeiro recém-cadastrado, sem serviços marcados, atende qualquer um.
 */
export function fazTodosOsServicos(servicosDoBarbeiro: unknown, serviceIds: string[]): boolean {
  if (!Array.isArray(servicosDoBarbeiro) || servicosDoBarbeiro.length === 0) return true;
  const faz = servicosDoBarbeiro.map(String);
  return serviceIds.every((id) => faz.includes(String(id)));
}

/** Ordem do dono; sem `order` gravado, vai para o fim. */
export function ordemDoBarbeiro(order: unknown): number {
  /* `Number(null)` é 0: sem esta guarda, a ficha com `order: null` furava a
   * fila e ia para o topo — e a tela (`emOrdem`) a punha no fim. */
  if (order === null || order === undefined || order === "") return Number.MAX_SAFE_INTEGER;
  const n = Number(order);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export type BarbeiroDaEquipe = {
  staffId: string;
  ordem: number;
  servicos: unknown;
  /** O expediente dele abre nesse dia (folga e exceção já aplicadas). */
  trabalhaNoDia: boolean;
};

/** Quem PODE atender: faz todos os serviços e trabalha no dia. Em ordem do dono. */
export function elegiveis<B extends BarbeiroDaEquipe>(equipe: B[], serviceIds: string[]): B[] {
  return equipe
    .filter((b) => b.trabalhaNoDia && fazTodosOsServicos(b.servicos, serviceIds))
    .sort(porOrdem);
}

export type Candidato = {
  staffId: string;
  ordem: number;
  /** Reservas que ocupam a cadeira dele nesse dia. */
  atendimentosNoDia: number;
  /** O atendimento inteiro cabe na agenda dele, naquele horário. */
  livre: boolean;
};

/**
 * Ordem do dono; empate (dois com o mesmo `order`, ou os dois sem), pelo id.
 *
 * É o MESMO desempate de `emOrdem` em `web/src/lib/distribuicao.ts` (08/10). A
 * tela de Ajustes desempatava pelo nome e o servidor pelo id: com dois
 * barbeiros de mesmo `order` — o que a tela de Equipe gravava ao adicionar
 * depois de uma remoção —, a lista que o dono via não era a fila que o
 * servidor usava, e "Ordem de preferência" escolhia quem não estava em
 * primeiro na tela. O id não muda com o nome e nunca empata.
 */
export function porOrdem(a: { ordem: number; staffId: string }, b: { ordem: number; staffId: string }) {
  return a.ordem - b.ordem || (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0);
}

/**
 * Escolhe quem atende. `null` = ninguém livre: o horário acabou de ser ocupado.
 *
 * Desempates sempre pela ordem do dono, para a mesma agenda dar sempre a mesma
 * resposta — sorteio de verdade deixaria o dono sem como explicar a escolha.
 */
export function escolherBarbeiro(params: {
  regra: RegraDeDistribuicao;
  candidatos: Candidato[];
  /** Último barbeiro que o rodízio escolheu nesta barbearia. */
  ultimoDoRodizio?: string | null;
}): string | null {
  const fila = [...params.candidatos].sort(porOrdem);
  const livres = fila.filter((c) => c.livre);
  if (livres.length === 0) return null;

  if (params.regra === "prioridade") return livres[0].staffId;

  if (params.regra === "rodizio") {
    /* A fila é a equipe INTEIRA em ordem, livre ou não: pular quem está
     * ocupado não pode mudar de quem é a vez depois. Último fora da fila (saiu
     * da equipe, não faz o serviço) recomeça do início. */
    const inicio = fila.findIndex((c) => c.staffId === params.ultimoDoRodizio) + 1;
    for (let i = 0; i < fila.length; i++) {
      const c = fila[(inicio + i) % fila.length];
      if (c.livre) return c.staffId;
    }
    return null;
  }

  /* equilíbrio: menos atendimentos no dia; empate, a ordem do dono. */
  return [...livres].sort(
    (a, b) => a.atendimentosNoDia - b.atendimentosNoDia || porOrdem(a, b)
  )[0].staffId;
}
