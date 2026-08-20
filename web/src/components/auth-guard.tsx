"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DoorClosed } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { isOnboardingComplete } from "@/lib/tenant";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";

/**
 * Porta de entrada das áreas logadas. O login é um só (`/login`) — o que
 * separa cliente de dono é a permissão da conta, não a tela.
 */
export function AuthGuard({
  children,
  requireOwner,
}: {
  children: React.ReactNode;
  requireOwner?: boolean;
}) {
  const { user, claims, loading } = useAuth();
  const tenant = useTenant();
  const router = useRouter();

  /* O vínculo agora é por barbearia. `claims.role` é o modelo single-tenant
   * antigo, mantido enquanto houver token não renovado em circulação. */
  const papel = claims.barbershops?.[tenant.id] ?? claims.role;
  const isOwner = papel === "owner";
  const authorized = !!user && (!requireOwner || isOwner);

  /* Senha provisória vem antes de tudo: a conta só é dele depois que a senha
   * que mandamos por mensagem parar de funcionar. */
  const precisaTrocarSenha = !!user && claims.mustChangePassword === true;

  // Dono com onboarding pela metade não deve cair num painel vazio.
  const precisaOnboarding = isOwner && !isOnboardingComplete(tenant.onboarding);

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
    if (authorized) return;
    /* Sem conta → login. Com conta e sem vínculo NÃO redireciona mais: explica
     * e oferece as duas saídas reais. */
    if (!user) router.replace("/login");
  }, [loading, authorized, user, router, precisaOnboarding, precisaTrocarSenha]);

  if (semVinculo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <EstadoCentral
          icon={DoorClosed}
          titulo="Esta conta não tem acesso a este painel"
          descricao={
            <>
              Você está conectado como <strong className="text-ink">{user.email}</strong>, e
              esta conta não está vinculada a esta barbearia. Nada foi perdido — se você
              administra a barbearia, entre com a conta que recebeu o acesso.
            </>
          }
          acao={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => router.replace("/")}>Ir para a área do cliente</Button>
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

  if (loading || !authorized || precisaOnboarding || precisaTrocarSenha) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
