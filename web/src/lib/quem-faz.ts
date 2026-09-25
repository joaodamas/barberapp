/**
 * Quem pode fazer os serviços escolhidos — a MESMA regra do servidor
 * (`createBooking`, em `functions/src/booking.ts`).
 *
 * Existe em um lugar só porque já existiu em dois e divergiu: o "+" do dono
 * filtrava a equipe pelos serviços, e o agendar do cliente só filtrava quando
 * havia mais de um barbeiro. Com um barbeiro só, ele era escolhido para
 * QUALQUER serviço — a tela mostrava os horários dele, o cliente escolhia, e o
 * servidor recusava no "confirmar" ("Rômulo não faz um dos serviços
 * escolhidos"). O dono via "nenhum horário" e o cliente via a agenda aberta,
 * para o mesmo dia e o mesmo serviço (O Siqueira, 25/09).
 */

type Barbeiro = { serviceIds?: string[] | null };

/** Lista vazia (ou ausente) significa TODOS os serviços, não nenhum — um
 *  barbeiro recém-cadastrado, sem serviços marcados, atende tudo. */
export function fazTodos(barbeiro: Barbeiro, serviceIds: string[]): boolean {
  const lista = barbeiro.serviceIds ?? [];
  return lista.length === 0 || serviceIds.every((id) => lista.includes(id));
}

export function quemFaz<B extends Barbeiro>(barbeiros: B[], serviceIds: string[]): B[] {
  return barbeiros.filter((b) => fazTodos(b, serviceIds));
}

/** Serviço que ninguém da equipe faz não pode ser oferecido ao cliente: ele
 *  escolheria, e não haveria horário nem quem confirmasse. */
export function alguemFaz(barbeiros: Barbeiro[], serviceId: string): boolean {
  return barbeiros.some((b) => fazTodos(b, [serviceId]));
}
