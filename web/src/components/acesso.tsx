import Link from "next/link";
import { AlertTriangle, Clock, Lock, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { hasPlatformContact, platformWhatsappUrl } from "@/lib/platform";
import { trialDaysLeft, type Tenant } from "@/lib/tenant";

/**
 * Fim do teste e conta suspensa.
 *
 * `isTrialExpired` e `shouldWarnAboutTrial` existiam desde a fundação do
 * multi-tenant e nunca tiveram um chamador; `tenant.status` não era lido por
 * tela nenhuma. Na prática o trial de 7 dias nunca vencia e marcar uma conta
 * como `suspenso` no console não produzia efeito — não havia como cortar um
 * inadimplente nem manualmente, a não ser apagando a barbearia com os dados
 * do cliente junto.
 *
 * ALCANCE DESTE BLOQUEIO: é da interface. O Firestore continua respondendo ao
 * SDK, porque negar por `status` exigiria um `get()` do documento da barbearia
 * dentro da regra — uma leitura cobrada a cada avaliação, e o arquivo de regras
 * evita isso por decisão explícita. Para esta fase basta: quem não paga perde
 * o painel, não a posse dos dados. Um bloqueio de verdade entra junto com o
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

export function AcessoExpirado({ tenant }: { tenant: Tenant }) {
  const suspenso = tenant.status === "suspenso";

  const mensagem = suspenso
    ? `Olá! Sou dono da ${tenant.brand.name} e quero regularizar minha conta na plataforma.`
    : `Olá! Sou dono da ${tenant.brand.name}, meu teste terminou e quero contratar um plano.`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <Card className="flex max-w-lg flex-col items-center gap-4 py-12 text-center md:py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-light">
          {suspenso ? <AlertTriangle size={22} aria-hidden /> : <Lock size={22} aria-hidden />}
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-lg text-ivory md:text-xl">
            {suspenso ? "Conta suspensa" : "Seu teste terminou"}
          </h1>
          <p className="text-sm text-ivory-muted">
            {suspenso
              ? "O acesso ao painel está pausado enquanto a assinatura não é regularizada."
              : "Os 7 dias de teste acabaram. O painel fica pausado até você escolher um plano."}
          </p>
          <p className="text-xs text-ivory-muted">
            Nada foi apagado: agenda, clientes, financeiro e histórico continuam
            aqui, e voltam no estado em que estavam. Seus clientes seguem
            conseguindo agendar normalmente.
          </p>
        </div>

        {hasPlatformContact() && (
          <a href={platformWhatsappUrl(mensagem)} target="_blank" rel="noopener noreferrer">
            <Button>
              <MessageCircle size={16} />
              {suspenso ? "Regularizar" : "Escolher um plano"}
            </Button>
          </a>
        )}

        <Link href="/" className="text-xs text-ivory-muted underline hover:text-ivory">
          Ir para a página da barbearia
        </Link>
      </Card>
    </div>
  );
}
