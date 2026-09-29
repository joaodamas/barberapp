/**
 * Fixa o horário dos mensalistas a partir da reserva que cada um já tem nesta
 * semana (pedido do dono, 29/09). Uso:
 *   node scripts/fixar-mensalistas.mjs <barbershopId>            → prévia (não grava)
 *   node scripts/fixar-mensalistas.mjs <barbershopId> --gravar    → grava
 *
 * Grava as mesmas reservas que o recurso de horário fixo (horario-fixo.ts) grava:
 * id `fixo_{assinatura}_{versão}_{data}` e `horarioFixoId`. Quando o recurso
 * entrar, ele reconhece estas reservas como já existentes e só continua a série.
 */
import { createHash } from "node:crypto";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const [shopId, flag] = process.argv.slice(2);
const GRAVAR = flag === "--gravar";
const SEMANAS = 8;
if (!shopId) { console.error("informe o barbershopId"); process.exit(1); }

initializeApp({ credential: applicationDefault(), projectId: "axon-barber" });
const db = getFirestore();
const shopRef = db.doc(`barbershops/${shopId}`);
const OCUPAM = ["pending_payment", "confirmed", "confirmed_by_client", "completed", "no_show"];
const ATIVAS = ["pending_payment", "confirmed", "confirmed_by_client", "fit_in_requested", "completed"];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const addDias = (iso, n) => { const [a,m,d] = iso.split("-").map(Number); return new Date(Date.UTC(a,m-1,d+n)).toISOString().slice(0,10); };
const dow = (iso) => { const [a,m,d] = iso.split("-").map(Number); return new Date(Date.UTC(a,m-1,d)).getUTCDay(); };
const min = (t) => { const [h,m] = t.split(":").map(Number); return h*60+m; };
const versao = (h) => createHash("sha1").update(JSON.stringify([h.diaDaSemana, h.hora, h.staffId, [...h.serviceIds].sort(), h.frequencia])).digest("hex").slice(0,8);

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const shop = (await shopRef.get()).data();
const abreDias = new Set(shop.schedule?.weekdays ?? []);
const excecoes = shop.schedule?.exceptions ?? [];
const subs = (await shopRef.collection("subscriptions").where("status", "==", "ativo").get()).docs;

const plano = [];
for (const s of subs) {
  const sub = s.data();
  const reservas = (await shopRef.collection("bookings").where("clientId", "==", sub.clientId).get()).docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((b) => b.date >= hoje && ["confirmed", "confirmed_by_client"].includes(b.status))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const base = reservas[0];
  if (!base) { plano.push({ nome: sub.clientName, erro: "sem reserva ativa nesta semana" }); continue; }
  const horario = { diaDaSemana: dow(base.date), hora: base.time, staffId: base.staffId, serviceIds: base.serviceIds ?? [], frequencia: "semanal", inicio: base.date };
  const v = versao(horario);
  const ocorrencias = [];
  for (let w = 1; w <= SEMANAS; w++) {
    const data = addDias(base.date, 7 * w);
    const exc = excecoes.find((e) => e.date === data);
    if (!abreDias.has(dow(data)) || exc?.closed || exc?.aberto === false) { ocorrencias.push({ data, status: "conflito", motivo: "barbearia fechada" }); continue; }
    const doCliente = reservas.find((b) => b.date === data);
    if (doCliente) { ocorrencias.push({ data, status: "cliente-ja-marcado" }); continue; }
    const doDia = (await shopRef.collection("bookings").where("date", "==", data).get()).docs.map((d) => d.data());
    const ini = min(base.time), fim = ini + (Number(base.durationMin) || 30);
    const choque = doDia.find((b) => b.staffId === base.staffId && OCUPAM.includes(b.status) && min(b.time) < fim && ini < min(b.time) + (Number(b.durationMin) || 30));
    if (choque) { ocorrencias.push({ data, status: "conflito", motivo: `ocupado por ${choque.clientName} às ${choque.time}` }); continue; }
    ocorrencias.push({ data, status: "criar", id: `fixo_${s.id}_${v}_${data}` });
  }
  plano.push({ nome: sub.clientName, s, sub, base, horario, ocorrencias });
}

for (const p of plano) {
  if (p.erro) { console.log(`\n${p.nome}: ${p.erro}`); continue; }
  const criar = p.ocorrencias.filter((o) => o.status === "criar");
  console.log(`\n${p.nome} · ${DIAS[p.horario.diaDaSemana]} ${p.horario.hora} · ${p.base.serviceNames?.join(" + ")} · ${criar.length} semanas`);
  for (const o of p.ocorrencias.filter((o) => o.status !== "criar")) console.log(`   ⚠ ${o.data} ${o.status}${o.motivo ? ": " + o.motivo : ""}`);
  console.log(`   datas: ${criar.map((o) => o.data.slice(8) + "/" + o.data.slice(5,7)).join(" · ")}`);
}

if (!GRAVAR) { console.log("\n(prévia — nada foi gravado)"); process.exit(0); }

let total = 0;
for (const p of plano) {
  if (p.erro) continue;
  await p.s.ref.update({ horarioFixo: p.horario, horarioFixoAtualizadoEm: FieldValue.serverTimestamp() });
  for (const o of p.ocorrencias.filter((o) => o.status === "criar")) {
    const ref = shopRef.collection("bookings").doc(o.id);
    await db.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      const doDia = await tx.get(shopRef.collection("bookings").where("date", "==", o.data));
      const ini = min(p.base.time), fim = ini + (Number(p.base.durationMin) || 30);
      const choque = doDia.docs.map((d) => d.data()).find((b) => b.staffId === p.base.staffId && OCUPAM.includes(b.status) && min(b.time) < fim && ini < min(b.time) + (Number(b.durationMin) || 30));
      if (choque) { console.log(`   pulado ${p.nome} ${o.data}: ocupado agora`); return; }
      tx.create(ref, {
        clientId: p.sub.clientId, staffId: p.base.staffId, staffName: p.base.staffName ?? null,
        clientName: p.base.clientName, clientWhatsapp: p.base.clientWhatsapp ?? "",
        serviceIds: p.base.serviceIds ?? [], serviceNames: p.base.serviceNames ?? [],
        date: o.data, time: p.base.time, durationMin: p.base.durationMin, value: p.base.value,
        paymentOrigin: "in_person", paymentMethod: null, status: "confirmed", origin: "fixo",
        horarioFixoId: p.s.id, requestedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(),
      });
      total++;
    });
  }
}
console.log(`\nGravadas ${total} reservas.`);
process.exit(0);
