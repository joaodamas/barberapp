/**
 * Carga inicial do Hub: enfileira `cadastrada` para as barbearias que já
 * existiam antes da integração (29/09 — hoje só o O Siqueira,
 * `ZE8iNGVKp3l7OqZFJbqF`).
 *
 * As barbearias novas avisam sozinhas, na transação que as cria. As antigas
 * nasceram antes disso, e sem esta carga o Hub nunca ficaria sabendo do id
 * delas aqui — e não conseguiria mandar `/plataforma/status` para elas.
 *
 * Só ENFILEIRA em `plataforma_saida`; quem envia é `enviarAvisoAoHub`, com
 * retentativa. Idempotente: o `eventoId` é `cadastrada:{id}`, o mesmo que a
 * criação usaria, e aviso que já está na caixa é pulado. Rodar duas vezes não
 * gera dois avisos, e o Hub deduplica pelo mesmo id se algum escapar.
 *
 * Barbearia encerrada fica de fora: avisar o Hub de um cadastro que já está a
 * caminho do expurgo criaria um cliente em teste que não existe mais.
 *
 * Usa o código compilado (`lib/`), para o corpo do evento ser EXATAMENTE o
 * que as funções mandam — duas montagens diferentes do mesmo evento é o tipo
 * de coisa que diverge. Uso (dentro de functions/, com ADC do projeto certo):
 *
 *   npm run build
 *   node scripts/avisar-hub-carga-inicial.mjs [--id <barbershopId>] [--gravar]
 *
 * Sem `--gravar`, só mostra o que enfileiraria.
 */

import { createRequire } from "node:module";
import { initializeApp, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
let contrato, saida, planos;
try {
  contrato = require("../lib/hub/contrato.js");
  planos = require("../lib/plans.js");
  saida = require("../lib/hub/saida.js");
} catch (e) {
  console.error("Não achei o código compilado. Rode `npm run build` antes.\n", e.message);
  process.exit(1);
}

const args = process.argv.slice(2);
const gravar = args.includes("--gravar");
const soId = args.includes("--id") ? args[args.indexOf("--id") + 1] : null;

initializeApp();
const db = getFirestore();
const projeto = getApp().options.projectId ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? "?";
console.log(`Projeto: ${projeto}${projeto === saida.PROJETO_DE_PRODUCAO ? "" : "  (fora de produção: os avisos ficarão retidos, sem ir ao Hub)"}\n`);

const docs = soId
  ? [await db.doc(`barbershops/${soId}`).get()].filter((d) => d.exists)
  : (await db.collection("barbershops").get()).docs;

if (!docs.length) {
  console.error(soId ? `Barbearia ${soId} não encontrada.` : "Nenhuma barbearia.");
  process.exit(1);
}

let novos = 0;
for (const shop of docs) {
  const nome = String(shop.get("brand.name") ?? shop.get("slug") ?? shop.id);
  if (shop.get("status") === "encerrada") {
    console.log(`- ${nome} (${shop.id}): encerrada, fica de fora`);
    continue;
  }
  const criadaEm = shop.get("createdAt")?.toDate?.() ?? new Date();
  // Isenta (o O Siqueira), o cadastro já vai com plano e valor 0.
  const isento = contrato.isentoDeCobranca(shop.data() ?? {});
  const corpo = contrato.montarEvento({
    evento: "cadastrada",
    barbershopId: shop.id,
    slug: String(shop.get("slug") ?? ""),
    nome,
    ocorridoEm: criadaEm,
    ...(isento ? { isento: true, plano: planos.toPlanId(shop.get("plan")) } : {}),
  });
  const ref = saida.refDoAviso(db, corpo.eventoId);
  const existente = await ref.get();
  if (existente.exists) {
    console.log(`- ${nome} (${shop.id}): já na caixa (${existente.get("estado")}), pulando`);
    continue;
  }
  console.log(`+ ${nome} (${shop.id}):`, JSON.stringify(corpo));
  novos++;
  if (gravar) {
    // `create`: se outra execução gravou no meio, falha em vez de sobrescrever.
    await ref.create(saida.registroDoAviso(corpo, { agoraMs: Date.now() }));
  }
}

console.log(
  gravar
    ? `\n${novos} aviso(s) enfileirado(s). Acompanhe em plataforma_saida (estado: enviado).`
    : `\n${novos} aviso(s) a enfileirar. Nada gravado — rode de novo com --gravar.`
);
