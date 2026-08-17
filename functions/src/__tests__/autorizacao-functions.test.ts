import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Nenhuma Cloud Function aceita `barbershopId` arbitrário sem verificar o
 * vínculo de quem chamou.
 *
 * Por que este teste existe, e por que ele lê o código-fonte:
 *
 * As regras do Firestore protegem o DADO, e o Admin SDK as ignora. Toda
 * function roda com privilégio total — então a única barreira entre um usuário
 * autenticado e a barbearia de outra pessoa é a guarda escrita no começo do
 * handler. Uma function nova que esqueça essa guarda não quebra nenhum teste de
 * regra, não aparece na suíte, e passa despercebida até alguém tentar.
 *
 * O ataque que ele fecha: o dono da Alfa chama `completeOnboardingStep` com
 * `barbershopId` da Beta. Ele está autenticado, o token é válido, e o Admin SDK
 * escreveria sem reclamar.
 *
 * É um teste ESTRUTURAL, e a fragilidade é conhecida: ele confere um padrão de
 * código, não o comportamento em execução. Vale mesmo assim, porque o custo de
 * errar aqui é vazamento entre clientes pagantes, e porque ele pega a função
 * NOVA — que é justamente o caso que ninguém lembra de testar.
 */

const SRC = resolve(__dirname, "..");

/**
 * Functions que recebem `barbershopId` e são PÚBLICAS por desenho.
 *
 * Qualquer pessoa pode agendar em qualquer barbearia — é o produto. Elas não
 * exigem vínculo, e por isso não podem fazer nada privilegiado: `createBooking`
 * só cria reserva para o próprio `uid`, e `availableSlots` devolve horários sem
 * dizer de quem são.
 */
const PUBLICAS_POR_DESENHO = new Set([
  "createBooking",
  "availableSlots",
  "checkSlugAvailability",
  "signUpBarbershop", // cria a PRÓPRIA barbearia; não recebe id de outra
  "redeemLoyaltyReward", // resgata do próprio saldo, na barbearia informada
  "healthcheck",
]);

