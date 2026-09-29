/**
 * Marca (ou desmarca) uma barbearia como ISENTA: acesso completo, sem
 * cobrança, e o Hub não consegue suspender nem cancelar (`isentoDeCobranca` em
 * `src/hub/contrato.ts`). Hoje só o O Siqueira, a fundadora (29/09).
 *
 * Rode ANTES da carga inicial do Hub: o aviso de cadastro lê esta marca para
 * ir com plano e valor zero.
 *
 *   node scripts/marcar-isento.mjs --id <barbershopId> [--motivo "..."] [--desligar] [--gravar]
 *
 * Sem `--gravar`, só mostra o que mudaria.
 */

import { initializeApp, getApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const valor = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : null);
const id = valor("--id");
const motivo = valor("--motivo") ?? "Barbearia fundadora";
const desligar = args.includes("--desligar");
const gravar = args.includes("--gravar");
if (!id) {
  console.error("Use --id <barbershopId>.");
  process.exit(1);
}

initializeApp();
const db = getFirestore();
const ref = db.doc(`barbershops/${id}`);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`Barbearia ${id} não encontrada.`);
  process.exit(1);
}

const novo = desligar
  ? { ativa: false, desligadaEm: new Date().toISOString(), motivo: snap.get("isento.motivo") ?? motivo }
  : { ativa: true, motivo, desde: new Date().toISOString() };

console.log(`Projeto: ${getApp().options.projectId ?? process.env.GOOGLE_CLOUD_PROJECT ?? "?"}`);
console.log(`${snap.get("brand.name") ?? snap.get("slug")} (${id}) — status ${snap.get("status")}, plano ${snap.get("plan")}`);
console.log("isento agora:", JSON.stringify(snap.get("isento") ?? null));
console.log("isento novo: ", JSON.stringify(novo));

if (!gravar) {
  console.log("\nNada gravado — rode de novo com --gravar.");
  process.exit(0);
}
await ref.update({ isento: novo });
await ref.collection("audit_log").add({
  action: desligar ? "barbershop.isencao_desligada" : "barbershop.isencao",
  by: "script:marcar-isento",
  at: FieldValue.serverTimestamp(),
  detail: novo,
});
console.log("\nGravado.");
