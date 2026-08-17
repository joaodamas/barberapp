/**
 * O mensalista da barbearia — G2.
 *
 * ## Duas coisas se chamam "assinatura" neste produto
 *
 * | Onde | Quem assina o quê |
 * |---|---|
 * | `subscription.ts` | a **barbearia** assinando a **plataforma** |
 * | este arquivo | o **cliente** assinando a **barbearia** |
 *
 * São mundos separados e o nome quase os confunde. Este arquivo trata só do
 * segundo: `barbershops/{id}/subscriptions` e `subscription_invoices`, que o
 * produto lia e ninguém escrevia.
 *
 * ## A regra que organiza tudo
 *
 * > **Uma assinatura não é receita realizada. Uma fatura não é receita
 * > realizada. O pagamento da fatura é o fato financeiro** — e como ele entra
 * > no resultado é decisão do modelo, na Rodada 3.
 *
 * É a mesma lição dos R$ 248: a receita de mensalista era derivada de uma
 * caixinha marcada como `ativo`, sem nenhum lastro de recebimento. Aqui o
 * lastro passa a existir, e continua **fora** de `receita.bruta` até a decisão
 * de modelo — `analytics.ts` não foi tocado.
 *
 * ## O que fica congelado, e por quê
 *
 * O `price` vivia na assinatura, e só nela. Reajustar o plano reescrevia o
 * histórico inteiro — o mesmo defeito que `products.cost` causava no CMV antes
 * de G1. Agora a **fatura** congela `amount` e `competencia` na emissão, e o
 * pagamento congela `paymentMethod`. Assinatura muda; fatura emitida, não.
 */

import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import { metodoValido } from "./inventory";
import type { PaymentMethod } from "./financial-events";

/**
 * Os status que o CONTRATO existente já declara.
 *
 * `SubscriberDoc` no web é `"ativo" | "suspenso" | "cancelado"`, e
 * `analytics.ts` filtra por `"ativo"`. Escrever "ativa" — que é o gênero certo
 * para "assinatura" — criaria uma assinatura que o motor não enxerga: o
 * mensalista existiria no banco e o MRR mostraria zero.
 *
 * O vocabulário do documento manda sobre a gramática. Renomear é território da
 * Rodada 3, junto com a leitura.
 */
export type StatusDaAssinatura = "ativo" | "suspenso" | "cancelado";
export type StatusDaFatura = "aberta" | "paga" | "cancelada";

export type SubscriptionDoc = {
  clientId: string;
  clientName: string;
  planId: string;
  /** Congelados na contratação: o plano pode ser renomeado ou reajustado. */
  planName: string;
  price: number;
  /** Dia do mês em que vence. 31 cobra no último dia de fevereiro. */
  billingDay: number;
  status: StatusDaAssinatura;
  startedAt: string;
  canceledAt: string | null;
};

export type SubscriptionInvoiceDoc = {
  subscriptionId: string;
  clientId: string;
  /** `YYYY-MM`. É o que resolve o MRR histórico que o estado de hoje não sabe. */
  competencia: string;
  dueDate: string;
  /** CONGELADO na emissão. Reajuste não reescreve fatura emitida. */
  amount: number;
  planName: string;
  status: StatusDaFatura;
  paidAt: string | null;
  /** Nasce no PAGAMENTO, nunca inferido depois. */
  paymentMethod: PaymentMethod | null;
};

/* ================================================================== */
/* Decisões puras                                                     */
/* ================================================================== */

const COMPETENCIA = /^\d{4}-\d{2}$/;

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function competenciaDe(data: string): string {
  return data.slice(0, 7);
}

/**
 * O dia de cobrança é utilizável?
 *
 * 1 a 31. Zero e 32 não existem no calendário, e um `billingDay` inválido
 * geraria fatura com vencimento fora do mês — que a régua D-5→D+5 leria como
 * atrasada desde o nascimento.
 */
export function billingDayValido(dia: unknown): boolean {
  return typeof dia === "number" && Number.isInteger(dia) && dia >= 1 && dia <= 31;
}

