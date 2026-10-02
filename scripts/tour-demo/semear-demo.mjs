/**
 * Semeia a "Barbearia Navalha" — barbearia FICTÍCIA do tour de apresentação.
 * SÓ NO EMULADOR.
 *
 * O tour mostra o app de verdade, e um app vazio não vende nada: aqui entra um
 * mês de movimento (histórico concluído pelo mesmo gatilho financeiro da
 * conclusão real, para DRE, fluxo de caixa, projeção e números terem o que
 * mostrar), uma agenda de hoje cheia, mensalistas com horário fixo, um pedido
 * de encaixe esperando aprovação, loja, despesas e um cliente com conta.
 *
 * Nomes, telefones e valores são inventados. Nenhum dado de barbearia real.
 *
 * "Hoje" do tour (`REF`): a gravação congela o relógio do navegador num
 * horário de movimento (15h). Precisa ser ANTES do relógio real — o token do
 * Firebase vence pelo relógio do navegador, e um relógio adiantado o daria por
 * vencido. Então: depois das 15h de São Paulo, REF é hoje às 15h; antes, é
 * ontem às 15h. O REF vai para `saida/ref.json`, que o `gravar-tour` lê.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { mkdirSync, writeFileSync } from "node:fs";

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error("RECUSADO: só roda contra emulador (FIRESTORE_EMULATOR_HOST e FIREBASE_AUTH_EMULATOR_HOST).");
  process.exit(1);
}
const PROJETO = process.env.PROJETO_EMULADOR ?? "demo-tour";
initializeApp({ projectId: PROJETO });
const db = getFirestore();
const auth = getAuth();

/* Nome, endereço e cor vêm do ambiente — para gerar o tour com o nome do
 * prospect. O padrão é a Navalha, inventada. Nunca o nome de um cliente real
 * sem o consentimento dele. */
const NOME = process.env.DEMO_NOME || "Barbearia Navalha";
const SLUG = (process.env.DEMO_SLUG || "navalha").toLowerCase().replace(/[^a-z0-9-]/g, "");
const CURTO = process.env.DEMO_NOME_CURTO || NOME.replace(/^barbearia\s+/i, "");
const COR = /^#[0-9a-f]{6}$/i.test(process.env.DEMO_COR ?? "") ? process.env.DEMO_COR : "#b8863a";
const SHOP = `shop-${SLUG}`;
const shopRef = db.doc(`barbershops/${SHOP}`);
const FUNCOES = `http://127.0.0.1:5001/${PROJETO}/southamerica-east1`;

/* Credenciais de TESTE, só existem no emulador. */
export const DONO = { email: "dono@navalha.teste", senha: "navalha12345", nome: "Diego Martins" };
export const CLIENTE = { email: "cliente@navalha.teste", senha: "cliente12345", nome: "Lucas Ferreira" };

/* ---- Relógio de referência ---- */
const SP = "America/Sao_Paulo";
const isoSP = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: SP }).format(d);
const horaSP = Number(new Intl.DateTimeFormat("en-US", { timeZone: SP, hour: "numeric", hourCycle: "h23" }).format(new Date()));
const hojeReal = isoSP(new Date());
const somaDias = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diaSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
let REF_DIA = horaSP >= 15 ? hojeReal : somaDias(hojeReal, -1);
/* Domingo a barbearia fecha: o tour num domingo mostraria a agenda vazia. */
if (diaSemana(REF_DIA) === 0) REF_DIA = somaDias(REF_DIA, -1);
const REF_HORA = "15:00";
/* São Paulo é UTC−3 o ano todo (sem horário de verão desde 2019). */
const REF_ISO = `${REF_DIA}T${REF_HORA}:00-03:00`;
const SAIDA = new URL("./saida/", import.meta.url).pathname;
mkdirSync(SAIDA, { recursive: true });
writeFileSync(SAIDA + "ref.json", JSON.stringify({ ref: REF_ISO, dia: REF_DIA, hora: REF_HORA, nome: NOME, slug: SLUG }));
console.log("REF do tour:", REF_ISO, "(hoje real:", hojeReal, horaSP + "h)");

/* Aleatório com semente: duas rodadas gravam o mesmo mês. */
let semente = 20261002;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
const escolha = (lista) => lista[Math.floor(rnd() * lista.length)];
const pesado = (pares) => {
  const total = pares.reduce((s, [, p]) => s + p, 0);
  let r = rnd() * total;
  for (const [v, p] of pares) if ((r -= p) <= 0) return v;
  return pares[0][0];
};

