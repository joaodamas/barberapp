/**
 * Convite de acesso para o barbeiro (05/10) — os textos e os links.
 *
 * O link mora no endereço DA BARBEARIA (a sessão do Firebase é por origem):
 * quem abre o convite já entra onde vai trabalhar.
 */

export function linkDoConvite(origem: string, token: string): string {
  return `${origem.replace(/\/+$/, "")}/convite/${token}`;
}

export function textoDoConvite(params: { barbearia: string; barbeiro: string; link: string }): string {
  const ola = params.barbeiro.trim() ? `Fala, ${params.barbeiro.trim().split(/\s+/)[0]}!` : "Fala!";
  return (
    `${ola} Este é o seu acesso à agenda da ${params.barbearia}. ` +
    `Abra o link, entre com sua conta (ou crie uma) e pronto: você vê seus horários, ` +
    `fecha seus atendimentos e acompanha sua comissão.\n\n${params.link}\n\n` +
    `O link é só seu e vale por 7 dias.`
  );
}

/** Só dígitos; celular brasileiro sem DDI ganha o 55. `null` se não serve. */
export function whatsappParaConvite(bruto: string): string | null {
  const d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

export function linkDoWhatsApp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function linkDoEmail(email: string, barbearia: string, texto: string): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    `Seu acesso à agenda da ${barbearia}`
  )}&body=${encodeURIComponent(texto)}`;
}
