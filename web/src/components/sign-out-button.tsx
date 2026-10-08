"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/cn";
import { desativarNotificacao } from "@/lib/notificacoes";
import { useTenant } from "@/lib/tenant-context";

/** Quanto o sair espera pela retirada da notificação antes de seguir. */
const PRAZO_DA_NOTIFICACAO_MS = 4000;

/**
 * Sai da conta tirando antes este aparelho da lista de notificação. Os dois
 * botões de sair (app e barra lateral do painel) passam por aqui.
 *
 * A retirada vem ANTES do `signOut`: depois dele a chamada não tem mais quem a
 * autorize. Sem isto, o celular compartilhado continuava recebendo avisos da
 * conta que saiu — e quem entrasse em seguida veria encaixe e cancelamento de
 * outra pessoa.
 *
 * Mas sair não pode depender disso: sem rede, a retirada falha ou demora, e
 * quem tocou em "Sair" precisa sair. Falhou, segue — com o motivo no log, e o
 * endereço continua guardado no aparelho para a próxima vez.
 */
export async function sairDaConta(barbershopId: string) {
  try {
    await Promise.race([
      desativarNotificacao(barbershopId),
      new Promise((resolve) => setTimeout(resolve, PRAZO_DA_NOTIFICACAO_MS)),
    ]);
  } catch (e) {
    console.error("[sair] não deu para desligar a notificação deste aparelho", e);
  }
  await signOut(auth);
}

export function SignOutButton({
  className,
  children = "Sair da conta",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const { id: barbershopId } = useTenant();

  async function handleSignOut() {
    await sairDaConta(barbershopId);
    router.replace("/login");
  }

  return (
    <button
      onClick={handleSignOut}
      className={cn(
        "text-sm text-ink-muted transition-colors hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}
