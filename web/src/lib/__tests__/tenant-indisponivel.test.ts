/**
 * D30 — falha de infraestrutura não pode virar "você não pertence a este painel".
 *
 * ## O defeito, reproduzido antes de qualquer correção
 *
 * O dono estava logado, no painel, olhando o financeiro. O Firestore caiu. Em
 * vez de uma tela dizendo "não consegui carregar, tente de novo", ele foi
 * mandado para a vitrine pública — a mesma experiência de quem nunca teve conta.
 *
 * O caminho inteiro:
 *
 * ```
 * Firestore cai
 *   → fetch lança  (ou responde 503)
 *   → loadTenantBySlug devolvia null
 *   → getTenant devolvia DEFAULT_TENANT              id: "cortehub"
 *   → AuthGuard lê claims.barbershops["cortehub"]    → undefined
 *   → isOwner = false
 *   → router.replace("/")                            fora do painel
 * ```
 *
 * A camada de tenant traduzia **"não consegui carregar"** para **"você não
 * pertence a este painel"**. É separado do D27, que é uma coleção falhando
 * dentro de uma tela já carregada: aqui o dono perde o painel inteiro.
 *
 * ## Evidência bruta contra o emulador, antes do teste
 *
 * ```
 * emulador no ar, slug existe     GET /slugs/osiqueira      HTTP 200
 * emulador no ar, slug não existe GET /slugs/naoexiste      HTTP 404 NOT_FOUND
 * emulador derrubado              GET /slugs/osiqueira      conexão recusada
 * ```
 *
 * Os dois últimos convergiam para o mesmo `return null` e para o mesmo
 * `DEFAULT_TENANT`. É essa convergência que os testes abaixo travam.
 *
 * ## A régua da classificação
 *
 * Os dois erros não custam o mesmo. Tratar transitório como permanente expulsa
 * o dono (o defeito). Tratar permanente como transitório prende quem digitou o
 * subdomínio errado num "tente de novo" que nunca funciona — pior, porque nunca
 * se resolve sozinho. Por isso só 5xx e 429 entram em `indisponivel`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  /* `cache()` memoiza por requisição. No teste cada chamada precisa ser uma
   * requisição nova, senão o segundo cenário leria a resposta do primeiro. */
  return { ...react, cache: <T,>(fn: T) => fn };
});

let hostAtual: string | null = "osiqueira.jpproject.com.br";
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (nome: string) => (nome === "host" ? hostAtual : null),
  }),
}));

const { resolverTenant, getTenant, isPlatformRoot } = await import("@/lib/tenant-server");
const { DEFAULT_TENANT } = await import("@/lib/tenant");

/* Os ids reais semeados por `scripts/semear-day-in-the-life.mjs`. */
const SLUG = "osiqueira";
const SHOP_ID = "shop-day-in-the-life";

/** A forma tipada que a REST do Firestore devolve. */
const SLUG_DOC = { fields: { barbershopId: { stringValue: SHOP_ID } } };
const FICHA = {
  fields: {
    slug: { stringValue: SLUG },
    status: { stringValue: "ativo" },
    plan: { stringValue: "gestao" },
  },
};

function firestoreRespondendo(handler: (url: string) => Response) {
  vi.stubGlobal("fetch", vi.fn(async (url: unknown) => handler(String(url))));
}

/** O Firestore saudável: os dois documentos existem. */
function firestoreNoAr() {
  firestoreRespondendo((url) =>
    Response.json(url.includes("/slugs/") ? SLUG_DOC : FICHA)
  );
}

function comProjeto() {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "day-in-the-life");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  hostAtual = `${SLUG}.jpproject.com.br`;
});

describe("D30 · o caminho feliz não muda", () => {
  it("com o Firestore no ar, resolve a barbearia do subdomínio", async () => {
    comProjeto();
    firestoreNoAr();

    const { estado, tenant } = await resolverTenant();

    expect(estado).toBe("resolvido");
    expect(tenant.id).toBe(SHOP_ID);
  });

  it("`getTenant` mantém assinatura e devolve o mesmo tenant de sempre", async () => {
    /* Layout raiz, `generateMetadata`, manifest e vitrine continuam chamando
     * isto. Se o contrato mudasse, a correção do painel quebraria as quatro. */
    comProjeto();
    firestoreNoAr();

    expect((await getTenant()).id).toBe(SHOP_ID);
  });
});

