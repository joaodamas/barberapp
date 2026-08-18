import type { BookingStatus, PaymentMethod, PaymentOrigin } from "@/lib/types";

/**
 * Documentos do Firestore, como eles vivem sob `/barbershops/{id}/`.
 *
 * Diferente de `types.ts`, que descreve o que a tela usa: aqui é o formato
 * persistido. A separação importa porque o documento carrega `clientId` e
 * `createdAt`, que a tela não precisa, e usa `serviceIds` em vez do serviço
 * já resolvido.
 */

export type ServiceDoc = {
  name: string;
  durationMin: number;
  price: number;
  priceFrom?: boolean;
  active: boolean;
};

export type PlanDoc = {
  name: string;
  price: number;
  priceAvulso: number;
  description: string;
  highlight?: boolean;
  unlimited?: boolean;
  active: boolean;
};

export type ProductDoc = {
  name: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
};

/**
 * Comissão apurada de um atendimento — escrita só pelo servidor.
 *
 * Guarda a BASE e o PERCENTUAL, não apenas o resultado. Com `commissionAmount`
 * sozinho dá para saber quanto foi pago e não como se chegou lá; com os três,
 * o histórico é auditável e a regra pode mudar sem tornar o passado indecifrável.
 */
export type CommissionDoc = {
  /**
   * De que fato veio. Ausente nas comissões anteriores à Rodada 3.1 — todas de
   * serviço, que era a única materializada.
   */
  bookingId?: string;
  /** Venda que originou a comissão de produto. */
  movementId?: string;
  staffId: string;
  uid: string | null;
  staffName?: string | null;
  date: string;
  origin: "servico" | "produto";
  /** Congelados na conclusão. Nunca releem o cadastro. */
  commissionPct: number;
  commissionBase: number;
  commissionAmount: number;
};

/**
 * Pagamento recebido — escrito só pelo servidor.
 *
 * Desde G1.6 nasce nas TRÊS origens, com a taxa congelada e id derivado do
 * fato:
 *
 * ```
 * pagamento_{bookingId}          serviço       conclusão do atendimento
 * pagamento_venda_{movementId}   produto       dentro da transação da venda
 * pagamento_fatura_{invoiceId}   mensalidade   ao marcar a fatura como paga
 * ```
 *
 * Antes, só o serviço gerava pagamento — e como `gatewayFeesTotal` soma esta
 * coleção, produto e mensalidade não debitavam taxa nenhuma no DRE mesmo com o
 * `paymentMethod` gravado nos dois fatos (D7 · D21).
 *
 * A referência fica explícita em vez de um `refId` genérico: uma abstração que
 * esconde a origem economiza um campo e cobra em toda consulta futura.
 */
export type PaymentDoc = {
  /** De que fato o dinheiro veio. Ausente nos pagamentos anteriores a G1.6. */
  origin?: "servico" | "produto" | "mensalidade";
  bookingId?: string;
  /** Movimento de venda que originou o pagamento. */
  movementId?: string;
  /** Fatura de mensalidade que originou o pagamento. */
  invoiceId?: string;
  subscriptionId?: string;
  clientId: string | null;
  date: string;
  /**
   * Onde o pagamento aconteceu, copiado da reserva na materialização.
   *
   * Fica aqui, e não só na reserva, porque `payments` é o registro histórico:
   * precisa responder sobre o evento sem depender de um join com um documento
   * que pode ser editado ou apagado.
   */
  paymentOrigin: PaymentOrigin;
  /** Nulo quando o atendimento foi concluído sem informar como o cliente pagou. */
  paymentMethod: PaymentMethod | null;
  grossAmount: number;
  /** Congelada na conclusão: mudar a taxa não altera o passado. */
  feePct: number;
  feeAmount: number;
  netAmount: number;
};

