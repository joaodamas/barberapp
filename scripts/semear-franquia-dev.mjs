/**
 * Monta no DEV uma FRANQUIA FICTÍCIA ("Navalha", 4 unidades) para teste de
 * tela por tela: dono de rede, gerentes, barbeiros, cliente em 2 unidades,
 * agenda de 14 dias atrás a 14 à frente, mensalistas com a régua D-5..D+5,
 * horário fixo, encaixes e despesas.
 *
 * SÓ NO DEV. A trava é de PERMISSÃO: o projectId tem de ser exatamente
 * `crucial-baton-440119-r8` (produção é axon-barber). Recusa também se alguma
 * variável de ambiente apontar para outro projeto ou para emulador.
 *
 *   node scripts/semear-franquia-dev.mjs             # cria / completa (idempotente)
 *   node scripts/semear-franquia-dev.mjs --verificar # só lê e conta
 *   node scripts/semear-franquia-dev.mjs --apagar    # remove os 4 tenants e as contas
 *
 * Credencial: ADC (`gcloud auth application-default login`). Usa o
 * firebase-admin de functions/node_modules (do checkout atual ou, numa
 * worktree sem node_modules, de FUNCTIONS_DIR).
 *
 * A senha das contas (igual para todas) fica SÓ em um arquivo ignorado pelo
 * git (FRANQUIA_CREDENCIAIS, padrão web/.env.franquia.local). O script aborta
 * se o arquivo não estiver ignorado.
 *
 * Idempotência: ids determinísticos. Reserva que já existe NÃO é regravada
 * (regravar o status de uma concluída reverteria o financeiro). Para refazer
 * do zero: --apagar e rodar de novo.
 *
 * Os atendimentos concluídos são gravados como o servidor grava (status
 * `confirmed`) e depois ATUALIZADOS para `completed` com a forma de pagamento:
 * é o UPDATE que dispara `materializeFinancialsOnCompletion` no DEV (pagamento
 * e comissão), como o barbeiro faria — mesmo caminho do popular-dev.
 */
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
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
const RAIZ = resolve(aqui, "..");
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

const APAGAR = process.argv.includes("--apagar");
const VERIFICAR = process.argv.includes("--verificar");
const MARCA = { semeadoPor: "semear-franquia-dev" };
const DOMINIO = "teste.topete.dev";

/* ------------------------------------------------------------------ */
/* A rede                                                              */
/* ------------------------------------------------------------------ */
const UNIDADES = [
  { slug: "navalha-centro", curto: "centro", nome: "Navalha Centro", endereco: "Rua Líbero Badaró, 400 - Centro, São Paulo", barbeiros: 4, aluguel: 4800, fone: "5511900000001" },
  { slug: "navalha-moema", curto: "moema", nome: "Navalha Moema", endereco: "Av. Ibirapuera, 2100 - Moema, São Paulo", barbeiros: 3, aluguel: 5400, fone: "5511900000002" },
  { slug: "navalha-pinheiros", curto: "pinheiros", nome: "Navalha Pinheiros", endereco: "Rua dos Pinheiros, 880 - Pinheiros, São Paulo", barbeiros: 2, aluguel: 4200, fone: "5511900000003" },
  { slug: "navalha-tatuape", curto: "tatuape", nome: "Navalha Tatuapé", endereco: "Rua Tuiuti, 1500 - Tatuapé, São Paulo", barbeiros: 6, aluguel: 5200, fone: "5511900000004" },
];
const shopIdDe = (u) => `rede-${u.slug}`;
const NOMES_BARBEIROS = [
  ["Heitor Nogueira", "Matheus Caldeira", "Otto Brandão", "Lucas Varela"],
  ["Ícaro Menezes", "Rodrigo Salgado", "Davi Amorim"],
  ["Felipe Aragão", "Gael Montenegro"],
  ["Enzo Quintela", "Arthur Bittencourt", "Renan Cordeiro", "Caetano Furtado", "Leandro Ximenes", "Breno Valadares"],
];
const COMISSAO = [null, 45, 50, null, 40, 50]; // null = padrão da casa

