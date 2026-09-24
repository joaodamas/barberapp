/**
 * Massa de demonstração para o dono ver o produto "com vida" — em PRODUÇÃO,
 * dentro da barbearia real. Pedido em 24/09: "crie alguns dados fake pro
 * barbeiro usar e ver como que é".
 *
 * Por que na barbearia real e não numa de demonstração: outra barbearia
 * precisa de outro subdomínio com HTTPS, e o curinga ainda depende do DNS na
 * Cloudflare. Então tudo que este script grava é MARCADO para sair inteiro:
 *
 *   - todo documento criado aqui tem id começando com `demo-` e `demo: true`;
 *   - o que os gatilhos derivam de uma reserva herda o id dela
 *     (`pagamento_demo-…`, `comissao_demo-…`, `credito_demo-…`);
 *   - `limpar.mjs` apaga exatamente isso, e nada além.
 *
 * O que NÃO cria, de propósito:
 *   - planos de mensalista: a vitrine é pública, e um plano inventado seria
 *     oferecido a cliente de verdade (os valores reais estão com o Rômulo);
 *   - barbeiro extra: apareceria para o cliente escolher no agendamento;
 *   - WhatsApp: o O Siqueira não tem WhatsApp configurado, então nenhuma
 *     reserva daqui gera mensagem — e os números são de faixa não atribuída.
 *
 * Os horários FUTUROS ocupam agenda de verdade: um cliente real não consegue
 * marcar em cima deles. São poucos (próximos 3 dias úteis) e saem no limpar.
 *
 * Uso (credencial do gcloud):
 *   CONFIRMO=osiqueira node semear.mjs
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (process.env.CONFIRMO !== "osiqueira") {
  console.error("RECUSADO: isto grava em PRODUÇÃO. Rode com CONFIRMO=osiqueira.");
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: "axon-barber" });
const db = getFirestore();

const shopId = (await db.doc("slugs/osiqueira").get()).get("barbershopId");
if (!shopId) throw new Error("slug osiqueira sem barbearia");
const shopRef = db.doc(`barbershops/${shopId}`);
const shop = (await shopRef.get()).data();

const staff = (await shopRef.collection("staff").get()).docs.filter((d) => d.get("active") !== false);
if (staff.length === 0) throw new Error("sem barbeiro ativo");
const servicos = Object.fromEntries(
  (await shopRef.collection("services").get()).docs.map((d) => [d.id, { id: d.id, ...d.data() }])
);

/* ---- Semente fixa: rodar de novo recria os MESMOS documentos. ---- */
let semente = 20260924;
const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const escolher = (lista) => lista[Math.floor(rnd() * lista.length)];
const pesado = (pares) => {
  const total = pares.reduce((s, [, p]) => s + p, 0);
  let r = rnd() * total;
  for (const [v, p] of pares) if ((r -= p) <= 0) return v;
  return pares[0][0];
};

/* ---- Clientes ---- */
const NOMES = [
  "Lucas Andrade", "Gabriel Moreira", "Rafael Teixeira", "Matheus Barbosa", "Pedro Henrique Lima",
  "Thiago Ramos", "Vinícius Carvalho", "Felipe Cardoso", "Bruno Nascimento", "Diego Pereira",
  "Leonardo Souza", "Guilherme Rocha", "Rodrigo Martins", "Eduardo Gomes", "Caio Ferreira",
  "André Luiz Costa", "Marcelo Dias", "Fábio Nunes", "Renato Alves", "Igor Mendes",
  "Samuel Oliveira", "Otávio Ribeiro", "Daniel Freitas", "Henrique Castro", "João Vitor Araújo",
  "Murilo Pinto", "Alexandre Fonseca", "Arthur Correia",
];
const clientes = NOMES.map((name, i) => ({
  id: `demo-cli-${String(i + 1).padStart(2, "0")}`,
  name,
  /* Faixa 11 90000-0xxx: não atribuída. Um em cada cinco sem número, como
     no balcão de verdade. */
  whatsapp: i % 5 === 4 ? "" : `119000000${String(100 + i).slice(-3)}`,
  /* Frequência: uns vêm a cada 2 semanas, outros uma vez por mês. */
  cadaDias: pesado([[14, 3], [21, 3], [30, 2], [45, 1]]),
}));