/**
 * Entrada e saída de estoque — alimenta o CMV do DRE.
 *
 * Escrito só pelo servidor desde G1: `registrarVendaDeProduto` grava o
 * movimento e baixa o estoque na mesma transação. As regras negam escrita
 * direta, porque as duas metades do fato precisam ser atômicas.
 *
 * ## O que os campos novos ainda NÃO mudam
 *
 * `unitCost`, `paymentMethod`, `clientId` e `bookingId` passaram a existir no
 * fato, e `analytics.ts` **continua sem lê-los** — de propósito. O CMV ainda
 * soma as compras do período (D3) e o caixa ainda joga toda venda em dinheiro
 * (D4), agora sobre um documento que já sabe responder direito.
 *
 * É a posição deliberada em que G1 deixa o produto: **o fato está certo e
 * algumas visões continuam erradas.** Corrigir as leituras aqui apagaria a
 * evidência que a Rodada 3 precisa encontrar.
 */
export type InventoryMovementDoc = {
  productId: string;
  /** `compra` entra no CMV; `venda` entra na receita da loja. */
  kind: "compra" | "venda" | "ajuste" | "perda";
  quantity: number;
  /** Valor total do movimento, não unitário. */
  value: number;
  date: string;
  /**
   * Preço unitário praticado, CONGELADO na venda.
   *
   * Ausente nos movimentos anteriores a G1 — não havia como gravá-lo.
   */
  unitPrice?: number;
  /**
   * Custo unitário no instante da venda, CONGELADO.
   *
   * É o campo que vai sustentar o CMV por competência. Sem ele, o custo do
   * vendido só se reconstrói a partir de `products.cost`, que é o custo de
   * HOJE — e uma reposição mais cara reescreveria o lucro de meses fechados.
   */
  unitCost?: number;
  /**
   * Como o cliente pagou ESTA venda.
   *
   * Vivia fora do documento: a massa de teste precisava de um mapa paralelo
   * (`MEIO_DA_VENDA`) para representar o que o modelo não sabia guardar. Era a
   * premissa N12 como dívida.
   */
  paymentMethod?: PaymentMethod | null;
  /** Quem levou. Nulo na venda de balcão sem cadastro — é caso normal. */
  clientId?: string | null;
  /** Atendimento a que a venda ficou casada, quando houver. */
  bookingId?: string | null;
  /**
   * Quem vendeu — Rodada 3.1.
   *
   * Faltava, e a ausência só apareceu ao materializar a comissão de produto:
   * `commissions.staffId` não tinha de onde sair. Nulo é caso legítimo — venda
   * sem vendedor indicado não gera comissão.
   */
  staffId?: string | null;
  /**
   * A venda que este ajuste desfaz — D23.
   *
   * Presente só em `kind: "ajuste"` gerado por estorno. Sem ele, uma devolução
   * é indistinguível de recontagem, quebra ou vencimento — e as duas mexem no
   * resultado em direções opostas.
   */
  refundOf?: string;
};

/**
 * O dinheiro que voltou — D22 / D23.
 *
 * Escrito só pelo servidor. A coleção existia em `paths.ts` e nas regras desde
 * sempre, sem uma única escrita, leitura ou tipo.
 *
 * **O estorno não substitui o fato original: ele soma.** O `PaymentDoc` fica
 * intacto, o movimento de venda fica intacto e a fatura paga continua paga.
 * Corrigir histórico financeiro é acrescentar fatos, nunca apagá-los — senão o
 * mês fechado passa a contar uma história que não explica a diferença.
 *
 * A taxa da maquininha **não volta**: o estorno devolve o bruto e grava
 * `feeAmount: 0`. A perda aparece sozinha ao somar o pagamento com o estorno,
 * sem que nenhuma leitura precise saber que houve devolução.
 *
 * Contrato e decisões em `functions/src/refunds.ts`.
 */
