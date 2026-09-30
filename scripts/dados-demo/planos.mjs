/**
 * Planos de mensalista e assinantes de DEMONSTRAÇÃO no O Siqueira — pedido do
 * dono em 24/09 ("cria planos também"), depois de `semear.mjs`.
 *
 * ⚠️ A vitrine é pública: estes planos aparecem para qualquer visitante do
 * link, com os preços abaixo, até `limpar.mjs` rodar. Os valores reais ainda
 * estão com o Rômulo.
 *
 * Grava no formato das callables reais (`criarMensalista`,
 * `gerarFaturasDoMes`, `registrarPagamentoDeMensalidade`), e com ids que o
 * limpar reconhece:
 *   plans/demo-…  ·  subscriptions/demo-…  ·  subscription_invoices/fatura_demo-…
 *   payments/pagamento_fatura_fatura_demo-…
 *
 * Uso: CONFIRMO=osiqueira node planos.mjs   (depois de semear.mjs: usa os clientes demo)
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (process.env.CONFIRMO !== "osiqueira") {
  console.error("RECUSADO: isto grava em PRODUÇÃO. Rode com CONFIRMO=osiqueira.");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: "axon-barber" });
const db = getFirestore();
const shopId = (await db.doc("slugs/osiqueira").get()).get("barbershopId");
const shopRef = db.doc(`barbershops/${shopId}`);
const taxas = (await shopRef.get()).get("policies.paymentFees") ?? {};
const TAXA = { pix: taxas.pix ?? 0, cash: taxas.dinheiro ?? 0, debit: taxas.debito ?? 0, credit: taxas.credito ?? 0 };
const ROTULO = { pix: "Pix", cash: "Dinheiro", debit: "Débito", credit: "Crédito" };

const PLANOS = [
  {
    id: "demo-plano-corte",
    name: "Corte mensal",
    price: 99,
    priceAvulso: 60,
    servicesIncluded: 2,
    unlimited: false,
    highlight: false,
    description: "2 cortes adultos por mês",
  },
  {
    id: "demo-plano-corte-barba",
    name: "Corte + barba",
    price: 159,
    priceAvulso: 90,
    servicesIncluded: 2,
    unlimited: false,
    highlight: true,
    description: "2 cortes com barba por mês",
  },
  {
    id: "demo-plano-ilimitado",
    name: "Ilimitado",
    price: 199,
    priceAvulso: 60,
    servicesIncluded: null,
    unlimited: true,
    highlight: false,
    description: "Cortes sem limite no mês",
  },
];

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const mesAtual = hoje.slice(0, 7);
const d = new Date(`${hoje}T12:00:00Z`);
d.setUTCDate(1);
d.setUTCMonth(d.getUTCMonth() - 1);
const mesAnterior = d.toISOString().slice(0, 7);
const vencimento = (comp, dia) => {
  const [a, m] = comp.split("-").map(Number);
  return `${comp}-${String(Math.min(dia, new Date(Date.UTC(a, m, 0)).getUTCDate())).padStart(2, "0")}`;
};

/* Seis clientes demo viram mensalistas. A fatura deste mês de dois deles
   fica em aberto — um já vencido — para a tela mostrar cobrança pendente. */
const ASSINANTES = [
  ["demo-cli-01", "demo-plano-corte", 5, "pix", true],
  ["demo-cli-03", "demo-plano-corte-barba", 10, "credit", true],
  ["demo-cli-06", "demo-plano-ilimitado", 10, "pix", true],
  ["demo-cli-09", "demo-plano-corte", 15, "debit", true],
  ["demo-cli-12", "demo-plano-corte-barba", 20, "pix", false],
  ["demo-cli-17", "demo-plano-corte", 5, "cash", false],
];

const w = db.bulkWriter();
for (const p of PLANOS) {
  const { id, ...dados } = p;
  w.set(shopRef.collection("plans").doc(id), { ...dados, active: true, demo: true });
}

let n = 0;
for (const [clientId, planId, billingDay, metodo, pagouEsteMes] of ASSINANTES) {
  const cli = await shopRef.collection("clients").doc(clientId).get();
  if (!cli.exists) throw new Error(`${clientId} não existe — rode semear.mjs antes`);
  const plano = PLANOS.find((p) => p.id === planId);
  const subId = `demo-sub-${String(++n).padStart(2, "0")}`;
  const nome = cli.get("name");
  w.set(shopRef.collection("subscriptions").doc(subId), {
    clientId,
    clientName: nome,
    name: nome,
    planId,
    planName: plano.name,
    price: plano.price,
    unlimited: plano.unlimited,
    servicesIncluded: plano.servicesIncluded,
    billingDay,
    status: "ativo",
    startedAt: `${mesAnterior}-${String(billingDay).padStart(2, "0")}`,
    canceledAt: null,
    demo: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  for (const comp of [mesAnterior, mesAtual]) {
    const faturaId = `fatura_${subId}_${comp}`;
    const venc = vencimento(comp, billingDay);
    const paga = comp === mesAnterior || (pagouEsteMes && venc <= hoje);
    w.set(shopRef.collection("subscription_invoices").doc(faturaId), {
      subscriptionId: subId,
      clientId,
      competencia: comp,
      dueDate: venc,
      amount: plano.price,
      planName: plano.name,
      status: paga ? "paga" : "aberta",
      paidAt: paga ? venc : null,
      paymentMethod: paga ? metodo : null,
      demo: true,
      emitidaEm: FieldValue.serverTimestamp(),
    });
    if (paga) {
      const feePct = TAXA[metodo] ?? 0;
      const feeAmount = Math.round(plano.price * feePct) / 100;
      w.set(shopRef.collection("payments").doc(`pagamento_fatura_${faturaId}`), {
        origin: "mensalidade",
        invoiceId: faturaId,
        clientId,
        date: venc,
        paymentOrigin: "in_person",
        paymentMethod: metodo,
        paymentFormId: metodo,
        paymentFormLabel: ROTULO[metodo],
        grossAmount: plano.price,
        feePct,
        feeAmount,
        netAmount: Math.round((plano.price - feeAmount) * 100) / 100,
        demo: true,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
}
await w.close();
console.log(`planos: ${PLANOS.length} · mensalistas: ${ASSINANTES.length} · faturas de ${mesAnterior} e ${mesAtual}`);
process.exit(0);
