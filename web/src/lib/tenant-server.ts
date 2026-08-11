import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  DEFAULT_SCHEDULE,
  DEFAULT_TENANT,
  featuresForPlan,
  PLATFORM_DEFAULT_POLICIES,
  slugFromHost,
  type Tenant,
  type TenantTrial,
} from "@/lib/tenant";

/**
 * Resolve a barbearia do subdomínio, no servidor.
 *
 * Lê pela API REST do Firestore, com `fetch`, sem SDK nenhum. São dois
 * documentos públicos — a ficha da barbearia é vitrine, a mesma informação que
 * está na fachada; contrato e cobrança vivem em `/barbershops/{id}/private`,
 * que ninguém de fora alcança.
 *
 * Por que nem Admin SDK nem SDK cliente:
 *
 * 1. `firebase-admin` é externalizado pelo Turbopack com um nome hasheado que
 *    não resolve em execução — o servidor sobe e devolve 500 em TODA rota.
 * 2. O SDK cliente é feito para navegador. Em Node ele falha em silêncio aqui:
 *    a resolução caía no tenant padrão, o app passava a consultar uma barbearia
 *    inexistente e o dono era expulso do próprio painel, porque o claim dele
 *    não batia com o id errado. Sem erro no log — o pior tipo de falha.
 *
 * `fetch` não tem bundler no caminho, não tem dependência, e o Next ainda
 * cacheia a resposta por conta própria.
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

  /* `x-forwarded-host` ANTES de `host`.
   *
   * O Firebase Hosting encaminha para o Cloud Run reescrevendo o `Host` para o
   * domínio interno `*.run.app`. Lendo só `host`, o subdomínio da barbearia
   * some no caminho: `slugFromHost` devolve nulo, o app cai no tenant padrão e
   * o dono é expulso do próprio painel — tudo isso SEM erro em log nenhum,
   * porque nada falhou, só chegou informação errada.
   *
   * Em desenvolvimento não existe proxy, então o sintoma não aparece: só surge
   * no primeiro acesso real em produção. */
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host");

  const slug = slugFromHost(host);

  if (!slug) return DEFAULT_TENANT;

  const tenant = await loadTenantBySlug(slug);
  if (!tenant) {
    console.warn(`[tenant] subdomínio sem barbearia: ${slug}`);
    return DEFAULT_TENANT;
  }
  return tenant;
});

/**
 * O host é o domínio da PLATAFORMA, sem barbearia?
 *
 * Serve para o domínio raiz mostrar a landing em vez do app do cliente. Sem
 * isso a página da plataforma existe em `/landing` e ninguém chega nela: quem
 * digita o domínio cai numa tela de login de uma barbearia que não existe.
 */
export const isPlatformRoot = cache(async function isPlatformRoot(): Promise<boolean> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  return slugFromHost(host) === null;
});

/**
 * `/slugs/{slug}` → `/barbershops/{id}`.
 *
 * Duas leituras por render não cacheado. O documento quase nunca muda, e o
 * cache de borda faz o render acontecer uma vez por barbearia — na prática são
 * duas leituras por barbearia a cada `s-maxage`, não por visita.
 */
