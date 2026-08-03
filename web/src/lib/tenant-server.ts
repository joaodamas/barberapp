import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { doc, getDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import {
  ALL_FEATURES,
  DEFAULT_SCHEDULE,
  DEFAULT_TENANT,
  PLATFORM_DEFAULT_POLICIES,
  slugFromHost,
  type Tenant,
  type TenantTrial,
} from "@/lib/tenant";

/**
 * Resolve a barbearia do subdomínio, no servidor.
 *
 * Usa o SDK CLIENTE, não o Admin, e a leitura passa pelas Security Rules como
 * qualquer outra. Isso é possível porque a ficha da barbearia é pública — é
 * vitrine, a mesma informação que está na fachada. Contrato e cobrança vivem em
 * `/barbershops/{id}/private`, que ninguém de fora alcança.
 *
 * Duas razões para não usar `firebase-admin` aqui:
 *
 * 1. O Turbopack o externaliza com um nome hasheado que não resolve em
 *    execução — o servidor sobe e devolve 500 em TODA rota. O pacote está no
 *    bundle; o especificador é que não bate. Custou um deploy inteiro para
 *    aparecer, porque em desenvolvimento o módulo resolve normalmente.
 * 2. Admin SDK ignora as regras. Para ler dado público isso é poder demais: um
 *    erro de caminho passaria a expor exatamente o que as regras protegem.
 *
 * CONSEQUÊNCIA ARQUITETURAL: ler o `host` torna a rota dinâmica. O app era 100%
 * estático; com subdomínio por barbearia ele deixa de ser — não se prerenderiza
 * marca que só se conhece na requisição. A mitigação é o cache de borda por
 * host em `next.config.ts`.
 *
 * `cache()` do React deduplica a leitura DENTRO de uma mesma requisição: o
 * layout raiz, o `generateMetadata` e o manifest chamam `getTenant()` cada um
 * por sua conta, e sem isso seriam três leituras do Firestore por acesso.
 */
export const getTenant = cache(async function getTenant(): Promise<Tenant> {
  const headerList = await headers();
  const slug = slugFromHost(headerList.get("host"));

  if (!slug) return DEFAULT_TENANT;

  const tenant = await loadTenantBySlug(slug);
  if (!tenant) {
    console.warn(`[tenant] subdomínio sem barbearia: ${slug}`);
    return DEFAULT_TENANT;
  }
  return tenant;
});

/**
 * `/slugs/{slug}` → `/barbershops/{id}`.
 *
 * Duas leituras por render não cacheado. O documento quase nunca muda, e o
 * cache de borda faz o render acontecer uma vez por barbearia — na prática são
 * duas leituras por barbearia a cada `s-maxage`, não por visita.
 */
async function loadTenantBySlug(slug: string): Promise<Tenant | null> {
  try {
    const db = await getDb();

    const slugDoc = await getDoc(doc(db, "slugs", slug));
    if (!slugDoc.exists()) return null;

    const barbershopId = slugDoc.data()?.barbershopId as string | undefined;
    if (!barbershopId) return null;

    const shopDoc = await getDoc(doc(db, "barbershops", barbershopId));
    if (!shopDoc.exists()) return null;

    return toTenant(barbershopId, shopDoc.data() ?? {});
  } catch (error) {
    // Barbearia fora do ar é pior que barbearia com a marca da plataforma:
    // degrada em vez de derrubar, e o erro fica no log.
    console.error(`[tenant] falha ao carregar "${slug}"`, error);
    return null;
  }
}

/** Documento do Firestore → `Tenant`, com o padrão da plataforma no que faltar. */
function toTenant(id: string, data: Record<string, unknown>): Tenant {
  const brand = (data.brand ?? {}) as Partial<Tenant["brand"]>;
  const contact = (data.contact ?? {}) as Partial<Tenant["contact"]>;
  const policies = (data.policies ?? {}) as Partial<Tenant["policies"]>;
  const features = (data.features ?? {}) as Partial<Tenant["features"]>;

  return {
    id,
    slug: String(data.slug ?? id),
    status: (data.status as Tenant["status"]) ?? "ativo",
    brand: { ...DEFAULT_TENANT.brand, ...brand },
    contact: { ...DEFAULT_TENANT.contact, ...contact },
    // Política ausente cai no padrão da plataforma — nunca em undefined, que
    // viraria NaN em cálculo de reembolso.
    policies: { ...PLATFORM_DEFAULT_POLICIES, ...policies },
    features: { ...ALL_FEATURES, ...features },
    schedule: { ...DEFAULT_SCHEDULE, ...((data.schedule ?? {}) as object) },
    trial: toTrial(data.trial),
    onboarding: toOnboarding(data.onboarding),
  };
}

/**
 * Timestamp do Firestore → ISO.
 *
 * O tenant atravessa de Server para Client Component. `Timestamp` é uma classe
 * e o React recusa: "Only plain objects can be passed to Client Components".
 * TODA data que sai daqui precisa passar por esta função — foi assim que o
 * `onboarding.completedAt` derrubou a rota inteira com 500.
 */
function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toTrial(raw: unknown): TenantTrial | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { startedAt?: unknown; endsAt?: unknown };
  const startedAt = toISO(value.startedAt);
  const endsAt = toISO(value.endsAt);
  return startedAt && endsAt ? { startedAt, endsAt } : null;
}

function toOnboarding(raw: unknown): Tenant["onboarding"] {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    completedSteps: Array.isArray(value.completedSteps)
      ? (value.completedSteps as Tenant["onboarding"]["completedSteps"])
      : [],
    completedAt: toISO(value.completedAt),
    sharedLink: value.sharedLink === true,
  };
}
