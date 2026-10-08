import { cobertoPeloPlano, EM_ABERTO, isRevenue } from "@/lib/domain";
import { valorCobrado } from "@/lib/desconto";
import type {
  BookingDoc,
  ClientDoc,
  InventoryMovementDoc,
  RefundDoc,
  SubscriberDoc,
} from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * O que se sabe sobre um cliente — D26.
 *
 * ## Tudo aqui é DERIVADO, nada é gravado
 *
 * O blueprint §3.2 é explícito: visitas, ticket médio, total gasto, última
 * visita e intervalo médio são *"derivados, nunca gravados"*. Materializá-los
 * criaria a mesma classe de defeito que `dueStage` teve — campo que envelhece
 * no dia seguinte e ninguém atualiza.
 *
 * `ClientDoc` guarda só identidade: nome, WhatsApp, uid, origem. O resto sai
 * dos fatos que a Fase 3 passou a produzir.
 *
 * ## O que este módulo NÃO faz
 *
 * Não calcula risco de perda nem segmentação. O blueprint os coloca no Bloco 3
 * do roadmap, e D26 é o MVP: ver quem é, achar de novo, e abrir a ficha.
 */

export type FichaDoCliente = {
  cliente: Doc<ClientDoc>;
  /** Atendimentos concluídos. Reserva futura não conta como visita. */
  visitas: number;
  /** ISO da última visita, ou `null` para quem nunca foi atendido. */
  ultimaVisita: string | null;
  /** Dias desde a última visita. `null` quando nunca houve. */
  diasSemVir: number | null;
  /** Só serviço — produto tem linha própria, como em D2. */
  gastoEmServicos: number;
  gastoEmProdutos: number;
  /** Ticket do ATENDIMENTO, pela mesma regra que D2 fixou. */
  ticketMedio: number;
  /** Próximo horário marcado, se houver. */
  proximoAtendimento: Doc<BookingDoc> | null;
  mensalista: Doc<SubscriberDoc> | null;
};

/**
 * O que o cliente PAGOU por um atendimento — a régua única do "total gasto"
 * (08/10).
 *
 * Três telas somavam o gasto do cliente, cada uma de um jeito: a ficha do
 * painel com `valorCobrado` (mas contando o corte coberto pelo plano), e o
 * "Total gasto" do app do cliente em Reservas e em Perfil com `b.value` — o
 * preço, com desconto e plano dentro. O mensalista via no app um gasto que
 * nunca saiu do bolso dele naquele atendimento, e o dono via outro número na
 * ficha. A régua é a de `recorrenciaDeClientes`: coberto pelo plano vale zero
 * (quem paga é a mensalidade); o resto vale o cobrado (cortesia = zero).
 */
export function gastoDoAtendimento(
  b: Pick<BookingDoc, "value" | "discountAmount" | "cobertura">
): number {
  return cobertoPeloPlano(b) ? 0 : valorCobrado(b);
}

/** Soma de `gastoDoAtendimento`, ao centavo. */
export function totalGasto(
  bookings: readonly Pick<BookingDoc, "value" | "discountAmount" | "cobertura">[]
): number {
  return Math.round(bookings.reduce((s, b) => s + gastoDoAtendimento(b), 0) * 100) / 100;
}

