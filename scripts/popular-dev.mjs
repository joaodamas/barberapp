/**
 * Popula a barbearia de teste do DEV com um movimento FICTÍCIO (03/10).
 *
 * Para ver funcionando o que não aparece com a base vazia:
 *  - Hoje: dia cheio e encerrado, dois barbeiros, recebido por forma, e
 *    amanhã com horários (cartão "Agora" com "Por barbeiro" e "Amanhã");
 *  - Mensalistas: quem começou no fim de setembro, com setembro e outubro em
 *    aberto ("Atrasada · N dias", "Pago em", "Não cobrar");
 *  - Clientes: cadastros de app e de balcão, e um par com o MESMO número
 *    (faixa "Mesmo número de … — Vincular").
 *
 * Nomes e telefones inventados (prefixo 11 90000-). Rodar de novo apaga o que
 * este script criou (marca `semeadoPor: "popular-dev"`) e cria de novo.
 *
 *   SEMEAR_DEV=crucial-baton-440119-r8 node scripts/popular-dev.mjs
 *
 * Roda de dentro de functions/ (usa o firebase-admin de lá):
 *   cd functions && SEMEAR_DEV=crucial-baton-440119-r8 node ../scripts/popular-dev.mjs
 */
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(join(process.cwd(), "package.json"));
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

/* Lista de PERMISSÃO: só o DEV, pedido por nome. Produção nunca. */
const PROJETO_DEV = "crucial-baton-440119-r8";
if (process.env.SEMEAR_DEV !== PROJETO_DEV) {
  console.error(`RECUSADO: rode com SEMEAR_DEV=${PROJETO_DEV}. Este script não roda em produção.`);
  process.exit(1);
}
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("RECUSADO: variável de emulador junto com SEMEAR_DEV.");
  process.exit(1);
}

initializeApp({ projectId: PROJETO_DEV });
const db = getFirestore();
const SHOP = db.doc("barbershops/shop-day-in-the-life");
const MARCA = { semeadoPor: "popular-dev" };

/* ---- Datas no fuso de São Paulo ---- */
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const diaISO = (deslocamento) => fmt.format(new Date(Date.now() + deslocamento * 86_400_000));
const HOJE = diaISO(0);
const AMANHA = diaISO(1);
const competenciaDe = (iso) => iso.slice(0, 7);
const mesAnterior = (comp) => {
  const [a, m] = comp.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};
const MES = competenciaDe(HOJE);
const MES_ANTERIOR = mesAnterior(MES);

/* ---- Limpa a rodada anterior ---- */
for (const col of ["bookings", "clients", "subscriptions", "subscription_invoices", "payments", "commissions"]) {
  const snap = await SHOP.collection(col).where("semeadoPor", "==", "popular-dev").get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const lote = db.batch();
    snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
}
/* Pagamentos e comissões que o gatilho gerou para reservas semeadas. */
for (const col of ["payments", "commissions"]) {
  const snap = await SHOP.collection(col).get();
  const lote = db.batch();
  let n = 0;
  for (const d of snap.docs) {
    if (String(d.get("bookingId") ?? d.id).includes("dev-")) {
      lote.delete(d.ref);
      n++;
    }
  }
  if (n) await lote.commit();
}

/* ---- Catálogo que já existe ---- */
const equipe = (await SHOP.collection("staff").get()).docs
  .filter((d) => d.get("active") !== false)
  .map((d) => ({ id: d.id, name: d.get("name") }));
const servicos = (await SHOP.collection("services").get()).docs.map((d) => ({
  id: d.id,
  name: d.get("name"),
  price: Number(d.get("price")) || 0,
  durationMin: Number(d.get("durationMin")) || 30,
}));
const planos = (await SHOP.collection("plans").get()).docs.map((d) => ({ id: d.id, ...d.data() }));
if (equipe.length === 0 || servicos.length === 0) {
  console.error("A barbearia de teste não tem equipe ou serviços. Rode antes o semear-day-in-the-life.");
  process.exit(1);
}

