import { getFirestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import type { WhatsappConfig } from "./client";

/**
 * De qual número esta barbearia envia.
 *
 * O id do número fica em `barbershops/{id}/private/whatsapp`, EXPLÍCITO por
 * barbearia. Nada de cair num número padrão da plataforma quando o documento
 * falta: numa plataforma multi-barbearia, um padrão silencioso faz a mensagem
 * da barbearia B sair pelo número da A — o cliente recebe uma confirmação
 * assinada por outro salão, e a barbearia A leva o bloqueio. Sem documento, não
 * envia. Ficar em silêncio é ruim; sair errado é pior.
 *
 * O token é da plataforma, não da barbearia: mora no Secret Manager, nunca no
 * Firestore. Documento do Firestore aparece em backup, em export e na tela de
 * quem tiver acesso ao console.
 */

export const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");

export type WhatsappTenantConfig = WhatsappConfig & {
  /** Número do dono, para os avisos operacionais. */
  ownerWhatsapp: string | null;
};

export async function loadWhatsappConfig(
  barbershopId: string
): Promise<WhatsappTenantConfig | null> {
  const db = getFirestore();
  const [conf, shop] = await Promise.all([
    db.doc(`barbershops/${barbershopId}/private/whatsapp`).get(),
    db.doc(`barbershops/${barbershopId}`).get(),
  ]);

  if (!conf.exists) return null;
  if (conf.get("enabled") !== true) return null;

  const phoneNumberId = conf.get("phoneNumberId");
  if (!phoneNumberId) return null;

  const token = WHATSAPP_TOKEN.value();
  if (!token) return null;

  return {
    phoneNumberId: String(phoneNumberId),
    token,
    // O dono pode ter um número só para receber avisos, diferente do que o
    // cliente vê no botão "Falar no WhatsApp".
    ownerWhatsapp:
      conf.get("ownerWhatsapp") ?? shop.get("contact.whatsapp") ?? null,
  };
}
