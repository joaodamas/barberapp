/**
 * Espera o servidor por um instante — e, se ele não responder, segue.
 *
 * ## Por que existe
 *
 * Gravação do Firestore com o aparelho offline é aceita na hora pelo cache
 * local, mas a promessa de `addDoc`/`setDoc`/`updateDoc` só resolve quando o
 * SERVIDOR confirma. A tela de despesas esperava essa promessa: sem sinal, o
 * diálogo ficava em "Salvando…" indefinidamente, o dono fechava, abria de novo
 * e salvava outra vez — e quando a conexão voltava, entravam duas despesas.
 *
 * O contrato aqui é dizer a verdade nos três casos:
 *
 * - `"confirmado"` — o servidor aceitou dentro do prazo; pode dizer "salvo";
 * - `"pendente"`   — está guardado neste aparelho e ainda não chegou; a tela
 *   precisa dizer isso, não "salvo";
 * - rejeição       — o servidor recusou dentro do prazo; nada foi gravado.
 *
 * No caso pendente, a promessa original continua valendo: quem chama deve
 * observá-la para avisar se o servidor recusar depois (permissão, regra).
 */
export async function esperarServidorOuSeguir(
  noServidor: Promise<unknown>,
  prazoMs = 2500
): Promise<"confirmado" | "pendente"> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<"pendente">((resolve) => {
    relogio = setTimeout(() => resolve("pendente"), prazoMs);
  });
  try {
    return await Promise.race([noServidor.then(() => "confirmado" as const), prazo]);
  } finally {
    clearTimeout(relogio);
  }
}
