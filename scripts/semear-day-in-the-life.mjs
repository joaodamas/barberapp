/**
 * Semeia o ambiente do Day in the Life — SÓ NO EMULADOR.
 *
 * Cria a barbearia como o produto a criaria: uma conta de dono com o claim,
 * a ficha da barbearia, dois barbeiros e o catálogo. Nada de reserva, despesa
 * ou venda — o teste existe para descobrir se o operador consegue criar isso
 * pela interface.
 *
 * A trava do topo é deliberada: este script grava com Admin SDK, que ignora as
 * regras. Apontá-lo para produção por engano criaria uma barbearia de teste na
 * base do piloto.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/* Dois alvos permitidos: o emulador, ou o projeto de DEV (cortehub-dev.web.app)
 * pedido POR NOME em SEMEAR_DEV. Produção (axon-barber) nunca: a lista é de
 * permissão, não de proibição. */
const PROJETO_DEV = "crucial-baton-440119-r8";
const EH_DEV = process.env.SEMEAR_DEV === PROJETO_DEV;
const PROJETO = EH_DEV ? PROJETO_DEV : process.env.PROJETO_EMULADOR ?? "day-in-the-life";

if (!EH_DEV && (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  console.error(
    "RECUSADO: este script só roda contra emulador ou contra o DEV.\n" +
      "  emulador: set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 e FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099\n" +
      `  DEV:      SEMEAR_DEV=${PROJETO_DEV}`
  );
  process.exit(1);
}
if (EH_DEV && (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST)) {
  console.error("RECUSADO: SEMEAR_DEV com variável de emulador junto — escolha um alvo só.");
  process.exit(1);
}

initializeApp({ projectId: PROJETO });
const db = getFirestore();
const auth = getAuth();

const SLUG = "osiqueira";
const SHOP_ID = "shop-day-in-the-life";
const EMAIL = "dono@osiqueira.teste";
/* No DEV o site é público: a senha vem de fora (DEV_SENHA), não do código. */
const SENHA = EH_DEV ? process.env.DEV_SENHA : "dono12345";
/* A exigência de 12+ é do DEV. Valia para o emulador também, e a senha fixa
 * dele tem 9: o passeio no celular parou na semente desde o #74 (achado em
 * 08/10, quando voltou a rodar). */
if (EH_DEV && (!SENHA || SENHA.length < 12)) {
  console.error("RECUSADO: no DEV, passe DEV_SENHA com 12+ caracteres.");
  process.exit(1);
}

/* ---- Dono ---- */
let dono;
try {
  dono = await auth.getUserByEmail(EMAIL);
} catch {
  dono = await auth.createUser({
    email: EMAIL,
    password: SENHA,
    displayName: "Rafael Siqueira",
    emailVerified: true,
  });
}
await auth.setCustomUserClaims(dono.uid, { barbershops: { [SHOP_ID]: "owner" } });

/* ---- Um cliente, para o dono não precisar criar conta de terceiro ---- */
const CLIENTE_EMAIL = "cliente@teste.com";
let cliente;
try {
  cliente = await auth.getUserByEmail(CLIENTE_EMAIL);
} catch {
  cliente = await auth.createUser({
    email: CLIENTE_EMAIL,
    password: EH_DEV ? SENHA : "cliente12345",
    displayName: "Carlos Cliente",
    emailVerified: true,
  });
}

/* ---- A barbearia ---- */
await db.doc(`slugs/${SLUG}`).set({ barbershopId: SHOP_ID });

await db.doc(`barbershops/${SHOP_ID}`).set({
  slug: SLUG,
  status: "ativo",
  plan: "gestao",
  trial: null,
  features: {
    whatsapp: true,
    loyalty: true,
    subscriptions: true,
    store: true,
    advancedFinance: true,
  },
  brand: {
    name: EH_DEV ? "Barbearia de Teste (DEV)" : "O Siqueira Barbearia",
    shortName: EH_DEV ? "Teste DEV" : "O Siqueira",
    logo: "/logo.svg",
    logoHorizontal: "/logo-horizontal.svg",
    accentColor: "#b8863a",
    themeColor: "#ffffff",
    panelLabel: "Painel do dono",
    clientTagline: "Sua barbearia",
  },
  contact: {
    address: "Rua das Tesouras, 120",
    whatsapp: "5511961733047",
  },
  locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" },
  schedule: {
    weekdays: [1, 2, 3, 4, 5, 6],
    opensAt: "09:00",
    closesAt: "19:00",
    breaks: [{ from: "12:00", to: "13:00" }],
    slotMinutes: 30,
  },
  policies: {
    booking: { lateToleranceMinutes: 15 },
  },
  onboarding: {
    completedSteps: ["barbearia", "servicos", "horarios", "compartilhar"],
    completedAt: FieldValue.serverTimestamp(),
    sharedLink: true,
  },
  createdAt: FieldValue.serverTimestamp(),
  createdBy: dono.uid,
});

/* Taxas moram no documento privado desde o #66 — a ficha pública não as tem. */
await db.doc(`barbershops/${SHOP_ID}/private/financeiro`).set({
  paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
});

await db.doc(`barbershops/${SHOP_ID}/members/${dono.uid}`).set({
  role: "owner",
  email: EMAIL,
  addedAt: FieldValue.serverTimestamp(),
});

/* ---- Equipe: dois barbeiros, um com comissão própria ---- */
const equipe = [
  { id: "b-rafael", name: "Rafael", commissionPct: null, uid: dono.uid, order: 1 },
  { id: "b-leo", name: "Léo", commissionPct: 50, uid: null, order: 2 },
];
for (const b of equipe) {
  await db.doc(`barbershops/${SHOP_ID}/staff/${b.id}`).set({
    name: b.name,
    active: true,
    uid: b.uid,
    serviceIds: [],
    commissionPct: b.commissionPct,
    schedule: null,
    order: b.order,
    createdAt: FieldValue.serverTimestamp(),
  });
}

/* ---- Catálogo ---- */
const servicos = [
  { id: "corte", name: "Corte", durationMin: 30, price: 50 },
  { id: "barba", name: "Barba", durationMin: 30, price: 35 },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 90 },
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 15 },
];
for (const s of servicos) {
  await db.doc(`barbershops/${SHOP_ID}/services/${s.id}`).set({ ...s, active: true });
}

