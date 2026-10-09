import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { idSeguro, vinculosDe } from "./acesso";
import { exigirCadeiraAtiva } from "./convite-equipe";
import { assinaturaDaCompetencia, competenciaDe } from "./mensalistas";

/**
 * "Este cliente é mensalista?" — a pergunta do fechamento, para o barbeiro (08/10).
 *
 * O barbeiro lia `subscriptions` INTEIRA para responder isso: preço, dia de
 * vencimento e horário fixo de todo mensalista da casa — receita da barbearia,
 * que ele não tem por que ver (decisão do dono: o barbeiro vê a própria agenda
 * e a própria comissão). As regras agora fecham a coleção para ele, e o
 * fechamento pergunta aqui, por atendimento: só da cadeira dele, e só o que a
 * tela mostra — o nome do plano e o que ele cobre.
 *
 * Responde "tem plano contratado", não "este corte está coberto": quem decide
 * a cobertura continua sendo o gatilho financeiro, com a cota do mês.
 */

export type PlanoNoFechamento = {
  planName: string;
  unlimited: boolean;
  servicesIncluded: number | null;
};

/** O recorte que sai daqui — nada de preço, vencimento ou horário fixo. */
export function recorteDoPlano(
  assinatura: Record<string, unknown> | undefined,
  /** Competência do atendimento: é o que deixa a cancelada com o mês pago valer. */
  competencia?: string
): PlanoNoFechamento | null {
  if (!assinatura) return null;
  /* Cancelar não corta o plano no mesmo dia: o ciclo pago vale até o fim dele
   * (`assinaturaDaCompetencia`). Sem a competência, só a ativa é plano. */
  const canceladaQueVale =
    assinatura.status === "cancelado" &&
    !!competencia &&
    !!assinatura.canceledAt &&
    assinaturaDaCompetencia(
      [
        {
          status: "cancelado" as const,
          startedAt: String(assinatura.startedAt ?? ""),
          canceledAt: String(assinatura.canceledAt),
        },
      ],
      competencia
    ) !== null;
  if (assinatura.status !== "ativo" && !canceladaQueVale) return null;
  const inclusos = Number(assinatura.servicesIncluded);
  return {
    planName: String(assinatura.planName ?? "Plano"),
    unlimited: assinatura.unlimited === true,
    servicesIncluded: Number.isFinite(inclusos) && inclusos > 0 ? inclusos : null,
  };
}

export const planoDoAtendimento = onCall<{ barbershopId: string; bookingId: string }>(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const bookingId = idSeguro(request.data?.bookingId, "Atendimento");
  const papel = vinculosDe(request)[barbershopId];
  if (papel !== "owner" && papel !== "staff") {
    throw new HttpsError("permission-denied", "Só quem trabalha na barbearia fecha atendimento.");
  }
  const minhaCadeira = await exigirCadeiraAtiva(request, barbershopId, papel);

  const shopRef = getFirestore().doc(`barbershops/${barbershopId}`);
  const reserva = await shopRef.collection("bookings").doc(bookingId).get();
  if (!reserva.exists) throw new HttpsError("not-found", "Atendimento não encontrado.");
  if (minhaCadeira && reserva.get("staffId") !== minhaCadeira) {
    throw new HttpsError("permission-denied", "Este atendimento é da agenda de outro barbeiro.");
  }

  const clientId = reserva.get("clientId") as string | null | undefined;
  if (!clientId) return { plano: null };
  const assinaturas = await shopRef.collection("subscriptions").where("clientId", "==", clientId).get();
  const competencia = competenciaDe(String(reserva.get("date") ?? ""));
  const escolhida = assinaturaDaCompetencia(
    assinaturas.docs.map((d) => ({
      status: d.get("status") as "ativo" | "suspenso" | "cancelado",
      startedAt: String(d.get("startedAt") ?? ""),
      canceledAt: (d.get("canceledAt") as string | null | undefined) ?? null,
      dados: d.data(),
    })),
    competencia
  );
  return { plano: recorteDoPlano(escolhida?.dados, competencia) };
});
