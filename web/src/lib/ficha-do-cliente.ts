import { isRevenue } from "@/lib/domain";
import type {
  BookingDoc,
  ClientDoc,
  InventoryMovementDoc,
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

function diasEntre(iso: string, hoje: Date): number {
  return Math.floor((hoje.getTime() - new Date(`${iso}T00:00:00`).getTime()) / 86_400_000);
}

export function fichaDoCliente(params: {
  cliente: Doc<ClientDoc>;
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  hoje: Date;
  hojeISO: string;
}): FichaDoCliente {
  const dele = params.bookings.filter((b) => b.clientId === params.cliente.id);
  const atendidos = dele.filter(isRevenue);

  const datas = atendidos.map((b) => b.date).sort();
  const ultimaVisita = datas.length > 0 ? datas[datas.length - 1] : null;

  const gastoEmServicos = atendidos.reduce((s, b) => s + b.value, 0);

  /* Compras do cliente. Venda avulsa tem `clientId: null` e não entra em ficha
   * nenhuma — é o caso normal do balcão, e atribuí-la a alguém seria inventar. */
  const gastoEmProdutos = params.movements
    .filter((m) => m.kind === "venda" && m.clientId === params.cliente.id)
    .reduce((s, m) => s + m.value, 0);

  /* Futuro = a partir de hoje, em qualquer estado que ainda ocupe a agenda.
   * Ordenado por data e hora porque a coleção vem por data decrescente. */
  const futuros = dele
    .filter((b) => b.date >= params.hojeISO && !String(b.status).startsWith("cancelled"))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  return {
    cliente: params.cliente,
    visitas: atendidos.length,
    ultimaVisita,
    diasSemVir: ultimaVisita ? diasEntre(ultimaVisita, params.hoje) : null,
    gastoEmServicos,
    gastoEmProdutos,
    /* Ticket do ATENDIMENTO: serviço ÷ visitas. Somar produto aqui repetiria
     * exatamente o erro de D2 — numerador de uma grandeza sobre denominador de
     * outra. */
    ticketMedio: atendidos.length > 0 ? Math.round(gastoEmServicos / atendidos.length) : 0,
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
 * Ordena por última visita, do mais recente para o mais antigo, com quem nunca
 * veio no fim: o dono procura quem esteve aqui, não quem está cadastrado em
 * ordem alfabética.
 */
export function listaDeClientes(params: {
  clientes: Doc<ClientDoc>[];
  bookings: Doc<BookingDoc>[];
  movements: Doc<InventoryMovementDoc>[];
  subscribers: Doc<SubscriberDoc>[];
  hoje: Date;
  hojeISO: string;
}): FichaDoCliente[] {
  return params.clientes
    .filter((c) => c.active !== false)
    .map((cliente) => fichaDoCliente({ ...params, cliente }))
    .sort((a, b) => {
      if (a.ultimaVisita && b.ultimaVisita) return b.ultimaVisita.localeCompare(a.ultimaVisita);
      if (a.ultimaVisita) return -1;
      if (b.ultimaVisita) return 1;
      return a.cliente.name.localeCompare(b.cliente.name);
    });
}
