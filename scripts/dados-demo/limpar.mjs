/**
 * Tira da barbearia real tudo que `semear.mjs` pôs lá — e nada além.
 *
 * Apaga por PREFIXO de id, não por data nem por nome: um cliente real chamado
 * "Lucas Andrade" não pode sumir porque o demo tinha um igual. O que os
 * gatilhos derivaram de uma reserva demo herda o id dela, então sai junto:
 * `pagamento_demo-…`, `comissao_demo-…`, `credito_demo-…` (fidelidade).
 *
 * Roda antes de o O Siqueira começar a valer — senão o "Quanto sobrou" do
 * mês mistura corte inventado com corte de verdade.
 *
 * Uso: CONFIRMO=osiqueira node limpar.mjs            (só mostra o que apagaria)
 *      CONFIRMO=osiqueira APAGAR=sim node limpar.mjs (apaga)
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldPath } from "firebase-admin/firestore";

if (process.env.CONFIRMO !== "osiqueira") {
  console.error("RECUSADO: isto mexe em PRODUÇÃO. Rode com CONFIRMO=osiqueira.");
  process.exit(1);
}
const apagar = process.env.APAGAR === "sim";
initializeApp({ credential: applicationDefault(), projectId: "axon-barber" });
const db = getFirestore();
const shopId = (await db.doc("slugs/osiqueira").get()).get("barbershopId");
const shopRef = db.doc(`barbershops/${shopId}`);

/* Coleção → prefixo do id que marca o demo. */
const ALVOS = [
  ["bookings", "demo-"],
  ["payments", "pagamento_demo-"],
  ["commissions", "comissao_demo-"],
  ["loyalty_transactions", "credito_demo-"],
  ["clients", "demo-"],
  ["expenses", "demo-"],
  ["products", "demo-"],
  /* planos.mjs */
  ["plans", "demo-"],
  ["subscriptions", "demo-"],
  ["subscription_invoices", "fatura_demo-"],
  ["payments", "pagamento_fatura_fatura_demo-"],
];

let total = 0;
const w = db.bulkWriter();
for (const [colecao, prefixo] of ALVOS) {
  const snap = await shopRef
    .collection(colecao)
    .where(FieldPath.documentId(), ">=", prefixo)
    .where(FieldPath.documentId(), "<", prefixo + "")
    .get();
  console.log(`${colecao.padEnd(22)} ${prefixo.padEnd(16)} ${snap.size}`);
  total += snap.size;
  if (apagar) snap.docs.forEach((d) => w.delete(d.ref));
}
await w.close();
console.log(apagar ? `APAGADOS: ${total}` : `seriam apagados: ${total} — rode com APAGAR=sim`);
process.exit(0);