/* ---- Clientes (inventados) ---- */
const NOMES = [
  "Bruno Matos", "Caio Ferraz", "Danilo Prates", "Eduardo Lins", "Fábio Assis", "Gustavo Prado",
  "Henrique Sales", "Igor Teles", "Jonas Viana", "Kauã Ribas", "Luan Barreto", "Marcelo Dutra",
  "Nicolas Fontes", "Otávio Reis", "Paulo Neves", "Murilo Cunha", "Ricardo Lopes", "Samuel Tavares",
  "Tiago Moura", "Vinícius Rocha", "Wesley Pinto", "Yuri Castro", "André Lacerda", "Bernardo Sá",
  "César Amaral", "Davi Correia", "Emanuel Brito", "Flávio Paiva",
];
const fone = (i) => `1190000${String(1000 + i).padStart(4, "0")}`;
const clientes = NOMES.map((name, i) => {
  const app = i % 3 !== 0;
  return {
    id: app ? `dev-uid-${i}` : `dev-balcao-${i}`,
    uid: app ? `dev-uid-${i}` : null,
    name,
    whatsapp: fone(i),
    origin: app ? "app" : "balcao",
  };
});
/* O par do vínculo: o mesmo número no balcão e numa conta de app. */
const parBalcao = { id: "dev-balcao-par", uid: null, name: "Rogério Albuquerque", whatsapp: "11900009999", origin: "balcao" };
const parConta = {
  id: "dev-uid-par",
  uid: "dev-uid-par",
  name: "Rogério A.",
  whatsapp: "11900009999",
  origin: "app",
  mesmoNumeroQue: parBalcao.id,
};
let lote = db.batch();
for (const c of [...clientes, parBalcao, parConta]) {
  lote.set(SHOP.collection("clients").doc(c.id), {
    ...c,
    active: true,
    mergedInto: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...MARCA,
  });
}
await lote.commit();

/* ---- Reservas ---- */
const reserva = (id, c, b, s, date, time, origem, extra = {}) => ({
  id,
  doc: {
    clientId: c.id,
    staffId: b.id,
    staffName: b.name,
    clientName: c.name,
    clientWhatsapp: c.whatsapp,
    serviceIds: [s.id],
    serviceNames: [s.name],
    date,
    time,
    durationMin: s.durationMin,
    value: s.price,
    paymentOrigin: "in_person",
    paymentMethod: null,
    status: "confirmed",
    origin: origem,
    requestedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    ...MARCA,
    ...extra,
  },
});
const horarios = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30"];
const FORMAS = ["pix", "pix", "credit", "debit", "cash"];

const hoje = [];
const amanha = [];
let k = 0;
equipe.forEach((b, ib) => {
  const qtd = ib === 0 ? 9 : 6;
  for (let i = 0; i < qtd; i++) {
    const c = clientes[(k * 5 + ib) % clientes.length];
    const s = servicos[k % servicos.length];
    const t = horarios[(i * 2 + ib) % horarios.length];
    hoje.push({ ...reserva(`dev-hoje-${k}`, c, b, s, HOJE, t, c.uid ? "app" : "balcao", k === 3 ? { isFitIn: true } : {}), falta: k === 7 });
    k++;
  }
  for (let i = 0; i < (ib === 0 ? 6 : 5); i++) {
    const c = clientes[(k * 7 + ib) % clientes.length];
    const s = servicos[(k + 1) % servicos.length];
    amanha.push(reserva(`dev-amanha-${k}`, c, b, s, AMANHA, horarios[(i * 2 + ib) % horarios.length], c.uid ? "app" : "balcao"));
    k++;
  }
});
/* Histórico das últimas 3 semanas, para Clientes e o par do vínculo terem visitas. */
const historico = [];
for (let d = 3; d <= 21; d += 3) {
  equipe.forEach((b, ib) => {
    for (let i = 0; i < 3; i++) {
      const c = clientes[(d * 3 + i + ib) % clientes.length];
      const s = servicos[(d + i) % servicos.length];
      historico.push(reserva(`dev-hist-${d}-${ib}-${i}`, c, b, s, diaISO(-d), horarios[i * 3 + ib], c.uid ? "app" : "balcao"));
    }
  });
}
historico.push(reserva("dev-par-1", parBalcao, equipe[0], servicos[0], diaISO(-12), "10:00", "balcao"));
historico.push(reserva("dev-par-2", parBalcao, equipe[0], servicos[0], diaISO(-5), "10:00", "balcao"));
historico.push(reserva("dev-par-3", parConta, equipe[0], servicos[0], diaISO(-1), "11:00", "app"));

