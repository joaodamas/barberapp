"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoorClosed, WifiOff } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { isOnboardingComplete } from "@/lib/tenant";
import { useEstadoDaFichaAoVivo } from "@/lib/ficha-ao-vivo";
import { decidirOnboarding, onboardingConcluidoAgora } from "@/lib/onboarding-concluido";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";

/**
 * Porta de entrada das áreas logadas. O login é um só (`/login`) — o que
 * separa cliente de dono é a permissão da conta, não a tela.
 */
export function AuthGuard({
  children,
  requireOwner,
  publicoEm,
}: {
  children: React.ReactNode;
  requireOwner?: boolean;
  /**
   * Caminhos que abrem SEM conta — a vitrine (decisão de 23/09).
   *
   * Quem abria o link da barbearia sem conta via só uma tela de login, sem
   * preço, serviço ou endereço, e sem saber de que barbearia se tratava. A
   * conta passa a ser pedida no único ato que precisa dela: confirmar a
   * reserva. Com conta, tudo segue igual — inclusive trocar senha e onboarding.
   */
  publicoEm?: string[];
}) {
  const { user, claims, loading, semResposta } = useAuth();
  const tenant = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const vitrine = !user && !!publicoEm?.includes(pathname);

  /* O vínculo é por barbearia. O `claims.role` global (single-tenant) saiu em
   * 08/10: nenhum fluxo o emitia mais, e honrá-lo aqui abria o painel de
   * QUALQUER barbearia a quem o tivesse. */
  const papel = claims.barbershops?.[tenant.id];
  const isOwner = papel === "owner";
  /* O barbeiro que abre o app instalado cai no `start_url` ("/"), que é o app
   * do cliente — e não tinha caminho para a agenda dele (08/10). No início,
   * ele vai direto para a área dele; as outras telas do cliente continuam
   * abertas (ele também pode marcar o próprio corte). */
  const barbeiroNoInicio = !!user && papel === "staff" && !requireOwner && pathname === "/";
  const authorized = !!user && (!requireOwner || isOwner);

  /* Senha provisória vem antes de tudo: a conta só é dele depois que a senha
   * que mandamos por mensagem parar de funcionar. */
  const precisaTrocarSenha = !!user && claims.mustChangePassword === true;

  /* Dono com onboarding pela metade não deve cair num painel vazio — mas quem
   * acabou de concluir também não pode voltar ao passo 1 porque a ficha do
   * servidor ainda é a de antes (cache de 300 s). Ver `onboarding-concluido`. */
  const estadoDaFicha = useEstadoDaFichaAoVivo();
  const onboarding = decidirOnboarding({
    isOwner,
    completo: isOnboardingComplete(tenant.onboarding),
    estadoDaFicha,
    concluidoAgora: isOwner && typeof window !== "undefined" && onboardingConcluidoAgora(tenant.id),
  });
  const precisaOnboarding = onboarding === "onboarding";
  const esperandoFicha = onboarding === "esperar";

  /* Tem conta, e a conta não é desta barbearia.
   *
   * Era `router.replace("/")` em silêncio: quem abria um link do painel — de um
   * favorito, de uma mensagem, de um e-mail — aparecia na área do cliente sem
   * uma palavra, e não tinha como saber se errou o endereço, se perdeu o
   * acesso, ou se entrou com a conta errada. As três causas pedem ações
   * diferentes e o produto não dizia qual foi.
   *
   * É a mesma classe do D30 — traduzir "não é para você" sem dizer por quê —
   * e a mesma de `ErroAoCarregar`: um estado terminal não pode parecer um
   * carregamento que nunca termina. */
  const semVinculo = !!user && !!requireOwner && !isOwner;

  useEffect(() => {
    if (loading) return;
    if (precisaTrocarSenha) {
      router.replace("/trocar-senha");
      return;
    }
    if (precisaOnboarding) {
      router.replace("/comecar");
      return;
    }
    if (barbeiroNoInicio) {
      router.replace("/barbeiro");
      return;
    }
    if (authorized || vitrine) return;
    /* Sem conta → login, voltando para onde estava. Com conta e sem vínculo
     * NÃO redireciona mais: explica e oferece as duas saídas reais. */
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, authorized, user, router, precisaOnboarding, precisaTrocarSenha, barbeiroNoInicio, vitrine, pathname]);

  /* Antes de qualquer decisão sobre permissão: sem resposta do Auth, não dá para
   * saber se a pessoa é dona, cliente ou visitante — e decidir no escuro ou
   * girar para sempre são os dois erros. Diz o que houve e oferece a saída. */
  // A vitrine abre sem conta: para ela, "sem resposta do Auth" é só "sem conta".
  if (semResposta && !vitrine) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <EstadoCentral
          icon={WifiOff}
          titulo="Não conseguimos confirmar sua conta"
          descricao="A conexão falhou ou demorou demais. Confira a internet e tente de novo — nada do que você fez se perdeu."
          acao={<Button onClick={() => window.location.reload()}>Tentar de novo</Button>}
        />
      </div>
    );
  }

  if (semVinculo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <EstadoCentral
          icon={DoorClosed}
          titulo="Esta conta não tem acesso a este painel"
          descricao={
            papel === "staff" ? (
              <>
                Você está conectado como <strong className="text-ink">{user.email ?? user.phoneNumber}</strong>,
                que é barbeiro desta barbearia. O painel é do dono; a sua agenda e a sua
                comissão ficam em Minha agenda.
              </>
            ) : (
              <>
                Você está conectado como <strong className="text-ink">{user.email}</strong>, e
                esta conta não está vinculada a esta barbearia. Nada foi perdido — se você
                administra a barbearia, entre com a conta que recebeu o acesso.
              </>
            )
          }
          acao={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {/* Barbeiro desta casa: o painel é do dono, a agenda dele mora em
                  /barbeiro (08/10). */}
              {papel === "staff" ? (
                <Button onClick={() => router.replace("/barbeiro")}>Ir para minha agenda</Button>
              ) : (
                <Button onClick={() => router.replace("/")}>Ir para a área do cliente</Button>
              )}
              <Button
                variant="ghost"
                onClick={async () => {
                  await signOut(auth);
                  router.replace("/login");
                }}
              >
                Entrar com outra conta
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!loading && vitrine) return <>{children}</>;

  if (loading || !authorized || precisaOnboarding || esperandoFicha || precisaTrocarSenha || barbeiroNoInicio) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
