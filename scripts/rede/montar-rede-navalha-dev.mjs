/**
 * Monta no DEV a REDE "navalha" (entidade da rede, PR1) sobre as 4 unidades da
 * franquia fictícia: rede-navalha-centro, -moema, -pinheiros e -tatuape.
 *
 * SÓ NO DEV. A trava é a mesma de `scripts/semear-franquia-dev.mjs`: o
 * projectId tem de ser exatamente `crucial-baton-440119-r8` (produção é
 * axon-barber); recusa variável de ambiente apontando para outro projeto ou
 * para emulador.
 *
 *   node scripts/rede/montar-rede-navalha-dev.mjs
 *
 * Por que grava direto pelo Admin SDK, e não pelas callables: o DEV só publica
 * a `main`, então as callables `criarRede`/`vincularUnidade` (PR1) ainda não
 * existem lá. O script REIMPLEMENTA a lógica de `functions/src/rede.ts`
 * (`aplicarAcessoDaRede` e `sincronizarAcessoDaRede`) — o build de `functions/`
 * não é importado porque pode não existir e arrastaria o runtime do Firebase
 * Functions. Os documentos e claims ficam no mesmo formato que o servidor grava:
 *
 *   redes/{id}                      vitrine (nome, slug, marca, unidades, ...)
 *   redes/{id}/private/contrato     donos, maxUnidades, criadoPor
 *   redes_slugs/navalha             { redeId }
 *   barbershops/{u}.redeId          em cada unidade
 *   claims do dono                  redes:{id:"dono"} + barbershops[u]="owner"
 *   barbershops/{u}/members/{dono}  { role:"owner", origem:"rede", redeId }
 *                                   (se o membro já existe SEM origem — a
 *                                   semente da franquia o grava assim — não é
 *                                   sobrescrito, como no servidor)
 *
 * Idempotente. Não revoga sessão (conceder não revoga). Se faltar unidade ou
 * o dono, cria o MÍNIMO (ficha e índice de slug; conta com e-mail confirmado),
 * mas o ideal é rodar antes `scripts/semear-franquia-dev.mjs`.
 *
 * Credencial: ADC (`gcloud auth application-default login`). Usa o
 * firebase-admin de functions/node_modules (do checkout atual ou, numa
 * worktree sem node_modules, de FUNCTIONS_DIR).
 */
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ------------------------------------------------------------------ */
/* Trava de projeto                                                    */
/* ------------------------------------------------------------------ */
const PROJETO_DEV = "crucial-baton-440119-r8";
const PROJETO_PRODUCAO = "axon-barber";

function recusar(msg) {
  console.error(`RECUSADO: ${msg}`);
  process.exit(1);
}
for (const v of ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT", "FIREBASE_PROJECT", "GCP_PROJECT"]) {
  const valor = process.env[v];
  if (valor && valor !== PROJETO_DEV) recusar(`${v}=${valor}. Só roda em ${PROJETO_DEV} (produção é ${PROJETO_PRODUCAO}).`);
}
if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  recusar("variável de emulador definida. Este script grava no DEV real.");
}
const PROJETO = PROJETO_DEV;
if (PROJETO !== "crucial-baton-440119-r8") recusar("projectId diferente do DEV.");

