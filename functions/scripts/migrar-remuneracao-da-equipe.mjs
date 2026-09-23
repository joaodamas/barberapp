/**
 * Tira comissão e salário da ficha pública do profissional.
 *
 * `staff/{id}` virou vitrine (legível sem login). A tela de Equipe gravava
 * `commissionPct` e `salary` ali, e as fichas antigas continuam com os campos
 * — expostos — até isto rodar. Move para `staff_pay/{id}` (só o dono lê) e
 * apaga da ficha. O servidor lê `staff_pay` primeiro e a ficha como fallback,
 * então rodar antes ou depois do deploy não muda nenhum valor calculado.
 *
 * Idempotente. Uso (dentro de functions/, com ADC configurado):
 *
 *   node scripts/migrar-remuneracao-da-equipe.mjs [--aplicar]
 */

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const aplicar = process.argv.includes("--aplicar");
initializeApp();
const db = getFirestore();

const fichas = await db.collectionGroup("staff").get();
let movidas = 0;
for (const ficha of fichas.docs) {
  const d = ficha.data();
  if (!("commissionPct" in d) && !("salary" in d)) continue;
  const shopRef = ficha.ref.parent.parent;
  const pay = {};
  if ("commissionPct" in d) pay.commissionPct = d.commissionPct ?? null;
  if ("salary" in d) pay.salary = d.salary ?? null;
  console.log(`${shopRef.id}/staff/${ficha.id}:`, pay);
  movidas++;
  if (!aplicar) continue;
  const batch = db.batch();
  /* merge: se a tela nova já gravou em staff_pay, o valor de lá vence. */
  const payRef = shopRef.collection("staff_pay").doc(ficha.id);
  const existente = (await payRef.get()).data() ?? {};
  batch.set(payRef, { ...pay, ...existente }, { merge: true });
  batch.update(ficha.ref, { commissionPct: FieldValue.delete(), salary: FieldValue.delete() });
  await batch.commit();
}
console.log(`\n${movidas} ficha(s) com remuneração exposta.${aplicar ? " Movidas." : " Nada gravado — rode com --aplicar."}`);
