import { HttpsError } from "firebase-functions/v2/https";
import { getAuth, type Auth } from "firebase-admin/auth";
import { vinculosDe } from "./acesso";

/**
 * Escrita centralizada dos custom claims.
 *
 * O Firebase Auth aceita no máximo 1000 bytes de claims por conta, e estourar
 * não dá erro de domínio — dá um `auth/claims-too-large` seco, no meio de uma
 * operação que já gravou outras coisas. Os claims carregam um item por
 * barbearia (`barbershops`), um por barbeiro (`equipe`) e, com a rede, um por
 * unidade do dono dela. Medir ANTES de gravar e recusar com mensagem clara é o
 * que deixa o limite uma regra do produto, e não uma surpresa de produção.
 *
 * Margem de 100 bytes de propósito: o Auth conta o JSON de um jeito que não
 * vale a pena reproduzir ao byte, e um claim novo (ex.: `mustChangePassword`)
 * precisa caber depois.
 */
export const LIMITE_DE_CLAIMS_BYTES = 900;

export type Claims = Record<string, unknown>;

/** Só o que `mutarClaims` precisa do Auth — injetável (a expurgação já injeta o seu). */
export type AuthDeClaims = Pick<Auth, "getUser" | "setCustomUserClaims">;

/** Tamanho em bytes do JSON dos claims, como o Auth o enxerga. */
export function tamanhoDosClaims(claims: Claims): number {
  return Buffer.byteLength(JSON.stringify(claims), "utf8");
}

/**
 * Lê os claims da conta, deixa `alterar` mexer numa CÓPIA e grava o resultado.
 * `alterar` pode mutar o objeto recebido ou devolver outro.
 *
 * Recusa gravar se o resultado passar de 900 bytes E for maior que o anterior:
 * uma conta que já estourou (dado antigo) ainda precisa conseguir ENCOLHER.
 * Devolve os claims gravados. Não revoga sessão — quem chama decide.
 */
export async function mutarClaims(
  uid: string,
  alterar: (claims: Claims) => Claims | void,
  auth: AuthDeClaims = getAuth()
): Promise<Claims> {
  const user = await auth.getUser(uid);
  const antes = { ...(user.customClaims ?? {}) } as Claims;
  const copia = { ...antes };
  const novos = alterar(copia) ?? copia;

  const tamanho = tamanhoDosClaims(novos);
  if (tamanho > LIMITE_DE_CLAIMS_BYTES && tamanho > tamanhoDosClaims(antes)) {
    throw new HttpsError(
      "resource-exhausted",
      `Esta conta já tem acessos demais (${tamanho} de ${LIMITE_DE_CLAIMS_BYTES} bytes de permissões). ` +
        "Retire algum vínculo antes de adicionar outro."
    );
  }

  await auth.setCustomUserClaims(uid, novos);
  return novos;
}

/**
 * Papel de quem chamou numa barbearia, ou `null`. Embrulha `vinculosDe`, então
 * herda a trava da senha provisória (sem papel enquanto `mustChangePassword`).
 */
export function papelNaBarbearia(
  request: { auth?: { token: Record<string, unknown> } | null },
  barbershopId: string
): string | null {
  return vinculosDe(request)[barbershopId] ?? null;
}