/* ---- Contas ---- */
async function conta({ email, senha, nome }) {
  try {
    return await auth.getUserByEmail(email);
  } catch {
    return auth.createUser({ email, password: senha, displayName: nome, emailVerified: true });
  }
}
const dono = await conta(DONO);
await auth.setCustomUserClaims(dono.uid, { barbershops: { [SHOP]: "owner" } });
const clienteConta = await conta(CLIENTE);

/* ---- A barbearia ---- */
await db.doc(`slugs/${SLUG}`).set({ barbershopId: SHOP });
await shopRef.set({
  slug: SLUG,
  status: "ativo",
  plan: "gestao",
  trial: null,
  features: { whatsapp: true, loyalty: true, subscriptions: true, store: true, advancedFinance: true },
  /* Sem `logo`: a barbearia sem logo próprio ganha o monograma dela. */
  brand: {
    name: NOME,
    shortName: CURTO,
    accentColor: COR,
    themeColor: "#ffffff",
    panelLabel: "Painel do dono",
    clientTagline: "Corte, barba e resenha",
  },
  contact: { address: "Av. Paulista, 1000 — loja 12", whatsapp: "5511900000000" },
  locale: { timeZone: SP, currency: "BRL", locale: "pt-BR" },
  schedule: {
    weekdays: [1, 2, 3, 4, 5, 6],
    opensAt: "09:00",
    closesAt: "19:00",
    breaks: [{ from: "12:00", to: "13:00" }],
    slotMinutes: 30,
  },
  policies: { booking: { lateToleranceMinutes: 15 } },
  onboarding: {
    completedSteps: ["barbearia", "servicos", "horarios", "compartilhar"],
    completedAt: FieldValue.serverTimestamp(),
    sharedLink: true,
  },
  createdAt: FieldValue.serverTimestamp(),
  createdBy: dono.uid,
});
await db.doc(`barbershops/${SHOP}/private/financeiro`).set({
  paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
});
await db.doc(`barbershops/${SHOP}/members/${dono.uid}`).set({
  role: "owner",
  email: DONO.email,
  addedAt: FieldValue.serverTimestamp(),
});

