/**
 * Contato comercial da PLATAFORMA — não da barbearia.
 *
 * A distinção importa: `tenant.contact.whatsapp` é o número do lojista, que o
 * cliente final usa para falar com a barbearia. Quem quer contratar um plano
 * superior precisa falar com quem vende o SaaS, e misturar os dois mandaria o
 * dono da barbearia conversar consigo mesmo.
 *
 * Enquanto não existe checkout de assinatura, a contratação é humana: o dono
 * clica e cai no WhatsApp do comercial com a mensagem pronta. Sem o número
 * configurado, o botão não é renderizado — um "Falar com o time" que não abre
 * nada é pior do que não existir.
 */

/** Somente dígitos, com DDI. Ex.: `5511999999999`. */
export const PLATFORM_WHATSAPP = (
  process.env.NEXT_PUBLIC_PLATFORM_WHATSAPP ?? ""
).replace(/\D/g, "");

export function hasPlatformContact() {
  // Um número brasileiro com DDI tem 12 ou 13 dígitos. Abaixo disso é engano
  // de digitação na variável, e o link abriria uma conversa inexistente.
  return PLATFORM_WHATSAPP.length >= 12;
}

/** Link do WhatsApp comercial com a mensagem já escrita. */
export function platformWhatsappUrl(mensagem: string) {
  return `https://wa.me/${PLATFORM_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;
}
