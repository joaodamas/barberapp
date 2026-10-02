import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { aplicarCombos, type ServicoDoCatalogo } from "./combos";
import {
  estornoDaComissaoDeServico,
  idDaComissaoDeCicloNovo,
  idDoEstornoDaComissaoDeServico,
} from "./comissoes";
import { dentroDaJanela } from "./correcao-de-pagamento";
import { descontoAplicavel, ehCortesia } from "./desconto";
import {
  calcularEventoFinanceiro,
  centavos,
  padraoDaCasa,
  SEM_TAXA,
  type CicloFinanceiro,
  type PaymentFees,
  type PaymentMethod,
  type PaymentOrigin,
} from "./financial-events";
import { formasDoTenant, type FormaDePagamento } from "./formas-de-pagamento";
import { metodoValido } from "./inventory";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import { idDoPagamento } from "./payments";
import { politicasDe } from "./politicas-financeiras";

/**
 * Editar a cobrança de um atendimento JÁ CONCLUÍDO — pedido do dono, 02/10.
 *
 * *"Às vezes acontece algum equívoco… selecionar o 'adicionar serviço' errado e
 * outras coisas… precisa ter como editar."*
 *
 * Até aqui, depois de concluído só dava para trocar a forma de pagamento (R1,
 * `correcao-de-pagamento.ts`) ou devolver dinheiro (D22, `refunds.ts`). Um
 * serviço somado por engano ficava para sempre no caixa, na comissão e no DRE.
 *
 * ## O que muda, e como o dinheiro continua batendo
 *
 * Serviços (lista inteira, preço do CATÁLOGO, combos aplicados), desconto e
 * forma de pagamento. Tudo numa transação:
 *
 * - **Comissão: soma, nunca reescreve.** Nega a linha vigente
 *   (`comissao_estorno_…`) e grava a nova (`comissao_{id}_{chave}`), com o MESMO
 *   percentual congelado da vigente (P1-7) — o mesmo par que reverter +
 *   reconcluir já produz no gatilho. `cicloFinanceiro.comissaoVigenteId` passa a
 *   apontar para a nova, e a próxima reversão nega a certa.
 * - **Pagamento: `update`** de bruto, desconto, taxa e líquido no MESMO
 *   documento, com a conta de `calcularEventoFinanceiro` (a do gatilho) — sem
 *   terceira cópia da fórmula. A taxa é a de hoje, como no R1.
 * - **Reserva**: serviços, valor, duração, desconto, forma e o histórico
 *   `edicoesDeCobranca`; e o `audit_log` com antes e depois.
 *
 * Caixa, DRE, fluxo e acerto derivam de `payments` e `commissions` no web — se
 * ajustam sozinhos.
 *
 * ## O que esta função NÃO toca
 *
 * A regra do Firestore (o concluído continua fechado para a tela) e o gatilho
 * (`completed → completed` continua "nada" — o R1 depende disso, e esta função
 * também: a escrita na reserva acorda o gatilho, que não pode rematerializar
 * por cima).
 */

/* ================================================================== */
/* Decisões puras                                                     */
/* ================================================================== */

export type PedidoDeDesconto =
  /** Ausente: mantém o desconto que havia (recalculado se era %). */
  | undefined
  /** Tira o desconto. */
  | null
  /** Desconto novo — só o dono. */
  | { tipo: "valor" | "pct"; valor: number; motivo?: string | null };

export type DescontoAtual = {
  discountAmount?: unknown;
  discountInput?: { tipo?: unknown; valor?: unknown } | null;
  discountReason?: unknown;
  discountBy?: unknown;
};

/**
 * O desconto em reais sobre o bruto NOVO.
 *
 * Mantido em %, ele acompanha o bruto (10% de um corte que virou combo continua
 * 10%); em reais, fica o mesmo valor, limitado ao bruto. Mesma conversão de
 * `web/src/lib/desconto.ts` (`calcularDesconto`): % acima de 100 não passa.
 */
export function descontoEmReais(bruto: number, tipo: unknown, valor: unknown): number {
  const v = Math.max(0, Number(valor) || 0);
  const pedido = tipo === "pct" ? centavos((bruto * Math.min(v, 100)) / 100) : centavos(v);
  return descontoAplicavel({ valor: bruto, discountAmount: pedido });
}