/* ---- Equipe: três barbeiros ---- */
const EQUIPE = [
  { id: "b-diego", name: "Diego", commissionPct: null, uid: dono.uid, order: 1 },
  { id: "b-thiago", name: "Thiago", commissionPct: 45, uid: null, order: 2 },
  { id: "b-caio", name: "Caio", commissionPct: 40, uid: null, order: 3 },
];
for (const b of EQUIPE) {
  await db.doc(`barbershops/${SHOP}/staff/${b.id}`).set({
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
const nomeDoBarbeiro = Object.fromEntries(EQUIPE.map((b) => [b.id, b.name]));

/* ---- Catálogo, com dois combos ---- */
const SERVICOS = [
  { id: "corte", name: "Corte", durationMin: 30, price: 50 },
  { id: "barba", name: "Barba", durationMin: 30, price: 35 },
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 15 },
  { id: "infantil", name: "Corte infantil", durationMin: 30, price: 40 },
  { id: "pigmentacao", name: "Pigmentação", durationMin: 30, price: 45 },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 75, composicao: ["corte", "barba"] },
  { id: "completo", name: "Completo (corte, barba e sobrancelha)", durationMin: 70, price: 85, composicao: ["corte", "barba", "sobrancelha"] },
];
for (const s of SERVICOS) await db.doc(`barbershops/${SHOP}/services/${s.id}`).set({ ...s, active: true });
const servico = Object.fromEntries(SERVICOS.map((s) => [s.id, s]));

/* ---- Loja ---- */
for (const p of [
  { id: "pomada", name: "Pomada modeladora", cost: 18, price: 45, stock: 12, minStock: 3 },
  { id: "oleo", name: "Óleo para barba", cost: 20, price: 49, stock: 2, minStock: 3 },
  { id: "shampoo", name: "Shampoo antiqueda", cost: 22, price: 55, stock: 8, minStock: 2 },
  { id: "cera", name: "Cera efeito seco", cost: 15, price: 39, stock: 6, minStock: 2 },
]) await db.doc(`barbershops/${SHOP}/products/${p.id}`).set(p);

/* ---- Planos de mensalista ---- */
for (const p of [
  { id: "ilimitado", name: "Ilimitado", price: 149, priceAvulso: 50, description: "Cortes sem limite no mês", unlimited: true, highlight: true, active: true },
  { id: "duplo", name: "2 cortes", price: 89, priceAvulso: 50, description: "Dois cortes por mês", servicesIncluded: 2, active: true },
  { id: "barba-mensal", name: "Corte + barba (4x)", price: 239, priceAvulso: 75, description: "Quatro corte + barba por mês", servicesIncluded: 4, active: true },
]) await db.doc(`barbershops/${SHOP}/plans/${p.id}`).set(p);

/* ---- Carteira: 30 clientes inventados ---- */
const NOMES = [
  "Rafael Costa", "Bruno Almeida", "Gustavo Ribeiro", "Matheus Oliveira", "Pedro Henrique Souza",
  "Felipe Carvalho", "André Lima", "Ricardo Gomes", "Vinícius Rocha", "João Vitor Dias",
  "Leonardo Martins", "Gabriel Pereira", "Eduardo Barbosa", "Rodrigo Teixeira", "Marcelo Araújo",
  "Daniel Moreira", "Thiago Nunes", "Henrique Castro", "Caio Fernandes", "Samuel Pinto",
  "Arthur Mendes", "Igor Cardoso", "Renan Correia", "Fábio Monteiro", "Otávio Freitas",
  "Murilo Batista", "Davi Ramos", "Enzo Vieira", "Alexandre Duarte", "Paulo Sérgio Melo",
];
const fone = (i) => `1197${String(1000000 + i * 37171).slice(-7)}`;
const CLIENTES = NOMES.map((name, i) => ({ id: `cli-${String(i + 1).padStart(2, "0")}`, name, whatsapp: fone(i) }));
for (const c of CLIENTES) {
  await db.doc(`barbershops/${SHOP}/clients/${c.id}`).set({
    uid: null, name: c.name, whatsapp: c.whatsapp, origin: pesado([["balcao", 1], ["app", 2]]), active: true,
    createdAt: FieldValue.serverTimestamp(),
  });
}
/* O cliente com conta: o cadastro tem o id do uid, como o app cria. */
await db.doc(`barbershops/${SHOP}/clients/${clienteConta.uid}`).set({
  uid: clienteConta.uid, name: CLIENTE.nome, whatsapp: "11974440000", origin: "app", active: true,
  createdAt: FieldValue.serverTimestamp(),
});
const LUCAS = { id: clienteConta.uid, name: CLIENTE.nome, whatsapp: "11974440000" };

/* ---- Callables com o token do dono ---- */
const login = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
  { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: DONO.email, password: DONO.senha, returnSecureToken: true }) }
).then((r) => r.json());
if (!login.idToken) throw new Error("login do dono falhou: " + JSON.stringify(login));
async function chamar(nome, dados) {
  const r = await fetch(`${FUNCOES}/${nome}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${login.idToken}` },
    body: JSON.stringify({ data: { barbershopId: SHOP, ...dados } }),
  });
  const corpo = await r.text();
  let j;
  try { j = JSON.parse(corpo); } catch { j = { error: { message: corpo.slice(0, 200) } }; }
  if (j.error) {
    console.warn(`  ${nome} recusou:`, j.error.message);
    return null;
  }
  return j.result;
}