async function loadTenantBySlug(slug: string): Promise<Tenant | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  /* Com o emulador ligado, ler daqui a PRODUÇÃO é pior que não ler nada.
   *
   * O SDK cliente respeita `connectFirestoreEmulator`, mas esta resolução usa
   * `fetch` direto na REST — e ficava apontada para o Firestore de verdade. O
   * sintoma não parece de tenant: o slug local não existe lá, cai no tenant
   * padrão, e o dono de uma barbearia local é tratado como CLIENTE, porque o
   * claim dele não bate com o id do tenant errado. Some o painel, sem erro.
   *
   * O emulador serve a mesma REST na porta 8080. */
  /* Cache de uma hora sobre o emulador esconde o que você acabou de semear. */
  const emEmulador = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
  const base = emEmulador
    ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

  try {
    // O documento de slug quase nunca muda: uma hora de cache é conservador.
    const slugRes = await fetch(`${base}/slugs/${encodeURIComponent(slug)}`, {
      next: { revalidate: emEmulador ? 0 : 3600 },
    });
    if (!slugRes.ok) return null;

    const barbershopId = readString((await slugRes.json())?.fields?.barbershopId);
    if (!barbershopId) return null;

    // A ficha muda quando o dono edita a marca: cinco minutos.
    const shopRes = await fetch(`${base}/barbershops/${barbershopId}`, {
      next: { revalidate: emEmulador ? 0 : 300 },
    });
    if (!shopRes.ok) return null;

    const fields = (await shopRes.json())?.fields;
    if (!fields) return null;

    return toTenant(barbershopId, decode(fields) as Record<string, unknown>);
  } catch (error) {
    // Barbearia fora do ar é pior que barbearia com a marca da plataforma:
    // degrada em vez de derrubar, e o erro fica no log.
    console.error(`[tenant] falha ao carregar "${slug}"`, error);
    return null;
  }
}

/**
 * A REST do Firestore devolve valores tipados (`{ stringValue }`,
 * `{ mapValue: { fields } }`). Converte para objeto comum.
 */
function decode(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  const v = value as Record<string, unknown>;

  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) {
    const values = (v.arrayValue as { values?: unknown[] })?.values ?? [];
    return values.map(decode);
  }
  if ("mapValue" in v) {
    const fields = (v.mapValue as { fields?: Record<string, unknown> })?.fields ?? {};
    return decode(fields);
  }

  // Já é um mapa de campos.
  return Object.fromEntries(Object.entries(v).map(([k, item]) => [k, decode(item)]));
}

function readString(field: unknown): string | undefined {
  const value = decode(field);
  return typeof value === "string" ? value : undefined;
}

/** Documento do Firestore → `Tenant`, com o padrão da plataforma no que faltar. */
function toTenant(id: string, data: Record<string, unknown>): Tenant {
  const brand = (data.brand ?? {}) as Partial<Tenant["brand"]>;
  const contact = (data.contact ?? {}) as Partial<Tenant["contact"]>;
  const policies = (data.policies ?? {}) as Partial<Tenant["policies"]>;
  const features = (data.features ?? {}) as Partial<Tenant["features"]>;
  const locale = (data.locale ?? {}) as Partial<Tenant["locale"]>;

  /* O plano é a base do que está liberado, e é campo imutável pela regra — ao
   * contrário de `features`, que o dono conseguia escrever direto. `plan`
   * ausente cai no plano de entrada: barbearia sem contrato conhecido recebe o
   * mínimo, não o máximo. */
  const plan: Tenant["plan"] = data.plan === "completo" ? "completo" : "entrada";

  return {
    id,
    slug: String(data.slug ?? id),
    status: (data.status as Tenant["status"]) ?? "ativo",
    plan,
    brand: { ...DEFAULT_TENANT.brand, ...brand },
    contact: { ...DEFAULT_TENANT.contact, ...contact },
    /* Barbearia sem `locale` gravado herda o padrão da plataforma. Nunca
     * `undefined`: `Intl` com fuso indefinido cai no fuso do SERVIDOR, que é
     * UTC — e aí a data da confirmação escorrega um dia sem erro nenhum. */
    locale: { ...DEFAULT_LOCALE, ...locale },
    // Política ausente cai no padrão da plataforma — nunca em undefined, que
    // viraria NaN em cálculo de reembolso.
    policies: { ...PLATFORM_DEFAULT_POLICIES, ...policies },
    /* Derivar do plano, não do catálogo completo.
     *
     * Era `{ ...ALL_FEATURES, ...features }`: documento sem o campo `features`
     * — que é exatamente o que `signUpBarbershop` criava — virava todo recurso
     * liberado. Todo cliente self-service ganhava o plano de cima de graça, sem
     * precisar de ataque nenhum. Agora a ausência resolve pelo plano contratado
     * e só o campo explícito sobrepõe. */
    features: { ...featuresForPlan(plan), ...features },
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