export type DescontoDaEdicao = {
  amount: number;
  input: { tipo: "valor" | "pct"; valor: number } | null;
  reason: unknown;
  by: unknown;
};

export function descontoDaEdicao(params: {
  bruto: number;
  pedido: PedidoDeDesconto;
  atual: DescontoAtual;
  autor: string;
}): DescontoDaEdicao {
  const { bruto, pedido, atual } = params;
  if (pedido === null) return { amount: 0, input: null, reason: null, by: null };
  if (pedido === undefined) {
    const tinha = Number(atual.discountAmount) || 0;
    if (!(tinha > 0)) return { amount: 0, input: null, reason: null, by: null };
    const tipo = atual.discountInput?.tipo === "pct" ? "pct" : "valor";
    const valor = tipo === "pct" ? Number(atual.discountInput?.valor) || 0 : tinha;
    return {
      amount: descontoEmReais(bruto, tipo, valor),
      input: { tipo, valor },
      reason: atual.discountReason ?? null,
      by: atual.discountBy ?? null,
    };
  }
  return {
    amount: descontoEmReais(bruto, pedido.tipo, pedido.valor),
    input: { tipo: pedido.tipo, valor: Math.max(0, Number(pedido.valor) || 0) },
    reason: pedido.motivo ?? null,
    by: params.autor,
  };
}

/** O atendimento com a lista nova de serviços — preço e combos do catálogo. */
export function servicosDaEdicao(ids: string[], catalogo: ServicoDoCatalogo[]) {
  const r = aplicarCombos(ids, catalogo);
  const nomes = new Map(catalogo.map((s) => [s.id, String(s.name ?? "Serviço")]));
  return {
    serviceIds: r.ids,
    serviceNames: r.ids.map((id) => nomes.get(id) ?? "Serviço"),
    value: r.valor,
    durationMin: r.duracao,
    combos: r.combos,
  };
}

export type MotivoDaRecusaDaEdicao =
  | "reserva_ausente"
  | "nao_concluido"
  | "sem_pagamento"
  | "ja_estornado"
  | "fora_da_janela"
  | "barbeiro_outro_dia"
  | "barbeiro_de_outro"
  | "desconto_so_dono"
  | "vira_cortesia"
  | "nada_mudou";

/**
 * Toda a régua de recusa, pura. A ORDEM é a da frase que explica melhor:
 * o fato mais forte primeiro (sem atendimento, sem pagamento, estornado),
 * depois quem pode, depois o que foi pedido.
 */
export function motivoDaRecusaDaEdicao(params: {
  temReserva: boolean;
  statusDaReserva: unknown;
  temPagamento: boolean;
  jaEstornado: boolean;
  papel: "owner" | "staff";
  /** O barbeiro da reserva é quem está editando? (só importa para o staff) */
  ehDoBarbeiro: boolean;
  dataDoPagamento: string;
  hoje: string;
  pediuDescontoNovo: boolean;
  viraCortesia: boolean;
  mudouAlgo: boolean;
}): MotivoDaRecusaDaEdicao | null {
  if (!params.temReserva) return "reserva_ausente";
  if (params.statusDaReserva !== "completed") return "nao_concluido";
  /* Coberto pelo plano e cortesia não têm pagamento: não há cobrança a editar,
   * e criar uma aqui seria inventar dinheiro que não entrou. */
  if (!params.temPagamento) return "sem_pagamento";
  /* O estorno congelou bruto e método antigos; editar deixaria os dois em
   * desacordo (a mesma recusa do R1). */
  if (params.jaEstornado) return "ja_estornado";
  if (params.papel === "staff") {
    if (!params.ehDoBarbeiro) return "barbeiro_de_outro";
    if (params.dataDoPagamento !== params.hoje) return "barbeiro_outro_dia";
    if (params.pediuDescontoNovo) return "desconto_so_dono";
  } else if (!dentroDaJanela(params.dataDoPagamento, params.hoje)) {
    return "fora_da_janela";
  }
  if (params.viraCortesia) return "vira_cortesia";
  if (!params.mudouAlgo) return "nada_mudou";
  return null;
}