/* ---- Mensalistas: seis, quatro com horário fixo ---- */
const MENSALISTAS = [
  { c: 0, plano: "ilimitado", fixo: { dia: 2, hora: "18:00", staffId: "b-diego", serviceIds: ["corte"] } },
  { c: 1, plano: "barba-mensal", fixo: { dia: 4, hora: "18:00", staffId: "b-thiago", serviceIds: ["corte-barba"] } },
  { c: 2, plano: "duplo", fixo: { dia: 5, hora: "18:30", staffId: "b-caio", serviceIds: ["corte"] } },
  { c: 3, plano: "ilimitado", fixo: { dia: 6, hora: "09:00", staffId: "b-diego", serviceIds: ["corte"] } },
  { c: 4, plano: "duplo" },
  { c: 5, plano: "ilimitado" },
];
const proximoDia = (diaDaSemana) => {
  let d = hojeReal;
  while (diaSemana(d) !== diaDaSemana) d = somaDias(d, 1);
  return d;
};
for (const m of MENSALISTAS) {
  const r = await chamar("criarMensalista", { clientId: CLIENTES[m.c].id, planId: m.plano, billingDay: 1 });
  if (r?.subscriptionId && m.fixo) {
    await chamar("definirHorarioFixo", {
      subscriptionId: r.subscriptionId,
      horarioFixo: {
        diaDaSemana: m.fixo.dia, hora: m.fixo.hora, staffId: m.fixo.staffId, serviceIds: m.fixo.serviceIds,
        frequencia: "semanal", inicio: proximoDia(m.fixo.dia),
      },
    });
  }
  console.log("  mensalista", CLIENTES[m.c].name, m.plano, m.fixo ? `fixo ${m.fixo.hora}` : "");
}
const faturas = await chamar("gerarFaturasDoMes", {});
const abertas = await shopRef.collection("subscriptionInvoices").get();
let pagas = 0;
for (const f of abertas.docs) {
  if (pagas >= 4) break;
  if (await chamar("registrarPagamentoDeMensalidade", { invoiceId: f.id, paymentMethod: "pix" })) pagas++;
}
console.log("  faturas:", abertas.size, "· pagas:", pagas, faturas ? "" : "(gerar falhou)");

/* ---- Agenda: ocupação em memória, para não sobrepor ninguém ---- */
const ocupado = new Map(); // `${staff}|${date}` → [[ini, fim]]
const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
for (const d of (await shopRef.collection("bookings").get()).docs) {
  const b = d.data();
  const k = `${b.staffId}|${b.date}`;
  ocupado.set(k, [...(ocupado.get(k) ?? []), [minutos(b.time), minutos(b.time) + (b.durationMin ?? 30)]]);
}
function livre(staffId, date, time, dur) {
  const ini = minutos(time), fim = ini + dur;
  if (ini < 9 * 60 || fim > 19 * 60) return false;
  if (ini < 13 * 60 && fim > 12 * 60) return false; // almoço
  return !(ocupado.get(`${staffId}|${date}`) ?? []).some(([a, b]) => ini < b && fim > a);
}
function ocupar(staffId, date, time, dur) {
  const k = `${staffId}|${date}`;
  ocupado.set(k, [...(ocupado.get(k) ?? []), [minutos(time), minutos(time) + dur]]);
}

let seq = 0;
function reserva({ cliente, staffId, serviceIds, date, time, status = "confirmed", origin = "app", extra = {} }) {
  const itens = serviceIds.map((id) => servico[id]);
  const dur = itens.reduce((s, x) => s + x.durationMin, 0);
  ocupar(staffId, date, time, dur);
  const ref = shopRef.collection("bookings").doc(`demo-${date}-${String(++seq).padStart(4, "0")}`);
  return {
    ref,
    doc: {
      clientId: cliente.id,
      staffId,
      staffName: nomeDoBarbeiro[staffId],
      clientName: cliente.name,
      clientWhatsapp: cliente.whatsapp ?? "",
      serviceIds,
      serviceNames: itens.map((x) => x.name),
      date,
      time,
      durationMin: dur,
      value: itens.reduce((s, x) => s + x.price, 0),
      paymentOrigin: "in_person",
      paymentMethod: null,
      status,
      origin,
      requestedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      ...extra,
    },
  };
}
const MISTURA = [[["corte"], 45], [["corte-barba"], 25], [["barba"], 10], [["completo"], 8], [["infantil"], 5], [["corte", "sobrancelha"], 4], [["pigmentacao"], 3]];
const METODO = [["pix", 50], ["credit", 20], ["debit", 20], ["cash", 10]];
const HORAS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30"];

/* Grava em aberto e depois conclui: é a TRANSIÇÃO que dispara o gatilho
 * financeiro (pagamento + comissão), como na conclusão de verdade. */
const aConcluir = [];
async function gravar(r, final) {
  await r.ref.set(r.doc);
  if (final) aConcluir.push([r.ref, final]);
}

