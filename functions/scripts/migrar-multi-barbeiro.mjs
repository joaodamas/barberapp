/**
 * Migração para multi-barbeiro.
 *
 * Toda barbearia existente ganha um barbeiro criado a partir do dono, e toda
 * reserva sem `staffId` passa a apontar para ele.
 *
 * Por que agora e não depois: hoje a atribuição é ÓBVIA — só existia uma
 * cadeira, então toda reserva histórica é do único barbeiro. Depois de a
 * barbearia contratar o segundo, decidir a qual dos dois pertence uma reserva
 * de três meses atrás é adivinhação, porque ninguém registrou.
 *
 * Idempotente: rodar de novo não duplica barbeiro nem reescreve reserva que já
 * tem dono.
 *
 * Uso, de dentro de functions/:
 *   node scripts/migrar-multi-barbeiro.mjs            # simulação
 *   node scripts/migrar-multi-barbeiro.mjs --aplicar
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const aplicar = process.argv.includes("--aplicar");
initializeApp();
const db = getFirestore();
const auth = getAuth();

const barbearias = await db.collection("barbershops").get();
console.log(`${barbearias.size} barbearia(s)\n`);

for (const shop of barbearias.docs) {
  const nome = shop.get("brand.name") ?? shop.id;
  const equipe = await shop.ref.collection("staff").get();

  let staffId = equipe.docs.find((d) => d.get("active") !== false)?.id;

  if (!staffId) {
    /* O nome do barbeiro vem do dono. Sem ele, "Eu" — que é como uma barbearia
     * solo se refere ao próprio barbeiro, e o dono renomeia em dois toques. */
    const dono = (await shop.ref.collection("members").where("role", "==", "owner").limit(1).get())
      .docs[0];
    let nomeDono = "Eu";
    if (dono) {
      try {
        const u = await auth.getUser(dono.id);
        nomeDono = u.displayName || u.email?.split("@")[0] || "Eu";
      } catch {
        // Conta apagada: o barbeiro continua existindo como recurso.
      }
    }

    console.log(`  ${nome}: criar barbeiro "${nomeDono}"`);
    if (aplicar) {
      const ref = shop.ref.collection("staff").doc();
      await ref.set({
        name: nomeDono,
        active: true,
        uid: dono?.id ?? null,
        serviceIds: [],
        commissionPct: null,
        schedule: null,
        order: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      staffId = ref.id;
    } else {
      staffId = "(seria criado)";
    }
  } else {
    console.log(`  ${nome}: já tem barbeiro`);
  }

  const reservas = await shop.ref.collection("bookings").get();
  const orfas = reservas.docs.filter((d) => !d.get("staffId"));
  console.log(`  ${nome}: ${orfas.length} de ${reservas.size} reserva(s) sem barbeiro`);

  if (aplicar && orfas.length && !staffId.startsWith("(")) {
    let lote = db.batch();
    let n = 0;
    for (const r of orfas) {
      lote.update(r.ref, { staffId });
      if (++n % 400 === 0) {
        await lote.commit();
        lote = db.batch();
      }
    }
    await lote.commit();
    console.log(`  ${nome}: ${orfas.length} reserva(s) atribuída(s)`);
  }
  console.log();
}

console.log(aplicar ? "Migração aplicada." : "Simulação — nada foi gravado. Use --aplicar.");
process.exit(0);
