/**
 * Mensalistas com horário fixo e semanas vazias (07/10).
 *
 * O defeito: mudar o horário fixo (ou tirar e recolocar, ou encerrar o plano
 * e abrir outro) liberava as semanas antigas, e a rotina tratava esses
 * cancelamentos como "semana desmarcada" — o mensalista ficava sem NENHUMA
 * reserva no horário novo, e nada avisava. Este script mede quem ficou assim
 * e, com `--corrigir`, completa as semanas pela MESMA função que a rotina da
 * madrugada usa (`garantirReservasDoFixo`, já corrigida).
 *
 * Usa o código compilado (`lib/`), para a conta ser exatamente a das funções.
 * Uso (dentro de functions/, com ADC do projeto certo):
 *
 *   npm run build
 *   node scripts/fixo-sem-semanas.mjs --id <barbershopId> [--corrigir]
 *
 * Sem `--corrigir`, só LÊ: para cada assinatura ativa com horário fixo,
 * imprime quantas das datas das próximas 8 semanas estão sem reserva ativa,
 * quantas delas foram afetadas pelo defeito (cancelada pela liberação do fixo,
 * sem reserva que a substitua) e o que a correção faria. Só contagens e ids
 * de assinatura — nenhum nome, telefone ou e-mail.
 */

import { createRequire } from "node:module";
import { initializeApp, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
let fixo, locale;
try {
  fixo = require("../lib/horario-fixo.js");
  locale = require("../lib/locale.js");
} catch (e) {
  console.error("Não achei o código compilado. Rode `npm run build` antes.\n", e.message);
  process.exit(1);
}
if (typeof fixo.liberadaPeloFixo !== "function") {
  console.error("O código compilado é anterior à correção. Rode `npm run build` de novo.");
  process.exit(1);
}

const args = process.argv.slice(2);
const valor = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
const id = valor("--id");
const corrigir = args.includes("--corrigir");
if (!id) {
  console.error("Use --id <barbershopId> [--corrigir].");
  process.exit(1);
}

initializeApp();
const db = getFirestore();
const projeto = getApp().options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "?";
const shopRef = db.doc(`barbershops/${id}`);
const shopSnap = await shopRef.get();
if (!shopSnap.exists) {
  console.error(`Barbearia ${id} não encontrada no projeto ${projeto}.`);
  process.exit(1);
}
const shop = shopSnap.data();
const hoje = locale.hojeNoFuso(locale.localeDoDocumento(shop).timeZone);
console.log(`Projeto: ${projeto} · barbearia ${id} · hoje ${hoje} · ${corrigir ? "CORRIGINDO" : "só leitura"}\n`);

if (!fixo.lojaRecebeReservaDoFixo(shop)) {
  console.log("A barbearia está encerrada ou em modo leitura: a rotina não reserva nela, e este script também não.");
  if (corrigir) process.exit(1);
}

/* O que conta como a semana estar coberta: qualquer reserva em aberto ou já
 * feita naquele dia, do fixo ou marcada à mão. */
const ATIVAS = ["confirmed", "confirmed_by_client", "pending_payment", "fit_in_requested", "completed"];

const assinaturas = (await shopRef.collection("subscriptions").where("status", "==", "ativo").get()).docs.filter(
  (a) => fixo.horarioFixoValido(a.get("horarioFixo"))
);

const total = { assinaturas: 0, semReserva: 0, afetadas: 0, aReservar: 0, conflitos: 0, criadas: 0 };
for (const a of assinaturas) {
  const horario = a.get("horarioFixo");
  const datas = fixo.datasDoHorarioFixo({ horario, hoje });
  const clientId = String(a.get("clientId") ?? "");
  const doCliente = clientId
    ? (await shopRef.collection("bookings").where("clientId", "==", clientId).get()).docs.map((d) => d.data())
    : [];

  let semReserva = 0;
  let afetadas = 0;
  for (const data of datas) {
    const doDia = doCliente.filter((b) => b.date === data);
    if (doDia.some((b) => ATIVAS.includes(b.status))) continue;
    semReserva++;
    if (doDia.some((b) => fixo.liberadaPeloFixo(b))) afetadas++;
  }

  /* A prévia da própria função: o que ela reservaria agora (e o que daria
   * conflito), sem gravar nada. */
  const previa = await fixo.garantirReservasDoFixo({
    db,
    shopRef,
    shop,
    subscriptionId: a.id,
    assinatura: a.data(),
    simular: true,
  });
  const aReservar = previa.filter((x) => x.resultado === "criada" || x.resultado === "reativada").length;
  const conflitos = previa.filter((x) => x.resultado === "conflito").length;

  total.assinaturas++;
  total.semReserva += semReserva;
  total.afetadas += afetadas;
  total.aReservar += aReservar;
  total.conflitos += conflitos;
  if (!semReserva && !aReservar && !conflitos) continue;

  let linha =
    `  ${a.id}  ${datas.length} datas · sem reserva: ${semReserva} · afetadas pelo defeito: ${afetadas}` +
    ` · a reservar: ${aReservar} · conflitos: ${conflitos}`;
  if (corrigir && aReservar > 0) {
    const r = await fixo.garantirReservasDoFixo({
      db,
      shopRef,
      shop,
      subscriptionId: a.id,
      assinatura: a.data(),
    });
    const criadas = r.filter((x) => x.resultado === "criada" || x.resultado === "reativada").length;
    total.criadas += criadas;
    linha += ` → reservadas agora: ${criadas}`;
  }
  console.log(linha);
}

console.log(
  `\nAssinaturas ativas com horário fixo: ${total.assinaturas}` +
    `\nDatas sem reserva ativa: ${total.semReserva} (afetadas pelo defeito: ${total.afetadas})` +
    `\nA correção reservaria: ${total.aReservar} · com conflito (o dono resolve na agenda): ${total.conflitos}`
);
if (corrigir) console.log(`Reservadas nesta execução: ${total.criadas}`);
else if (total.aReservar) console.log("\nNada foi gravado. Rode de novo com --corrigir para reservar.");
