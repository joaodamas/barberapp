"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTenant, useTenantIndisponivel } from "@/lib/tenant-context";
import { DEFAULT_TENANT } from "@/lib/tenant";

/**
 * Traz o histórico de balcão para a conta que entrou por SMS (02/10).
 *
 * Não desenha nada. Quando quem está logado tem telefone verificado pelo
 * Firebase (`user.phoneNumber`), pede ao servidor para vincular os cadastros
 * de balcão daquele número NESTA barbearia. A decisão — e a prova — é do
 * servidor (`vinculo-de-cadastro.ts`); aqui é só o gatilho, uma vez por
 * sessão. As reservas movidas aparecem sozinhas: a tela escuta `bookings` por
 * `clientId`.
 */
export function VinculoPeloTelefone() {
  const { user } = useAuth();
  const tenant = useTenant();
  const indisponivel = useTenantIndisponivel();
  const uid = user?.uid;
  const telefone = user?.phoneNumber;

  useEffect(() => {
    if (!uid || !telefone || indisponivel || tenant.id === DEFAULT_TENANT.id) return;
    const chave = `vinculo-telefone:${uid}:${tenant.id}`;
    try {
      if (sessionStorage.getItem(chave)) return;
      sessionStorage.setItem(chave, "1");
    } catch {
      /* Sem sessionStorage (aba privada): chama assim mesmo — é idempotente. */
    }
    import("@/lib/firebase")
      .then(({ callFunction }) => callFunction("vincularMinhaContaPeloTelefone", { barbershopId: tenant.id }))
      .catch((err) => console.warn("[vinculo] não foi possível vincular pelo telefone", err));
  }, [uid, telefone, indisponivel, tenant.id]);

  return null;
}
