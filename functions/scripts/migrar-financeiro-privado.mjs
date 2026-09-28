/**
 * Tira taxas, formas de pagamento e comissão da ficha PÚBLICA da barbearia e
 * as leva para `barbershops/{id}/private/financeiro` (auditoria de 28/09, M4).
 *
 * Ordem segura: roda DEPOIS de o código que lê o privado estar no ar
 * (`politicasDe` no servidor, `TenantLive` no painel). Copia primeiro; só apaga
 * do público o que ficou gravado no privado.
 *
 *   node scripts/migrar-financeiro-privado.mjs            # só mostra
 *   APLICAR=sim node scripts/migrar-financeiro-privado.mjs
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const CAMPOS = ["paymentFees", "paymentForms", "commissionSplit"];
const APLICAR = process.env.APLICAR === "sim";

initializeApp({ credential: applicationDefault(), projectId: "axon-barber" });
const db = getFirestore();

for (const shop of (await db.collection("barbershops").get()).docs) {
  const publicas = shop.get("policies") ?? {};
  const presentes = CAMPOS.filter((c) => publicas[c] !== undefined);
  if (presentes.length === 0) {
    console.log(`${shop.id}: nada na ficha pública`);
    continue;
  }
  const privRef = shop.ref.collection("private").doc("financeiro");
  const priv = (await privRef.get()).data() ?? {};
  /* O privado vence: se o dono já salvou pela tela nova, o valor dele é o atual. */
  const copia = Object.fromEntries(presentes.filter((c) => priv[c] === undefined).map((c) => [c, publicas[c]]));
  console.log(`${shop.id}: move ${presentes.join(", ")}${Object.keys(copia).length ? "" : " (privado já tem tudo)"}`);
  if (!APLICAR) continue;

  if (Object.keys(copia).length) await privRef.set(copia, { merge: true });
  const conferido = (await privRef.get()).data() ?? {};
  const apagar = presentes.filter((c) => conferido[c] !== undefined);
  await shop.ref.update(Object.fromEntries(apagar.map((c) => [`policies.${c}`, FieldValue.delete()])));
  console.log(`  apagado da ficha pública: ${apagar.join(", ")}`);
}
console.log(APLICAR ? "Pronto." : "Nada foi alterado. Rode com APLICAR=sim.");
