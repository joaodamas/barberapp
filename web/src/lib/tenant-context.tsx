"use client";

import { createContext, useContext } from "react";
import { acessoDaBarbearia, DEFAULT_TENANT, type Tenant } from "@/lib/tenant";

/**
 * A barbearia do subdomínio atual, resolvida no servidor e injetada aqui.
 *
 * Resolver no servidor evita o pior sintoma de white-label mal feito: a tela
 * abrir com a marca da plataforma e "piscar" para a marca do cliente depois da
 * hidratação. Como o layout raiz já é servidor, o tenant chega pronto no
 * primeiro byte de HTML.
 */
const TenantContext = createContext<Tenant>(DEFAULT_TENANT);

/**
 * O tenant é um SUBSTITUTO, não a barbearia de verdade.
 *
 * Existe separado do tenant porque `resolverTenant` já garante que
 * `tenant` nunca é nulo — em qualquer falha vem `DEFAULT_TENANT`. Sem este
 * sinal, quem consome não tem como saber se está olhando a barbearia do dono ou
 * a marca da plataforma no lugar dela.
 *
 * A decisão de degradar em silêncio na VITRINE é deliberada e continua valendo
 * (`tenant-server.ts`: *"barbearia com a marca da plataforma é melhor que
 * barbearia fora do ar"*). Este sinal não a desfaz — apenas permite que telas
 * onde o silêncio é inaceitável façam diferente. Hoje é uma só: o login.
 */
const TenantIndisponivelContext = createContext(false);

export function TenantProvider({
  tenant,
  indisponivel = false,
  children,
}: {
  tenant: Tenant;
  /** A resolução falhou por infraestrutura e `tenant` é o padrão da plataforma. */
  indisponivel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenant}>
      <TenantIndisponivelContext.Provider value={indisponivel}>
        {children}
      </TenantIndisponivelContext.Provider>
    </TenantContext.Provider>
  );
}

/** A barbearia atual. Nunca é nula: sem subdomínio, cai no tenant padrão. */
export function useTenant() {
  return useContext(TenantContext);
}

/**
 * `true` quando o que está em `useTenant()` é substituto, não a barbearia.
 *
 * Quem pergunta isto está prestes a **afirmar uma identidade** para o usuário.
 * Quem só precisa de cor, ícone ou nome curto não precisa perguntar.
 */
export function useTenantIndisponivel() {
  return useContext(TenantIndisponivelContext);
}

/** Atalho para as políticas — o que antes eram constantes de `business-rules`. */
export function usePolicies() {
  return useContext(TenantContext).policies;
}

/**
 * Recurso liberado — já considerando plano, trial e suspensão.
 *
 * Lia `tenant.features` **cru**, direto do documento, e por isso ignorava
 * `status` e `trial`. O efeito: numa barbearia suspensa, `acessoDaBarbearia`
 * devolvia "nenhum recurso", mas `features` gravado no documento continuava
 * dizendo `store: true` — e Loja e Mensalistas seguiam abertas. Eram duas
 * respostas para a mesma pergunta, divergindo exatamente no caso que importa.
 *
 * O DRE tinha os dois gates e só se salvava porque o segundo (`useAcesso`)
 * pegava o que o primeiro deixava passar.
 *
 * Agora existe uma fonte só, como o `HANDOFF.md` §4 já dizia que deveria:
 * "a decisão de acesso mora num lugar só (`acessoDaBarbearia`)".
 */
export function useFeature(feature: keyof Tenant["features"]) {
  return useAcesso().features[feature];
}

/**
 * O que esta barbearia pode fazer agora.
 *
 * Deriva de status, trial e plano — ver `acessoDaBarbearia`. Existe como hook
 * próprio para nenhuma tela precisar repetir a regra: quem pergunta "posso
 * mostrar o DRE?" pergunta aqui, e a resposta muda num lugar só quando o
 * pacote de planos mudar.
 */
export function useAcesso() {
  return acessoDaBarbearia(useContext(TenantContext));
}
