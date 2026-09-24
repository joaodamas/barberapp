/**
 * Dá à barbearia semeada por `semear-day-in-the-life.mjs` uma agenda para o
 * passeio ter o que mostrar: ontem concluído, hoje em aberto, amanhã marcado,
 * uma despesa. SÓ NO EMULADOR.
 *
 * Hoje e amanhã entram pela MESMA porta do balcão (`createBookingAtCounter`),
 * com o token do dono — é o caminho que o produto usa, com cliente e duração
 * gravados pelo servidor. Ontem não passa por ali (a função recusa data
 * passada), então é gravado direto e concluído, para os gatilhos financeiros
 * materializarem pagamento e comissão como numa conclusão real.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("RECUSADO: só roda contra emulador.");
  process.exit(1);
}
const PROJETO = process.env.PROJETO_EMULADOR;
const SHOP = "shop-day-in-the-life";
initializeApp({ projectId: PROJETO });
const db = getFirestore();

const iso = (d) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const dia = (n) => iso(new Date(Date.now() + n * 86_400_000));
const hoje = dia(0);

/* Login do dono no emulador de Auth: a chave é ignorada pelo emulador. */
const login = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "dono@osiqueira.teste", password: "dono12345", returnSecureToken: true }),
  }
).then((r) => r.json());
if (!login.idToken) throw new Error("login do dono falhou: " + JSON.stringify(login));

async function marcar(dados) {
  const r = await fetch(
    `http://127.0.0.1:5001/${PROJETO}/southamerica-east1/createBookingAtCounter`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${login.idToken}` },
      body: JSON.stringify({ data: { barbershopId: SHOP, ...dados } }),
    }
  ).then(async (x) => {
    const corpo = await x.text();
    try { return JSON.parse(corpo); } catch { return { error: { message: corpo.slice(0, 200) } }; }
  });
  if (r.error) console.warn("  não marcou", dados.date, dados.time, r.error.message);
  else console.log("  marcado", dados.date, dados.time, dados.clientName);
}

/* Horários de hoje: dois que já passaram (viram "atrasado" e alimentam o
 * "Precisa de você") e dois à frente. Calculados pelo relógio de São Paulo. */
const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const hh = (h) => `${String(Math.max(9, Math.min(18, h))).padStart(2, "0")}:00`;
const h = agoraSP.getHours();
const agendaHoje = [
  { time: hh(h - 2), clientName: "Marcos Almeida", clientWhatsapp: "11987654321", serviceIds: ["corte"], staffId: "b-rafael" },
  { time: hh(h - 1), clientName: "João Pedro Santos", clientWhatsapp: "", serviceIds: ["corte-barba"], staffId: "b-leo" },
  { time: hh(h + 1), clientName: "Bruno Carvalho", clientWhatsapp: "11912345678", serviceIds: ["barba"], staffId: "b-rafael" },
  { time: hh(h + 2), clientName: "Felipe Rodrigues de Oliveira Neto", clientWhatsapp: "21998877665", serviceIds: ["corte", "sobrancelha"], staffId: "b-leo" },
];
for (const b of agendaHoje) await marcar({ date: hoje, ...b });
for (const b of [
  { time: "10:00", clientName: "André Lima", clientWhatsapp: "11955554444", serviceIds: ["corte"], staffId: "b-rafael" },
  { time: "15:30", clientName: "Ricardo Souza", clientWhatsapp: "", serviceIds: ["corte-barba"], staffId: "b-leo" },
]) await marcar({ date: dia(1), ...b });

/* Ontem: grava em aberto e depois conclui — a transição é o que dispara o
 * gatilho financeiro, como no balcão. */
const ontem = dia(-1);
for (const [i, b] of [
  { time: "09:30", clientName: "Paulo Mendes", serviceIds: ["corte"], value: 50, staffId: "b-rafael", metodo: "pix" },
  { time: "11:00", clientName: "Gustavo Reis", serviceIds: ["corte-barba"], value: 90, staffId: "b-leo", metodo: "credit" },
  { time: "14:00", clientName: "Diego Fernandes", serviceIds: ["barba"], value: 35, staffId: "b-rafael", metodo: "cash" },
].entries()) {
  const ref = db.doc(`barbershops/${SHOP}/bookings/ontem-${i}`);
  await ref.set({
    clientId: `cli-ontem-${i}`,
    staffId: b.staffId,
    clientName: b.clientName,
    clientWhatsapp: "",
    serviceIds: b.serviceIds,
    date: ontem,
    time: b.time,
    durationMin: 30,
    status: "confirmed",
    value: b.value,
    paymentOrigin: "in_person",
    paymentMethod: null,
    createdAt: new Date(),
  });
  await db.doc(`barbershops/${SHOP}/clients/cli-ontem-${i}`).set({
    uid: null, name: b.clientName, whatsapp: "", origin: "balcao", active: true,
  });
  await ref.update({ status: "completed", paymentMethod: b.metodo });
  console.log("  concluído ontem", b.time, b.clientName);
}

await db.collection(`barbershops/${SHOP}/expenses`).add({
  category: "Aluguel",
  description: "Aluguel do ponto",
  supplier: "Imobiliária Centro",
  value: 1800,
  date: hoje,
  payment: "Boleto",
  recurring: true,
});

/* Dá tempo aos gatilhos do emulador de materializarem ontem. */
await new Promise((r) => setTimeout(r, 4000));
console.log("AGENDA SEMEADA para", ontem, hoje, dia(1));
process.exit(0);