export type RefundDoc = {
  origin: "servico" | "produto" | "mensalidade";
  bookingId?: string;
  movementId?: string;
  invoiceId?: string;
  /** O pagamento revertido. Explícito, para quem lê não reimplementar o id. */
  paymentId: string;
  clientId: string | null;
  /** Quando o dinheiro voltou. */
  date: string;
  /** Quando o fato original aconteceu — competência usa esta, caixa usa `date`. */
  originalDate: string;
  reason: string;
  paymentMethod: PaymentMethod | null;
  grossAmount: number;
  /** Sempre 0 — ver a nota sobre a taxa acima. */
  feeAmount: number;
  netAmount: number;
  parcial: boolean;
  /** Unidades devolvidas ao estoque. Só em produto. */
  quantity?: number;
};

/**
 * O cliente da barbearia — G3.
 *
 * O id do documento **é o uid quando a pessoa tem conta no app**, e um id
 * gerado quando não tem. Isso mantém `bookings.clientId` com o mesmo
 * significado de sempre (o uid), e é o que permite as regras do Firestore
 * continuarem comparando `clientId == request.auth.uid` sem alteração.
 *
 * Escrito só pelo servidor, dentro da transação que grava a reserva. Contrato e
 * decisões em `functions/src/clients.ts`.
 */
export type ClientDoc = {
  /** Conta no app. **Nulo para quem chega no balcão** — é o caso normal. */
  uid: string | null;
  name: string;
  /** Só dígitos. Chave de deduplicação dentro da barbearia. */
  whatsapp: string;
  origin: "app" | "balcao" | "importacao";
  active: boolean;
  /**
   * Para onde este cadastro foi fundido, quando a mesma pessoa voltou com conta
   * no app. As reservas antigas continuam apontando para o cadastro antigo — o
   * fato não se reescreve para arrumar o cadastro.
   */
  mergedInto?: string | null;
};

export type BookingDoc = {
  clientId: string;
  /**
   * Qual barbeiro atende. Obrigatório desde a introdução do multi-barbeiro.
   *
   * Reserva sem dono não é ambígua só na agenda — ela some do cálculo de
   * comissão e não bate com capacidade nenhuma. Barbearia sempre tem ao menos
   * um barbeiro (criado no cadastro), então nunca existe motivo legítimo para
   * este campo faltar.
   */
  staffId: string;
  clientName: string;
  clientWhatsapp: string;
  serviceIds: string[];
  /** ISO `YYYY-MM-DD`. */
  date: string;
  /** `HH:mm`. */
  time: string;
  /**
   * Quanto o atendimento ocupa, em minutos — a soma dos serviços escolhidos.
   *
   * O servidor grava isto desde sempre (`functions/src/booking.ts`), e o tipo do
   * front **não o declarava**. A ausência não era inofensiva: enquanto o campo
   * não existe no contrato, nenhuma tela e nenhum cálculo do web podem
   * considerá-lo — e foi assim que a duração ficou de fora da ocupação da agenda
   * por tanto tempo, até o Gate A corrigi-la do lado do servidor.
   *
   * Opcional porque reserva anterior à introdução do campo não o tem; quem
   * precisa da duração assume a grade da jornada, como faz `agenda.ts`.
   */
  durationMin?: number;
  status: BookingStatus;
  value: number;
  /** Onde o pagamento acontece. Decidido no agendamento. */
  paymentOrigin: PaymentOrigin;
  /**
   * Como o dinheiro entrou. NULO até a conclusão — quem sabe é quem está no
   * balcão, não o cliente no momento de marcar.
   */
  paymentMethod: PaymentMethod | null;
  isFitIn?: boolean;
  /** Quando o encaixe foi pedido — base para o prazo de expiração. */
  requestedAt?: string;
  /**
   * Quantas vezes esta reserva já foi remarcada.
   *
   * Escrito só pelo servidor, com `increment`, dentro da transação que move o
   * horário. A tela lê para dizer a verdade antes do toque; **quem aplica o
   * limite é `rescheduleBooking`**, e não este campo.
   *
   * Vivia num `useState` que zerava com F5 — a tela anunciava um teto de 2 que
   * bastava recarregar a página para contornar (P1-13).
   *
   * Opcional porque reserva anterior ao campo não o tem, e ausência vale zero:
   * quem nunca remarcou pelo caminho que conta não pode começar no limite.
   */
  rescheduleCount?: number;
  /**
   * De onde a reserva veio — D13.
   *
   * Fica na RESERVA, e não só no cliente, porque `bookings` é o registro
   * histórico: saber que um atendimento nasceu no balcão precisa sobreviver a
   * uma fusão de cadastro, que muda o cliente e não pode mudar o fato.
   *
   * Ausente nas reservas anteriores ao campo — todas do app, que era o único
   * caminho que existia.
   */
  origin?: "app" | "balcao" | "importacao";
};