const SERVICOS = [
  { id: "corte", name: "Corte", durationMin: 30, price: 60 },
  { id: "barba", name: "Barba", durationMin: 30, price: 40 },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 90, composicao: ["corte", "barba"] },
  { id: "infantil", name: "Corte infantil", durationMin: 30, price: 50 },
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 20 },
];
const PESO_SERVICO = [34, 20, 26, 10, 10];
const PLANOS = [
  { id: "ilimitado", name: "Ilimitado", price: 149, priceAvulso: 60, description: "Cortes sem limite no mês", unlimited: true, highlight: true, active: true },
  { id: "duplo", name: "2 cortes", price: 99, priceAvulso: 60, description: "Dois cortes por mês", servicesIncluded: 2, active: true },
];
const PRODUTOS = [
  { id: "pomada", name: "Pomada modeladora", cost: 18, price: 45, stock: 10, minStock: 3 },
  { id: "shampoo", name: "Shampoo", cost: 22, price: 55, stock: 5, minStock: 2 },
];

const PRIMEIROS = [
  "Alisson", "Benício", "Cauê", "Dionísio", "Elias", "Fabrício", "Giovani", "Hugo", "Ismael", "Joaquim",
  "Kleber", "Lauro", "Marlon", "Nilton", "Orlando", "Patrício", "Quirino", "Rúbens", "Sandro", "Telmo",
  "Ubiratã", "Valter", "Washington", "Xavier", "Yago", "Zeca", "Abel", "Brian", "Cleiton", "Douglas",
];
const SOBRENOMES = [
  "Albuquerque", "Bastos", "Cavalcante", "Drummond", "Esteves", "Falcão", "Guedes", "Holanda", "Iglesias", "Jardim",
  "Kruger", "Loureiro", "Magalhães", "Novaes", "Ouro Preto", "Peixoto", "Queiroz", "Rangel", "Sampaio", "Tavora",
  "Uchoa", "Vasques", "Wanderley", "Xisto", "Yamada", "Zanetti", "Aguiar", "Borges", "Camargo", "Dantas",
];
/* Clientes que são a MESMA pessoa (mesmo telefone) em duas unidades. */
const COMPARTILHADOS = [
  { nome: "Reinaldo Pacheco", fone: "5511900000801", em: ["centro", "moema"] },
  { nome: "Gilberto Sarmento", fone: "5511900000802", em: ["centro", "moema"] },
  { nome: "Nelson Taveira", fone: "5511900000803", em: ["centro", "moema"] },
  { nome: "Clóvis Medeiros", fone: "5511900000804", em: ["moema", "pinheiros"] },
  { nome: "Plínio Albernaz", fone: "5511900000805", em: ["moema", "pinheiros"] },
  { nome: "Ivo Castelar", fone: "5511900000806", em: ["pinheiros", "tatuape"] },
  { nome: "Mauro Bevilacqua", fone: "5511900000807", em: ["pinheiros", "tatuape"] },
  { nome: "Dagoberto Lessa", fone: "5511900000808", em: ["centro", "tatuape"] },
  { nome: "Sérgio Wanderlei", fone: "5511900000809", em: ["moema", "tatuape"] },
];
const CLIENTE_APP = { email: `cliente@${DOMINIO}`, nome: "Cliente Teste da Rede", fone: "5511900000999", em: ["centro", "moema"] };
const CLIENTES_POR_UNIDADE = 40;

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const fmtDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const diaISO = (desloc, base = Date.now()) => fmtDia.format(new Date(base + desloc * 86_400_000));
const HOJE = diaISO(0);
const agoraSP = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false })
  .format(new Date())
  .split(":")
  .map(Number);