const todas = [...hoje, ...amanha, ...historico];
for (let i = 0; i < todas.length; i += 400) {
  lote = db.batch();
  todas.slice(i, i + 400).forEach((r) => lote.set(SHOP.collection("bookings").doc(r.id), r.doc));
  await lote.commit();
}

/* Concluir pelo UPDATE (é ele que dispara o gatilho financeiro: pagamento e
 * comissão), como o barbeiro faria. Hoje: tudo concluído, uma falta. */
const concluir = [...hoje, ...historico];
for (let i = 0; i < concluir.length; i += 400) {
  lote = db.batch();
  concluir.slice(i, i + 400).forEach((r, j) => {
    const ref = SHOP.collection("bookings").doc(r.id);
    if (r.falta) lote.update(ref, { status: "no_show" });
    else lote.update(ref, { status: "completed", paymentMethod: FORMAS[(i + j) % FORMAS.length] });
  });
  await lote.commit();
}

/* ---- Mensalistas: começaram em 28/09, setembro e outubro emitidos ---- */
const planoBase = planos.find((p) => !p.unlimited) ?? planos[0];
const planoIlimitado = planos.find((p) => p.unlimited) ?? planos[0];
const mensalistas = clientes.slice(0, 7);
lote = db.batch();
mensalistas.forEach((c, i) => {
  const plano = i % 2 ? planoIlimitado : planoBase;
  const billingDay = i < 4 ? 5 : 10;
  const subId = `dev-sub-${i}`;
  const price = Number(plano.price) || 99;
  lote.set(SHOP.collection("subscriptions").doc(subId), {
    clientId: c.id,
    clientName: c.name,
    name: c.name,
    planId: plano.id,
    planName: plano.name,
    price,
    unlimited: plano.unlimited === true,
    servicesIncluded: Number(plano.servicesIncluded) || null,
    billingDay,
    status: "ativo",
    startedAt: `${MES_ANTERIOR}-28`,
    canceledAt: null,
    createdAt: FieldValue.serverTimestamp(),
    ...MARCA,
  });
  for (const comp of [MES_ANTERIOR, MES]) {
    const paga = comp === MES && i === 0;
    lote.set(SHOP.collection("subscription_invoices").doc(`fatura_${subId}_${comp}`), {
      subscriptionId: subId,
      clientId: c.id,
      competencia: comp,
      dueDate: `${comp}-${String(billingDay).padStart(2, "0")}`,
      amount: price,
      planName: plano.name,
      status: paga ? "paga" : "aberta",
      paidAt: paga ? `${MES}-01` : null,
      paymentMethod: paga ? "pix" : null,
      emitidaEm: FieldValue.serverTimestamp(),
      ...MARCA,
    });
  }
});
await lote.commit();

console.log("DEV POPULADO (fictício)");
console.log(`  hoje ${HOJE}: ${hoje.length} reservas (1 falta, 1 encaixe) · amanhã ${AMANHA}: ${amanha.length}`);
console.log(`  histórico: ${historico.length} · clientes: ${clientes.length + 2} (1 par com o mesmo número)`);
console.log(`  mensalistas: ${mensalistas.length}, faturas de ${MES_ANTERIOR} e ${MES} (1 paga)`);
process.exit(0);