/**
 * Quando vence a fatura desta competência.
 *
 * Dia 31 numa competência de fevereiro cobra no dia 28 — ou 29. O blueprint
 * escreve isso como "31 cobra no último dia do mês", e a alternativa (rolar
 * para 1º de março) mudaria a competência da cobrança: a mensalidade de
 * fevereiro venceria em março e apareceria no mês errado do histórico.
 */
export function vencimentoDaCompetencia(competencia: string, billingDay: number): string {
  const [ano, mes] = competencia.split("-").map(Number);
  /* Dia 0 do mês seguinte é o último dia deste — evita tabela de 28/29/30/31 e
   * acerta ano bissexto sem caso especial. */
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(billingDay, ultimoDia);
  return `${competencia}-${String(dia).padStart(2, "0")}`;
}

/**
 * Em que ponto da régua esta fatura está, HOJE.
 *
 * `dueStage` era campo gravado, e ninguém nunca o escreveu: a tela Mensal
 * contava assinantes por estágio e os sete baldes mostravam zero para sempre.
 * Derivar de `dueDate` mata o campo morto sem migração, e responde certo em
 * qualquer data — um campo gravado ficaria velho no dia seguinte.
 *
 * Os cortes: a régua tem sete marcos, e cada fatura cai no marco **já
 * alcançado**. Faltando 4 dias, o aviso de D-5 já saiu e o de D-3 ainda não —
 * então ela está em `D-5`. É o que a operação pergunta: *"o que já foi avisado
 * e o que vem agora"*.
 *
 * Fatura paga ou cancelada não tem estágio: a régua é de cobrança.
 */
export function estagioDaRegua(
  dueDate: string,
  hoje: string
): "D-5" | "D-3" | "D-1" | "D0" | "D+1" | "D+3" | "D+5" | null {
  const dias = Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000
  );
  if (dias > 5) return null; // longe do vencimento: nada a fazer ainda
  if (dias > 3) return "D-5";
  if (dias > 1) return "D-3";
  if (dias > 0) return "D-1";
  if (dias === 0) return "D0";
  if (dias >= -2) return "D+1";
  if (dias >= -4) return "D+3";
  return "D+5";
}

/** A régua completa, para a tela contar sem repetir a lógica. */
export function estagioDaFatura(
  fatura: Pick<SubscriptionInvoiceDoc, "dueDate" | "status">,
  hoje: string
) {
  if (fatura.status !== "aberta") return null;
  return estagioDaRegua(fatura.dueDate, hoje);
}

/** O documento da fatura, montado a partir da assinatura. */
export function faturaDaCompetencia(params: {
  subscriptionId: string;
  assinatura: Pick<SubscriptionDoc, "clientId" | "planName" | "price" | "billingDay">;
  competencia: string;
}): SubscriptionInvoiceDoc {
  return {
    subscriptionId: params.subscriptionId,
    clientId: params.assinatura.clientId,
    competencia: params.competencia,
    dueDate: vencimentoDaCompetencia(params.competencia, params.assinatura.billingDay),
    /* CONGELADOS. Reajustar o plano em outubro não pode alterar a fatura de
     * setembro — é a mesma razão de `unitCost` no movimento de estoque. */
    amount: params.assinatura.price,
    planName: params.assinatura.planName,
    status: "aberta",
    paidAt: null,
    paymentMethod: null,
  };
}

/**
 * A assinatura vale nesta competência?
 *
 * Cancelada antes de a competência começar não gera fatura. Cancelada no meio
 * do mês gera: o ciclo já pago vale até o fim, e é o que `plano_cancelado`
 * promete ao cliente — *"continua valendo até {{3}}"*.
 */
export function valeNaCompetencia(
  assinatura: Pick<SubscriptionDoc, "startedAt" | "canceledAt">,
  competencia: string
): boolean {
  if (competenciaDe(assinatura.startedAt) > competencia) return false;
  if (!assinatura.canceledAt) return true;
  return competenciaDe(assinatura.canceledAt) >= competencia;
}