export const FRASE_DA_RECUSA_DA_EDICAO: Record<MotivoDaRecusaDaEdicao, string> = {
  reserva_ausente: "Esse atendimento não está mais registrado.",
  nao_concluido: "Só atendimento concluído tem cobrança para editar.",
  sem_pagamento:
    "Esse atendimento não teve cobrança (coberto pelo plano ou cortesia) — não há valor a editar.",
  ja_estornado:
    "Esse atendimento já teve devolução registrada. Editar agora deixaria a devolução e a cobrança em desacordo.",
  fora_da_janela: "Esse atendimento é de outro mês. A edição vale para o mês corrente.",
  barbeiro_outro_dia:
    "O barbeiro edita a cobrança só no mesmo dia do atendimento. Para dias anteriores, peça ao dono.",
  barbeiro_de_outro: "Você só edita a cobrança dos seus atendimentos.",
  desconto_so_dono: "Só o dono dá ou muda desconto.",
  vira_cortesia:
    "Com esse desconto o atendimento sairia de graça. Para cortesia, peça ao dono para tratar à parte.",
  nada_mudou: "Nada mudou na cobrança — confira os serviços, o desconto e a forma.",
};

const CODIGO: Record<MotivoDaRecusaDaEdicao, "not-found" | "failed-precondition" | "permission-denied"> = {
  reserva_ausente: "not-found",
  nao_concluido: "failed-precondition",
  sem_pagamento: "failed-precondition",
  ja_estornado: "failed-precondition",
  fora_da_janela: "failed-precondition",
  barbeiro_outro_dia: "permission-denied",
  barbeiro_de_outro: "permission-denied",
  desconto_so_dono: "permission-denied",
  vira_cortesia: "failed-precondition",
  nada_mudou: "failed-precondition",
};

/** Id DERIVADO do evento de auditoria — idempotência por construção. */
export function idDaEdicao(bookingId: string, chave: string): string {
  return `edicao_${bookingId}_${chave}`;
}

/** Chave dos ids de comissão desta edição — prefixada para nunca colidir com a do gatilho. */
export function chaveDaEdicao(chave: string): string {
  return `edicao-${chave}`;
}

const mesmaLista = (a: unknown[], b: unknown[]) =>
  a.length === b.length && a.every((x, i) => String(x) === String(b[i]));

/* ================================================================== */
/* A transação                                                        */
/* ================================================================== */

export type ResumoDaCobranca = {
  serviceIds: string[];
  serviceNames: string[];
  value: number;
  discountAmount: number;
  cobrado: number;
  paymentMethod: PaymentMethod | null;
  paymentFormLabel: string | null;
  commissionAmount: number;
};

export type ResultadoDaEdicao = {
  bookingId: string;
  antes: ResumoDaCobranca;
  depois: ResumoDaCobranca;
  repetida: boolean;
};

