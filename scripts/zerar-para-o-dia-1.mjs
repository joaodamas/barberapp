/**
 * Deixa a barbearia pronta para o primeiro dia real: sem movimento, sem
 * clientes e sem contas que não sejam da casa.
 *
 * Roda com a credencial do gcloud do dono, a partir de `functions/` (é de lá
 * que vem o firebase-admin):
 *
 *   cd functions
 *   CONFIRMO=osiqueira node ../scripts/zerar-para-o-dia-1.mjs            # só mostra
 *   CONFIRMO=osiqueira APAGAR=sim node ../scripts/zerar-para-o-dia-1.mjs # apaga
 *
 * SAI
 * - todo o movimento (as mesmas coleções do "Começar do zero" do app —
 *   `COLECOES_DE_MOVIMENTO` em `functions/src/comecar-do-zero.ts`);
 * - todos os clientes da barbearia;
 * - planos e produtos de demonstração (id `demo-`); o estoque dos que ficam
 *   volta a zero, como no "Começar do zero";
 * - quem é só CLIENTE: o vínculo com a barbearia, o perfil e a conta de login.
 *
 * FICA
 * - a ficha da barbearia, serviços, preços, horários, equipe, formas de
 *   pagamento, taxas e o que foi cadastrado de verdade;
 * - as contas do dono, da equipe e do administrador da plataforma;
 * - `audit_log`, inteiro: ele é o rastro do que aconteceu, e ganha uma linha
 *   dizendo que esta limpeza aconteceu.
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(path.resolve("package.json"));
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const SLUG = "osiqueira";
const PROJETO = "axon-barber";

if (process.env.CONFIRMO !== SLUG) {
  console.error(`Defina CONFIRMO=${SLUG} para dizer de qual barbearia se trata.`);
  process.exit(1);
}
const APAGAR = process.env.APAGAR === "sim";

const COLECOES_DE_MOVIMENTO = [
  "bookings",
  "payments",
  "commissions",
  "refunds",
  "cash_entries",
  "inventory_movements",
  "expenses",
  "subscriptions",
  "subscription_invoices",
  "loyalty_transactions",
  "client_occurrences",
  "whatsapp_messages",
];

initializeApp({ credential: applicationDefault(), projectId: PROJETO });
const db = getFirestore();
const auth = getAuth();

const achadas = await db.collection("barbershops").where("slug", "==", SLUG).get();
const shopRef = achadas.empty ? null : achadas.docs[0].ref;
if (!shopRef) {
  console.error(`Barbearia "${SLUG}" não encontrada.`);
  process.exit(1);
}
console.log(`Barbearia ${SLUG} (${shopRef.id}) — ${APAGAR ? "APAGANDO" : "só mostrando, nada será apagado"}\n`);

/* ---- o que sai ---- */
const plano = [];

for (const nome of [...COLECOES_DE_MOVIMENTO, "clients"]) {
  const snap = await shopRef.collection(nome).get();
  if (!snap.empty) plano.push({ rotulo: nome, refs: snap.docs.map((d) => d.ref) });
}

for (const nome of ["plans", "products"]) {
  const snap = await shopRef.collection(nome).get();
  const demo = snap.docs.filter((d) => d.id.startsWith("demo-"));
  const ficam = snap.docs.filter((d) => !d.id.startsWith("demo-"));
  if (demo.length) plano.push({ rotulo: `${nome} (demonstração)`, refs: demo.map((d) => d.ref) });
  if (ficam.length) {
    console.log(`  fica em ${nome}: ${ficam.map((d) => d.get("name") ?? d.id).join(", ")}`);
  }
}

/* Contas: fica quem é dono ou equipe de alguma barbearia, ou administrador da
 * plataforma. O resto é cliente — e só existe uma barbearia na plataforma, então
 * apagar a conta não tira ninguém de outra casa. A conferência é pelo claim E
 * pelo vínculo gravado, e na dúvida a conta fica. */
const daCasa = (claims) =>
  claims?.platformAdmin === true ||
  Object.values(claims?.barbershops ?? {}).some((p) => p === "owner" || p === "staff");

const membros = await shopRef.collection("members").get();
const papelDoMembro = new Map(membros.docs.map((d) => [d.id, d.get("role")]));

const contasQueFicam = [];
const contasQueSaem = [];
let pagina;
do {
  const lote = await auth.listUsers(1000, pagina);
  for (const u of lote.users) {
    const papel = papelDoMembro.get(u.uid);
    const ficar = daCasa(u.customClaims) || papel === "owner" || papel === "staff";
    (ficar ? contasQueFicam : contasQueSaem).push(u);
  }
  pagina = lote.pageToken;
} while (pagina);

/* Vínculo de membro de quem não fica na lista de contas (conta já apagada). */
const membrosOrfaos = membros.docs.filter(
  (d) => d.get("role") !== "owner" && d.get("role") !== "staff" && !contasQueSaem.some((u) => u.uid === d.id)
);

/* ---- prévia ---- */
let total = 0;
for (const p of plano) {
  console.log(`  sai ${p.rotulo}: ${p.refs.length}`);
  total += p.refs.length;
}
console.log(`\n  contas que FICAM (${contasQueFicam.length}):`);
for (const u of contasQueFicam) console.log(`    ${u.email ?? u.phoneNumber ?? u.uid}`);
console.log(`  contas de cliente que SAEM (${contasQueSaem.length}):`);
for (const u of contasQueSaem) console.log(`    ${u.email ?? u.phoneNumber ?? u.uid}`);
if (membrosOrfaos.length) console.log(`  vínculos de cliente sem conta: ${membrosOrfaos.length}`);
console.log(`\n  documentos: ${total}`);

if (!APAGAR) {
  console.log("\nNada foi apagado. Para apagar, rode de novo com APAGAR=sim.");
  process.exit(0);
}

/* ---- execução ---- */

/* O registro vem ANTES: se a execução parar no meio, fica escrito que ela
 * começou e o que ia sair — mesma ordem do "Começar do zero". */
await shopRef.collection("audit_log").add({
  acao: "zerar_para_o_dia_1",
  em: FieldValue.serverTimestamp(),
  por: "script scripts/zerar-para-o-dia-1.mjs",
  previa: Object.fromEntries(plano.map((p) => [p.rotulo, p.refs.length])),
  contasRemovidas: contasQueSaem.length,
});

async function apagar(refs) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    for (const r of refs.slice(i, i + 400)) batch.delete(r);
    await batch.commit();
  }
}

for (const p of plano) {
  await apagar(p.refs);
  console.log(`  apagado ${p.rotulo}: ${p.refs.length}`);
}

const produtos = await shopRef.collection("products").get();
if (!produtos.empty) {
  const batch = db.batch();
  for (const d of produtos.docs) batch.update(d.ref, { stock: 0 });
  await batch.commit();
  console.log(`  estoque zerado em ${produtos.size} produto(s)`);
}

for (const u of contasQueSaem) {
  const refs = [shopRef.collection("members").doc(u.uid)];
  const vinculos = await db.collection(`users/${u.uid}/memberships`).get();
  refs.push(...vinculos.docs.map((d) => d.ref), db.doc(`users/${u.uid}`));
  await apagar(refs);
  await auth.deleteUser(u.uid);
}
await apagar(membrosOrfaos.map((d) => d.ref));
console.log(`  contas de cliente removidas: ${contasQueSaem.length}`);

console.log("\nPronto. A barbearia está sem movimento e sem clientes.");