/* ================================================================== */
/* Cloud Functions                                                    */
/* ================================================================== */

function exigirVinculo(request: { auth?: { token: Record<string, unknown> } | null }, barbershopId: string) {
  const papel = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia faz isso.");
  }
}

/**
 * Contrata um mensalista.
 *
 * O plano é copiado para a assinatura, não referenciado: renomear ou reajustar
 * o plano não pode reescrever o que o cliente contratou. `planId` fica junto
 * para rastrear, mas `planName` e `price` são o que vale.
 */
export const criarMensalista = onCall<{
  barbershopId: string;
  clientId: string;
  planId: string;
  billingDay: number;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, clientId, planId, billingDay } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  exigirVinculo(request, barbershopId);

  if (!clientId) throw new HttpsError("invalid-argument", "Escolha o cliente.");
  if (!planId) throw new HttpsError("invalid-argument", "Escolha o plano.");
  if (!billingDayValido(billingDay)) {
    throw new HttpsError("invalid-argument", "Dia de vencimento precisa ser de 1 a 31.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);

  const [clienteSnap, planoSnap] = await Promise.all([
    shopRef.collection("clients").doc(String(clientId)).get(),
    shopRef.collection("plans").doc(String(planId)).get(),
  ]);
  if (!clienteSnap.exists) throw new HttpsError("not-found", "Esse cliente não está cadastrado.");
  if (clienteSnap.get("active") === false) {
    throw new HttpsError("failed-precondition", "Esse cadastro foi substituído por outro.");
  }
  if (!planoSnap.exists) throw new HttpsError("not-found", "Esse plano não existe.");
  if (planoSnap.get("active") === false) {
    throw new HttpsError("failed-precondition", "Esse plano não está mais ativo.");
  }

  /* Um cliente, uma assinatura ativa. Duas seriam duas mensalidades cobradas da
   * mesma pessoa pelo mesmo serviço, e o MRR contaria em dobro. */
  const jaTem = await shopRef
    .collection("subscriptions")
    .where("clientId", "==", String(clientId))
    .where("status", "==", "ativo")
    .limit(1)
    .get();
  if (!jaTem.empty) {
    throw new HttpsError("already-exists", "Esse cliente já é mensalista.");
  }

  const doc: SubscriptionDoc & { name: string } = {
    clientId: String(clientId),
    clientName: String(clienteSnap.get("name") ?? "Cliente"),
    /* `name` duplica `clientName` porque a tela Mensal e `useSubscribers`
     * ordenam por `name`. Removê-lo exigiria mexer na leitura, e a leitura é
     * território da Rodada 3. */
    name: String(clienteSnap.get("name") ?? "Cliente"),
    planId: String(planId),
    planName: String(planoSnap.get("name") ?? ""),
    price: Number(planoSnap.get("price")) || 0,
    billingDay,
    status: "ativo",
    startedAt: hoje,
    canceledAt: null,
  };

  const ref = await shopRef.collection("subscriptions").add({
    ...doc,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: uid,
  });

  return { subscriptionId: ref.id, ...doc };
});

/**
 * Cancela a assinatura.
 *
 * Não apaga: grava `canceledAt`. O ciclo já faturado continua valendo até o
 * fim, e as faturas emitidas permanecem — apagar histórico para "limpar" a
 * lista destruiria o MRR do passado.
 */
export const cancelarMensalista = onCall<{
  barbershopId: string;
  subscriptionId: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, subscriptionId } = request.data ?? {};
  if (!barbershopId || !subscriptionId) {
    throw new HttpsError("invalid-argument", "Assinatura não informada.");
  }
  exigirVinculo(request, barbershopId);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const ref = shopRef.collection("subscriptions").doc(String(subscriptionId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Assinatura não encontrada.");
  if (snap.get("status") === "cancelado") {
    return { subscriptionId: String(subscriptionId), canceledAt: snap.get("canceledAt") };
  }

  await ref.update({ status: "cancelado", canceledAt: hoje });
  return { subscriptionId: String(subscriptionId), canceledAt: hoje };
});

