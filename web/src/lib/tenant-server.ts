import "server-only";
import { headers } from "next/headers";
import { DEFAULT_TENANT, slugFromHost, type Tenant } from "@/lib/tenant";

/**
 * Resolve a barbearia do subdomínio, no servidor.
 *
 * CONSEQUÊNCIA ARQUITETURAL: ler o `host` torna a rota dinâmica. O app era
 * 100% estático (19 rotas prerenderizadas); com subdomínio por barbearia ele
 * deixa de ser — não dá para prerender uma marca que só se conhece na
 * requisição.
 *
 * Isso é o preço do ícone próprio na tela do celular, que foi a razão de
 * escolher subdomínio em vez de caminho na URL. Como todo o conteúdo logado já
 * renderizava só um spinner no HTML estático (o AuthGuard resolve no cliente),
 * a perda real de performance é próxima de zero.
 */
export async function getTenant(): Promise<Tenant> {
  const headerList = await headers();
  const slug = slugFromHost(headerList.get("host"));

  if (!slug || slug === DEFAULT_TENANT.slug) {
    return DEFAULT_TENANT;
  }

  const tenant = await loadTenantBySlug(slug);
  return tenant ?? DEFAULT_TENANT;
}

/**
 * Carrega a barbearia pelo slug.
 *
 * Hoje devolve null para qualquer slug que não seja o de referência — o
 * Firestore ainda não é usado por nenhuma tela. Quando entrar, esta função lê
 * `/slugs/{slug}` para descobrir o id e então `/barbershops/{id}`, com cache:
 * é uma leitura por requisição e o documento quase nunca muda.
 *
 *   const { getDb } = await import("@/lib/firebase");
 *   const db = await getDb();
 *   const slugDoc = await getDoc(doc(db, "slugs", slug));
 *   if (!slugDoc.exists()) return null;
 *   const shop = await getDoc(doc(db, "barbershops", slugDoc.data().barbershopId));
 *   return shop.exists() ? toTenant(shop) : null;
 */
async function loadTenantBySlug(slug: string): Promise<Tenant | null> {
  if (slug === DEFAULT_TENANT.slug) return DEFAULT_TENANT;
  return null;
}