/* ---- O que se pede, com peso de balcão ---- */
const CARDAPIO = [
  ["serv_1788103351198", 40], // Corte adulto
  ["corte-barba", 22],
  ["barba", 10],
  ["corte-sobrancelha", 8],
  ["corte-infantil", 6],
  ["pezinho", 5],
  ["corte-barba-sobrancelha", 5],
  ["sobrancelha", 2],
  ["luzes", 1],
  ["serv_1788103270532", 1], // Pigmentação
].filter(([id]) => servicos[id]);

/* ---- Calendário da barbearia ---- */
const sched = shop.schedule;
const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const minutosAgora = agoraSP.getHours() * 60 + agoraSP.getMinutes();
const isoDe = (d) => d.toISOString().slice(0, 10);
const diaUtil = (iso) => sched.weekdays.includes(new Date(`${iso}T12:00:00Z`).getUTCDay());
const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const grade = [];
for (let m = min(sched.opensAt); m + 30 <= min(sched.closesAt); m += 30) {
  const noIntervalo = (sched.breaks ?? []).some((b) => m >= min(b.from) && m < min(b.to));
  if (!noIntervalo) grade.push(m);
}

const dias = [];
for (let n = -42; n <= 7; n++) {
  const d = new Date(`${hojeISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  const iso = isoDe(d);
  if (diaUtil(iso)) dias.push({ iso, n });
}
/* Só os três próximos dias úteis no futuro: cada horário demo ocupa a agenda real. */
const futuros = dias.filter((d) => d.n > 0).slice(0, 3).map((d) => d.iso);

/* ---- Reservas ---- */
const ultimaVisita = new Map();
const reservas = [];
let seq = 0;
for (const { iso, n } of dias) {
  if (n > 0 && !futuros.includes(iso)) continue;
  const quantas = n > 0 ? 3 + Math.floor(rnd() * 2) : 5 + Math.floor(rnd() * 5);
  const livres = [...grade];
  for (let k = 0; k < quantas && livres.length; k++) {
    const inicio = livres.splice(Math.floor(rnd() * livres.length), 1)[0];
    const svcId = pesado(CARDAPIO);
    const svc = servicos[svcId];
    const dur = Math.max(30, Math.ceil((svc.durationMin ?? 30) / 30) * 30);
    /* Não sobrepor: tira da grade o que a duração ocupa. */
    for (let m = inicio + 30; m < inicio + dur; m += 30) {
      const i = livres.indexOf(m);
      if (i >= 0) livres.splice(i, 1);
    }
    /* Cliente que "já deveria voltar" tem preferência — dá recorrência real. */
    const diaNum = Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
    const devidos = clientes.filter((c) => {
      const u = ultimaVisita.get(c.id);
      return u === undefined || diaNum - u >= c.cadaDias - 3;
    });
    const cli = escolher(devidos.length ? devidos : clientes);
    ultimaVisita.set(cli.id, diaNum);

    const passou = n < 0 || (n === 0 && inicio + dur <= minutosAgora);
    let status = "confirmed";
    let metodo = null;
    if (passou) {
      status = pesado([["completed", 85], ["no_show", 6], ["cancelled_by_client", 9]]);
      /* Hoje, dois que passaram ficam em aberto: é assim que o dono vê o
         "atendeu ou não veio?" na agenda. */
      if (n === 0 && reservas.filter((r) => r.date === iso && r.passou && r.statusFinal === "confirmed").length < 2) {
        status = "confirmed";
      }
      if (status === "completed") metodo = pesado([["pix", 50], ["credit", 20], ["debit", 15], ["cash", 15]]);
    }
    const b = staff[Math.floor(rnd() * staff.length)];
    reservas.push({
      id: `demo-${iso}-${String(++seq).padStart(3, "0")}`,
      date: iso,
      time: hhmm(inicio),
      cli,
      svc,
      dur: svc.durationMin ?? 30,
      staffId: b.id,
      staffName: b.get("name"),
      statusFinal: status,
      metodo,
      passou,
    });
  }
}

/* ---- Gravação ---- */
const lote = () => {
  const w = db.bulkWriter();
  w.onWriteError((e) => {
    console.error("falhou", e.documentRef.path, e.message);
    return e.failedAttempts < 3;
  });
  return w;
};

let w = lote();
for (const c of clientes) {
  w.set(shopRef.collection("clients").doc(c.id), {
    uid: null,
    name: c.name,
    whatsapp: c.whatsapp,
    origin: "balcao",
    active: true,
    demo: true,
    createdAt: FieldValue.serverTimestamp(),
  });
}
/* Toda reserva nasce `confirmed` — os gatilhos financeiros só agem na
   TRANSIÇÃO, como no balcão. */
for (const r of reservas) {
  w.set(shopRef.collection("bookings").doc(r.id), {
    clientId: r.cli.id,
    staffId: r.staffId,
    staffName: r.staffName,
    clientName: r.cli.name,
    clientWhatsapp: r.cli.whatsapp,
    serviceIds: [r.svc.id],
    serviceNames: [r.svc.name],
    date: r.date,
    time: r.time,
    durationMin: r.dur,
    value: Number(r.svc.price) || 0,
    paymentOrigin: "in_person",
    paymentMethod: null,
    status: "confirmed",
    origin: "balcao",
    demo: true,
    requestedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });
}

/* Despesas do mês e do anterior — o "Quanto sobrou" precisa de custo. */
const mesAtual = hojeISO.slice(0, 7);
const d0 = new Date(`${hojeISO}T12:00:00Z`);
d0.setUTCDate(1);
d0.setUTCMonth(d0.getUTCMonth() - 1);
const mesAnterior = isoDe(d0).slice(0, 7);
const DESPESAS = [
  ["Aluguel", "Aluguel do ponto", "Imobiliária Central", 2200, "05", "Boleto", true],
  ["Energia", "Conta de luz", "Enel", 380, "10", "Boleto", true],
  ["Água", "Conta de água", "Sabesp", 120, "12", "Boleto", true],
  ["Internet", "Internet fibra", "Vivo", 110, "15", "Pix", true],
  ["Contabilidade", "Honorários do contador", "Contábil Silva", 300, "08", "Pix", true],
  ["Produtos", "Lâminas, talco e pós-barba", "Distribuidora Navalha", 450, "18", "Cartão", false],
];
for (const mes of [mesAnterior, mesAtual]) {
  for (const [category, description, supplier, value, dia, payment, recurring] of DESPESAS) {
    const date = `${mes}-${dia}`;
    if (date > hojeISO) continue;
    w.set(shopRef.collection("expenses").doc(`demo-${mes}-${category.toLowerCase()}`), {
      category, description, supplier, value, date, payment, recurring, demo: true,
    });
  }
}

/* Produtos do balcão (a Loja é só da equipe — o cliente não vê). */
for (const [id, name, cost, price, stock, minStock] of [
  ["demo-pomada", "Pomada modeladora", 18, 45, 12, 3],
  ["demo-oleo-barba", "Óleo para barba", 22, 55, 6, 2],
  ["demo-shampoo", "Shampoo para barba", 20, 48, 2, 3],
  ["demo-cera", "Cera efeito matte", 16, 40, 9, 3],
]) {
  w.set(shopRef.collection("products").doc(id), { name, cost, price, stock, minStock, demo: true });
}
await w.close();
console.log(`gravados: ${clientes.length} clientes, ${reservas.length} reservas, despesas e 4 produtos`);

/* ---- Desfechos: a transição dispara pagamento, comissão e fidelidade ---- */
w = lote();
let desfechos = 0;
for (const r of reservas) {
  if (r.statusFinal === "confirmed") continue;
  const ref = shopRef.collection("bookings").doc(r.id);
  if (r.statusFinal === "completed") {
    w.update(ref, {
      status: "completed",
      paymentMethod: r.metodo,
      paymentFormId: r.metodo,
      paymentFormLabel: { pix: "Pix", cash: "Dinheiro", debit: "Débito", credit: "Crédito" }[r.metodo],
    });
  } else {
    w.update(ref, { status: r.statusFinal });
  }
  desfechos++;
}
await w.close();
console.log(`desfechos: ${desfechos} (os gatilhos materializam o dinheiro em seguida)`);

const porStatus = reservas.reduce((m, r) => ((m[r.statusFinal] = (m[r.statusFinal] ?? 0) + 1), m), {});
console.log("por status:", JSON.stringify(porStatus), "· futuros:", futuros.join(", "));
process.exit(0);
