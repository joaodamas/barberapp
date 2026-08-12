import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Materialização do evento financeiro do atendimento.
 *
 * O sistema já derivava tudo de `bookings`: receita, comissão e caixa eram
 * recalculados a cada leitura. Isso é correto para indicadores — e errado para
 * histórico, porque a derivação lê o cadastro ATUAL.
 *
 * O sintoma: o barbeiro renegocia de 40% para 50% em setembro e o DRE de agosto
 * passa a mostrar 50%. Fechamento financeiro não pode mudar retroativamente —
 * quebra o acerto com o profissional e a conversa com o contador.
 *
 * Aqui o atendimento concluído vira dois documentos imutáveis: a comissão e o
 * pagamento, com percentual e taxa CONGELADOS no momento da conclusão.
 *
 * MOMENTO DO RECONHECIMENTO: `completed`. Numa barbearia o intervalo entre
 * atender e receber é de minutos, então o produto adota um marco só — o
 * atendimento concluído — em vez de separar regime de caixa e de competência.
 * Consequência conhecida: cliente que paga adiantado e não comparece não gera
 * pagamento aqui; isso entra junto com o evento de no-show.
 *
 * GUARDAR A BASE, NÃO SÓ O RESULTADO: `commissionAmount` sozinho diz quanto foi
 * pago e não como se chegou lá. Com `commissionPct` e `commissionBase` o
 * histórico fica auditável, e a regra pode mudar no futuro sem tornar o passado
 * indecifrável.
 */

export type PaymentMethod = "pix" | "cash" | "debit" | "credit";

/**
 * ONDE o pagamento aconteceu.
 *
 * Vai para o documento de pagamento junto com o método: `payments` é o registro
 * histórico, e precisa responder sobre o evento sem depender de um join com a
 * reserva — que pode ser editada, arquivada ou apagada.
 *
 * Hoje só existe um valor, e é justamente por isso que o campo entra agora: com
 * `online` no futuro, um histórico sem origem não conseguiria separar o que
 * entrou pela maquininha do que entrou pelo app.
 */
export type PaymentOrigin = "in_person" | "online";

/** Taxa por método, como o dono cadastra em Configurações. */
export type PaymentFees = {
  dinheiro: number;
  pix: number;
  debito: number;
  credito: number;
};

export const SEM_TAXA: PaymentFees = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };

/**
 * Taxa exata do instrumento usado.
 *
 * Antes o vocabulário era `pix | cartao | local`, e `cartao` não distinguia
 * débito de crédito: a função precisava supor crédito por precaução, cobrando
 * 3,49% de quem pagou 1,99% no débito. Com o método informado no fechamento, a
 * suposição sai e a taxa é a que a maquininha de fato cobrou.
 */
export function taxaDoMetodo(metodo: PaymentMethod, fees: PaymentFees): number {
  if (metodo === "pix") return Number(fees.pix) || 0;
  if (metodo === "debit") return Number(fees.debito) || 0;
  if (metodo === "credit") return Number(fees.credito) || 0;
  return Number(fees.dinheiro) || 0;
}

/** Arredonda para centavo — evita 0.30000000000000004 no documento. */
export function centavos(valor: number) {
  return Math.round(valor * 100) / 100;
}

/**
 * Decide os valores do evento financeiro — separada do gatilho de propósito.
 *
 * Dentro do trigger, esta lógica só seria verificável com emulador. Aqui ela é
 * função pura: recebe o retrato do momento e devolve o que será congelado.
 *
 * O invariante que ela sustenta: o resultado depende SÓ dos argumentos. Nada
 * aqui relê cadastro, então o documento gravado é reprodutível a partir dos
 * próprios campos — que é o que torna o histórico auditável.
 */