/** As expressões que contam como guarda de autorização. */
const GUARDAS = [
  /token\.barbershops/, // lê o vínculo do claim
  /platformAdmin/, // operador da plataforma
  /token\.role/, // modelo antigo, ainda aceito no bootstrap
  /exigirVinculo\(/, // a MESMA leitura, centralizada — ver o teste logo abaixo
];

type Handler = { nome: string; corpo: string; arquivo: string };

/** Extrai cada `export const X = onCall/onRequest(...)` com o corpo. */
function handlersDe(arquivo: string): Handler[] {
  const texto = readFileSync(resolve(SRC, arquivo), "utf8");
  const achados: Handler[] = [];

  const re = /export const (\w+) = (onCall|onRequest)[\s\S]*?(?=\nexport const |\n\/\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    achados.push({ nome: m[1], corpo: m[0], arquivo });
  }
  return achados;
}

function todosOsHandlers(): Handler[] {
  const arquivos = readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .concat(
      readdirSync(resolve(SRC, "whatsapp"))
        .filter((f) => f.endsWith(".ts"))
        .map((f) => `whatsapp/${f}`)
    );

  return arquivos.flatMap((a) => {
    try {
      return handlersDe(a);
    } catch {
      return [];
    }
  });
}

const HANDLERS = todosOsHandlers();

describe("inventário", () => {
  it("encontra os handlers chamáveis do repositório", () => {
    /* Se este número cair, uma function sumiu; se subir, uma nova entrou e
     * precisa passar pelo teste abaixo. */
    expect(HANDLERS.length).toBeGreaterThanOrEqual(8);
    const nomes = HANDLERS.map((h) => h.nome);
    expect(nomes).toContain("createBooking");
    expect(nomes).toContain("completeOnboardingStep");
    expect(nomes).toContain("definirPlano");
  });
});

/**
 * Endpoints HTTP públicos, chamados por terceiros.
 *
 * Não têm `request.auth` — quem chama é a Meta, não um usuário nosso. A guarda
 * deles é outra e está testada em `webhooks públicos` abaixo: assinatura HMAC
 * do corpo cru, mais verificação de autoria por evento.
 */
const WEBHOOKS = new Set(["whatsappWebhook"]);

describe("toda function que recebe barbershopId verifica o vínculo", () => {
  const queRecebemTenant = HANDLERS.filter(
    (h) =>
      /barbershopId/.test(h.corpo) &&
      !PUBLICAS_POR_DESENHO.has(h.nome) &&
      !WEBHOOKS.has(h.nome)
  );

  it("há funções privilegiadas para verificar", () => {
    expect(queRecebemTenant.length).toBeGreaterThan(0);
  });

  it.each(queRecebemTenant.map((h) => [h.nome, h] as const))(
    "🔒 %s exige vínculo antes de agir",
    (_nome, handler) => {
      /* O ataque: um usuário autenticado chama a function com o
       * `barbershopId` de OUTRA barbearia. Sem esta guarda, o Admin SDK
       * escreveria — as regras do Firestore não são consultadas. */
      const temGuarda = GUARDAS.some((g) => g.test(handler.corpo));
      expect(
        temGuarda,
        `${handler.nome} (${handler.arquivo}) recebe barbershopId e não confere ` +
          `o vínculo de quem chamou. Ou acrescente a guarda, ou declare a função ` +
          `em PUBLICAS_POR_DESENHO com a justificativa.`
      ).toBe(true);
    }
  );

  it("🔒 e exige autenticação antes de qualquer coisa", () => {
    for (const h of queRecebemTenant) {
      expect(/request\.auth/.test(h.corpo), h.nome).toBe(true);
    }
  });

  it("🔒 `exigirVinculo` realmente lê o claim, e recusa quem não é da casa", () => {
    /* A guarda aceita como padrão em `GUARDAS` é uma CHAMADA. Sem verificar o
     * que ela faz, bastaria alguém escrever uma função vazia com esse nome para
     * quatro handlers passarem no teste sem guarda nenhuma.
     *
     * Este caso fecha o buraco: o padrão só vale porque o corpo do helper faz a
     * mesma leitura que o regex exigiria inline. */
    const fonte = readFileSync(resolve(SRC, "mensalistas.ts"), "utf8");
    const helper = fonte.slice(
      fonte.indexOf("function exigirVinculo"),
      fonte.indexOf("export const criarMensalista")
    );
    expect(helper).toMatch(/token\.barbershops/);
    expect(helper).toMatch(/"owner"/);
    expect(helper).toMatch(/"staff"/);
    expect(helper).toMatch(/permission-denied/);
  });
});

describe("as públicas por desenho não fazem nada privilegiado", () => {
  const publicas = HANDLERS.filter((h) => PUBLICAS_POR_DESENHO.has(h.nome));

  it("nenhuma escreve em coleção de contrato ou de dinheiro", () => {
    /* `createBooking` grava em `bookings`, e está certo. O que ela não pode
     * fazer é tocar em `private`, `payments`, `commissions` ou no documento da
     * barbearia — se um dia tocar, a ausência de guarda vira escalada. */
    const proibidas = [
      /collection\(["']private["']\)/,
      /\/private\//,
      /collection\(["']payments["']\)/,
      /collection\(["']commissions["']\)/,
    ];

    for (const h of publicas) {
      for (const p of proibidas) {
        expect(p.test(h.corpo), `${h.nome} escreve em coleção privilegiada`).toBe(false);
      }
    }
  });

  it("createBooking usa o uid de quem chamou como cliente, nunca um id recebido", () => {
    /* Sem isso, qualquer um criaria reserva em nome de qualquer pessoa — e o
     * limite de reservas ativas por cliente seria contornável usando o uid dos
     * outros. */
    const criar = HANDLERS.find((h) => h.nome === "createBooking")!;
    expect(/clientId:\s*uid/.test(criar.corpo)).toBe(true);
    expect(/clientId:\s*request\.data/.test(criar.corpo)).toBe(false);
  });
});

describe("as guardas dizem o que verificam", () => {
  it("definirPlano é só do operador da plataforma", () => {
    const f = HANDLERS.find((h) => h.nome === "definirPlano")!;
    expect(/platformAdmin/.test(f.corpo)).toBe(true);
  });

  it("completeOnboardingStep é só do dono daquela barbearia", () => {
    const f = HANDLERS.find((h) => h.nome === "completeOnboardingStep")!;
    expect(/role !== "owner"/.test(f.corpo)).toBe(true);
  });

  it("encerrarConta e reabrirConta são só do dono daquela barbearia", () => {
    for (const nome of ["encerrarConta", "reabrirConta"]) {
      const f = HANDLERS.find((h) => h.nome === nome)!;
      expect(/ehDono/.test(f.corpo), nome).toBe(true);
    }
  });

  it("cancelBooking e rescheduleBooking aceitam o dono da reserva OU o da barbearia", () => {
    for (const nome of ["cancelBooking", "rescheduleBooking"]) {
      const f = HANDLERS.find((h) => h.nome === nome)!;
      expect(/clientId !== uid && !ehDono/.test(f.corpo), nome).toBe(true);
    }
  });

  it("provisionBarbershop e grantShopRole exigem plataforma ou dono", () => {
    const prov = HANDLERS.find((h) => h.nome === "provisionBarbershop")!;
    expect(/platformAdmin/.test(prov.corpo)).toBe(true);

    const grant = HANDLERS.find((h) => h.nome === "grantShopRole")!;
    expect(/isPlatformAdmin|platformAdmin/.test(grant.corpo)).toBe(true);
    expect(/callerRole !== "owner"/.test(grant.corpo)).toBe(true);
  });
});

describe("webhooks públicos têm a guarda que lhes cabe", () => {
  /* `whatsappWebhook` é chamado pela Meta, de fora, sem autenticação nossa —
   * então `request.auth` não existe e a lista de vínculos não se aplica. A
   * barreira dele é outra, e precisa ser tão forte quanto: sem a conferência
   * de assinatura, qualquer um que descubra a URL cancela reserva de qualquer
   * barbearia mandando um JSON. */
  const webhook = HANDLERS.find((h) => h.nome === "whatsappWebhook")!;

  it("existe", () => {
    expect(webhook).toBeDefined();
  });

  it("🔒 confere a assinatura HMAC do corpo CRU", () => {
    /* Cru, e não reserializado: reserializar o JSON muda espaços e ordem, e o
     * hash deixa de bater mesmo na requisição legítima. */
    expect(/assinaturaConfere/.test(webhook.corpo)).toBe(true);
    expect(/rawBody/.test(webhook.corpo)).toBe(true);
  });

  it("🔒 recusa a requisição quando a assinatura não bate", () => {
    expect(/401|Unauthorized/.test(webhook.corpo)).toBe(true);
  });

  it("🔒 a barbearia vem do payload assinado, não de um parâmetro solto", () => {
    /* Com um número único para toda a plataforma, o `phone_number_id` não
     * identifica mais a dona da conversa. A origem de cada evento é declarada
     * em `barbeariaDoNumero` / `barbeariaDaMensagem` / `barbeariaDaConversa`,
     * e o botão traz a barbearia dentro da requisição assinada. */
    const fonte = readFileSync(resolve(SRC, "whatsapp/webhook.ts"), "utf8");
    expect(/parseButtonPayload/.test(fonte)).toBe(true);
    expect(/barbeariaDaMensagem|barbeariaDaConversa/.test(fonte)).toBe(true);
  });

  it("🔒 confere se quem tocou o botão tem a ver com a reserva", () => {
    /* Todos os clientes de todas as barbearias conversam com o MESMO número,
     * então uma mensagem com o payload de outra pessoa é indistinguível da
     * legítima só pelo conteúdo. */
    const fonte = readFileSync(resolve(SRC, "whatsapp/webhook.ts"), "utf8");
    expect(/ehOCliente|donoDaReserva/.test(fonte)).toBe(true);
    expect(/numerosDaLoja/.test(fonte)).toBe(true);
  });

  it("🔒 não ressuscita reserva já encerrada", () => {
    const fonte = readFileSync(resolve(SRC, "whatsapp/webhook.ts"), "utf8");
    expect(/completed.*cancelled_by_client|status.*terminal|atual/.test(fonte)).toBe(true);
  });
});
