"use client";

import { createContext, useContext } from "react";
import { DEFAULT_TENANT, type Tenant } from "@/lib/tenant";

/**
 * A barbearia do subdomínio atual, resolvida no servidor e injetada aqui.
 *
 * Resolver no servidor evita o pior sintoma de white-label mal feito: a tela
 * abrir com a marca da plataforma e "piscar" para a marca do cliente depois da
 * hidratação. Como o layout raiz já é servidor, o tenant chega pronto no
 * primeiro byte de HTML.
 */
const TenantContext = createContext<Tenant>(DEFAULT_TENANT);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: Tenant;
  children: React.ReactNode;
}) {
  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>;
}

/** A barbearia atual. Nunca é nula: sem subdomínio, cai no tenant padrão. */
export function useTenant() {
  return useContext(TenantContext);
}

/** Atalho para as políticas — o que antes eram constantes de `business-rules`. */
export function usePolicies() {
  return useContext(TenantContext).policies;
}

/** Recurso liberado pelo plano contratado. */
export function useFeature(feature: keyof Tenant["features"]) {
  return useContext(TenantContext).features[feature];
}
