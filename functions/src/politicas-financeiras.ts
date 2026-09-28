import type { DocumentSnapshot } from "firebase-admin/firestore";

/**
 * As políticas da barbearia que são DINHEIRO — taxas da maquininha, formas de
 * pagamento com taxa e a comissão da casa.
 *
 * Moravam na ficha pública (`barbershops/{id}`, `allow get: if true`): qualquer
 * pessoa, sem login, lia quanto a maquininha cobra e quanto fica com o
 * barbeiro (auditoria de segurança de 28/09, M4). Passaram para
 * `barbershops/{id}/private/financeiro`, que só dono e equipe leem.
 *
 * A leitura junta o privado POR CIMA do público: durante a migração a ficha
 * antiga ainda tem os campos, e nenhum cálculo pode ficar sem taxa ou
 * comissão no meio do caminho. Depois da migração o público não os tem mais.
 */
export const CAMPOS_FINANCEIROS = ["paymentFees", "paymentForms", "commissionSplit"] as const;

export const CAMINHO_FINANCEIRO = { colecao: "private", doc: "financeiro" } as const;

export async function politicasDe(shopSnap: DocumentSnapshot): Promise<Record<string, unknown>> {
  const publicas = (shopSnap.get("policies") ?? {}) as Record<string, unknown>;
  const privado = await shopSnap.ref
    .collection(CAMINHO_FINANCEIRO.colecao)
    .doc(CAMINHO_FINANCEIRO.doc)
    .get();
  const financeiro = (privado.exists ? privado.data() : {}) ?? {};
  const juntas: Record<string, unknown> = { ...publicas };
  for (const campo of CAMPOS_FINANCEIROS) {
    if (financeiro[campo] !== undefined) juntas[campo] = financeiro[campo];
  }
  return juntas;
}
