import { HttpsError, onCall } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { featuresFor, toPlanId, type PlanId } from "./plans";

/**
 * A máquina de estados da assinatura da barbearia com a plataforma.
 *
 * Existia tudo menos a transição: `signUpBarbershop` criava em `trial`,
 * `revisarAssinaturas` movia trial vencido para `suspenso`, e **nada no
 * repositório inteiro mudava `plan`**. Uma varredura por escrita nesse campo
 * devolvia apenas os dois pontos de criação.
 *
 * O efeito prático é que o produto não conseguia cobrar: não havia como sair de
 * teste para pagante, nem subir, nem descer de plano. A única forma era editar
 * o documento à mão no console — que é o caminho que as regras permitem
 * (`isPlatformAdmin`) e o que ninguém consegue auditar depois.
 *
 * Os estados, e quem provoca cada transição:
 *
 *   signUp/provision ──► trial ──┬─► ativo        (definirPlano, aqui)
 *                                └─► suspenso     (revisarAssinaturas, trial vencido)
 *                  ativo ────────┬─► ativo        (definirPlano, upgrade/downgrade)
 *                                └─► suspenso     (revisarAssinaturas, inadimplência)
 *               suspenso ────────► ativo          (definirPlano, ao regularizar)
 *                 (dono) ────────► encerrada      (encerrarConta)
 *
 * Não há checkout: a contratação é humana, por WhatsApp, e quem confirma o
 * pagamento é a plataforma. Por isso a autorização é `platformAdmin` — o dono
 * não escolhe o próprio plano, e as regras do Firestore já o impedem de tocar
 * em `plan`, `status`, `features` e `trial` direto.
 */

/**
 * Estado da conta com a plataforma. `encerrada` não entra: sair é ato do dono
 * (`encerrarConta`), e reabrir tem função própria.
 */
const STATUS_VALIDOS = ["ativo", "suspenso"] as const;
type StatusAssinatura = (typeof STATUS_VALIDOS)[number];

/**
 * O que gravar no documento da barbearia ao definir um plano.
 *
 * Função pura, separada do `onCall` pelo motivo de sempre: dentro dele só se
 * exerceria com emulador e autenticação, e esta é a conta que decide o que a
 * barbearia passa a poder fazer.
 *
 * **`plan` e `features` andam juntos, sempre.** Enquanto só o `plan` mudasse, o
 * `features` gravado na criação continuaria valendo e o downgrade não teria
 * efeito nenhum — o furo que `acessoDaBarbearia` fechou do lado da leitura, e
 * que aqui se fecha do lado da escrita. Os dois lados, porque um documento
 * coerente vale mais que uma leitura que corrige documento incoerente.
 */
export function mudancaDePlano(params: {
  plan: PlanId;
  status: StatusAssinatura;
  /** Motivo, para a trilha de auditoria. */
  motivo?: string | null;
}) {
  return {
    plan: params.plan,
    status: params.status,
    features: featuresFor(params.plan),
    /* O teste acabou — e a data fica no histórico em vez de sumir: ela responde
     * "quando essa barbearia começou a usar" para o resto da vida da conta. */
    trialEncerradoEm: FieldValue.serverTimestamp(),
    /* Some com o que a suspensão anterior deixou. Sem isto, uma barbearia
     * reativada continuaria carregando o motivo pelo qual foi suspensa, e a
     * próxima leitura do documento contaria uma história errada. */
    suspendedAt: FieldValue.delete(),
    suspendedReason: FieldValue.delete(),
    planoDefinidoEm: FieldValue.serverTimestamp(),
    planoDefinidoMotivo: params.motivo ?? null,
  };
}

export const definirPlano = onCall<{
  barbershopId: string;
  plan: string;
  status?: StatusAssinatura;
  /** ISO `YYYY-MM-DD` — até quando está pago. Alimenta a régua de cobrança. */
  paidUntil?: string;
  motivo?: string;
}>(async (request) => {
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Só o operador da plataforma define o plano de uma barbearia."
    );
  }

  const { barbershopId, paidUntil, motivo } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  /* Plano desconhecido NÃO cai no plano de entrada aqui.
   *
   * `toPlanId` normaliza para o mínimo na LEITURA, e isso está certo: uma
   * barbearia com o campo corrompido precisa continuar funcionando. Mas na
   * ESCRITA o mesmo comportamento seria um desastre silencioso — digitar
   * "gestão" com acento rebaixaria um cliente pagante para o plano de entrada
   * e ninguém saberia por quê. Aqui, entrada inválida para. */
  const bruto = String(request.data?.plan ?? "");
  const plan = toPlanId(bruto);
  if (plan !== bruto) {
    throw new HttpsError(
      "invalid-argument",
      `Plano "${bruto}" não existe. Use: agenda, crescimento ou gestao.`
    );
  }

  const status = request.data?.status ?? "ativo";
  if (!STATUS_VALIDOS.includes(status)) {
    throw new HttpsError(
      "invalid-argument",
      `Status "${status}" inválido. Use: ${STATUS_VALIDOS.join(" ou ")}.`
    );
  }

  const db = getFirestore();
  const ref = db.doc(`barbershops/${barbershopId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  /* Conta encerrada não volta por aqui: ela está na janela de exportação, e
   * reabrir é decisão do dono (`reabrirConta`). Definir plano numa conta
   * encerrada ressuscitaria em silêncio algo que alguém pediu para apagar. */
  if (snap.get("status") === "encerrada") {
    throw new HttpsError(
      "failed-precondition",
      "Esta conta foi encerrada. Ela precisa ser reaberta pelo dono antes de receber um plano."
    );
  }

  const anterior = {
    plan: snap.get("plan") ?? null,
    status: snap.get("status") ?? null,
  };

  await ref.update(mudancaDePlano({ plan, status, motivo: motivo ?? null }));

  if (paidUntil) {
    await ref
      .collection("private")
      .doc("billing")
      .set(
        {
          paidUntil,
          /* A régua zera ao regularizar: sem isso, a barbearia que pagou
           * continuaria no estágio de cobrança em que parou. */
          dunningStage: FieldValue.delete(),
          atualizadoEm: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }

  await ref.collection("audit_log").add({
    action: "barbershop.plano_definido",
    by: request.auth?.uid ?? null,
    at: FieldValue.serverTimestamp(),
    detail: { de: anterior, para: { plan, status }, paidUntil: paidUntil ?? null, motivo: motivo ?? null },
  });

  return { barbershopId, plan, status };
});
