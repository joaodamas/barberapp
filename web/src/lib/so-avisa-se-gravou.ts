/**
 * Grava primeiro; avisa depois — e só se a gravação passou.
 *
 * Existe por um defeito concreto do painel: aprovar um encaixe disparava a
 * escrita como `void patchDoc(...).catch(console.error)` e, na linha seguinte,
 * abria o WhatsApp com *"Seu encaixe foi confirmado. Te esperamos!"*. O
 * `window.open` era incondicional. Com a rede caindo no salão — ou uma regra
 * negando —, o dono **enviava a um terceiro a confirmação de um encaixe que não
 * existia**, e o cliente aparecia para um horário sem reserva.
 *
 * Afirmar algo a um cliente é irreversível de um jeito que uma tela errada não
 * é: dá para recarregar a página, não dá para desenviar a mensagem. Por isso a
 * ordem é regra, e não estilo.
 *
 * O helper existe para que a regra tenha um teste. Dentro de um componente ela
 * só se exerceria com ambiente de navegador e rede falhando de propósito, que é
 * exatamente a condição que não aparece numa validação com internet boa.
 */
export async function soAvisaSeGravou(params: {
  /** A escrita que precisa ter dado certo antes de qualquer anúncio. */
  gravar: () => Promise<unknown>;
  /**
   * O que só pode acontecer depois: abrir o WhatsApp do cliente, fechar o
   * diálogo, mostrar o selo de salvo. Nunca é chamado se `gravar` rejeitar.
   */
  avisar?: () => void;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    await params.gravar();
  } catch (e) {
    return { ok: false, erro: mensagemDe(e) };
  }
  params.avisar?.();
  return { ok: true };
}

/**
 * Mensagem para o dono, não para o log.
 *
 * "FirebaseError: Missing or insufficient permissions" não ajuda quem está no
 * balcão com um cliente esperando. O que ele precisa saber é que **não foi
 * gravado** — e que pode tentar de novo.
 */
function mensagemDe(e: unknown): string {
  const bruta = e instanceof Error ? e.message : String(e ?? "");
  if (/offline|network|unavailable|failed to get|deadline/i.test(bruta)) {
    return "Sem conexão agora. Nada foi salvo — tente de novo em alguns segundos.";
  }
  if (/permission|insufficient|unauthenticated/i.test(bruta)) {
    return "Você não tem permissão para esta alteração. Nada foi salvo.";
  }
  return "Não foi possível salvar. Nada foi alterado — tente de novo.";
}