const aqui = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(aqui, "..", "..");
const candidatos = [process.env.FUNCTIONS_DIR, join(RAIZ, "functions")].filter(Boolean);
const functionsDir = candidatos.find((d) => existsSync(join(d, "node_modules", "firebase-admin")));
if (!functionsDir) recusar("firebase-admin não encontrado. Defina FUNCTIONS_DIR=<checkout>/functions (com node_modules).");
const require = createRequire(join(functionsDir, "package.json"));
const { initializeApp, getApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

initializeApp({ projectId: PROJETO });
if (getApp().options.projectId !== PROJETO_DEV) recusar("projectId do app não é o do DEV.");
const db = getFirestore();
const auth = getAuth();

/* ------------------------------------------------------------------ */
/* A rede                                                              */
/* ------------------------------------------------------------------ */
const DOMINIO = "teste.topete.dev";
const REDE_ID = "rede-navalha";
const REDE_SLUG = "navalha";
const REDE_NOME = "Navalha";
const EMAIL_DONO = `dono.rede@${DOMINIO}`;
const MAX_UNIDADES = 20;
const LIMITE_DE_CLAIMS_BYTES = 900;

const UNIDADES = [
  { slug: "navalha-centro", nome: "Navalha Centro" },
  { slug: "navalha-moema", nome: "Navalha Moema" },
  { slug: "navalha-pinheiros", nome: "Navalha Pinheiros" },
  { slug: "navalha-tatuape", nome: "Navalha Tatuapé" },
].map((u) => ({ ...u, id: `rede-${u.slug}` }));

/* ------------------------------------------------------------------ */
/* Cópia fiel de `aplicarAcessoDaRede` (functions/src/rede.ts)          */
/* ------------------------------------------------------------------ */
function aplicarAcessoDaRede(claims, { redeId, dono, conceder, retirar }) {
  const novos = { ...claims };
  const redes = { ...(novos.redes ?? {}) };
  if (dono) redes[redeId] = "dono";
  else delete redes[redeId];
  if (Object.keys(redes).length > 0) novos.redes = redes;
  else delete novos.redes;
  const barbershops = { ...(novos.barbershops ?? {}) };
  for (const u of retirar) if (barbershops[u] === "owner") delete barbershops[u];
  for (const u of conceder) barbershops[u] = "owner";
  novos.barbershops = barbershops;
  return novos;
}
const tamanhoDosClaims = (c) => Buffer.byteLength(JSON.stringify(c), "utf8");

/* ------------------------------------------------------------------ */
/* Credencial da conta criada (arquivo ignorado pelo git)               */
/* ------------------------------------------------------------------ */
const ARQ_CRED = resolve(process.env.FRANQUIA_CREDENCIAIS ?? join(RAIZ, "web", ".env.franquia.local"));
function garantirArquivoIgnorado() {
  mkdirSync(dirname(ARQ_CRED), { recursive: true });
  try {
    execFileSync("git", ["-C", dirname(ARQ_CRED), "check-ignore", "-q", ARQ_CRED], { stdio: "ignore" });
  } catch {
    recusar(`${ARQ_CRED} NÃO está ignorado pelo git. Escolha outro caminho em FRANQUIA_CREDENCIAIS.`);
  }
}
function senhaGravada() {
  if (!existsSync(ARQ_CRED)) return null;
  const m = readFileSync(ARQ_CRED, "utf8").match(/^FRANQUIA_SENHA=(\S{12,})$/m);
  return m ? m[1] : null;
}

/* ------------------------------------------------------------------ */
/* 1. As unidades                                                       */
/* ------------------------------------------------------------------ */
console.log(`Projeto ${PROJETO}. Montando a rede "${REDE_SLUG}"...`);

const slugRede = await db.doc(`slugs/${REDE_SLUG}`).get();
if (slugRede.exists) recusar(`slugs/${REDE_SLUG} existe: o slug da rede colide com uma barbearia.`);
const indiceRede = await db.doc(`redes_slugs/${REDE_SLUG}`).get();
if (indiceRede.exists && indiceRede.get("redeId") !== REDE_ID) {
  recusar(`redes_slugs/${REDE_SLUG} aponta para outra rede (${indiceRede.get("redeId")}).`);
}

const unidadesDaRede = [];
for (const u of UNIDADES) {
  const ref = db.doc(`barbershops/${u.id}`);
  let snap = await ref.get();
  if (!snap.exists) {
    console.log(`  ${u.id}: não existia; criando ficha mínima (rode semear-franquia-dev depois para o resto).`);
    await ref.set({
      slug: u.slug,
      status: "ativo",
      plan: "gestao",
      brand: { name: u.nome, shortName: u.nome.slice(0, 14) },
      createdAt: FieldValue.serverTimestamp(),
      semeadoPor: "montar-rede-navalha-dev",
    });
    const idx = await db.doc(`slugs/${u.slug}`).get();
    if (!idx.exists) await db.doc(`slugs/${u.slug}`).set({ barbershopId: u.id });
    snap = await ref.get();
  }
  const atual = snap.get("redeId");
  if (atual && atual !== REDE_ID) recusar(`${u.id} já pertence a outra rede (${atual}).`);
  const dominio = typeof snap.get("dominio") === "string" && snap.get("dominio").trim() ? snap.get("dominio").trim() : null;
  unidadesDaRede.push({
    id: u.id,
    slug: String(snap.get("slug") ?? u.slug),
    nome: String(snap.get("brand.name") ?? snap.get("name") ?? u.nome),
    ...(dominio ? { dominio } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* 2. O dono                                                            */
/* ------------------------------------------------------------------ */
let dono;
try {
  dono = await auth.getUserByEmail(EMAIL_DONO);
  console.log(`  dono: ${EMAIL_DONO} já existe (${dono.uid})`);
} catch (e) {
  if (e.code !== "auth/user-not-found") throw e;
  garantirArquivoIgnorado();
  let senha = senhaGravada();
  if (!senha) {
    senha = `Nv${randomBytes(12).toString("base64url")}9!`;
    writeFileSync(ARQ_CRED, `FRANQUIA_SENHA=${senha}\n`, { flag: "a" });
  }
  dono = await auth.createUser({ email: EMAIL_DONO, password: senha, displayName: "Dono da Rede Navalha", emailVerified: true });
  console.log(`  dono: ${EMAIL_DONO} criado (${dono.uid}); senha em ${ARQ_CRED}`);
}

/* ------------------------------------------------------------------ */
/* 3. Os documentos da rede                                             */
/* ------------------------------------------------------------------ */
const redeRef = db.doc(`redes/${REDE_ID}`);
const existia = (await redeRef.get()).exists;
await redeRef.set(
  {
    nome: REDE_NOME,
    slug: REDE_SLUG,
    marca: { name: REDE_NOME, accentColor: null, logo: null },
    unidades: unidadesDaRede,
    status: "ativa",
    politicas: { fidelidade: "por_unidade", mensalidadeValeNaRede: false },
    ...(existia ? {} : { createdAt: FieldValue.serverTimestamp() }),
  },
  { merge: true }
);
await db.doc(`redes/${REDE_ID}/private/contrato`).set(
  { donos: [dono.uid], maxUnidades: MAX_UNIDADES, hubTenantId: null, criadoPor: "montar-rede-navalha-dev" },
  { merge: true }
);
await db.doc(`redes_slugs/${REDE_SLUG}`).set({ redeId: REDE_ID });
for (const u of unidadesDaRede) await db.doc(`barbershops/${u.id}`).update({ redeId: REDE_ID });
console.log(`  rede ${REDE_ID}: ${existia ? "atualizada" : "criada"} com ${unidadesDaRede.length} unidades`);

/* ------------------------------------------------------------------ */
/* 4. Acesso (a mesma lógica de sincronizarAcessoDaRede)                */
/* ------------------------------------------------------------------ */
const ids = unidadesDaRede.map((u) => u.id);
for (const id of ids) {
  const ref = db.doc(`barbershops/${id}/members/${dono.uid}`);
  const atual = await ref.get();
  if (atual.exists && atual.get("origem") !== "rede") {
    console.log(`  ${id}: membro já existe sem origem (dono por conta própria); mantido.`);
    continue;
  }
  if (atual.exists && atual.get("redeId") === REDE_ID) continue;
  await ref.set({ role: "owner", origem: "rede", redeId: REDE_ID, email: EMAIL_DONO, addedAt: FieldValue.serverTimestamp() }, { merge: true });
}

const antes = { ...((await auth.getUser(dono.uid)).customClaims ?? {}) };
const depois = aplicarAcessoDaRede(antes, { redeId: REDE_ID, dono: true, conceder: ids, retirar: [] });
const bytes = tamanhoDosClaims(depois);
if (bytes > LIMITE_DE_CLAIMS_BYTES && bytes > tamanhoDosClaims(antes)) {
  recusar(`claims do dono ficariam com ${bytes} bytes (limite ${LIMITE_DE_CLAIMS_BYTES}). Nada gravado nos claims.`);
}
if (JSON.stringify(depois) !== JSON.stringify(antes)) {
  await auth.setCustomUserClaims(dono.uid, depois);
  console.log("  claims do dono gravados (sem revogar sessão)");
} else {
  console.log("  claims do dono já estavam corretos");
}

/* ------------------------------------------------------------------ */
/* 5. Conferência (getUser + releitura dos documentos)                  */
/* ------------------------------------------------------------------ */
const conferido = (await auth.getUser(dono.uid)).customClaims ?? {};
console.log("\nClaims de", EMAIL_DONO, `(${tamanhoDosClaims(conferido)} bytes de ${LIMITE_DE_CLAIMS_BYTES}):`);
console.log(JSON.stringify(conferido, null, 2));

const falhas = [];
if (conferido.redes?.[REDE_ID] !== "dono") falhas.push("claim redes[rede-navalha] != dono");
for (const id of ids) {
  if (conferido.barbershops?.[id] !== "owner") falhas.push(`claim barbershops[${id}] != owner`);
  if ((await db.doc(`barbershops/${id}`).get()).get("redeId") !== REDE_ID) falhas.push(`${id}.redeId ausente`);
  if (!(await db.doc(`barbershops/${id}/members/${dono.uid}`).get()).exists) falhas.push(`${id}: membro do dono ausente`);
}
const redeLida = await redeRef.get();
if ((redeLida.get("unidades") ?? []).length !== ids.length) falhas.push("redes/{id}.unidades com tamanho errado");
const contratoLido = await db.doc(`redes/${REDE_ID}/private/contrato`).get();
if (!(contratoLido.get("donos") ?? []).includes(dono.uid)) falhas.push("contrato sem o dono");
if ((await db.doc(`redes_slugs/${REDE_SLUG}`).get()).get("redeId") !== REDE_ID) falhas.push("redes_slugs sem o índice");

if (falhas.length) {
  console.error("\nCONFERÊNCIA FALHOU:\n - " + falhas.join("\n - "));
  process.exit(2);
}
console.log("\nConferência OK: rede, contrato, índice de slug, redeId nas 4 unidades, membros e claims do dono.");
console.log("O dono precisa sair e entrar (ou renovar o token) para enxergar os claims novos.");
