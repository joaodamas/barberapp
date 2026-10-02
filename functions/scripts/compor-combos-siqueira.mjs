/**
 * Diz do que cada combo da O Siqueira é feito (01/10/2026), para os combos
 * valerem em todo lugar (`src/combos.ts`). Sem --gravar, só mostra.
 *   node scripts/compor-combos-siqueira.mjs [--gravar]
 * Depois, o dono ajusta pela tela de Serviços ("Combo de").
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
initializeApp({ projectId: "axon-barber" });
const S = getFirestore().doc("barbershops/ZE8iNGVKp3l7OqZFJbqF");
const ADULTO = "serv_1788103351198", BARBA = "barba", SOBR = "sobrancelha", INF = "corte-infantil";
const COMBOS = {
  "corte-barba": [ADULTO, BARBA],
  "corte-sobrancelha": [ADULTO, SOBR],
  "corte-barba-sobrancelha": [ADULTO, BARBA, SOBR],
  serv_1788103722915: [ADULTO, INF],
  serv_1788103859620: [ADULTO, BARBA, INF],
  serv_1788104083638: [ADULTO, INF, INF],
  serv_1788103747136: [ADULTO, BARBA, INF, INF],
};
const cat = new Map((await S.collection("services").get()).docs.map((d) => [d.id, d.data()]));
const gravar = process.argv.includes("--gravar");
for (const [id, pecas] of Object.entries(COMBOS)) {
  const c = cat.get(id);
  if (!c) { console.log(`?? ${id} não existe`); continue; }
  const faltam = pecas.filter((p) => !cat.has(p));
  const soma = pecas.reduce((t, p) => t + (Number(cat.get(p)?.price) || 0), 0);
  console.log(`${c.name} (R$ ${c.price}) = ${pecas.map((p) => cat.get(p)?.name ?? "??").join(" + ")} · separados R$ ${soma}${faltam.length ? " · FALTA " + faltam : ""}${Number(c.price) >= soma ? " · ATENÇÃO: combo não é mais barato" : ""}`);
  if (gravar && !faltam.length) await S.collection("services").doc(id).set({ composicao: pecas }, { merge: true });
}
console.log(gravar ? "\nGravado." : "\nNada gravado — rode com --gravar.");
