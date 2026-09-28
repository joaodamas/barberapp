/**
 * Confirmação de e-mail para agendar — auditoria de 28/09, achado M2.
 *
 * Qualquer conta de e-mail e senha agendava sem confirmar o e-mail, e um
 * script lotava a agenda com contas inventadas. O servidor passou a recusar
 * (`createBooking`, `podeAgendarComEstaConta`); este arquivo é o lado da tela,
 * com a MESMA regra, para o cliente ser avisado antes de tocar em "Confirmar"
 * e não depois.
 *
 * Mora fora do componente para a regra ter teste: dentro dele só se exerceria
 * com navegador e Firebase de verdade.
 */

/** Identificador que o servidor põe em `details.motivo`. Ver `functions/src/booking.ts`. */
export const MOTIVO_EMAIL_NAO_VERIFICADO = "email-nao-verificado";

/** O pedaço do `User` do Firebase que decide. */
export type ContaParaAgendar = {
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string | null;
  providerData: ReadonlyArray<{ providerId: string }>;
};

/**
 * A conta precisa confirmar o e-mail antes de agendar?
 *
 * Espelho de `podeAgendarComEstaConta` no servidor: passa quem tem e-mail
 * confirmado, telefone ou Google. Na dúvida, NÃO pede — quem decide de verdade
 * é o servidor, e ele responde com o motivo que reabre o cartão. Pedir
 * confirmação a quem não precisa travaria um cliente que conseguiria agendar.
 */
export function precisaConfirmarEmail(conta: ContaParaAgendar | null | undefined): boolean {
  if (!conta) return false;
  if (conta.emailVerified) return false;
  if (conta.phoneNumber) return false;
  if (conta.providerData.some((p) => p.providerId === "google.com")) return false;
  /* Sem e-mail não há o que confirmar nem para onde mandar o link. */
  return Boolean(conta.email);
}

/** O erro da callable é a recusa por e-mail não confirmado? */
export function ehRecusaPorEmailNaoVerificado(erro: unknown): boolean {
  const details = (erro as { details?: unknown } | null)?.details;
  return (
    typeof details === "object" &&
    details !== null &&
    (details as { motivo?: unknown }).motivo === MOTIVO_EMAIL_NAO_VERIFICADO
  );
}

/**
 * O que dizer quando o envio do link falhou. Nunca "enviamos": a tela não
 * afirma o que não aconteceu.
 */
export function mensagemDeFalhaNoEnvio(erro: unknown): string {
  const code = (erro as { code?: unknown } | null)?.code;
  if (code === "auth/too-many-requests") {
    return "Muitos envios seguidos. Espere alguns minutos e tente de novo.";
  }
  if (code === "auth/network-request-failed") {
    return "Sem conexão. Confira a internet e tente de novo.";
  }
  return "Não conseguimos enviar o link agora. Tente de novo em alguns minutos.";
}

/**
 * Marca, na sessão do navegador, que um link JÁ foi enviado para esta conta.
 *
 * Existe para o cartão não disparar um segundo e-mail a quem acabou de criar
 * a conta (o login já enviou) e para poder dizer "enviamos" só quando é
 * verdade. Mesma chave que `criar-conta` usava.
 */
export function chaveDoEnvio(uid: string): string {
  return `verificacao-enviada:${uid}`;
}

export function linkJaEnviado(uid: string): boolean {
  try {
    return sessionStorage.getItem(chaveDoEnvio(uid)) === "1";
  } catch {
    return false;
  }
}

export function marcarLinkEnviado(uid: string): void {
  try {
    sessionStorage.setItem(chaveDoEnvio(uid), "1");
  } catch {}
}
