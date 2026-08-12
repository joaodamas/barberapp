import { Clock } from "lucide-react";
import { trialDaysLeft, type Tenant } from "@/lib/tenant";

/**
 * Aviso da reta final do teste.
 *
 * `isTrialExpired` e `shouldWarnAboutTrial` existiam desde a fundação do
 * multi-tenant e nunca tiveram um chamador; `tenant.status` não era lido por
 * tela nenhuma. Na prática o trial de 7 dias nunca vencia e marcar uma conta
 * como `suspenso` no console não produzia efeito — não havia como cortar um
 * inadimplente nem manualmente, a não ser apagando a barbearia com os dados
 * do cliente junto.
 *
 * Este componente cobre só o ANTES: os últimos dias, enquanto ainda dá para
 * agir sem interrupção. Depois de vencer quem fala é `AvisoModoLeitura`, e o
 * painel entra em leitura em vez de fechar — ver `docs/COBRANCA-E-ENTRADA.md`.
 *
 * ALCANCE DO MODO LEITURA: é da interface. O Firestore continua respondendo ao
 * SDK, porque negar por `status` exigiria um `get()` do documento da barbearia
 * dentro da regra — uma leitura cobrada a cada avaliação, e o arquivo de regras
 * evita isso por decisão explícita. Para esta fase basta: quem não paga perde a
 * edição, não a posse dos dados. Uma trava de verdade entra junto com o
 * gateway, quando existir cobrança para reagir a ela.
 *
 * O app do CLIENTE segue no ar de propósito. Quem marcou corte na sexta não
 * tem culpa da mensalidade do dono, e derrubar a agenda pública transforma uma
 * cobrança em prejuízo para terceiros.
 */
export function AvisoDeTrial({ tenant }: { tenant: Tenant }) {
  const dias = trialDaysLeft(tenant.trial);
  if (dias === null || dias > 4 || dias <= 0) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-[11px] text-ivory md:text-xs"
    >
      <Clock size={13} className="shrink-0 text-gold-light" aria-hidden />
      <span>
        {dias === 1 ? (
          <>
            <strong className="font-semibold">Seu teste termina amanhã.</strong> Depois
            disso o painel fecha — sua agenda e seus dados continuam aqui.
          </>
        ) : (
          <>
            <strong className="font-semibold">
              Seu teste termina em {dias} dias.
            </strong>{" "}
            Fale com a gente para continuar sem interrupção.
          </>
        )}
      </span>
    </div>
  );
}
