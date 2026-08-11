/**
 * Liga o WhatsApp de uma barbearia a um número da Cloud API.
 *
 * Grava DOIS documentos, e os dois precisam existir:
 *
 * - `barbershops/{id}/private/whatsapp` — de qual número esta barbearia envia.
 *   Explícito por barbearia, sem padrão da plataforma: um padrão silencioso
 *   faria a mensagem da barbearia B sair pelo número da A, e o cliente
 *   receberia uma confirmação assinada por outro salão.
 *
 * - `whatsapp_numbers/{phoneNumberId}` — o caminho inverso. O webhook é
 *   público e recebe só o `phone_number_id`; sem esta tradução ele não sabe
 *   de quem é o toque de botão que chegou.
 *
 * O token NÃO passa por aqui: fica no Secret Manager (`WHATSAPP_TOKEN`).
 * Documento do Firestore aparece em backup, em export e na tela de quem tiver
 * acesso ao console.
 *
 * Uso, de dentro de functions/:
 *
 *   node scripts/configurar-whatsapp.mjs --slug osiqueira \
 *     --phone-number-id 1207681169097014 --avisos-para 5511961733047
 *
 * `--avisos-para` é o número que RECEBE os avisos operacionais (nova reserva,
 * encaixe). Pode ser diferente do que o cliente vê no botão do app.
 * `--desligar` derruba o envio sem apagar a configuração.
 */

import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (nome) => args.includes(`--${nome}`);

const slug = valor("slug");
const phoneNumberId = valor("phone-number-id");
const avisosPara = valor("avisos-para");
const ligado = !flag("desligar");

if (!slug || !phoneNumberId) {
  console.error("Falta --slug ou --phone-number-id.");
  process.exit(1);
}

initializeApp();
const db = getFirestore();

const slugSnap = await db.doc(`slugs/${slug}`).get();
if (!slugSnap.exists) {
  console.error(`Nenhuma barbearia no endereço "${slug}".`);
  process.exit(1);
}
const barbershopId = slugSnap.get("barbershopId");

/* Um número da Cloud API pertence a UMA barbearia. Se já estiver apontando
 * para outra, parar: reapontar em silêncio faria as respostas dos clientes da
 * barbearia antiga caírem na agenda da nova. */
const mapeamento = await db.doc(`whatsapp_numbers/${phoneNumberId}`).get();
const donoAtual = mapeamento.get("barbershopId");
if (donoAtual && donoAtual !== barbershopId && !flag("forcar")) {
  console.error(
    `O número ${phoneNumberId} já está ligado à barbearia ${donoAtual}.\n` +
      "Use --forcar se a intenção é mesmo transferir."
  );
  process.exit(1);
}

const owner =
  avisosPara?.replace(/\D/g, "") ??
  (await db.doc(`barbershops/${barbershopId}`).get()).get("contact.whatsapp") ??
  null;

await db.doc(`barbershops/${barbershopId}/private/whatsapp`).set(
  {
    phoneNumberId: String(phoneNumberId),
    ownerWhatsapp: owner,
    enabled: ligado,
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);

await db.doc(`whatsapp_numbers/${phoneNumberId}`).set(
  { barbershopId, slug, updatedAt: FieldValue.serverTimestamp() },
  { merge: true }
);

console.log(`barbearia      : ${slug} (${barbershopId})`);
console.log(`phoneNumberId  : ${phoneNumberId}`);
console.log(`avisos vão para: ${owner ?? "(nenhum — o dono não receberá nada)"}`);
console.log(`envio          : ${ligado ? "LIGADO" : "desligado"}`);
if (!owner) {
  console.log(
    "\nSem número de avisos, a barbearia não fica sabendo de reserva nova.\n" +
      "Rode de novo com --avisos-para."
  );
}
process.exit(0);