/**
 * O mensalista — G2.
 *
 * Escrito só pelo servidor (`criarMensalista`, `cancelarMensalista`). O plano é
 * COPIADO, não referenciado: renomear ou reajustar o plano não pode reescrever
 * o que o cliente contratou.
 *
 * **Uma assinatura não é receita realizada.** Ela é contrato. O fato financeiro
 * nasce no pagamento da fatura — `SubscriptionInvoiceDoc` abaixo.
 */
export type SubscriberDoc = {
  clientId: string;
  name: string;
  /** Igual a `name`; `name` existe porque as leituras ordenam por ele. */
  clientName?: string;
  planId: string;
  planName: string;
  price: number;
  status: "ativo" | "suspenso" | "cancelado";
  /** ISO `YYYY-MM-DD`, ou vazio quando cancelado. */
  nextCharge?: string;
  /** Dia do mês em que vence. 31 cobra no último dia de fevereiro. */
  billingDay?: number;
  startedAt?: string;
  canceledAt?: string | null;
  /**
   * @deprecated Campo morto: a tela contava por estágio e ninguém nunca o
   * gravou — os sete baldes mostravam zero para sempre. A régua passou a ser
   * DERIVADA de `SubscriptionInvoiceDoc.dueDate`, que responde certo em
   * qualquer data. Um estágio gravado ficaria velho no dia seguinte.
   */
  dueStage?: "D-5" | "D-3" | "D-1" | "D0" | "D+1" | "D+3" | "D+5";
};

/**
 * A fatura mensal do mensalista — G2.
 *
 * É o que faltava para a mensalidade ter lastro. Antes, "receita de mensalista"
 * era derivada de uma caixinha marcada como `ativo`: o produto AFIRMAVA um
 * recebimento cuja evidência era um status.
 *
 * `amount` e `competencia` são congelados na emissão; `paymentMethod` nasce no
 * pagamento. Mesmo desenho de `unitCost` em G1 — reajustar o plano em outubro
 * não pode alterar a fatura de setembro.
 *
 * A regra: **a fatura também não é receita realizada.** O pagamento dela é o
 * fato financeiro, e como ele entra no resultado é decisão da Rodada 3.
 */
export type SubscriptionInvoiceDoc = {
  subscriptionId: string;
  clientId: string;
  /** `YYYY-MM`. Resolve o MRR histórico que o estado de hoje não sabe responder. */
  competencia: string;
  dueDate: string;
  /** CONGELADO na emissão. */
  amount: number;
  planName: string;
  status: "aberta" | "paga" | "cancelada";
  paidAt: string | null;
  paymentMethod: PaymentMethod | null;
};

export type ExpenseDoc = {
  category: string;
  description: string;
  supplier: string;
  value: number;
  date: string;
  payment: "Pix" | "Boleto" | "Cartão" | "Transferência";
  recurring: boolean;
  observations?: string;
};

/**
 * Um barbeiro.
 *
 * RECURSO, não usuário. `members` é quem tem login; existe barbeiro que não
 * quer aplicativo, não tem e-mail, e mesmo assim ocupa uma cadeira e precisa
 * aparecer na agenda. Se o barbeiro só existisse com conta, o dono não
 * conseguiria cadastrar metade da equipe.
 */