describe("D30 · o que DEVE continuar caindo no tenant padrão", () => {
  it("host sem subdomínio de barbearia — domínio raiz, localhost, preview", async () => {
    hostAtual = "localhost:3000";

    const { estado, tenant } = await resolverTenant();

    expect(estado).toBe("sem-barbearia");
    expect(tenant.id).toBe(DEFAULT_TENANT.id);
    // E o desvio para a landing continua acontecendo, que é o correto aqui.
    expect(await isPlatformRoot()).toBe(true);
  });

  it("subdomínio que nunca existiu — 404 no documento de slug", async () => {
    comProjeto();
    hostAtual = "barbearia-que-nao-existe.jpproject.com.br";
    firestoreRespondendo(() => new Response("", { status: 404 }));

    const { estado, tenant } = await resolverTenant();

    expect(estado).toBe("inexistente");
    expect(tenant.id).toBe(DEFAULT_TENANT.id);
  });

  it("slug aponta para uma ficha que não existe mais — barbearia encerrada e removida", async () => {
    comProjeto();
    firestoreRespondendo((url) =>
      url.includes("/slugs/") ? Response.json(SLUG_DOC) : new Response("", { status: 404 })
    );

    expect((await resolverTenant()).estado).toBe("inexistente");
  });

  it("documento de slug sem `barbershopId` — dado quebrado é permanente", async () => {
    /* Recarregar não conserta um campo que não está lá. Prender o visitante num
     * "tente de novo" seria trocar um defeito por outro. */
    comProjeto();
    firestoreRespondendo(() => Response.json({ fields: {} }));

    expect((await resolverTenant()).estado).toBe("inexistente");
  });

  it("403 das regras não é infraestrutura — segue permanente", async () => {
    comProjeto();
    firestoreRespondendo(() => new Response("", { status: 403 }));

    expect((await resolverTenant()).estado).toBe("inexistente");
  });
});

describe("D30 · o que NÃO pode mais ser confundido com barbearia inexistente", () => {
  it("Firestore fora do ar: `fetch` lança e a resolução diz INDISPONÍVEL", async () => {
    comProjeto();
    firestoreRespondendo(() => {
      // Exatamente o que o curl mostrou com o emulador derrubado.
      throw new TypeError("fetch failed");
    });

    const { estado, tenant } = await resolverTenant();

    expect(estado).toBe("indisponivel");
    // O substituto continua vindo, porque a vitrine precisa renderizar algo.
    expect(tenant.id).toBe(DEFAULT_TENANT.id);
  });

  it("503 e 500 são infraestrutura", async () => {
    comProjeto();
    for (const status of [500, 502, 503, 504]) {
      firestoreRespondendo(() => new Response("", { status }));
      expect((await resolverTenant()).estado).toBe("indisponivel");
    }
  });

  it("429 — excesso de chamadas passa, e é transitório por definição", async () => {
    comProjeto();
    firestoreRespondendo(() => new Response("", { status: 429 }));

    expect((await resolverTenant()).estado).toBe("indisponivel");
  });

  it("a ficha cai DEPOIS do slug ter sido lido com sucesso", async () => {
    /* O caso mais próximo do relato: o slug estava em cache de borda e a
     * segunda leitura pegou o banco já fora do ar. */
    comProjeto();
    firestoreRespondendo((url) =>
      url.includes("/slugs/") ? Response.json(SLUG_DOC) : new Response("", { status: 503 })
    );

    expect((await resolverTenant()).estado).toBe("indisponivel");
  });

  it("configuração ausente não é barbearia inexistente", async () => {
    /* Sem `projectId` nenhuma pergunta chegou ao banco. Responder
     * "não existe" a uma pergunta que não foi feita é o mesmo erro de classe. */
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "");
    firestoreNoAr();

    expect((await resolverTenant()).estado).toBe("indisponivel");
  });

  it("503 e 404 deixam de produzir o mesmo resultado — era ESTE o defeito", async () => {
    comProjeto();

    firestoreRespondendo(() => new Response("", { status: 503 }));
    const caiu = await resolverTenant();

    firestoreRespondendo(() => new Response("", { status: 404 }));
    const naoExiste = await resolverTenant();

    expect(caiu.estado).not.toBe(naoExiste.estado);
    // O tenant substituto é o mesmo; o que mudou é saber POR QUE ele veio.
    expect(caiu.tenant.id).toBe(naoExiste.tenant.id);
  });
});

describe("D30 · a decisão do AuthGuard, com e sem a distinção", () => {
  /* A autorização vive em `components/auth-guard.tsx:26-28` e a suíte roda em
   * ambiente `node`, sem React DOM. A expressão é reproduzida literalmente. */
  const claimsDoDono = { barbershops: { [SHOP_ID]: "owner" } as Record<string, string> };

  function ehDono(tenantId: string) {
    const papel = claimsDoDono.barbershops?.[tenantId];
    return papel === "owner";
  }

  it("com o tenant resolvido, o dono é dono", async () => {
    comProjeto();
    firestoreNoAr();

    const { tenant } = await resolverTenant();

    expect(ehDono(tenant.id)).toBe(true);
  });

  it("com o tenant substituído, o dono deixa de ser dono — a expulsão", async () => {
    comProjeto();
    firestoreRespondendo(() => {
      throw new TypeError("fetch failed");
    });

    const { estado, tenant } = await resolverTenant();

    // O `AuthGuard`, sozinho, continua concluindo "não é dono"…
    expect(ehDono(tenant.id)).toBe(false);
    // …e é por isso que ele não pode ser CONSULTADO neste estado.
    expect(estado).toBe("indisponivel");
  });
});
