/**
 * Cria (ou repara) o acesso do dono de uma barbearia já provisionada.
 *
 * Existe porque o caminho self-service — dono cria a conta, cria a barbearia —
 * não serve para a barbearia piloto: ela foi provisionada por nós, e o dono
 * precisa receber uma senha pronta pelo WhatsApp. A senha nasce provisória: o
 * claim `mustChangePassword` prende a conta na tela de troca até ela morrer.
 *
 * É idempotente de propósito. Rodar de novo repõe a senha provisória e o claim
 * sem duplicar nada — é o procedimento de "perdi o acesso" também.
 *
 * Uso (dentro de functions/, com `npm run build` feito e ADC configurado):
 *
 *   node scripts/criar-acesso-dono.mjs \
 *     --slug osiqueira --email dono@exemplo.com --senha 'SenhaProvisoria' \
 *     [--reiniciar-onboarding] [--limpar-contato-inventado]
 *
 * `--reiniciar-onboarding` devolve a barbearia para o passo 1: é o que faz o
 * dono passar pela configuração guiada em vez de cair num painel que alguém
 * configurou por ele.
 *
 * `--limpar-contato-inventado` apaga endereço, WhatsApp e Instagram. Sem isso o
 * onboarding aparece PREENCHIDO com o dado de exemplo — e um formulário que já
 * vem preenchido é um formulário que ninguém lê antes de clicar em Continuar.
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { hashInitialPassword, validatePassword } from "../lib/account.js";

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (nome) => args.includes(`--${nome}`);

const slug = valor("slug");
const email = valor("email")?.trim().toLowerCase();
const senha = valor("senha");

if (!slug || !email || !senha) {
  console.error("Faltou --slug, --email ou --senha.");
  process.exit(1);
}
const problema = validatePassword(senha);
if (problema) {
  console.error(`Senha provisória recusada: ${problema}`);
  process.exit(1);
}

initializeApp();
const auth = getAuth();
const db = getFirestore();

const slugSnap = await db.doc(`slugs/${slug}`).get();
if (!slugSnap.exists) {
  console.error(`Nenhuma barbearia no endereço "${slug}".`);
  process.exit(1);
}
const barbershopId = slugSnap.get("barbershopId");
const shopRef = db.doc(`barbershops/${barbershopId}`);

/* ---- A conta ---- */
let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password: senha });
  console.log(`Conta já existia (${user.uid}) — senha provisória reposta.`);
} catch {
  user = await auth.createUser({ email, password: senha, emailVerified: false });
  console.log(`Conta criada (${user.uid}).`);
}

/* ---- O vínculo, no claim ---- */
const claims = { ...(user.customClaims ?? {}) };
claims.barbershops = { ...(claims.barbershops ?? {}), [barbershopId]: "owner" };
claims.mustChangePassword = true;
await auth.setCustomUserClaims(user.uid, claims);
/* Derruba sessão antiga: se a conta já existia logada, o claim novo só valeria
 * na próxima renovação e ela passaria direto pela tela de troca. */
await auth.revokeRefreshTokens(user.uid);
console.log(`Claim: owner em ${barbershopId} + troca de senha obrigatória.`);

/* ---- O espelho do vínculo e o hash da senha provisória ---- */
await shopRef.collection("members").doc(user.uid).set(
  { role: "owner", email, addedAt: FieldValue.serverTimestamp() },
  { merge: true }
);
await db.doc(`platform_users/${user.uid}`).set(
  {
    email,
    initialPasswordHash: hashInitialPassword(senha),
    initialPasswordSetAt: FieldValue.serverTimestamp(),
    passwordChangedAt: FieldValue.delete(),
  },
  { merge: true }
);

/* ---- Onboarding do zero ---- */
if (flag("reiniciar-onboarding")) {
  await shopRef.update({
    "onboarding.completedSteps": [],
    "onboarding.completedAt": null,
    "onboarding.sharedLink": false,
  });
  console.log("Onboarding reiniciado — o dono entra pelo passo 1.");
}

/* ---- Contato inventado ---- */
if (flag("limpar-contato-inventado")) {
  /* String vazia, NÃO delete: `toTenant` faz `{...DEFAULT_TENANT.contact,
   * ...contact}`, então campo ausente ressuscita o dado de exemplo do código —
   * e o endereço fictício voltaria à tela do cliente sem ninguém entender por
   * quê. Vazio sobrescreve; ausente não. */
  await shopRef.update({
    "contact.address": "",
    "contact.whatsapp": "",
    "contact.instagram": null,
    "contact.since": null,
  });
  console.log("Endereço, WhatsApp e Instagram de exemplo apagados.");
}

const shop = await shopRef.get();
console.log("\n--- estado final ---");
console.log("barbearia :", shop.get("brand.name"), `(${barbershopId})`);
console.log("endereço  :", JSON.stringify(shop.get("contact.address")));
console.log("whatsapp  :", JSON.stringify(shop.get("contact.whatsapp")));
console.log("onboarding:", JSON.stringify(shop.get("onboarding")));
console.log("dono      :", email, `(${user.uid})`);
process.exit(0);