const MIN_AGORA = agoraSP[0] * 60 + agoraSP[1];
const addDias = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diaSemana = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const competenciaAnterior = (comp) => {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const ultimoDiaDoMes = (comp) => {
  const [a, m] = comp.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
};
const vencimentoDaCompetencia = (comp, dia) => `${comp}-${String(Math.min(dia, ultimoDiaDoMes(comp))).padStart(2, "0")}`;

function prng(seed) {
  let a = createHash("sha1").update(seed).digest().readUInt32LE(0);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const escolhaPonderada = (rand, pesos) => {
  const total = pesos.reduce((s, p) => s + p, 0);
  let x = rand() * total;
  for (let i = 0; i < pesos.length; i++) {
    x -= pesos[i];
    if (x < 0) return i;
  }
  return pesos.length - 1;
};
async function emLotes(refsEDados, tamanho = 400) {
  for (let i = 0; i < refsEDados.length; i += tamanho) {
    const lote = db.batch();
    for (const op of refsEDados.slice(i, i + tamanho)) {
      if (op.tipo === "update") lote.update(op.ref, op.dados);
      else lote.set(op.ref, op.dados, { merge: true });
    }
    await lote.commit();
  }
}

/* ------------------------------------------------------------------ */
/* Credenciais (arquivo fora do git)                                    */
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
const gerarSenha = () => `Nv${randomBytes(12).toString("base64url")}9!`;

/* ------------------------------------------------------------------ */
/* Contas                                                               */
/* ------------------------------------------------------------------ */
const EMAIL = {
  dono: `dono.rede@${DOMINIO}`,
  gerente: (u) => `gerente.${u.curto}@${DOMINIO}`,
  barbeiro: (u) => `barbeiro.${u.curto}@${DOMINIO}`,
  cliente: CLIENTE_APP.email,
};
const todosEmails = () => [
  EMAIL.dono,
  EMAIL.cliente,
  ...UNIDADES.flatMap((u) => [EMAIL.gerente(u), EMAIL.barbeiro(u)]),
];

/* ------------------------------------------------------------------ */
/* --apagar                                                             */
/* ------------------------------------------------------------------ */
if (APAGAR) {
  console.log(`Projeto ${PROJETO}. Apagando a franquia fictícia...`);
  for (const u of UNIDADES) {
    const id = shopIdDe(u);
    const ref = db.doc(`barbershops/${id}`);
    const slug = await db.doc(`slugs/${u.slug}`).get();
    if (slug.exists && slug.get("barbershopId") !== id) {
      console.log(`  ${u.slug}: slug aponta para outra barbearia (${slug.get("barbershopId")}); NÃO apagado.`);
    } else {
      await db.doc(`slugs/${u.slug}`).delete();
    }
    await db.recursiveDelete(ref);
    console.log(`  ${id}: removida (com subcoleções)`);
  }
  for (const email of todosEmails()) {
    try {
      const uid = (await auth.getUserByEmail(email)).uid;
      await auth.deleteUser(uid);
      console.log(`  conta removida: ${email}`);
    } catch (e) {
      if (e.code !== "auth/user-not-found") throw e;
    }
  }
  console.log("Pronto.");
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* --verificar                                                          */
/* ------------------------------------------------------------------ */
async function verificar() {
  console.log(`Projeto ${PROJETO} · hoje ${HOJE}`);
  const cols = ["staff", "services", "plans", "clients", "bookings", "subscriptions", "subscription_invoices", "expenses", "payments", "commissions", "members"];
  for (const u of UNIDADES) {
    const ref = db.doc(`barbershops/${shopIdDe(u)}`);
    const linha = [];
    for (const c of cols) linha.push(`${c}=${(await ref.collection(c).count().get()).data().count}`);
    const porStatus = {};
    for (const d of (await ref.collection("bookings").select("status").get()).docs) {
      porStatus[d.get("status")] = (porStatus[d.get("status")] ?? 0) + 1;
    }
    console.log(`${u.slug}: ${linha.join(" ")}`);
    console.log(`   reservas por status: ${JSON.stringify(porStatus)}`);
  }
  for (const email of todosEmails()) {
    try {
      const x = await auth.getUserByEmail(email);
      console.log(`${email}: claims=${JSON.stringify(x.customClaims)}`);
    } catch {
      console.log(`${email}: INEXISTENTE`);
    }
  }
}
if (VERIFICAR) {
  await verificar();
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Pré-voo: acesso de leitura                                           */
/* ------------------------------------------------------------------ */
garantirArquivoIgnorado();
try {
  const teste = await db.collection("barbershops").limit(1).get();
  console.log(`Acesso ao Firestore do DEV (${PROJETO}) ok (${teste.size} doc lido).`);
} catch (e) {
  console.error(`SEM ACESSO ao Firestore de ${PROJETO}: ${e.message}`);
  console.error("O dono precisa rodar:  gcloud auth application-default login  e conceder Datastore User/Firebase Admin neste projeto.");
  process.exit(2);
}

/* ------------------------------------------------------------------ */
/* Contas no Auth                                                       */
/* ------------------------------------------------------------------ */
const SENHA = senhaGravada() ?? gerarSenha();
async function garantirConta(email, displayName) {
  try {
    const u = await auth.getUserByEmail(email);
    return await auth.updateUser(u.uid, { password: SENHA, displayName, emailVerified: true, disabled: false });
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    return await auth.createUser({ email, password: SENHA, displayName, emailVerified: true });
  }
}
const contas = { gerente: {}, barbeiro: {} };
contas.dono = await garantirConta(EMAIL.dono, "Dono da Rede Navalha");
contas.cliente = await garantirConta(EMAIL.cliente, CLIENTE_APP.nome);
for (const u of UNIDADES) {
  contas.gerente[u.curto] = await garantirConta(EMAIL.gerente(u), `Gerente ${u.nome}`);
  contas.barbeiro[u.curto] = await garantirConta(EMAIL.barbeiro(u), NOMES_BARBEIROS[UNIDADES.indexOf(u)][0]);
}

/* Claims: só existem os papéis `owner` e `staff` — NÃO há papel de gerente. */
const donosDe = Object.fromEntries(UNIDADES.map((u) => [shopIdDe(u), "owner"]));
await auth.setCustomUserClaims(contas.dono.uid, { barbershops: donosDe });
for (const u of UNIDADES) {
  const id = shopIdDe(u);
  const staffId = `b-${u.curto}-1`;
  await auth.setCustomUserClaims(contas.gerente[u.curto].uid, { barbershops: { [id]: "owner" } });
  await auth.setCustomUserClaims(contas.barbeiro[u.curto].uid, { barbershops: { [id]: "staff" }, equipe: { [id]: staffId } });
}

/* Arquivo de credenciais: só aqui a senha é escrita. */
{
  const linhas = [
    "# Franquia fictícia Navalha (DEV crucial-baton-440119-r8). NÃO versionar.",
    "# Gerado por scripts/semear-franquia-dev.mjs. A mesma senha vale para todas as contas.",
    `FRANQUIA_SENHA=${SENHA}`,
    "",
    "# conta | papel",
    `${EMAIL.dono} | owner das 4 unidades`,
    ...UNIDADES.map((u) => `${EMAIL.gerente(u)} | owner somente de ${u.slug} (não existe papel de gerente)`),
    ...UNIDADES.map((u) => `${EMAIL.barbeiro(u)} | staff de ${u.slug} (ficha b-${u.curto}-1, claim equipe)`),
    `${EMAIL.cliente} | cliente com reservas em navalha-centro e navalha-moema`,
    "",
  ];
  writeFileSync(ARQ_CRED, linhas.join("\n"), "utf8");
}

/* ------------------------------------------------------------------ */
/* As unidades                                                          */
/* ------------------------------------------------------------------ */
const MES = HOJE.slice(0, 7);
const MES_ANT = competenciaAnterior(MES);
/* Vencimentos da régua (dias a partir de hoje) por unidade: 3 mensalistas. */
const OFFSETS_REGUA = [
  [-5, 0, 3],
  [-2, 1, 5],
  [-4, 2, 4],
  [-1, -3, 5],
];
const resumo = [];

for (const [iu, u] of UNIDADES.entries()) {
  const SHOP_ID = shopIdDe(u);
  const SHOP = db.doc(`barbershops/${SHOP_ID}`);
  const rand = prng(`franquia:${u.slug}`);
  const ops = [];
  const set = (ref, dados) => ops.push({ tipo: "set", ref, dados });

  /* Slug: se já aponta para outra barbearia, não sobrescreve. */
  const slugSnap = await db.doc(`slugs/${u.slug}`).get();
  if (slugSnap.exists && slugSnap.get("barbershopId") !== SHOP_ID) {
    recusar(`o slug ${u.slug} já pertence a ${slugSnap.get("barbershopId")}.`);
  }
  await db.doc(`slugs/${u.slug}`).set({ barbershopId: SHOP_ID });

  /* ---- A barbearia (modelo de provisioning.ts + day-in-the-life) ---- */
  await SHOP.set(
    {
      slug: u.slug,
      /* Isenta como o piloto: nenhuma rotina de cobrança/teste age sobre ela. */
      status: "ativo",
      isento: true,
      plan: "gestao",
      trial: null,
      schedule: { weekdays: [2, 3, 4, 5, 6], opensAt: "09:00", closesAt: "20:00", breaks: [], slotMinutes: 30 },
      brand: {
        name: u.nome,
        shortName: u.nome.length <= 14 ? u.nome : u.nome.slice(0, 14).trim(),
        accentColor: ["#b8863a", "#2f6f5e", "#7a3b69", "#2b5d9b"][iu],
        themeColor: "#ffffff",
        panelLabel: "Painel do dono",
        clientTagline: "Rede Navalha",
      },
      contact: { address: u.endereco, whatsapp: u.fone },
      features: { whatsapp: true, loyalty: true, subscriptions: true, store: true, advancedFinance: true, projection: true },
      locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" },
      policies: {},
      onboarding: {
        completedSteps: ["barbearia", "servicos", "horarios", "compartilhar"],
        completedAt: FieldValue.serverTimestamp(),
        sharedLink: true,
      },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: contas.dono.uid,
    },
    { merge: true }
  );
  set(SHOP.collection("private").doc("financeiro"), {
    commissionSplit: { barberPct: 40, shopPct: 60 },
    paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
  });

  /* ---- Acesso: members (dono da rede, gerente da unidade, barbeiro) ---- */
  const addedAt = FieldValue.serverTimestamp();
  set(SHOP.collection("members").doc(contas.dono.uid), { role: "owner", email: EMAIL.dono, addedAt });
  set(SHOP.collection("members").doc(contas.gerente[u.curto].uid), { role: "owner", email: EMAIL.gerente(u), addedAt });

  /* ---- Equipe ---- */
  const equipe = [];
  for (let i = 0; i < u.barbeiros; i++) {
    const b = { id: `b-${u.curto}-${i + 1}`, name: NOMES_BARBEIROS[iu][i], uid: i === 0 ? contas.barbeiro[u.curto].uid : null };
    equipe.push(b);
    set(SHOP.collection("staff").doc(b.id), {
      name: b.name,
      active: true,
      uid: b.uid,
      serviceIds: [],
      commissionPct: COMISSAO[(i + iu) % COMISSAO.length],
      schedule: null,
      order: i + 1,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  set(SHOP.collection("members").doc(contas.barbeiro[u.curto].uid), {
    role: "staff",
    staffId: equipe[0].id,
    email: EMAIL.barbeiro(u),
    addedAt,
  });

  /* ---- Catálogo ---- */
  for (const s of SERVICOS) set(SHOP.collection("services").doc(s.id), { ...s, active: true });
  for (const p of PLANOS) set(SHOP.collection("plans").doc(p.id), p);
  for (const p of PRODUTOS) set(SHOP.collection("products").doc(p.id), p);

  /* ---- Clientes ---- */
  const clientes = [];
  const novoCliente = (c) => {
    clientes.push(c);
    set(SHOP.collection("clients").doc(c.id), {
      uid: c.uid,
      name: c.name,
      whatsapp: c.whatsapp,
      origin: c.origin,
      active: true,
      mergedInto: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...MARCA,
    });
  };
  const compartilhadosAqui = COMPARTILHADOS.filter((c) => c.em.includes(u.curto));
  const doApp = CLIENTE_APP.em.includes(u.curto);
  const nLocais = CLIENTES_POR_UNIDADE - compartilhadosAqui.length - (doApp ? 1 : 0);
  /* Mensalistas = os 3 primeiros locais (balcão). */
  const nomesUsados = new Set(COMPARTILHADOS.map((c) => c.nome));
  for (let i = 0; nomesUsados.size < 400 && clientes.length < nLocais; i++) {
    const k = (iu * 211 + i * 7 + 3) % 900;
    const nome = `${PRIMEIROS[k % 30]} ${SOBRENOMES[Math.floor(k / 30) % 30]}`;
    if (nomesUsados.has(nome)) continue;
    nomesUsados.add(nome);
    const n = clientes.length;
    const app = n >= 3 && n % 3 === 0;
    const id = app ? `c-app-${u.curto}-${n}` : `c-balcao-${u.curto}-${n}`;
    novoCliente({
      id,
      uid: app ? id : null,
      name: nome,
      whatsapp: `5511900000${String(iu * 100 + n + 10).padStart(3, "0")}`,
      origin: app ? "app" : "balcao",
    });
  }
  for (const c of compartilhadosAqui) {
    novoCliente({ id: `c-comp-${c.fone.slice(-3)}`, uid: null, name: c.nome, whatsapp: c.fone, origin: "balcao" });
  }
  const clienteApp = doApp
    ? { id: contas.cliente.uid, uid: contas.cliente.uid, name: CLIENTE_APP.nome, whatsapp: CLIENTE_APP.fone, origin: "app" }
    : null;
  if (clienteApp) novoCliente(clienteApp);
  const mensalistas = clientes.slice(0, 3);

  /* ---- Reservas ---- */
  const bookings = []; // { id, doc, final: "completed"|"no_show"|null, metodo }
  const FORMAS = ["pix", "pix", "pix", "credit", "credit", "debit", "debit", "cash"];
  const reserva = (id, c, b, servicoIds, date, time, status, origem, extra = {}) => {
    const itens = servicoIds.map((sid) => SERVICOS.find((s) => s.id === sid));
    const valor = itens.reduce((s, x) => s + x.price, 0);
    return {
      id,
      doc: {
        clientId: c.id,
        staffId: b.id,
        staffName: b.name,
        clientName: c.name,
        clientWhatsapp: c.whatsapp,
        serviceIds: servicoIds,
        serviceNames: itens.map((x) => x.name),
        date,
        time,
        durationMin: itens.reduce((s, x) => s + x.durationMin, 0),
        value: valor,
        paymentOrigin: "in_person",
        paymentMethod: null,
        status,
        origin: origem,
        requestedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        ...MARCA,
        ...extra,
      },
    };
  };
  /* O sorteio do desfecho. `final` = para onde o UPDATE leva depois. */
  const desfecho = (date, minInicio) => {
    const passou = date < HOJE || (date === HOJE && minInicio + 30 < MIN_AGORA);
    if (passou) {
      const x = rand();
      if (x < 0.8) return { status: "confirmed", final: "completed" };
      if (x < 0.87) return { status: "confirmed", final: "no_show" };
      if (x < 0.95) return { status: "cancelled_by_client", final: null };
      return { status: "cancelled_by_shop", final: null };
    }
    const x = rand();
    if (x < 0.82) return { status: "confirmed", final: null };
    if (x < 0.92) return { status: "confirmed_by_client", final: null };
    return { status: "cancelled_by_client", final: null };
  };
  const formaDe = () => FORMAS[Math.floor(rand() * FORMAS.length)];
  const escolheCliente = () => {
    if (clienteApp && rand() < 0.05) return clienteApp;
    return clientes[Math.floor(rand() * clientes.length)];
  };

  /* Horário fixo: mensalista[0], quarta 10:00, barbeiro 1, corte + barba, semanal. */
  const fixoSub = `sub-${u.curto}-1`;
  const primeiraQuarta = (() => {
    let d = addDias(HOJE, -14);
    while (diaSemana(d) !== 3) d = addDias(d, 1);
    return d;
  })();
  const horarioFixo = { diaDaSemana: 3, hora: "10:00", staffId: equipe[0].id, serviceIds: ["corte-barba"], frequencia: "semanal", inicio: primeiraQuarta };
  const versao = createHash("sha1")
    .update(JSON.stringify([3, "10:00", equipe[0].id, ["corte-barba"], "semanal"]))
    .digest("hex")
    .slice(0, 8);
  const reservado = new Set(); // `${staffId}|${data}|${minuto}` ocupado pelo fixo
  for (let d = primeiraQuarta; d <= addDias(HOJE, 14); d = addDias(d, 7)) {
    for (const m of [600, 630]) reservado.add(`${equipe[0].id}|${d}|${m}`);
    const des = desfecho(d, 600);
    const r = reserva(`fixo_${fixoSub}_${versao}_${d}`, mensalistas[0], equipe[0], ["corte-barba"], d, "10:00", des.status, "fixo", {
      horarioFixoId: fixoSub,
    });
    bookings.push({ ...r, final: des.final, metodo: formaDe() });
  }

  /* Agenda: por barbeiro e dia aberto. */
  let seq = 0;
  for (let off = -14; off <= 14; off++) {
    const date = addDias(HOJE, off);
    if (![2, 3, 4, 5, 6].includes(diaSemana(date))) continue;
    const densidade = off <= 0 ? 0.36 : 0.26;
    for (const b of equipe) {
      let t = 9 * 60;
      while (t < 20 * 60) {
        if (reservado.has(`${b.id}|${date}|${t}`) || rand() > densidade) {
          t += 30;
          continue;
        }
        const sid = SERVICOS[escolhaPonderada(rand, PESO_SERVICO)].id;
        const s = SERVICOS.find((x) => x.id === sid);
        const blocos = Math.ceil(s.durationMin / 30);
        let livre = t + blocos * 30 <= 20 * 60;
        for (let k = 0; k < blocos && livre; k++) if (reservado.has(`${b.id}|${date}|${t + k * 30}`)) livre = false;
        if (!livre) {
          t += 30;
          continue;
        }
        const c = escolheCliente();
        const des = desfecho(date, t);
        const r = reserva(`fr-${u.curto}-${off + 14}-${b.id.slice(-1)}-${seq++}`, c, b, [sid], date, hhmm(t), des.status, c.uid ? "app" : "balcao");
        bookings.push({ ...r, final: des.final, metodo: formaDe() });
        t += blocos * 30;
      }
    }
  }

  /* Dois encaixes pendentes, em cima de reservas futuras confirmadas. */
  const futurasConfirmadas = bookings.filter(
    (b) => b.doc.status === "confirmed" && b.doc.date >= addDias(HOJE, 2) && b.doc.origin !== "fixo"
  );
  for (let e = 0; e < 2; e++) {
    const alvo = futurasConfirmadas[Math.floor(futurasConfirmadas.length * (0.25 + 0.4 * e))];
    const c = clientes.filter((x) => x.id !== alvo.doc.clientId)[5 + e * 4];
    const b = equipe.find((x) => x.id === alvo.doc.staffId);
    const r = reserva(`enc-${u.curto}-${e + 1}`, c, b, alvo.doc.serviceIds, alvo.doc.date, alvo.doc.time, "fit_in_requested", c.uid ? "app" : "balcao", {
      isFitIn: true,
    });
    bookings.push({ ...r, final: null, metodo: null });
  }

  /* Cria o que não existe; atualiza para o desfecho só o que ainda está `confirmed`. */
  const refsB = bookings.map((b) => SHOP.collection("bookings").doc(b.id));
  const existentes = new Map();
  for (let i = 0; i < refsB.length; i += 300) {
    const docs = await db.getAll(...refsB.slice(i, i + 300), { fieldMask: ["status"] });
    docs.forEach((d) => d.exists && existentes.set(d.id, d.get("status")));
  }
  const criar = [];
  const concluir = [];
  for (const b of bookings) {
    const ref = SHOP.collection("bookings").doc(b.id);
    const atual = existentes.get(b.id);
    if (atual === undefined) criar.push({ tipo: "set", ref, dados: b.doc });
    if (b.final && (atual === undefined || atual === "confirmed")) {
      concluir.push({
        tipo: "update",
        ref,
        dados: b.final === "completed" ? { status: "completed", paymentMethod: b.metodo } : { status: "no_show" },
      });
    }
  }

  /* ---- Mensalistas, faturas (régua D-5..D+5) ---- */
  mensalistas.forEach((c, i) => {
    const subId = `sub-${u.curto}-${i + 1}`;
    const plano = i === 0 ? PLANOS[0] : PLANOS[(i + iu) % 2];
    const vence = addDias(HOJE, OFFSETS_REGUA[iu][i]);
    const billingDay = Number(vence.slice(8, 10));
    const compAtual = vence.slice(0, 7);
    const compAnt = competenciaAnterior(compAtual);
    set(SHOP.collection("subscriptions").doc(subId), {
      clientId: c.id,
      clientName: c.name,
      name: c.name,
      planId: plano.id,
      planName: plano.name,
      price: plano.price,
      unlimited: plano.unlimited === true,
      servicesIncluded: plano.servicesIncluded ?? null,
      billingDay,
      status: "ativo",
      startedAt: `${compAnt}-01`,
      canceledAt: null,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: contas.dono.uid,
      ...(i === 0 ? { horarioFixo } : {}),
      ...MARCA,
    });
    for (const comp of [compAnt, compAtual]) {
      const paga = comp === compAnt;
      const dueDate = vencimentoDaCompetencia(comp, billingDay);
      set(SHOP.collection("subscription_invoices").doc(`fatura_${subId}_${comp}`), {
        subscriptionId: subId,
        clientId: c.id,
        competencia: comp,
        dueDate,
        amount: plano.price,
        planName: plano.name,
        status: paga ? "paga" : "aberta",
        paidAt: paga ? dueDate : null,
        paymentMethod: paga ? "pix" : null,
        emitidaEm: FieldValue.serverTimestamp(),
        ...MARCA,
      });
    }
  });

  /* ---- Despesas ---- */
  const dia = (n) => (HOJE.slice(0, 7) + "-" + String(Math.min(n, Number(HOJE.slice(8, 10)))).padStart(2, "0"));
  const despesas = [
    { id: `desp-${MES_ANT}-aluguel`, category: "Aluguel", description: `Aluguel ${u.nome}`, supplier: "Imobiliária Fictícia Ltda", value: u.aluguel, date: `${MES_ANT}-05`, payment: "Boleto", recurring: true },
    { id: `desp-${MES}-aluguel`, category: "Aluguel", description: `Aluguel ${u.nome}`, supplier: "Imobiliária Fictícia Ltda", value: u.aluguel, date: dia(5), payment: "Boleto", recurring: true },
    { id: `desp-${MES}-produtos`, category: "Insumos e produtos", description: "Pomadas, lâminas e descartáveis", supplier: "Distribuidora Fio de Navalha", value: 680 + iu * 90, date: dia(3), payment: "Pix", recurring: false },
    { id: `desp-${MES}-energia`, category: "Energia/Água", description: "Conta de luz e água", supplier: "Concessionária Fictícia", value: 540 + iu * 35, date: dia(7), payment: "Boleto", recurring: true },
  ];
  for (const d of despesas) {
    const { id, ...resto } = d;
    set(SHOP.collection("expenses").doc(id), { ...resto, ...MARCA });
  }

  await emLotes(ops);
  await emLotes(criar);
  /* Só agora o UPDATE que dispara o financeiro. */
  await emLotes(concluir, 200);

  const porStatus = (st) => bookings.filter((b) => b.doc.status === st || b.final === st).length;
  resumo.push({
    u: u.slug,
    barbeiros: equipe.length,
    clientes: clientes.length,
    reservas: bookings.length,
    novas: criar.length,
    concluidas: bookings.filter((b) => b.final === "completed").length,
    faltas: porStatus("no_show"),
    canceladas: bookings.filter((b) => b.doc.status.startsWith("cancelled")).length,
    futuras: bookings.filter((b) => b.doc.date >= HOJE && b.doc.status.startsWith("confirmed") && !b.final).length,
    encaixes: 2,
    mensalistas: mensalistas.length,
  });
  console.log(`  ${SHOP_ID}: ok (${criar.length} reservas novas, ${concluir.length} concluídas/faltas enviadas ao gatilho)`);
}

console.log("\nFRANQUIA FICTÍCIA SEMEADA (DEV)");
console.table(resumo);
console.log(`Credenciais (senha) em: ${ARQ_CRED}`);
console.log("Rode com --verificar para conferir contagens, claims e o financeiro materializado pelo gatilho.");
process.exit(0);
