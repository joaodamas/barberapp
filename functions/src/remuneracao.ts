/**
 * Comissão e salário do profissional moram FORA da ficha pública.
 *
 * `staff/{id}` é vitrine: o cliente lê para escolher com quem cortar — e, com
 * a vitrine pública, lê sem login. O comentário da regra dizia que a comissão
 * ficava em `commissions`, e não era verdade: a tela de Equipe gravava
 * `commissionPct` na própria ficha, e qualquer conta logada lia o salário de
 * todo barbeiro de toda barbearia (rodada E2E de 23/09, provado com teste de
 * regra).
 *
 * Agora: `staff_pay/{staffId}` = `{ commissionPct, salary }`, só o dono lê.
 * A ficha antiga ainda pode ter os campos até o script
 * `migrar-remuneracao-da-equipe.mjs` rodar — por isso o fallback.
 */
export async function percentualDoCadastro(
  shopRef: FirebaseFirestore.DocumentReference,
  staffId: string | null,
  fichaPublica?: FirebaseFirestore.DocumentSnapshot | null
): Promise<unknown> {
  if (!staffId) return null;
  const pay = await shopRef.collection("staff_pay").doc(staffId).get();
  if (pay.exists && pay.get("commissionPct") !== undefined) return pay.get("commissionPct");
  return fichaPublica?.get("commissionPct") ?? null;
}