export async function gravarEdicao(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  bookingId: string;
  papel: "owner" | "staff";
  /** O `staff/{id}` vinculado a quem chamou (para o barbeiro). */
  staffIdDoAutor: string | null;
  serviceIds: string[];
  catalogo: ServicoDoCatalogo[];
  desconto: PedidoDeDesconto;
  metodo: PaymentMethod;
  formaId?: string | null;
  fees: PaymentFees;
  formas?: FormaDePagamento[];
  padraoPct: number;
  hoje: string;
  chave: string;
  autor: string;
}): Promise<ResultadoDaEdicao> {
  const { db, shopRef, bookingId } = params;
  const paymentId = idDoPagamento({ origem: "servico", bookingId });
  const pagamentoRef = shopRef.collection("payments").doc(paymentId);
  const reservaRef = shopRef.collection("bookings").doc(bookingId);
  const logRef = shopRef.collection("audit_log").doc(idDaEdicao(bookingId, params.chave));
  const estornosQuery = shopRef.collection("refunds").where("paymentId", "==", paymentId);

  return db.runTransaction(async (tx) => {
    /* ================= LEITURAS (todas antes de qualquer escrita) ================= */
    const [reservaSnap, pagamentoSnap, logSnap, estornosSnap] = await Promise.all([
      tx.get(reservaRef),
      tx.get(pagamentoRef),
      tx.get(logRef),
      tx.get(estornosQuery),
    ]);

    /* Idempotência ANTES das recusas: depois da primeira gravação, um retry
     * cairia em "nada mudou" e a tela mostraria erro sobre algo que deu certo. */
    if (logSnap.exists) {
      const d = (logSnap.get("detail") ?? {}) as { antes?: ResumoDaCobranca; depois?: ResumoDaCobranca };
      return { bookingId, antes: d.antes!, depois: d.depois!, repetida: true };
    }

    const reserva = (reservaSnap.data() ?? {}) as Record<string, unknown>;
    const ciclo = reserva.cicloFinanceiro as CicloFinanceiro | undefined;
    const comissaoVigenteId = ciclo?.comissaoVigenteId || `comissao_${bookingId}`;
    const comissaoVigenteRef = shopRef.collection("commissions").doc(comissaoVigenteId);
    const comissaoSnap = reservaSnap.exists ? await tx.get(comissaoVigenteRef) : null;

    const novo = servicosDaEdicao(params.serviceIds, params.catalogo);
    const desconto = descontoDaEdicao({
      bruto: novo.value,
      pedido: params.desconto,
      atual: reserva as DescontoAtual,
      autor: params.autor,
    });

    const metodoAtual = (pagamentoSnap.get("paymentMethod") ?? null) as PaymentMethod | null;
    const formaAtual = (pagamentoSnap.get("paymentFormId") ?? null) as string | null;
    const descontoAtual = Number(reserva.discountAmount) || 0;
    const mudouAlgo =
      !mesmaLista(Array.isArray(reserva.serviceIds) ? reserva.serviceIds : [], novo.serviceIds) ||
      centavos(desconto.amount) !== centavos(descontoAtual) ||
      metodoAtual !== params.metodo ||
      (params.formaId != null && params.formaId !== formaAtual);

    const motivo = motivoDaRecusaDaEdicao({
      temReserva: reservaSnap.exists,
      statusDaReserva: reserva.status,
      temPagamento: pagamentoSnap.exists,
      jaEstornado: !estornosSnap.empty,
      papel: params.papel,
      ehDoBarbeiro: Boolean(params.staffIdDoAutor) && String(reserva.staffId ?? "") === params.staffIdDoAutor,
      dataDoPagamento: String(pagamentoSnap.get("date") ?? ""),
      hoje: params.hoje,
      pediuDescontoNovo: params.desconto !== undefined && params.desconto !== null,
      viraCortesia: ehCortesia({ valor: novo.value, desconto: desconto.amount }),
      mudouAlgo,
    });
    if (motivo) throw new HttpsError(CODIGO[motivo], FRASE_DA_RECUSA_DA_EDICAO[motivo]);

    /* O MESMO percentual da comissão vigente — P1-7. Quem renegociou o % depois
     * do atendimento não muda o acerto de um corte passado por causa de uma
     * correção de serviço. Sem linha vigente (dado antigo), vale o padrão. */
    const pct = comissaoSnap?.exists ? Number(comissaoSnap.get("commissionPct")) : null;

    const { commission, payment } = calcularEventoFinanceiro({
      valor: novo.value,
      metodo: params.metodo,
      origem: (pagamentoSnap.get("paymentOrigin") ?? null) as PaymentOrigin | null,
      commissionPctDoBarbeiro: pct,
      padraoPct: params.padraoPct,
      fees: params.fees,
      formas: params.formas,
      formaId: params.formaId ?? null,
      desconto: desconto.amount,
    });

    const antes: ResumoDaCobranca = {
      serviceIds: (Array.isArray(reserva.serviceIds) ? reserva.serviceIds : []).map(String),
      serviceNames: (Array.isArray(reserva.serviceNames) ? reserva.serviceNames : []).map(String),
      value: Number(reserva.value) || 0,
      discountAmount: descontoAtual,
      cobrado: Number(pagamentoSnap.get("grossAmount")) || 0,
      paymentMethod: metodoAtual,
      paymentFormLabel: (pagamentoSnap.get("paymentFormLabel") ?? null) as string | null,
      commissionAmount: comissaoSnap?.exists ? Number(comissaoSnap.get("commissionAmount")) || 0 : 0,
    };
    const depois: ResumoDaCobranca = {
      serviceIds: novo.serviceIds,
      serviceNames: novo.serviceNames,
      value: novo.value,
      discountAmount: desconto.amount,
      cobrado: payment.grossAmount,
      paymentMethod: params.metodo,
      paymentFormLabel: payment.paymentFormLabel,
      commissionAmount: commission.commissionAmount,
    };

    /* ================= ESCRITAS ================= */
    const chave = chaveDaEdicao(params.chave);
    const staffId = String(reserva.staffId ?? comissaoSnap?.get("staffId") ?? "");
    const date = String(reserva.date ?? pagamentoSnap.get("date") ?? "");
    const uid = (comissaoSnap?.get("uid") ?? null) as string | null;
    const staffName = (comissaoSnap?.get("staffName") ?? reserva.staffName ?? null) as string | null;

    /* 1. Comissão: nega a vigente e grava a nova — soma, nunca reescreve. */
    if (comissaoSnap?.exists) {
      tx.set(shopRef.collection("commissions").doc(idDoEstornoDaComissaoDeServico(bookingId, chave)), {
        ...estornoDaComissaoDeServico({
          bookingId,
          chave,
          staffId: String(comissaoSnap.get("staffId") ?? staffId),
          uid,
          staffName,
          date: String(comissaoSnap.get("date") ?? date),
          commissionPct: Number(comissaoSnap.get("commissionPct")) || 0,
          commissionBase: Number(comissaoSnap.get("commissionBase")) || 0,
          commissionAmount: Number(comissaoSnap.get("commissionAmount")) || 0,
        }),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    const novaComissaoId = idDaComissaoDeCicloNovo(bookingId, chave);
    tx.set(shopRef.collection("commissions").doc(novaComissaoId), {
      bookingId,
      staffId,
      uid,
      staffName,
      date,
      origin: "servico",
      cobertoPeloPlano: false,
      ...commission,
      createdAt: FieldValue.serverTimestamp(),
    });

    /* 2. Pagamento: o MESMO documento, campos econômicos atualizados. Sem
     * desconto, os campos do par saem — ausente = sem desconto. */
    tx.update(pagamentoRef, {
      paymentMethod: payment.paymentMethod,
      paymentFormId: payment.paymentFormId,
      paymentFormLabel: payment.paymentFormLabel,
      grossAmount: payment.grossAmount,
      feePct: payment.feePct,
      feeAmount: payment.feeAmount,
      netAmount: payment.netAmount,
      originalAmount: desconto.amount > 0 ? novo.value : FieldValue.delete(),
      discountAmount: desconto.amount > 0 ? desconto.amount : FieldValue.delete(),
    });

    /* 3. Reserva: o estado operacional bate com o fato. `completed → completed`
     * é "nada" para o gatilho, que não rematerializa por cima. */
    tx.set(
      reservaRef,
      {
        serviceIds: novo.serviceIds,
        serviceNames: novo.serviceNames,
        value: novo.value,
        durationMin: novo.durationMin,
        paymentMethod: params.metodo,
        paymentFormId: payment.paymentFormId,
        paymentFormLabel: payment.paymentFormLabel,
        ...(desconto.amount > 0
          ? {
              discountAmount: desconto.amount,
              discountInput: desconto.input,
              discountReason: desconto.reason ?? null,
              discountBy: desconto.by ?? null,
            }
          : {
              discountAmount: FieldValue.delete(),
              discountInput: FieldValue.delete(),
              discountReason: FieldValue.delete(),
              discountBy: FieldValue.delete(),
              discountAt: FieldValue.delete(),
            }),
        cicloFinanceiro: { comissaoVigenteId: novaComissaoId },
        edicoesDeCobranca: FieldValue.arrayUnion({
          antes: { serviceNames: antes.serviceNames, cobrado: antes.cobrado, paymentMethod: antes.paymentMethod },
          depois: { serviceNames: depois.serviceNames, cobrado: depois.cobrado, paymentMethod: depois.paymentMethod },
          combos: novo.combos,
          por: params.autor,
          papel: params.papel,
          emMs: Date.now(),
        }),
      },
      { merge: true }
    );

    /* 4. O rastro, na mesma transação. */
    tx.set(logRef, {
      action: "booking.cobranca_editada",
      by: params.autor,
      at: FieldValue.serverTimestamp(),
      detail: { bookingId, paymentId, papel: params.papel, antes, depois },
    });

    return { bookingId, antes, depois, repetida: false };
  });
}

/* ================================================================== */
/* A porta de entrada                                                 */
/* ================================================================== */

type EdicaoInput = {
  barbershopId: string;
  bookingId: string;
  serviceIds: string[];
  /** Ausente = mantém; `null` = tira; objeto = desconto novo (só dono). */
  desconto?: { tipo: "valor" | "pct"; valor: number; motivo?: string | null } | null;
  paymentMethod: PaymentMethod;
  paymentFormId?: string | null;
  idempotencyKey?: string;
};

const MAX_SERVICOS = 10;

export const editarCobrancaDoAtendimento = onCall<EdicaoInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const data = request.data ?? ({} as EdicaoInput);
  const barbershopId = idSeguro(data.barbershopId, "Barbearia");

  const papel = vinculosDe(request)[barbershopId];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia edita cobrança.");
  }
  await exigirEdicao(barbershopId);

  const bookingId = idSeguro(data.bookingId, "Atendimento");
  const pedidos = Array.isArray(data.serviceIds) ? data.serviceIds : [];
  if (pedidos.length === 0 || pedidos.length > MAX_SERVICOS) {
    throw new HttpsError("invalid-argument", "O atendimento precisa ter de 1 a 10 serviços.");
  }
  const ids = pedidos.map((s) => idSeguro(s, "Serviço"));
  if (!metodoValido(data.paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o cliente pagou.");
  }
  let desconto: PedidoDeDesconto = undefined;
  if (data.desconto === null) desconto = null;
  else if (data.desconto && typeof data.desconto === "object") {
    const tipo = data.desconto.tipo === "pct" ? "pct" : "valor";
    const valor = Number(data.desconto.valor);
    if (!Number.isFinite(valor) || valor < 0 || (tipo === "pct" && valor > 100)) {
      throw new HttpsError("invalid-argument", "Desconto inválido.");
    }
    desconto = valor > 0 ? { tipo, valor, motivo: data.desconto.motivo ?? null } : null;
  }

  const chave = String(data.idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!chave) throw new HttpsError("invalid-argument", "Chave de idempotência ausente.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  /* Preço SEMPRE do catálogo, nunca da tela. Serviço desativado só vale se já
   * estava no atendimento (é o que ele foi, de fato). */
  const [catalogoSnap, reservaSnap] = await Promise.all([
    shopRef.collection("services").get(),
    shopRef.collection("bookings").doc(bookingId).get(),
  ]);
  const catalogo: ServicoDoCatalogo[] = catalogoSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<ServicoDoCatalogo, "id">),
  }));
  const jaTinha = new Set((Array.isArray(reservaSnap.get("serviceIds")) ? reservaSnap.get("serviceIds") : []).map(String));
  for (const id of ids) {
    const s = catalogo.find((c) => c.id === id);
    if (!s || (s.active === false && !jaTinha.has(id))) {
      throw new HttpsError("failed-precondition", "Serviço indisponível.");
    }
  }

  /* O barbeiro: qual `staff` é ele. */
  let staffIdDoAutor: string | null = null;
  if (papel === "staff") {
    const meu = await shopRef.collection("staff").where("uid", "==", uid).limit(1).get();
    staffIdDoAutor = meu.docs[0]?.id ?? null;
  }

  const policies = (await politicasDe(shopSnap)) as {
    commissionSplit?: { barberPct?: number };
    paymentFees?: Partial<PaymentFees>;
    paymentForms?: unknown;
  };

  return gravarEdicao({
    db,
    shopRef,
    bookingId,
    papel,
    staffIdDoAutor,
    serviceIds: ids,
    catalogo,
    desconto,
    metodo: data.paymentMethod,
    formaId: data.paymentFormId ? String(data.paymentFormId) : null,
    fees: { ...SEM_TAXA, ...(policies.paymentFees ?? {}) },
    formas: formasDoTenant(policies),
    padraoPct: padraoDaCasa(policies),
    hoje: hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone),
    chave,
    autor: uid,
  });
});