export function calcularEventoFinanceiro(params: {
  valor: number;
  /**
   * Nulo quando o atendimento foi concluído sem informar como o cliente pagou.
   * A interface sempre pergunta, então é caminho de exceção — escrita direta no
   * banco, importação, correção manual.
   */
  metodo: PaymentMethod | null;
  /** Onde o pagamento aconteceu. Reserva antiga, sem o campo, é do balcão. */
  origem?: PaymentOrigin | null;
  /** Percentual do barbeiro. `null`/`undefined` cai no padrão da casa. */
  commissionPctDoBarbeiro?: number | null;
  padraoPct: number;
  fees: PaymentFees;
}) {
  const valor = Number(params.valor) || 0;
  const commissionPct = Number(params.commissionPctDoBarbeiro ?? params.padraoPct) || 0;

  /* Sem método, a taxa é DESCONHECIDA, não zero. Materializamos assim mesmo,
   * com `paymentMethod: null` explícito: o bruto aconteceu e precisa existir no
   * histórico. O nulo é o que permite separar depois "não teve taxa" de "não
   * sabemos a taxa" — gravar 0 sem marca apagaria essa diferença. */
  const feePct = params.metodo ? taxaDoMetodo(params.metodo, params.fees) : 0;
  const feeAmount = centavos((valor * feePct) / 100);

  return {
    commission: {
      commissionPct,
      commissionBase: valor,
      commissionAmount: centavos((valor * commissionPct) / 100),
    },
    payment: {
      paymentOrigin: params.origem ?? "in_person",
      paymentMethod: params.metodo,
      grossAmount: valor,
      feePct,
      feeAmount,
      netAmount: centavos(valor - feeAmount),
    },
  };
}

export const materializeFinancialsOnCompletion = onDocumentUpdated(
  "barbershops/{barbershopId}/bookings/{bookingId}",
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    const { barbershopId, bookingId } = event.params;
    const db = getFirestore();

    /* Ids derivados da reserva: o Firestore reprocessa o gatilho em caso de
     * retry, e `set` no mesmo id sobrescreve em vez de duplicar. Idempotência
     * por construção, não por checagem — que teria corrida entre a leitura e a
     * escrita. */
    const comissaoRef = db.doc(
      `barbershops/${barbershopId}/commissions/comissao_${bookingId}`
    );
    const pagamentoRef = db.doc(
      `barbershops/${barbershopId}/payments/pagamento_${bookingId}`
    );

    const virouConcluido = antes.status !== "completed" && depois.status === "completed";
    const deixouDeSerConcluido = antes.status === "completed" && depois.status !== "completed";

    if (deixouDeSerConcluido) {
      /* Conclusão desfeita (correção do dono, estorno) remove os dois. Sem
       * isso, marcar como concluído por engano deixa comissão a pagar e receita
       * fantasma no fechamento, sem caminho de volta pela interface. */
      await Promise.all([
        comissaoRef.delete().catch(() => undefined),
        pagamentoRef.delete().catch(() => undefined),
      ]);
      return;
    }

    if (!virouConcluido) return;

    const valor = Number(depois.value) || 0;
    const metodo = (depois.paymentMethod ?? null) as PaymentMethod | null;
    const staffId = String(depois.staffId ?? "");
    const date = String(depois.date ?? "");

    /* Lidos AGORA e congelados: é este o ponto do arquivo inteiro. Depois desta
     * escrita, nada relê `staff` nem `policies` para reconstruir estes valores. */
    const [shopSnap, staffSnap] = await Promise.all([
      db.doc(`barbershops/${barbershopId}`).get(),
      staffId
        ? db.doc(`barbershops/${barbershopId}/staff/${staffId}`).get()
        : Promise.resolve(null),
    ]);

    const policies = (shopSnap.get("policies") ?? {}) as {
      commissionSplit?: { barberPct?: number };
      paymentFees?: Partial<PaymentFees>;
    };

    const fees: PaymentFees = { ...SEM_TAXA, ...(policies.paymentFees ?? {}) };
    const padraoPct = Number(policies.commissionSplit?.barberPct) || 0;

    const { commission, payment } = calcularEventoFinanceiro({
      valor,
      metodo,
      origem: (depois.paymentOrigin ?? null) as PaymentOrigin | null,
      // Gravado como `null` no cadastro inicial, não ausente.
      commissionPctDoBarbeiro: staffSnap?.get("commissionPct") ?? null,
      padraoPct,
      fees,
    });

    await Promise.all([
      comissaoRef.set({
        bookingId,
        staffId,
        /* O barbeiro lê a própria comissão pela regra `resource.data.uid ==
         * request.auth.uid`. Sem vínculo de conta fica nulo, e só o dono vê. */
        uid: staffSnap?.get("uid") ?? null,
        staffName: depois.staffName ?? null,
        date,
        origin: "servico",
        ...commission,
        createdAt: FieldValue.serverTimestamp(),
      }),
      pagamentoRef.set({
        bookingId,
        clientId: depois.clientId ?? null,
        date,
        ...payment,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);
  }
);