export type StaffDoc = {
  name: string;
  active: boolean;
  /** Vínculo com uma conta, quando existe. */
  uid?: string | null;
  /** O que ele faz. Vazio = todos os serviços da barbearia. */
  serviceIds?: string[];
  /** Percentual dele na comissão. Ausente cai no padrão da plataforma. */
  commissionPct?: number;
  /**
   * Salário mensal fixo, em reais.
   *
   * Alimenta a linha de folha do DRE, que era zero estrutural: `payroll`
   * existia como parâmetro e nenhum chamador o preenchia, porque não havia
   * onde cadastrar. Ausente = only comissão, que é o arranjo mais comum.
   */
  salary?: number;
  /** Jornada própria. Ausente = herda a da barbearia. */
  schedule?: TenantScheduleLike | null;
  /** Para distinguir na agenda em colunas. */
  color?: string;
  order?: number;
};

/** A parte da jornada que o barbeiro pode sobrescrever. */
export type TenantScheduleLike = {
  weekdays: number[];
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
};

/** Serviços que este barbeiro atende — vazio significa TODOS, não nenhum. */
export function staffFazServico(staff: Pick<StaffDoc, "serviceIds">, serviceId: string) {
  const lista = staff.serviceIds ?? [];
  return lista.length === 0 || lista.includes(serviceId);
}

/**
 * Uma movimentação de fidelidade. O saldo é a SOMA das transações do cliente —
 * nunca uma contagem de atendimentos, que não sobrevive ao primeiro resgate.
 */
export type LoyaltyTransactionDoc = {
  clientId: string;
  kind: "credito" | "resgate" | "estorno";
  /** Positivo credita, negativo resgata. */
  stamps: number;
  bookingId?: string;
  rewardLabel?: string;
};

/** Saldo de carimbos e progresso até a recompensa. */
export function saldoDeFidelidade(
  transacoes: Array<{ stamps: number }>,
  meta: number
) {
  const saldo = transacoes.reduce((total, t) => total + (t.stamps ?? 0), 0);
  const stamps = Math.max(saldo, 0);
  return {
    stamps,
    goal: meta,
    faltam: Math.max(meta - stamps, 0),
    podeResgatar: stamps >= meta && meta > 0,
  };
}

/** Taxa do gateway, versionada por vigência (PRD §5). */
export type GatewayFeeDoc = {
  gateway: string;
  method: string;
  pct: number;
  validFrom: string;
};

/* ------------------------------------------------------------------ */

/** Reserva que ocupa horário na agenda. */
export const OCCUPIES_SLOT: BookingStatus[] = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "completed",
  "no_show",
];

/** Reserva que virou dinheiro: só o que foi efetivamente atendido. */
export function isRevenue(booking: Pick<BookingDoc, "status">) {
  return booking.status === "completed";
}

/**
 * Reserva já recebida — caixa realizado.
 *
 * Contava Pix e cartão assim que confirmados, e dinheiro só na conclusão. Isso
 * misturava regime de caixa com competência dentro do mesmo número: o "Recebido"
 * do dia somava dinheiro que ainda não tinha virado atendimento.
 *
 * O produto adota UM marco financeiro — o atendimento concluído —, que é onde
 * `payments` e `commissions` são materializados. Numa barbearia o intervalo
 * entre atender e receber é de minutos, e um marco só evita dois números com o
 * mesmo nome divergindo entre telas.
 *
 * O que era previsão de recebimento não se perde: o painel Hoje já mostra
 * "Previsão do dia" separado, que é o lugar certo dela.
 */
export function isReceived(booking: Pick<BookingDoc, "status">) {
  return booking.status === "completed";
}

/** `YYYY-MM` de uma data ISO. */
export function monthOf(isoDate: string) {
  return isoDate.slice(0, 7);
}
