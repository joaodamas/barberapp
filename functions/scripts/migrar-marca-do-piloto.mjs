/**
 * Aponta a marca d'O Siqueira para a pasta dele.
 *
 * `/logo.svg`, `/logo-horizontal.svg` e `/icons/*` eram do piloto e ficavam na
 * raiz — e o cadastro gravava "/logo.svg" em TODA barbearia nova, que nascia
 * com a marca de outra. Os arquivos foram para `/tenants/osiqueira/`, e a
 * normalização passou a ler "/logo.svg" como "sem logo" (monograma).
 *
 * Sem rodar isto depois do deploy, O Siqueira aparece com o monograma "S" em
 * vez do selo. Nada quebra; só a marca fica genérica até rodar.
 *
 * Idempotente. Uso (dentro de functions/, com ADC configurado):
 *
 *   node scripts/migrar-marca-do-piloto.mjs [--slug osiqueira] [--aplicar]
 *
 * Sem `--aplicar`, só mostra o que mudaria.
 */

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const slug = args.includes("--slug") ? args[args.indexOf("--slug") + 1] : "osiqueira";
const aplicar = args.includes("--aplicar");

initializeApp();
const db = getFirestore();

const indice = await db.doc(`slugs/${slug}`).get();
if (!indice.exists) {
  console.error(`Nenhuma barbearia no endereço "${slug}".`);
  process.exit(1);
}
const ref = db.doc(`barbershops/${indice.get("barbershopId")}`);
const atual = (await ref.get()).get("brand") ?? {};

const novo = {
  "brand.logo": `/tenants/${slug}/logo.svg`,
  "brand.logoHorizontal": `/tenants/${slug}/logo-horizontal.svg`,
  "brand.icones": `/tenants/${slug}/icons`,
};

console.log("Antes:", { logo: atual.logo, logoHorizontal: atual.logoHorizontal, icones: atual.icones });
console.log("Depois:", novo);

if (!aplicar) {
  console.log("\nNada gravado. Rode de novo com --aplicar.");
  process.exit(0);
}
await ref.update(novo);
console.log("\nGravado.");
