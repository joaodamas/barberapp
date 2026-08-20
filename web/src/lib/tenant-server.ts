import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { DEFAULT_TENANT, slugFromHost, type Tenant } from "@/lib/tenant";
/* A normalização mora em `tenant-shape` porque o painel também precisa dela:
 * ele lê a mesma ficha pelo SDK cliente, em tempo real. Duas implementações do
 * mesmo merge divergiriam, e o preço da divergência é uma política sumir num
 * caminho de leitura e não no outro. */
import { toTenant } from "@/lib/tenant-shape";

/* ---------------------------------------------------------------------------
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
 * ------------------------------------------------------------------------- */
/**
 * Por que a resolução tem ESTADO, e não só um tenant — D30.
 *
 * `loadTenantBySlug` devolvia `null` para cinco situações diferentes, e
 * `getTenant` transformava todas elas no MESMO `DEFAULT_TENANT`. O 404 de um
 * subdomínio que não existe e o 503 do Firestore fora do ar chegavam
 * indistinguíveis do outro lado — e o outro lado é `AuthGuard`, que compara o
 * claim do dono com `tenant.id`.
 *
 * O caminho completo do defeito, reproduzido em `tenant-indisponivel.test.ts`:
 *
 * ```
 * Firestore cai
 *   → fetch lança
 *   → loadTenantBySlug devolve null
 *   → getTenant devolve DEFAULT_TENANT           id: "cortehub"
 *   → AuthGuard lê claims.barbershops["cortehub"]  → undefined
 *   → isOwner = false
 *   → router.replace("/")                        o dono vai para a vitrine
 * ```
 *
 * Ele estava logado, no painel, olhando o financeiro. O banco caiu e ele foi
 * tratado como quem nunca teve conta. A camada de tenant traduziu **"não
 * consegui carregar"** para **"você não pertence a este painel"**.
 *
 * A distinção que este tipo carrega é a correção: quem consome decide, e só
 * pode decidir se souber a diferença.
 */
export type EstadoDoTenant =
  /** Achei a barbearia. */
  | "resolvido"
  /** O host não tem subdomínio de barbearia — domínio raiz, localhost, preview. */
  | "sem-barbearia"
  /** O Firestore respondeu, e a barbearia não existe (404) ou está corrompida. */
  | "inexistente"
  /** Não consegui perguntar: rede, 5xx, timeout, configuração ausente. */
  | "indisponivel";

export type ResolucaoDeTenant = {
  estado: EstadoDoTenant;
  /**
   * Nunca é nulo. Em qualquer falha vem `DEFAULT_TENANT`, porque a vitrine
   * pública precisa renderizar de qualquer jeito — o que muda é que agora o
   * chamador sabe que aquilo é um substituto, e não a barbearia dele.
   */
  tenant: Tenant;
};

/**
 * A resolução com o estado à mostra.
 *
 * Só o PAINEL precisa da distinção: é lá que existe um dono para expulsar. A
 * vitrine pública continua degradando para `DEFAULT_TENANT` sem alarde, que é a
 * decisão registrada em `loadTenantBySlug` — barbearia com a marca da
 * plataforma é melhor que barbearia fora do ar.
 */
export const resolverTenant = cache(async function resolverTenant(): Promise<ResolucaoDeTenant> {
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

  if (!slug) return { estado: "sem-barbearia", tenant: DEFAULT_TENANT };

  return loadTenantBySlug(slug);
});

/**
 * A barbearia do subdomínio. Assinatura e comportamento inalterados: quem só
 * quer a marca — layout raiz, `generateMetadata`, manifest, vitrine — continua
 * chamando isto e continua recebendo `DEFAULT_TENANT` quando a leitura falha.
 */
export const getTenant = cache(async function getTenant(): Promise<Tenant> {
  return (await resolverTenant()).tenant;
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
async function loadTenantBySlug(slug: string): Promise<ResolucaoDeTenant> {
  /* Configuração ausente NÃO é "a barbearia não existe".
   *
   * Sem `projectId` não houve pergunta nenhuma ao banco — e responder
   * "inexistente" a uma pergunta que não foi feita é exatamente o erro que o
   * D30 corrige, só que uma camada acima. */
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("[tenant] NEXT_PUBLIC_FIREBASE_PROJECT_ID ausente");
    return indisponivel;
  }

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
    if (!slugRes.ok) return classificarResposta(slug, "slugs", slugRes.status);

    const barbershopId = readString((await slugRes.json())?.fields?.barbershopId);
    /* O documento existe e está sem o campo. É dado quebrado, não banco fora
     * do ar — permanente, e por isso "inexistente": recarregar não conserta. */
    if (!barbershopId) {
      console.warn(`[tenant] slug "${slug}" sem barbershopId`);
      return inexistente;
    }

    // A ficha muda quando o dono edita a marca: cinco minutos.
    const shopRes = await fetch(`${base}/barbershops/${barbershopId}`, {
      next: { revalidate: emEmulador ? 0 : 300 },
    });
    if (!shopRes.ok) return classificarResposta(slug, "barbershops", shopRes.status);

    const fields = (await shopRes.json())?.fields;
    if (!fields) {
      console.warn(`[tenant] ficha vazia em barbershops/${barbershopId}`);
      return inexistente;
    }

    return {
      estado: "resolvido",
      tenant: toTenant(barbershopId, decode(fields) as Record<string, unknown>),
    };
  } catch (error) {
    /* `fetch` só rejeita por rede: DNS, conexão recusada, timeout, socket
     * derrubado no meio. Nenhuma dessas respostas é "a barbearia não existe" —
     * é "não consegui perguntar". Era ESTE ramo que expulsava o dono.
     *
     * A vitrine pública continua degradando (o chamador é quem decide), e o
     * erro continua no log. */
    console.error(`[tenant] Firestore indisponível ao carregar "${slug}"`, error);
    return indisponivel;
  }
}

/** Em falha, o substituto é sempre a marca da plataforma — nunca nada. */
const indisponivel: ResolucaoDeTenant = { estado: "indisponivel", tenant: DEFAULT_TENANT };
const inexistente: ResolucaoDeTenant = { estado: "inexistente", tenant: DEFAULT_TENANT };

/**
 * O código HTTP diz se a resposta é um FATO ou uma falha de infraestrutura.
 *
 * A régua é deliberadamente conservadora, porque os dois erros não custam o
 * mesmo: tratar transitório como permanente expulsa o dono do produto (o D30);
 * tratar permanente como transitório prende quem digitou um subdomínio errado
 * numa tela de "tente de novo" que nunca vai funcionar. O segundo é pior, então
 * só entra em `indisponivel` o que é INEQUIVOCAMENTE infraestrutura — 5xx e o
 * 429 de excesso de chamadas. Todo o resto, incluindo 404 e 403, permanece
 * permanente e mantém o comportamento de hoje.
 */
function classificarResposta(
  slug: string,
  colecao: string,
  status: number
): ResolucaoDeTenant {
  if (status >= 500 || status === 429) {
    console.error(`[tenant] ${colecao} respondeu ${status} para "${slug}"`);
    return indisponivel;
  }
  /* Era aqui que o log mentia: dizia "subdomínio sem barbearia" para QUALQUER
   * código, 503 incluído. Quem lesse o log de um incidente concluiria que o
   * cliente tinha sumido do banco. */
  console.warn(`[tenant] ${colecao} respondeu ${status} para "${slug}"`);
  return inexistente;
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