/* ---- 30 dias de histórico ---- */
let historico = 0;
for (let n = 30; n >= 1; n--) {
  const date = somaDias(REF_DIA, -n);
  if (diaSemana(date) === 0) continue;
  const sabado = diaSemana(date) === 6;
  for (const b of EQUIPE) {
    const quantos = Math.floor((sabado ? 7 : 4) + rnd() * 4);
    for (let i = 0; i < quantos; i++) {
      const serviceIds = pesado(MISTURA);
      const dur = serviceIds.reduce((s, id) => s + servico[id].durationMin, 0);
      const time = escolha(HORAS);
      if (!livre(b.id, date, time, dur)) continue;
      const fim = pesado([["completed", 90], ["no_show", 4], ["cancelled_by_client", 6]]);
      const r = reserva({ cliente: escolha(CLIENTES), staffId: b.id, serviceIds, date, time, origin: pesado([["app", 3], ["balcao", 2]]) });
      await gravar(r, fim === "completed" ? { status: "completed", paymentMethod: pesado(METODO) } : { status: fim });
      historico++;
    }
  }
}
/* O cliente com conta tem histórico também — a tela Reservas dele não fica vazia. */
for (const [n, sv] of [[24, ["corte"]], [17, ["corte-barba"]], [10, ["corte"]]]) {
  const date = somaDias(REF_DIA, -n);
  if (diaSemana(date) === 0) continue;
  const time = HORAS.find((h) => livre("b-diego", date, h, 60)) ?? "18:00";
  await gravar(reserva({ cliente: LUCAS, staffId: "b-diego", serviceIds: sv, date, time }), { status: "completed", paymentMethod: "pix" });
}

/* ---- Hoje (REF): cheia. O que terminou antes das 15h está concluído ---- */
const HOJE_PLANO = {
  "b-diego": [["09:00", ["corte"]], ["09:30", ["corte-barba"]], ["10:30", ["corte"]], ["11:00", ["barba"]], ["13:00", ["completo"]], ["14:30", ["corte"]], ["15:00", ["corte-barba"]], ["16:30", ["corte"]], ["17:30", ["corte", "sobrancelha"]]],
  "b-thiago": [["09:00", ["corte-barba"]], ["10:00", ["corte"]], ["11:00", ["pigmentacao"]], ["13:30", ["corte"]], ["14:00", ["barba"]], ["15:30", ["corte"]], ["16:00", ["completo"]], ["17:30", ["corte-barba"]]],
  "b-caio": [["09:30", ["infantil"]], ["10:30", ["corte"]], ["11:30", ["corte"]], ["13:00", ["corte-barba"]], ["14:30", ["corte"]], ["15:00", ["corte"]], ["16:00", ["barba"]], ["17:00", ["corte"]]],
};
const REF_MIN = minutos(REF_HORA);
let idx = 6;
for (const [staffId, lista] of Object.entries(HOJE_PLANO)) {
  for (const [time, serviceIds] of lista) {
    const dur = serviceIds.reduce((s, id) => s + servico[id].durationMin, 0);
    if (!livre(staffId, REF_DIA, time, dur)) continue;
    const r = reserva({ cliente: CLIENTES[idx++ % CLIENTES.length], staffId, serviceIds, date: REF_DIA, time, origin: pesado([["app", 3], ["balcao", 2]]) });
    const terminou = minutos(time) + dur <= REF_MIN;
    await gravar(r, terminou ? { status: "completed", paymentMethod: pesado(METODO) } : null);
  }
}
/* Um encaixe já aprovado hoje — aparece em azul na grade. */
{
  const r = reserva({ cliente: CLIENTES[20], staffId: "b-thiago", serviceIds: ["barba"], date: REF_DIA, time: "16:00", origin: "app", extra: { isFitIn: true } });
  await gravar(r, null);
}

/* ---- Próximos dias ---- */
for (let n = 1; n <= 6; n++) {
  const date = somaDias(REF_DIA, n);
  if (diaSemana(date) === 0) continue;
  for (const b of EQUIPE) {
    const quantos = Math.max(1, Math.floor((7 - n) * 0.9 + rnd() * 2));
    for (let i = 0; i < quantos; i++) {
      const serviceIds = pesado(MISTURA);
      const dur = serviceIds.reduce((s, id) => s + servico[id].durationMin, 0);
      const time = escolha(HORAS);
      if (!livre(b.id, date, time, dur)) continue;
      await gravar(reserva({ cliente: escolha(CLIENTES), staffId: b.id, serviceIds, date, time }), null);
    }
  }
}
/* O cliente com conta tem um horário marcado. */
{
  let date = somaDias(REF_DIA, 4);
  if (diaSemana(date) === 0) date = somaDias(date, 1);
  const time = HORAS.find((h) => livre("b-diego", date, h, 30)) ?? "11:00";
  await gravar(reserva({ cliente: LUCAS, staffId: "b-diego", serviceIds: ["corte"], date, time }), null);
}

