import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

/**
 * O modo leitura, do lado do servidor.
 *
 * Teste vencido, conta suspensa ou encerrada: o dono continua VENDO tudo, o
 * cliente continua agendando pelo link, e o que trava é editar a operação.
 * A trava existia só no navegador (`web/src/lib/db/trava-de-escrita.ts`), para
 * escritas diretas no Firestore — e as callables passavam por fora: uma
 * barbearia suspensa seguia vendendo, estornando, mexendo no caixa, marcando
 * no balcão e zerando o movimento (auditoria da rodada E2E de 23/09).
 *
 * A decisão é a mesma de `acessoDaBarbearia` (web/src/lib/tenant.ts): lá o
 * teste vence quando faltam 0 dias arredondando para cima, o que é o mesmo que
 * `endsAt <= agora`. As mensagens são as mesmas da trava do navegador.
 */
export type MotivoDeLeitura = "trial_vencido" | "suspensa" | "cancelada";

const MENSAGEM: Record<MotivoDeLeitura, string> = {
  trial_vencido:
    "Seu teste terminou, então a conta está em modo leitura. Nada foi alterado — escolha um plano para voltar a editar.",
  suspensa:
    "Sua conta está suspensa, então ela está em modo leitura. Nada foi alterado — regularize para voltar a editar.",
  cancelada:
    "Esta conta foi encerrada e está em modo leitura. Nada foi alterado — seus dados seguem disponíveis para exportação.",
};

function paraData(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const t = v as { toDate?: () => Date };
  if (typeof t.toDate === "function") return t.toDate();
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function motivoDeLeitura(
  shop: FirebaseFirestore.DocumentData | undefined,
  agora = new Date()
): MotivoDeLeitura | null {
  const status = shop?.status;
  if (status === "encerrada") return "cancelada";
  if (status === "suspenso") return "suspensa";
  if (status === "trial") {
    const fim = paraData(shop?.trial?.endsAt);
    if (fim && fim.getTime() <= agora.getTime()) return "trial_vencido";
  }
  return null;
}

/** Recusa a callable que edita a operação quando a barbearia está em leitura. */
export async function exigirEdicao(barbershopId: string): Promise<void> {
  const shop = (await getFirestore().doc(`barbershops/${barbershopId}`).get()).data();
  const motivo = motivoDeLeitura(shop);
  if (motivo) throw new HttpsError("failed-precondition", MENSAGEM[motivo]);
}