function diasEntre(iso: string, hoje: Date): number {
  return Math.floor((hoje.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);
}

export function fichaDoCliente(params: {
  cliente: Doc<ClientDoc>;
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  /**
   * Devoluções (D22). Presentes, abatem o gasto: o dinheiro que voltou ao
   * cliente não foi gasto. Ausentes (sem acesso a `refunds`), nada é abatido.
   */
  refunds?: Doc<RefundDoc>[];
  hoje: Date;
  hojeISO: string;
}): FichaDoCliente {
  const dele = params.bookings.filter((b) => b.clientId === params.cliente.id);
  const atendidos = dele.filter(isRevenue);

  const datas = atendidos.map((b) => b.date).sort();
  const ultimaVisita = datas.length > 0 ? datas[datas.length - 1] : null;

  /* O que o cliente PAGOU: com desconto no fechamento (28/09), o preço da
   * agenda é maior do que o que entrou — e a cortesia entra como zero. O
   * coberto pelo plano também é zero (08/10): quem pagou foi a mensalidade. */
  const idsAtendidos = new Set(atendidos.map((b) => b.id));
  const devolvido = (origem: RefundDoc["origin"], pertence: (r: Doc<RefundDoc>) => boolean) =>
    (params.refunds ?? [])
      .filter((r) => r.origin === origem && pertence(r))
      .reduce((s, r) => s + (Number(r.grossAmount) || 0), 0);
  const pagos = atendidos.filter((b) => !cobertoPeloPlano(b)).length;
  const gastoEmServicos = Math.max(
    0,
    totalGasto(atendidos) - devolvido("servico", (r) => !!r.bookingId && idsAtendidos.has(r.bookingId))
  );

  /* Compras do cliente. Venda avulsa tem `clientId: null` e não entra em ficha
   * nenhuma — é o caso normal do balcão, e atribuí-la a alguém seria inventar.
   * A devolução de produto abate (08/10): o produto que voltou não foi gasto. */
  const vendas = params.movements.filter((m) => m.kind === "venda" && m.clientId === params.cliente.id);
  const idsVendas = new Set(vendas.map((m) => m.id));
  const gastoEmProdutos = Math.max(
    0,
    Math.round(
      (vendas.reduce((s, m) => s + m.value, 0) -
        devolvido("produto", (r) => !!r.movementId && idsVendas.has(r.movementId))) *
        100
    ) / 100
  );

  /* Futuro = a partir de hoje, e só o que ainda vai acontecer (`EM_ABERTO`).
   * "Não cancelado" deixava passar concluído, falta e expirado: o corte das
   * 14h, já feito e pago, aparecia como "próximo atendimento" na ficha
   * (rodada E2E de 23/09). Ordenado por data e hora porque a coleção vem por
   * data decrescente. */
  const futuros = dele
    .filter((b) => b.date >= params.hojeISO && EM_ABERTO.includes(b.status))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  return {
    cliente: params.cliente,
    visitas: atendidos.length,
    ultimaVisita,
    diasSemVir: ultimaVisita ? diasEntre(ultimaVisita, params.hoje) : null,
    gastoEmServicos,
    gastoEmProdutos,
    /* Ticket do ATENDIMENTO: serviço ÷ visitas PAGAS. Somar produto aqui
     * repetiria exatamente o erro de D2 — numerador de uma grandeza sobre
     * denominador de outra. E com o coberto pelo plano valendo zero no gasto
     * (08/10), ele sai do denominador também, como em `receitaDeServico`. */
    ticketMedio: pagos > 0 ? Math.round(gastoEmServicos / pagos) : 0,
    proximoAtendimento: futuros[0] ?? null,
    mensalista:
      params.subscribers.find(
        (s) => s.clientId === params.cliente.id && s.status !== "cancelado"
      ) ?? null,
  };
}

/**
 * A lista da tela, já com o que ela precisa mostrar.
 *
 * Ordem ALFABÉTICA do nome (pedido do dono, 02/10): é como ele procura um
 * cliente na lista. Comparação brasileira — sem diferenciar acento nem
 * maiúscula ("Álvaro" junto de "Alberto", "joão" junto de "João") e com
 * números em ordem natural. Quem sumiu continua visível em "há N dias".
 */
const ORDEM_DE_NOME = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

export function listaDeClientes(params: {
  clientes: Doc<ClientDoc>[];
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  refunds?: Doc<RefundDoc>[];
  hoje: Date;
  hojeISO: string;
}): FichaDoCliente[] {
  return params.clientes
    .filter((c) => c.active !== false)
    .map((cliente) => fichaDoCliente({ ...params, cliente }))
    .sort((a, b) =>
      ORDEM_DE_NOME.compare((a.cliente.name ?? "").trim(), (b.cliente.name ?? "").trim())
    );
}

export type ParDeMesmoNumero = { conta: Doc<ClientDoc>; balcao: Doc<ClientDoc> };

/**
 * Conta do app e cadastro de balcão com o mesmo número, ainda separados
 * (02/10). O número digitado não é prova — quem decide é o dono, na tela
 * Clientes. Só pares vivos: balcão já vinculado ou inativo sai da lista.
 */
export function paresDeMesmoNumero(clientes: Doc<ClientDoc>[]): ParDeMesmoNumero[] {
  const porId = new Map(clientes.map((c) => [c.id, c]));
  const pares: ParDeMesmoNumero[] = [];
  for (const conta of clientes) {
    if (!conta.uid || conta.active === false || !conta.mesmoNumeroQue) continue;
    const balcao = porId.get(conta.mesmoNumeroQue);
    if (!balcao || balcao.uid || balcao.active === false || balcao.mergedInto) continue;
    pares.push({ conta, balcao });
  }
  return pares;
}