/**
 * Emite as faturas de uma competência.
 *
 * Idempotente por construção: o id da fatura é `fatura_{subscriptionId}_{YYYY-MM}`.
 * Rodar duas vezes no mesmo mês não cobra duas vezes, e é isso que permite
 * chamá-la por rotina sem medo — retry de agendador é normal.
 */
export async function emitirFaturasDaCompetencia(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  competencia: string;
}): Promise<{ emitidas: number; jaExistiam: number }> {
  if (!COMPETENCIA.test(params.competencia)) {
    throw new HttpsError("invalid-argument", "Competência inválida.");
  }

  const assinaturas = await params.shopRef.collection("subscriptions").get();
  let emitidas = 0;
  let jaExistiam = 0;

  for (const a of assinaturas.docs) {
    const dados = a.data() as SubscriptionDoc;
    if (!valeNaCompetencia(dados, params.competencia)) continue;

    const faturaRef = params.shopRef
      .collection("subscription_invoices")
      .doc(`fatura_${a.id}_${params.competencia}`);

    /* `create` em vez de `set`: falha se já existir, e é exatamente o que se
     * quer. `set` sobrescreveria uma fatura JÁ PAGA, apagando `paidAt` e
     * `paymentMethod` — o pior resultado possível de uma rotina que roda de
     * novo. */
    try {
      await faturaRef.create({
        ...faturaDaCompetencia({
          subscriptionId: a.id,
          assinatura: dados,
          competencia: params.competencia,
        }),
        emitidaEm: FieldValue.serverTimestamp(),
      });
      emitidas++;
    } catch {
      jaExistiam++;
    }
  }

  return { emitidas, jaExistiam };
}

export const gerarFaturasDoMes = onCall<{
  barbershopId: string;
  competencia?: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  exigirVinculo(request, barbershopId);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const competencia = String(request.data?.competencia ?? competenciaDe(hoje));

  return emitirFaturasDaCompetencia({ db, shopRef, competencia });
});

/**
 * O dono confirma que a mensalidade foi paga.
 *
 * É AQUI que o fato financeiro nasce — não na assinatura, não na emissão. O
 * `paymentMethod` é obrigatório e congelado, mesmo desenho de G1: inferir meio
 * de pagamento depois é o que a premissa N12 recusa.
 */
export const registrarPagamentoDeMensalidade = onCall<{
  barbershopId: string;
  invoiceId: string;
  paymentMethod: PaymentMethod;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId, invoiceId, paymentMethod } = request.data ?? {};
  if (!barbershopId || !invoiceId) {
    throw new HttpsError("invalid-argument", "Fatura não informada.");
  }
  exigirVinculo(request, barbershopId);
  if (!metodoValido(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o cliente pagou.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);
  const ref = shopRef.collection("subscription_invoices").doc(String(invoiceId));

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Fatura não encontrada.");

    /* Já paga devolve o que está lá, sem reescrever. Dois toques no botão não
     * podem trocar o meio de pagamento nem a data de uma fatura fechada — o
     * fato financeiro é congelado, como comissão e pagamento de atendimento. */
    if (snap.get("status") === "paga") {
      return {
        invoiceId: String(invoiceId),
        amount: Number(snap.get("amount")) || 0,
        paidAt: snap.get("paidAt"),
        paymentMethod: snap.get("paymentMethod"),
        repetida: true,
      };
    }
    if (snap.get("status") === "cancelada") {
      throw new HttpsError("failed-precondition", "Essa fatura foi cancelada.");
    }

    tx.update(ref, {
      status: "paga",
      paidAt: hoje,
      paymentMethod,
      registradoPor: uid,
    });

    return {
      invoiceId: String(invoiceId),
      amount: Number(snap.get("amount")) || 0,
      paidAt: hoje,
      paymentMethod,
      repetida: false,
    };
  });
});