/* ---- O pedido de encaixe esperando aprovação ----
 * Dois dias à frente do REF: é sempre futuro no relógio REAL, senão aprovar
 * na gravação devolveria "expirado". Por cima de um horário ocupado do Thiago. */
{
  let date = somaDias(REF_DIA, 2);
  if (diaSemana(date) === 0) date = somaDias(date, 1);
  const base = HORAS.find((h) => !livre("b-thiago", date, h, 30)) ?? "16:00";
  if (livre("b-thiago", date, base, 30)) await gravar(reserva({ cliente: CLIENTES[22], staffId: "b-thiago", serviceIds: ["corte"], date, time: base }), null);
  /* Um pedido por aparelho gravado: o celular aprova um, o computador o outro. */
  for (const c of [23, 24]) {
    const r = reserva({ cliente: CLIENTES[c], staffId: "b-thiago", serviceIds: ["corte"], date, time: base, origin: "app", extra: { isFitIn: true } });
    r.doc.status = "fit_in_requested";
    await gravar(r, null);
  }
  console.log("  encaixes pendentes: 2 ·", date, base);
}

/* ---- Conclui em lotes: o gatilho do emulador materializa cada uma ---- */
for (let i = 0; i < aConcluir.length; i += 12) {
  await Promise.all(aConcluir.slice(i, i + 12).map(([ref, final]) => ref.update(final)));
  await new Promise((r) => setTimeout(r, 400));
}
console.log("  histórico:", historico, "· transições:", aConcluir.length);

/* ---- Vendas da loja (hoje, no relógio real do servidor) ---- */
for (const [itens, paymentMethod, staffId] of [
  [[{ productId: "pomada", quantity: 1 }], "pix", "b-diego"],
  [[{ productId: "shampoo", quantity: 1 }, { productId: "cera", quantity: 1 }], "credit", "b-thiago"],
  [[{ productId: "pomada", quantity: 2 }], "cash", "b-caio"],
]) await chamar("registrarVendaDeProduto", { itens, paymentMethod, staffId, idempotencyKey: `demo-${itens[0].productId}-${staffId}` });

/* ---- Despesas do mês e do anterior ---- */
const mesRef = REF_DIA.slice(0, 7);
const mesAnt = somaDias(`${mesRef}-01`, -1).slice(0, 7);
for (const [mes, lista] of [[mesAnt, 1], [mesRef, 0]]) {
  for (const e of [
    { category: "Aluguel", description: "Aluguel do ponto", supplier: "Imobiliária Paulista", value: 2400, dia: "05", payment: "Boleto", recurring: true },
    { category: "Energia", description: "Conta de luz", supplier: "Distribuidora", value: 410, dia: "10", payment: "Pix", recurring: true },
    { category: "Água", description: "Conta de água", supplier: "Saneamento", value: 120, dia: "10", payment: "Pix", recurring: true },
    { category: "Internet", description: "Internet fibra", supplier: "Provedor", value: 110, dia: "12", payment: "Cartão", recurring: true },
    { category: "Produtos", description: "Reposição de lâminas e toalhas", supplier: "Distribuidora Barber", value: 380 + lista * 90, dia: "15", payment: "Pix", recurring: false },
    { category: "Marketing", description: "Impulsionamento Instagram", supplier: "Meta", value: 150, dia: "18", payment: "Cartão", recurring: false },
  ]) {
    /* No mês do REF, o que venceria depois dele entra no próprio REF: a tela
     * de despesas do mês corrente não fica vazia num começo de mês. */
    const date = `${mes}-${e.dia}` > REF_DIA ? REF_DIA : `${mes}-${e.dia}`;
    const { dia, ...resto } = e;
    await shopRef.collection("expenses").add({ ...resto, date });
  }
}

/* Dá tempo aos gatilhos do emulador. */
await new Promise((r) => setTimeout(r, 8000));
const [pag, com] = await Promise.all([shopRef.collection("payments").count().get(), shopRef.collection("commissions").count().get()]);
console.log(`SEMEADO: ${NOME} (${SLUG}) · pagamentos`, pag.data().count, "· comissões", com.data().count);
process.exit(0);