/* ---- Produtos, para a etapa das 11:00 ---- */
const produtos = [
  { id: "pomada", name: "Pomada modeladora", cost: 18, price: 45, stock: 10, minStock: 3 },
  { id: "shampoo", name: "Shampoo", cost: 22, price: 55, stock: 5, minStock: 2 },
];
for (const p of produtos) {
  await db.doc(`barbershops/${SHOP_ID}/products/${p.id}`).set(p);
}

/* ---- Planos de mensalista, para a etapa das 14:00 ---- */
const planos = [
  { id: "ilimitado", name: "Ilimitado", price: 149, priceAvulso: 50, description: "Cortes sem limite no mês", unlimited: true, highlight: true, active: true },
  { id: "duplo", name: "2 cortes", price: 99, priceAvulso: 50, description: "Dois cortes por mês", active: true },
];
for (const p of planos) {
  await db.doc(`barbershops/${SHOP_ID}/plans/${p.id}`).set(p);
}

console.log("SEMEADO");
console.log("  barbearia : %s", EH_DEV ? "https://cortehub-dev.web.app" : "http://osiqueira.lvh.me:3000");
console.log("  dono      : %s%s", EMAIL, EH_DEV ? " (senha: DEV_SENHA)" : ` / ${SENHA}`);
console.log("  cliente   : %s%s", CLIENTE_EMAIL, EH_DEV ? " (senha: DEV_SENHA)" : " / cliente12345");
console.log("  equipe    : Rafael (padrão da casa) · Léo (50%%)");
console.log("  serviços  : 4 · produtos: 2 · planos: 2");
console.log("  SEM reservas, SEM despesas, SEM vendas — é o que o teste vai criar.");
process.exit(0);
