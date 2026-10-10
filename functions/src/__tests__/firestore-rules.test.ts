import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  deleteDoc,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Prova o isolamento entre barbearias contra o emulador do Firestore.
 *
 * Este é o teste mais importante da plataforma: um furo aqui vaza o financeiro
 * de um cliente pagante para outro. As regras anteriores tinham exatamente esse
 * furo — `isOwner()` global sobre coleções na raiz — e nenhum teste o pegou,
 * porque não havia teste.
 */

const ALFA = "barbearia-alfa";
const BETA = "barbearia-beta";

const DONO_ALFA = { sub: "dono-alfa", barbershops: { [ALFA]: "owner" } };
const DONO_BETA = { sub: "dono-beta", barbershops: { [BETA]: "owner" } };
const BARBEIRO_ALFA = { sub: "barbeiro-alfa", barbershops: { [ALFA]: "staff" }, equipe: { [ALFA]: "s-alfa" } };
/* Barbeiro com o papel mas sem o claim da cadeira (ligado antes do convite). */
const BARBEIRO_SEM_CADEIRA = { sub: "barbeiro-antigo", barbershops: { [ALFA]: "staff" } };
const CLIENTE = { sub: "cliente-1" };
const OUTRO_CLIENTE = { sub: "cliente-2" };
const SUPORTE = { sub: "suporte", platformAdmin: true };

let testEnv: RulesTestEnvironment;

function as(claims: { sub: string } & Record<string, unknown>) {
  const { sub, ...rest } = claims;
  return testEnv.authenticatedContext(sub, rest).firestore();
}

const anon = () => testEnv.unauthenticatedContext().firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "regras-multi-tenant",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(resolve(__dirname, "../../../firestore.rules"), "utf8"),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Semeia dados das duas barbearias ignorando as regras.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const bid of [ALFA, BETA]) {
      await setDoc(doc(db, "barbershops", bid), { slug: bid, status: "ativo", plan: "completo" });
      await setDoc(doc(db, `barbershops/${bid}/expenses`, "exp-1"), { value: 1800 });
      await setDoc(doc(db, `barbershops/${bid}/services`, "corte"), { name: "Corte", price: 60 });
      await setDoc(doc(db, `barbershops/${bid}/cash_entries`, "cx-1"), { value: 300 });
      await setDoc(doc(db, `barbershops/${bid}/payments`, "pg-1"), {
        clientId: CLIENTE.sub,
        value: 90,
      });
      await setDoc(doc(db, `barbershops/${bid}/bookings`, "bk-1"), {
        clientId: CLIENTE.sub,
        staffId: "s-alfa",
        status: "confirmed",
        value: 90,
      });
      /* A reserva de um COLEGA (05/10): o barbeiro não vê a agenda dos outros. */
      await setDoc(doc(db, `barbershops/${bid}/bookings`, "bk-colega"), {
        clientId: CLIENTE.sub,
        staffId: "s-colega",
        status: "confirmed",
        value: 90,
      });
      await setDoc(doc(db, `barbershops/${bid}/audit_log`, "log-1"), { action: "criou" });
    }
    /* A cadeira do barbeiro da Alfa, ligada à conta dele na FICHA (08/10): as
     * regras conferem `staff.uid` além do claim. */
    await setDoc(doc(db, `barbershops/${ALFA}/staff`, "s-alfa"), {
      name: "Barbeiro Alfa", active: true, uid: BARBEIRO_ALFA.sub,
    });
    await setDoc(doc(db, "slugs", ALFA), { barbershopId: ALFA });
    await setDoc(doc(db, "users", CLIENTE.sub), { name: "Cliente Um" });
  });
});

/* ------------------------------------------------------------------ */

describe("isolamento entre barbearias", () => {
  it("o dono da Alfa lê as despesas da Alfa", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/expenses`, "exp-1")));
  });

  it("🔒 o dono da Alfa NÃO lê as despesas da Beta", async () => {
    await assertFails(getDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/expenses`, "exp-1")));
  });

  it("🔒 o dono da Alfa NÃO escreve na Beta", async () => {
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/expenses`, "novo"), { value: 1 })
    );
  });

  it("🔒 o dono da Alfa NÃO lê o caixa da Beta", async () => {
    await assertFails(getDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/cash_entries`, "cx-1")));
  });

  it("🔒 o dono da Alfa NÃO altera o catálogo da Beta", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/services`, "corte"), { price: 1 })
    );
  });

  it("cada dono enxerga a própria casa", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_BETA), `barbershops/${BETA}/expenses`, "exp-1")));
    await assertFails(getDoc(doc(as(DONO_BETA), `barbershops/${ALFA}/expenses`, "exp-1")));
  });
});

describe("papéis dentro da barbearia", () => {
  it("o barbeiro lê a agenda DELE", async () => {
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1")));
    await assertSucceeds(
      getDocs(query(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`), where("staffId", "==", "s-alfa")))
    );
  });

  /* Decisão do dono (05/10): o barbeiro vê só a própria agenda e a própria
   * comissão — nada dos colegas nem do caixa da casa. */
  it("🔒 o barbeiro NÃO lê a agenda de um colega", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-colega")));
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`)));
    await assertFails(
      getDocs(query(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`), where("staffId", "==", "s-colega")))
    );
  });

  it("🔒 o barbeiro NÃO conclui nem marca falta na agenda de um colega", async () => {
    const colega = doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-colega");
    await assertFails(updateDoc(colega, { status: "completed", paymentMethod: "pix" }));
    await assertFails(updateDoc(colega, { status: "no_show" }));
  });

  it("🔒 o barbeiro NÃO lê pagamentos nem ocorrências da casa", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/payments`, "pg-1")));
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/payments`)));
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/client_occurrences`)));
  });

  it("🔒 barbeiro sem o claim da cadeira não lê agenda nenhuma", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_SEM_CADEIRA), `barbershops/${ALFA}/bookings`, "bk-1")));
  });

  it("🔒 convite de barbeiro é inalcançável pelo cliente", async () => {
    await assertFails(getDoc(doc(as(DONO_ALFA), "convites_equipe", "qualquer")));
    await assertFails(setDoc(doc(as(BARBEIRO_ALFA), "convites_equipe", "qualquer"), { barbershopId: ALFA }));
  });

  it("🔒 o barbeiro NÃO lê as despesas do dono", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/expenses`, "exp-1")));
  });

  it("🔒 o barbeiro NÃO altera o catálogo", async () => {
    await assertFails(
      updateDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/services`, "corte"), { price: 1 })
    );
  });
});

describe("cliente final", () => {
  it("lê a própria reserva", async () => {
    await assertSucceeds(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "bk-1")));
  });

  it("🔒 NÃO lê a reserva de outro cliente", async () => {
    await assertFails(getDoc(doc(as(OUTRO_CLIENTE), `barbershops/${ALFA}/bookings`, "bk-1")));
  });

  it("🔒 NÃO lê as despesas da barbearia que frequenta", async () => {
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/expenses`, "exp-1")));
  });

  it("lê o catálogo de serviços", async () => {
    await assertSucceeds(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/services`, "corte")));
  });

  /**
   * Criar reserva passou a ser EXCLUSIVIDADE da Cloud Function.
   *
   * A regra antiga deixava o cliente gravar direto desde que não tocasse em
   * status e valor. Duas coisas passavam por ali: reserva sem `status`, que não
   * bloqueia horário na checagem de conflito e ainda assim aparece na agenda do
   * dono; e criação em massa, sem o limite por cliente nem a validação de dia,
   * horário e antecedência — ou seja, dava para ocupar a agenda inteira.
   */
  it("🔒 NÃO cria reserva direto no banco, nem bem-comportada", async () => {
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova"), {
        clientId: CLIENTE.sub,
        date: "2026-08-10",
        time: "10:00",
      })
    );
  });

  it("🔒 NÃO cria reserva em nome de outro, nem com status e valor forjados", async () => {
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova"), {
        clientId: OUTRO_CLIENTE.sub,
        date: "2026-08-10",
      })
    );
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova2"), {
        clientId: CLIENTE.sub,
        status: "confirmed",
        value: 0,
      })
    );
  });

  it("🔒 NÃO cancela nem remarca a própria reserva direto no banco", async () => {
    /* As duas passam por Cloud Function: aplicam política, calculam reembolso e
     * disputam o horário. A tela escrevia direto e só fazia `console.error` no
     * erro — o modal fechava, o cliente achava que tinha cancelado, e a agenda
     * do barbeiro continuava com ele. */
    await assertFails(
      updateDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "bk-1"), {
        status: "cancelled_by_client",
      })
    );
    await assertFails(
      updateDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "bk-1"), {
        date: "2026-09-02", time: "11:00", status: "confirmed",
      })
    );
  });

  it("🔒 NÃO lê pagamento nenhum — taxa e líquido da casa são dado interno (09/10)", async () => {
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/payments`, "pg-1")));
    await assertFails(getDoc(doc(as(OUTRO_CLIENTE), `barbershops/${ALFA}/payments`, "pg-1")));
    await assertFails(
      getDocs(query(collection(as(CLIENTE), `barbershops/${ALFA}/payments`), where("clientId", "==", CLIENTE.sub)))
    );
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/payments`, "pg-1")));
  });

  it("🔒 NÃO escreve pagamento — isso é do servidor", async () => {
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/payments`, "forjado"), {
        clientId: CLIENTE.sub,
        value: 0,
      })
    );
  });
});

describe("conta do cliente", () => {
  it("lê e edita o próprio perfil", async () => {
    await assertSucceeds(getDoc(doc(as(CLIENTE), "users", CLIENTE.sub)));
    await assertSucceeds(updateDoc(doc(as(CLIENTE), "users", CLIENTE.sub), { name: "Novo" }));
  });

  it("🔒 NÃO lê o perfil de outro cliente", async () => {
    await assertFails(getDoc(doc(as(OUTRO_CLIENTE), "users", CLIENTE.sub)));
  });

  it("🔒 NÃO se promove a dono editando o próprio documento", async () => {
    await assertFails(
      updateDoc(doc(as(CLIENTE), "users", CLIENTE.sub), { barbershops: { [ALFA]: "owner" } })
    );
    await assertFails(updateDoc(doc(as(CLIENTE), "users", CLIENTE.sub), { platformAdmin: true }));
  });

  it("🔒 NÃO lê nem zera o próprio teto diário de reservas (28/09, M2)", async () => {
    /* Gravável, o script zeraria o contador antes de cada laço; legível,
     * saberia quantas faltam. Só o `createBooking` conta. */
    const id = `${CLIENTE.sub}_2026-09-28`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "limites_de_reserva", id), { criadas: 10 });
    });
    await assertFails(getDoc(doc(as(CLIENTE), "limites_de_reserva", id)));
    await assertFails(setDoc(doc(as(CLIENTE), "limites_de_reserva", id), { criadas: 0 }));
    await assertFails(deleteDoc(doc(as(CLIENTE), "limites_de_reserva", id)));
  });
});

describe("contrato com a plataforma", () => {
  it("🔒 o dono NÃO muda o próprio plano, status ou slug", async () => {
    // Valores DIFERENTES dos semeados: `diff()` não acusa mudança quando se
    // grava o mesmo valor, e um teste com valor igual passaria por acidente.
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { plan: "completo+" }));
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { status: "suspenso" }));
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { slug: "outro" }));
  });

  it("🔒 o dono NÃO libera recurso pago escrevendo `features`", async () => {
    /* `features` ficou de fora da lista de imutáveis por descuido, e é
     * justamente o campo que o gate de plano lê. Um `updateDoc` direto do
     * navegador destravava o plano de cima sem passar por função nenhuma. */
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        features: { subscriptions: true, store: true, advancedFinance: true },
      })
    );
  });

  it("🔒 o dono NÃO libera recurso pago escrevendo `featuresExtras` (auditoria 28/09, M1)", async () => {
    /* `features` estava protegido e `featuresExtras` não — e é ele que a tela
     * soma ao plano para liberar recurso. */
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        featuresExtras: { subscriptions: true, store: true, advancedFinance: true },
      })
    );
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { planoDefinidoMotivo: "eu mesmo" })
    );
  });

  it("🔒 Telegram: só o dono lê quem recebe os avisos; ninguém grava nem lê convite (01/10)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `barbershops/${ALFA}/telegram_contatos`, "123"), { chatId: "123", alvo: "dono", ativo: true });
      await setDoc(doc(db, "telegram_convites", "codigo-1"), { barbershopId: ALFA });
      await setDoc(doc(db, "telegram_chats", "123"), { barbershopId: ALFA });
    });
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/telegram_contatos`, "123")));
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/telegram_contatos`, "123")));
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/telegram_contatos`, "123")));
    /* Gravável, alguém amarraria o próprio Telegram e aprovaria encaixe. */
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/telegram_contatos`, "999"), { chatId: "999", alvo: "dono", ativo: true })
    );
    await assertFails(getDoc(doc(as(DONO_ALFA), "telegram_convites", "codigo-1")));
    /* Token de notificação do celular: nem o dono lê, ninguém grava. */
    await assertFails(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/push_tokens`, "x")));
    await assertFails(setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/push_tokens`, "x"), { token: "t" }));
    await assertFails(setDoc(doc(as(DONO_ALFA), "telegram_chats", "999"), { barbershopId: ALFA }));
  });

  it("🔒 o dono NÃO se isenta de pagar nem troca o endereço do login (29/09)", async () => {
    /* `isento` impede a suspensão pelo Hub; `dominio` é para onde o login da
     * plataforma manda a equipe. Os dois são da plataforma. */
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        isento: { ativa: true, motivo: "eu mesmo" },
      })
    );
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { dominio: "golpe.example.com" })
    );
  });

  it("🔒 o dono NÃO grava `locale` direto — fuso inválido parava as rotinas (08/10)", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { locale: { timeZone: "Brasil" } })
    );
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { "locale.timeZone": "America/Sao_Paulo" })
    );
  });

  it("🔒 o dono NÃO estende o próprio período de teste", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        trial: { startedAt: new Date(), endsAt: new Date("2099-01-01") },
      })
    );
    // Zerar o trial vale tanto quanto esticá-lo: sem data de fim não vence.
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { trial: null }));
  });

  it("🔒 o dono NÃO reescreve quem criou a barbearia", async () => {
    // `createdBy` sustenta o limite de uma conta, uma barbearia.
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { createdBy: "outro-uid" })
    );
  });

  it("🔒 não dá para plantar `platformAdmin` recriando o próprio documento", async () => {
    /* O `update` filtrava os campos de autoridade e o `create` não, e `delete`
     * é permitido: apagar e recriar deixava o campo gravado. Não era explorável
     * hoje, porque nada lê autoridade do documento — mas o `update` blindado
     * passa a impressão de que o campo é confiável. */
    await assertFails(
      setDoc(doc(as(OUTRO_CLIENTE), "users", OUTRO_CLIENTE.sub), { platformAdmin: true })
    );
    await assertFails(
      setDoc(doc(as(OUTRO_CLIENTE), "users", OUTRO_CLIENTE.sub), {
        barbershops: { [ALFA]: "owner" },
      })
    );
    // O documento comum continua criável.
    await assertSucceeds(
      setDoc(doc(as(OUTRO_CLIENTE), "users", OUTRO_CLIENTE.sub), { name: "Cliente Dois" })
    );
  });

  it("🔒 o dono não escapa escondendo a mudança de plano junto de outra", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        brand: { name: "Disfarce" },
        plan: "completo+",
      })
    );
  });

  it("o dono edita o que é dele", async () => {
    await assertSucceeds(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { brand: { name: "Nova Marca" } })
    );
  });

  it("🔒 o dono NÃO cria nem exclui barbearia", async () => {
    await assertFails(setDoc(doc(as(DONO_ALFA), "barbershops", "invadida"), { slug: "x" }));
    await assertFails(deleteDoc(doc(as(DONO_ALFA), "barbershops", ALFA)));
  });

  it("o suporte da plataforma alcança o que precisa", async () => {
    await assertSucceeds(setDoc(doc(as(SUPORTE), "barbershops", "nova"), { slug: "nova" }));
    await assertSucceeds(getDoc(doc(as(SUPORTE), `barbershops/${ALFA}/audit_log`, "log-1")));
  });

  it("🔒 o log de auditoria é imutável, inclusive para o dono", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/audit_log`, "log-1")));
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/audit_log`, "log-1"), { action: "editado" })
    );
    await assertFails(deleteDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/audit_log`, "log-1")));
  });
});

describe("a marca que o dono edita em \"Sua marca\" (02/10)", () => {
  const storage = (caminho: string) =>
    `https://firebasestorage.googleapis.com/v0/b/axon-barber.firebasestorage.app/o/${encodeURIComponent(
      caminho
    )}?alt=media`;
  const LOGO_ALFA = storage(`barbershops/${ALFA}/brand/1727000000000/logo.png`);
  const ficha = () => doc(as(DONO_ALFA), "barbershops", ALFA);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "barbershops", ALFA), {
        brand: {
          name: "Barbearia Alfa",
          shortName: "Alfa",
          accentColor: "#b8863a",
          themeColor: "#ffffff",
          panelLabel: "Painel do dono",
          logo: "/tenants/alfa/logo.svg",
          logoHorizontal: "/tenants/alfa/logo-horizontal.svg",
          icones: "/tenants/alfa/icons",
        },
      });
    });
  });

  /* Os outros blocos gravam `brand` inteiro sobre uma ficha sem marca;
   * deixar esta marca semeada mudaria o que eles testam. */
  afterEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "barbershops", ALFA), { brand: deleteField() });
    });
  });

  it("o dono troca nome, nome curto, cor e logo do próprio envio", async () => {
    await assertSucceeds(
      updateDoc(ficha(), {
        "brand.name": "Barbearia Alfa & Cia",
        "brand.shortName": "Alfa & Cia",
        "brand.accentColor": "#5b8cc4",
        "brand.logo": LOGO_ALFA,
      })
    );
  });

  it("o dono remove o logo, a pasta de ícones e o horizontal — volta o monograma", async () => {
    await assertSucceeds(
      updateDoc(ficha(), {
        "brand.logo": deleteField(),
        "brand.logoHorizontal": deleteField(),
        "brand.icones": deleteField(),
      })
    );
  });

  it.each([
    ["site de fora", "https://evil.example/logo.png"],
    ["logo de outra barbearia", storage(`barbershops/${BETA}/brand/1727000000000/logo.png`)],
    ["ícone no lugar do logo", storage(`barbershops/${ALFA}/brand/1727000000000/icon-512.png`)],
    ["fora de uma pasta de envio", storage(`barbershops/${ALFA}/brand/logo.png`)],
    ["caminho local", "/tenants/beta/logo.svg"],
    ["data URL", "data:image/svg+xml,<svg onload=alert(1)>"],
    ["com sufixo depois do alt=media", `${LOGO_ALFA}&x=1`],
  ])("🔒 logo que não é um envio desta barbearia: %s", async (_, logo) => {
    await assertFails(updateDoc(ficha(), { "brand.logo": logo }));
  });

  it("🔒 o dono não aponta ícones nem logo horizontal para outro lugar — só remove", async () => {
    await assertFails(updateDoc(ficha(), { "brand.icones": "https://evil.example/icons" }));
    await assertFails(updateDoc(ficha(), { "brand.logoHorizontal": "https://evil.example/h.png" }));
  });

  it("🔒 cor fora de #rrggbb não entra — ela vira variável de CSS no primeiro HTML", async () => {
    await assertFails(updateDoc(ficha(), { "brand.accentColor": "red;background:url(x)" }));
    await assertFails(updateDoc(ficha(), { "brand.accentColor": "#abc" }));
  });

  it("🔒 nome vazio ou comprido demais não entra", async () => {
    await assertFails(updateDoc(ficha(), { "brand.name": " " }));
    await assertFails(updateDoc(ficha(), { "brand.name": "x".repeat(61) }));
    await assertFails(updateDoc(ficha(), { "brand.shortName": "x".repeat(15) }));
    await assertFails(updateDoc(ficha(), { "brand.name": deleteField() }));
  });

  it("🔒 os campos da plataforma ficam com a plataforma", async () => {
    await assertFails(updateDoc(ficha(), { "brand.themeColor": "#000000" }));
    await assertFails(updateDoc(ficha(), { "brand.panelLabel": "Painel" }));
    await assertFails(updateDoc(ficha(), { "brand.qualquer": "coisa" }));
  });

  it("🔒 o barbeiro não mexe na marca", async () => {
    await assertFails(
      updateDoc(doc(as(BARBEIRO_ALFA), "barbershops", ALFA), { "brand.accentColor": "#5b8cc4" })
    );
  });

  it("editar outra coisa da ficha não esbarra na marca já gravada pela plataforma", async () => {
    await assertSucceeds(updateDoc(ficha(), { "contact.address": "Rua Nova, 10" }));
  });
});

describe("resolução do subdomínio", () => {
  it("o índice de slugs é público — resolve antes de haver login", async () => {
    await assertSucceeds(getDoc(doc(anon(), "slugs", ALFA)));
  });

  it("🔒 ninguém sequestra um slug", async () => {
    await assertFails(setDoc(doc(as(DONO_ALFA), "slugs", "beta-novo"), { barbershopId: ALFA }));
  });
});

describe("negar por padrão", () => {
  it("🔒 coleção não declarada dentro da barbearia é inacessível", async () => {
    await assertFails(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/coisa_nova`, "x")));
    await assertFails(setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/coisa_nova`, "x"), { a: 1 }));
  });

  it("🔒 coleção nova na raiz é inacessível", async () => {
    await assertFails(getDoc(doc(as(SUPORTE), "coisa_nova", "x")));
  });

  it("🔒 ninguém alcança platform_users — nem o dono, nem o suporte", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "platform_users", DONO_ALFA.sub), {
        initialPasswordHash: "abc",
      });
    });
    // É onde vive o hash da senha provisória: leitura por cliente é vazamento.
    await assertFails(getDoc(doc(as(DONO_ALFA), "platform_users", DONO_ALFA.sub)));
    await assertFails(getDoc(doc(as(SUPORTE), "platform_users", DONO_ALFA.sub)));
    await assertFails(
      setDoc(doc(as(DONO_ALFA), "platform_users", DONO_ALFA.sub), { initialPasswordHash: "x" })
    );
  });

  /**
   * A ficha da barbearia virou PÚBLICA quando a resolução do subdomínio passou
   * a ler o Firestore pela API REST, sem login — é o que pinta a página antes
   * de existir usuário. Este teste afirmava o contrário e ficou vermelho a
   * partir daquela mudança, sem que ninguém percebesse.
   *
   * O que precisa continuar valendo é a fronteira: vitrine sim, agenda não.
   */
  it("anônimo lê a ficha da barbearia — é vitrine, como a fachada", async () => {
    await assertSucceeds(getDoc(doc(anon(), "barbershops", ALFA)));
  });

  it("🔒 anônimo não lê agenda, nem contrato, nem quem trabalha lá", async () => {
    await assertFails(getDoc(doc(anon(), `barbershops/${ALFA}/bookings`, "bk-1")));
    await assertFails(getDoc(doc(anon(), `barbershops/${ALFA}/private`, "contract")));
    await assertFails(getDoc(doc(anon(), `barbershops/${ALFA}/members`, DONO_ALFA.sub)));
    await assertFails(getDoc(doc(anon(), `barbershops/${ALFA}/expenses`, "e1")));
  });
});

describe("taxas e comissão fora da ficha pública (auditoria 28/09, M4)", () => {
  const FIN = `barbershops/${ALFA}/private`;

  it("🔒 anônimo e cliente não leem o financeiro", async () => {
    await assertFails(getDoc(doc(anon(), FIN, "financeiro")));
    await assertFails(getDoc(doc(as(CLIENTE), FIN, "financeiro")));
  });

  it("dono e equipe leem o financeiro", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), FIN, "financeiro")));
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), FIN, "financeiro")));
  });

  it("o dono grava taxas e comissão — e só isso", async () => {
    await assertSucceeds(
      setDoc(doc(as(DONO_ALFA), FIN, "financeiro"), {
        commissionSplit: { barberPct: 45, shopPct: 55 },
        paymentForms: [],
      })
    );
    await assertFails(
      setDoc(doc(as(DONO_ALFA), FIN, "financeiro"), { commissionSplit: {}, plano: "completo" })
    );
  });

  it("🔒 a equipe não altera o financeiro, e o dono não toca o resto de `private`", async () => {
    await assertFails(setDoc(doc(as(BARBEIRO_ALFA), FIN, "financeiro"), { commissionSplit: {} }));
    await assertFails(setDoc(doc(as(DONO_ALFA), FIN, "contract"), { commissionSplit: {} }));
  });
});

describe("fidelidade", () => {
  it("o cliente lê o próprio extrato", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/loyalty_transactions`, "t1"), {
        clientId: CLIENTE.sub, kind: "credito", stamps: 1,
      });
    });
    await assertSucceeds(
      getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/loyalty_transactions`, "t1"))
    );
  });

  it("🔒 o cliente NÃO credita carimbo para si mesmo", async () => {
    // Senão o cartão fidelidade vira campo livre.
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/loyalty_transactions`, "forjado"), {
        clientId: CLIENTE.sub, kind: "credito", stamps: 999,
      })
    );
  });

  it("🔒 nem o dono grava fidelidade direto — é do servidor", async () => {
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/loyalty_transactions`, "x"), {
        clientId: CLIENTE.sub, kind: "credito", stamps: 1,
      })
    );
  });
});

describe("cobertura", () => {
  it("nenhuma barbearia enxerga a outra, em nenhuma coleção declarada", async () => {
    const colecoes = [
      "expenses", "cash_entries", "commissions", "inventory_movements",
      "payments", "refunds", "subscriptions", "subscription_invoices",
      "loyalty_transactions", "client_occurrences", "whatsapp_messages",
      "audit_log", "bookings", "members",
    ];
    for (const colecao of colecoes) {
      await assertFails(
        getDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/${colecao}`, "qualquer"))
      );
    }
    expect(colecoes).toHaveLength(14);
  });
});

describe("a equipe", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `barbershops/${ALFA}/staff`, "s1"), {
        name: "Rômulo", active: true, uid: BARBEIRO_ALFA.sub,
      });
      await setDoc(doc(db, `barbershops/${ALFA}/staff`, "s2"), {
        name: "Léo", active: true, uid: "outro-barbeiro",
      });
      await setDoc(doc(db, `barbershops/${ALFA}/commissions`, "c1"), {
        uid: BARBEIRO_ALFA.sub, value: 1200,
      });
      await setDoc(doc(db, `barbershops/${ALFA}/commissions`, "c2"), {
        uid: "outro-barbeiro", value: 3400,
      });
    });
  });

  it("o cliente lê a equipe — precisa, para escolher com quem cortar", async () => {
    await assertSucceeds(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/staff`, "s1")));
  });

  it("🔒 o cliente NÃO cadastra nem edita barbeiro", async () => {
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/staff`, "novo"), { name: "Eu mesmo", active: true })
    );
    await assertFails(
      updateDoc(doc(as(CLIENTE), `barbershops/${ALFA}/staff`, "s1"), { active: false })
    );
  });

  it("🔒 o barbeiro NÃO edita a própria ficha — comissão está nela", async () => {
    await assertFails(
      updateDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/staff`, "s1"), { commissionPct: 90 })
    );
  });

  it("o dono cadastra e edita a equipe", async () => {
    await assertSucceeds(
      setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "s3"), { name: "Novo", active: true })
    );
  });

  it("🔒 o dono da Alfa NÃO mexe na equipe da Beta", async () => {
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${BETA}/staff`, "invasor"), { name: "X", active: true })
    );
  });

  it("o barbeiro lê a PRÓPRIA comissão", async () => {
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c1")));
  });

  it("🔒 o barbeiro NÃO lê a comissão do colega", async () => {
    /* A regra era `isStaffOf`: qualquer barbeiro lia o salário de todos. Com
     * uma cadeira só nunca apareceu, porque o único `staff` era o dono. Numa
     * equipe é vazamento de salário entre colegas. */
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c2")));
  });

  it("o dono lê a comissão de todo mundo — é ele quem paga", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/commissions`, "c1")));
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/commissions`, "c2")));
  });

  it("🔒 ninguém escreve comissão — quem calcula é o servidor", async () => {
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/commissions`, "forjada"), { uid: "x", value: 0 })
    );
    await assertFails(
      updateDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c1"), { value: 99999 })
    );
  });

  it("🔒 o cliente não alcança comissão nenhuma", async () => {
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/commissions`, "c1")));
  });

  /* ---------------- livro caixa — D25 ---------------- */

  it("o dono LÊ o próprio livro caixa", async () => {
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/cash_entries`, "cx-1")));
  });

  it("🔒 nem o dono ESCREVE caixa direto — quem grava é o servidor", async () => {
    /* A regra era `allow read, write: if isOwnerOf`, herdada de quando a
     * coleção não tinha contrato nem uma única escrita. Com valor congelado,
     * sinal derivado do tipo e idempotência por chave, escrita direta tornaria
     * as três promessas falsas na primeira tela que gravasse por fora de
     * `registrarMovimentoDeCaixa`.
     *
     * O `update` importa tanto quanto o `create`: "valor congelado" que aceita
     * edição posterior não é congelado. */
    await assertFails(
      setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/cash_entries`, "forjada"), {
        kind: "sangria",
        amount: -1000,
      })
    );
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/cash_entries`, "cx-1"), { amount: 99999 })
    );
  });

  it("🔒 barbeiro e cliente não alcançam o livro caixa", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/cash_entries`, "cx-1")));
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/cash_entries`, "cx-1")));
  });
});

describe("reserva: o painel fecha e marca falta — e só isso", () => {
  /* A regra era `update, delete: if isStaffOf`, sem campo nenhum conferido, e
   * o gatilho financeiro confia no documento. Rodada E2E de 23/09. */
  const bk = (quem: { sub: string } & Record<string, unknown>) =>
    doc(as(quem), `barbershops/${ALFA}/bookings`, "bk-1");

  it("o dono conclui com o meio e a forma de pagamento", async () => {
    await assertSucceeds(
      updateDoc(bk(DONO_ALFA), {
        status: "completed", paymentMethod: "credit", paymentFormId: "credito-1x", paymentFormLabel: "Crédito",
      })
    );
  });

  it("o barbeiro conclui o mensalista sem meio de pagamento (null)", async () => {
    await assertSucceeds(
      updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: null, paymentFormId: null, paymentFormLabel: null })
    );
  });

  it("marca falta", async () => {
    await assertSucceeds(updateDoc(bk(DONO_ALFA), { status: "no_show" }));
  });

  it("🔒 não forja comissão, valor, cobertura, barbeiro nem cliente ao concluir", async () => {
    for (const extra of [
      { value: 99999 },
      { staffId: "barbeiro-alfa" },
      { clientId: "outra-conta" },
      { cobertura: { tipo: "plano" } },
      { cicloFinanceiro: { revertidoEm: "x", comissao: { commissionPct: 100 }, pagamento: { grossAmount: 99999 } } },
    ]) {
      await assertFails(updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "cash", ...extra }));
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "cash", ...extra }));
    }
  });

  it("🔒 não inventa meio de pagamento nem status fora do fechamento", async () => {
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "bitcoin" }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "cancelled_by_shop" }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "confirmed", time: "23:00" }));
  });

  it("🔒 não reabre atendimento concluído direto no banco", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), { status: "completed" });
    });
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "no_show" }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix" }));
  });

  it("🔒 ninguém apaga reserva", async () => {
    await assertFails(deleteDoc(bk(DONO_ALFA)));
    await assertFails(deleteDoc(bk(BARBEIRO_ALFA)));
  });

  /* "Veio depois" (02/10): o cliente marcado como falta aparece e é atendido.
   * O painel grava no_show → completed direto, mas a regra só aceitava origem
   * em aberto — o botão era recusado pelo banco. */
  describe("veio depois: falta → concluído", () => {
    const marcarFalta = () =>
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), { status: "no_show" });
      });

    it("o barbeiro conclui quem tinha faltado, com meio e forma de pagamento", async () => {
      await marcarFalta();
      await assertSucceeds(
        updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "pix", paymentFormId: "pix", paymentFormLabel: "Pix" })
      );
    });

    it("o dono conclui quem tinha faltado", async () => {
      await marcarFalta();
      await assertSucceeds(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "cash" }));
    });

    it("🔒 cliente não conclui a falta", async () => {
      await marcarFalta();
      await assertFails(updateDoc(bk(CLIENTE), { status: "completed", paymentMethod: "pix" }));
    });

    it("🔒 da falta só se vai para concluído — e sem forjar valor nem método", async () => {
      await marcarFalta();
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "confirmed" }));
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "cancelled_by_shop" }));
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "bitcoin" }));
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "cash", value: 99999 }));
    });
  });
});

describe("reserva: desconto no fechamento (28/09)", () => {
  /* A reserva semeada vale R$ 90. O gatilho financeiro calcula pagamento e
   * comissão sobre `value − discountAmount`, então a regra é a primeira camada
   * do limite — o servidor limita de novo. */
  const bk = (quem: { sub: string } & Record<string, unknown>) =>
    doc(as(quem), `barbershops/${ALFA}/bookings`, "bk-1");
  const desconto = (
    quem: { sub: string },
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    discountAmount: 9,
    discountInput: { tipo: "pct", valor: 10 },
    discountReason: "fidelidade",
    discountBy: quem.sub,
    discountAt: serverTimestamp(),
    ...extra,
  });

  it("o dono conclui com desconto parcial e forma de pagamento", async () => {
    await assertSucceeds(
      updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", ...desconto(DONO_ALFA) })
    );
  });

  it("o motivo é opcional", async () => {
    await assertSucceeds(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "cash",
        ...desconto(DONO_ALFA, { discountReason: null, discountInput: { tipo: "valor", valor: 9 } }),
      })
    );
  });

  it("cortesia: 100% de desconto conclui SEM forma de pagamento", async () => {
    await assertSucceeds(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: null,
        ...desconto(DONO_ALFA, { discountAmount: 90, discountInput: { tipo: "pct", valor: 100 }, discountReason: "cortesia" }),
      })
    );
  });

  it("🔒 cortesia com forma de pagamento, e desconto parcial sem forma, não passam", async () => {
    /* A forma nula é a porta do mensalista: um desconto parcial sem forma
     * seria ambíguo para o servidor, e uma cortesia "no Pix" afirmaria
     * dinheiro que não entrou. */
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountAmount: 90 }),
      })
    );
    await assertFails(
      updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: null, ...desconto(DONO_ALFA) })
    );
  });

  it("🔒 o desconto nunca passa do valor, nem é negativo", async () => {
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: null,
        ...desconto(DONO_ALFA, { discountAmount: 90.01 }),
      })
    );
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountAmount: -10 }),
      })
    );
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountAmount: "9" }),
      })
    );
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountInput: { tipo: "pct", valor: 150 } }),
      })
    );
  });

  it("🔒 o barbeiro NÃO dá desconto — é dinheiro da casa", async () => {
    await assertFails(
      updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "pix", ...desconto(BARBEIRO_ALFA) })
    );
  });

  it("🔒 a autoria é de quem grava, com o relógio do servidor", async () => {
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountBy: "outra-pessoa" }),
      })
    );
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountAt: new Date("2026-01-01T12:00:00Z") }),
      })
    );
    const { discountAt: _semData, ...semAutoria } = desconto(DONO_ALFA);
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", ...semAutoria }));
  });

  it("🔒 motivo fora da lista não entra", async () => {
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: "pix",
        ...desconto(DONO_ALFA, { discountReason: "porque sim" }),
      })
    );
  });

  it("🔒 desconto só junto com a conclusão — nem na falta, nem sozinho", async () => {
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "no_show", ...desconto(DONO_ALFA) }));
    await assertFails(updateDoc(bk(DONO_ALFA), desconto(DONO_ALFA)));
  });

  it("🔒 não dá desconto em atendimento já concluído direto no banco", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), { status: "completed" });
    });
    await assertFails(updateDoc(bk(DONO_ALFA), desconto(DONO_ALFA)));
  });
});

describe("reserva: caixinha no fechamento", () => {
  const bk = (quem: { sub: string } & Record<string, unknown>) =>
    doc(as(quem), `barbershops/${ALFA}/bookings`, "bk-1");
  const marcarFalta = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), { status: "no_show" });
    });

  it("o dono e o barbeiro concluem com forma de pagamento e caixinha", async () => {
    await assertSucceeds(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", tipAmount: 10 }));
  });

  it("o barbeiro também informa a caixinha", async () => {
    await assertSucceeds(
      updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "credit", tipAmount: 5.5 })
    );
  });

  it("quem veio depois (falta -> concluído) pode ter caixinha", async () => {
    await marcarFalta();
    await assertSucceeds(updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "cash", tipAmount: 7 }));
  });

  it("🔒 sem forma de pagamento não há caixinha (mensalista sem cobrar)", async () => {
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: null, tipAmount: 10 }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", tipAmount: 10 }));
  });

  it("🔒 cortesia (100% de desconto) não tem caixinha", async () => {
    await assertFails(
      updateDoc(bk(DONO_ALFA), {
        status: "completed",
        paymentMethod: null,
        tipAmount: 10,
        discountAmount: 90,
        discountInput: { tipo: "pct", valor: 100 },
        discountReason: "cortesia",
        discountBy: DONO_ALFA.sub,
        discountAt: serverTimestamp(),
      })
    );
  });

  it("🔒 só número positivo e até o teto de R$ 1.000,00", async () => {
    for (const tipAmount of [0, -5, "10", null, 1000.01, 99999]) {
      await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", tipAmount }));
    }
    await assertSucceeds(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", tipAmount: 1000 }));
  });

  it("🔒 não vai na marcação de falta nem fora da conclusão", async () => {
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "no_show", tipAmount: 10 }));
    await assertFails(updateDoc(bk(DONO_ALFA), { tipAmount: 10 }));
    await assertFails(updateDoc(bk(BARBEIRO_ALFA), { tipAmount: 10 }));
  });

  it("🔒 reserva concluída não ganha caixinha depois, direto no banco", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), {
        status: "completed",
        paymentMethod: "pix",
      });
    });
    await assertFails(updateDoc(bk(DONO_ALFA), { tipAmount: 10 }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix", tipAmount: 10 }));
  });
});

describe("vitrine pública e o que não é vitrine (rodada E2E de 23/09)", () => {
  it("sem login: vê a barbearia, serviços, barbeiros e planos", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "vit"), { name: "Zé", active: true });
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/plans`, "p1"), { name: "Ilimitado", price: 149 });
    });
    await assertSucceeds(getDoc(doc(anon(), "barbershops", ALFA)));
    await assertSucceeds(getDoc(doc(anon(), `barbershops/${ALFA}/services`, "corte")));
    await assertSucceeds(getDoc(doc(anon(), `barbershops/${ALFA}/staff`, "vit")));
    await assertSucceeds(getDoc(doc(anon(), `barbershops/${ALFA}/plans`, "p1")));
  });

  it("🔒 ninguém lista todas as barbearias", async () => {
    await assertFails(getDocs(collection(anon(), "barbershops")));
    await assertFails(getDocs(collection(as(CLIENTE), "barbershops")));
    await assertFails(getDocs(collection(as(DONO_ALFA), "barbershops")));
  });

  it("🔒 salário e comissão: só o dono, e fora da ficha pública", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff_pay`, "vit"), { commissionPct: 50, salary: 2200 });
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "legado"), { name: "Antigo", commissionPct: 40 });
    });
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff_pay`, "vit")));
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/staff_pay`, "vit")));
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/staff_pay`, "vit")));
    await assertFails(getDoc(doc(as(DONO_BETA), `barbershops/${ALFA}/staff_pay`, "vit")));
    // A ficha pública não volta a receber remuneração…
    await assertFails(setDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "n"), { name: "N", commissionPct: 40 }));
    await assertFails(updateDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "legado"), { commissionPct: 60 }));
    // …mas a ficha antiga continua editável, e o campo pode ser removido.
    await assertSucceeds(updateDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "legado"), { name: "Renomeado" }));
    await assertSucceeds(updateDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "legado"), { commissionPct: deleteField() }));
  });

  it("🔒 custo de produto não é vitrine", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/products`, "pomada"), { name: "Pomada", cost: 18 });
    });
    await assertFails(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/products`, "pomada")));
    await assertFails(getDoc(doc(anon(), `barbershops/${ALFA}/products`, "pomada")));
    /* 08/10: nem o barbeiro — a ficha traz o custo, e o painel dele não
     * vende produto. */
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/products`, "pomada")));
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/products`, "pomada")));
  });

  it("🔒 produto: o dono edita o cadastro, mas não o saldo, e com valores válidos", async () => {
    const pomada = (db: ReturnType<typeof as>) =>
      doc(db, `barbershops/${ALFA}/products`, "pomada");
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/products`, "pomada"), {
        name: "Pomada",
        cost: 18,
        price: 45,
        stock: 10,
        minStock: 5,
      });
    });
    const dono = as(DONO_ALFA);

    // O que é cadastro, edita.
    await assertSucceeds(updateDoc(pomada(dono), { name: "Pomada matte", price: 49.9, cost: 20, minStock: 3 }));
    await assertSucceeds(updateDoc(pomada(dono), { archived: true }));
    await assertSucceeds(updateDoc(pomada(dono), { archived: false }));
    // Custo zero (brinde do fornecedor) é válido.
    await assertSucceeds(updateDoc(pomada(dono), { cost: 0 }));

    // Comissão do barbeiro neste produto: 0–100 ou null (volta ao padrão).
    await assertSucceeds(updateDoc(pomada(dono), { commissionPct: 10 }));
    await assertSucceeds(updateDoc(pomada(dono), { commissionPct: 0 }));
    await assertSucceeds(updateDoc(pomada(dono), { commissionPct: 100 }));
    await assertSucceeds(updateDoc(pomada(dono), { commissionPct: null }));
    await assertFails(updateDoc(pomada(dono), { commissionPct: -1 }));
    await assertFails(updateDoc(pomada(dono), { commissionPct: 101 }));
    await assertFails(updateDoc(pomada(dono), { commissionPct: "10" }));
    await assertFails(updateDoc(pomada(as(BARBEIRO_ALFA)), { commissionPct: 10 }));

    // O saldo é do servidor: entrada, venda, devolução e ajuste.
    await assertFails(updateDoc(pomada(dono), { stock: 99 }));
    await assertFails(updateDoc(pomada(dono), { name: "X", stock: 99 }));
    // Campo que não existe no cadastro.
    await assertFails(updateDoc(pomada(dono), { desconto: 10 }));

    // Valor sem forma quebraria a próxima venda e o CMV.
    await assertFails(updateDoc(pomada(dono), { price: -1 }));
    await assertFails(updateDoc(pomada(dono), { cost: -5 }));
    await assertFails(updateDoc(pomada(dono), { price: "45" }));
    await assertFails(updateDoc(pomada(dono), { cost: "18" }));
    await assertFails(updateDoc(pomada(dono), { minStock: -1 }));
    await assertFails(updateDoc(pomada(dono), { name: "" }));
    await assertFails(updateDoc(pomada(dono), { archived: "sim" }));

    // Nem o dono de outra barbearia, nem o barbeiro.
    await assertFails(updateDoc(pomada(as(DONO_BETA)), { price: 1 }));
    await assertFails(updateDoc(pomada(as(BARBEIRO_ALFA)), { price: 1 }));
  });

  it("🔒 produto: o cadastro novo tem forma", async () => {
    const dono = as(DONO_ALFA);
    const novo = (id: string) => doc(dono, `barbershops/${ALFA}/products`, id);
    await assertSucceeds(
      setDoc(novo("p1"), { name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2 })
    );
    await assertSucceeds(
      setDoc(novo("p1c"), { name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2, commissionPct: 15 })
    );
    await assertSucceeds(
      setDoc(novo("p1d"), { name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2, commissionPct: null })
    );
    await assertFails(
      setDoc(novo("p1e"), { name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2, commissionPct: 150 })
    );
    await assertFails(setDoc(novo("p2"), { name: "Cera", cost: -10, price: 30, stock: 4, minStock: 2 }));
    await assertFails(setDoc(novo("p3"), { name: "Cera", cost: 10, price: 30, stock: -4, minStock: 2 }));
    await assertFails(setDoc(novo("p4"), { name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2, extra: 1 }));
    await assertFails(setDoc(doc(as(DONO_BETA), `barbershops/${ALFA}/products`, "p5"), {
      name: "Cera", cost: 10, price: 30, stock: 4, minStock: 2,
    }));
  });

  it("🔒 senha provisória não trocada: nenhum papel", async () => {
    const PROVISORIO = { sub: "dono-provisorio", barbershops: { [ALFA]: "owner" }, mustChangePassword: true };
    await assertFails(getDoc(doc(as(PROVISORIO), `barbershops/${ALFA}/expenses`, "exp-1")));
    await assertFails(updateDoc(doc(as(PROVISORIO), "barbershops", ALFA), { "brand.name": "X" }));
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/expenses`, "exp-1")));
  });
});

/* ------------------------------------------------------------------ */
/* Encerramento da conta — P0-5                                        */
/* ------------------------------------------------------------------ */

describe("o encerramento é do servidor", () => {
  /* A barbearia encerrada há 2 dias, como `encerrarConta` a deixa. */
  const DOIS_DIAS_ATRAS = Date.now() - 2 * 24 * 60 * 60 * 1000;

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "barbershops", ALFA), {
        status: "encerrada",
        statusAntesDeEncerrar: "ativo",
        encerradaEm: new Date(DOIS_DIAS_ATRAS),
        encerradaEmMs: DOIS_DIAS_ATRAS,
        encerradaPor: DONO_ALFA.sub,
        encerramentoMotivo: null,
      });
    });
  });

  it("🔒 o dono NÃO antecipa o expurgo reescrevendo a data do encerramento", async () => {
    /* `encerradaEmMs: 1` = "encerrada em 1970": o expurgo rodaria na
     * madrugada seguinte, pulando a janela de 30 dias. */
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { encerradaEmMs: 1 }));
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { encerradaEm: new Date(0) })
    );
  });

  it("🔒 o dono NÃO impede o expurgo estragando a data", async () => {
    /* Uma string faz `venceuAJanela` devolver falso para sempre — a conta
     * nunca seria apagada, e a Política afirmaria que foi. */
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { encerradaEmMs: "nunca" })
    );
  });

  it("🔒 o dono NÃO reescreve quem encerrou, nem o motivo, nem o status a restaurar", async () => {
    const ref = doc(as(DONO_ALFA), "barbershops", ALFA);
    await assertFails(updateDoc(ref, { encerradaPor: "outra-pessoa" }));
    await assertFails(updateDoc(ref, { encerramentoMotivo: "reescrito" }));
    /* `statusAntesDeEncerrar` decide o que `reabrirConta` devolve: gravar
     * "ativo" numa conta que era suspensa a destravaria ao reabrir. */
    await assertFails(updateDoc(ref, { statusAntesDeEncerrar: "trial" }));
  });

  it("🔒 o dono NÃO destrava a reabertura apagando a marca do expurgo", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "barbershops", ALFA), {
        expurgo: { iniciadoEmMs: Date.now() },
      });
    });
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { expurgo: null }));
  });

  it("🔒 o dono NÃO apaga o rastro de uma suspensão", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { suspendedReason: null })
    );
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { suspendedAt: new Date() })
    );
  });

  it("🔒 nem escondendo a mudança junto de uma edição legítima", async () => {
    await assertFails(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), {
        brand: { name: "Disfarce" },
        encerradaEmMs: 1,
      })
    );
  });

  it("a lista nova não pegou campo que o dono edita", async () => {
    /* O modo leitura da conta encerrada é decisão da TELA
     * (`acessoDaBarbearia`), não desta regra. */
    await assertSucceeds(
      updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { brand: { name: "Nova Marca" } })
    );
  });

  it("o suporte da plataforma ainda corrige o encerramento, se precisar", async () => {
    await assertSucceeds(
      updateDoc(doc(as(SUPORTE), "barbershops", ALFA), { encerradaEmMs: DOIS_DIAS_ATRAS - 1 })
    );
  });
});

describe("o arquivo fiscal do expurgo", () => {
  it("🔒 ninguém alcança `arquivo_fiscal` pelo cliente — nem o dono, nem o suporte", async () => {
    /* Cópia sem identificação dos registros fiscais de uma barbearia que já
     * não existe. Só o Admin SDK lê; ver `data-deletion.ts`. */
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `arquivo_fiscal/${ALFA}/payments`, "pg-1"), { value: 90 });
    });
    for (const quem of [DONO_ALFA, SUPORTE, CLIENTE]) {
      await assertFails(getDoc(doc(as(quem), `arquivo_fiscal/${ALFA}/payments`, "pg-1")));
      await assertFails(
        setDoc(doc(as(quem), `arquivo_fiscal/${ALFA}/payments`, "forjado"), { value: 1 })
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* Acesso do barbeiro — 08/10                                          */
/* ------------------------------------------------------------------ */

describe("acesso do barbeiro: tirado é tirado (08/10)", () => {
  /* O dono tirou o acesso: a ficha perdeu o `uid`, mas o token do barbeiro
   * (com o claim antigo) ainda vale por até uma hora. */
  const tirarAcesso = () =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "s-alfa"), { uid: null });
    });

  it("com a cadeira ligada, lê a agenda dele e a lista de clientes", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/clients`, "cli-1"), { name: "Cliente", uid: null });
    });
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1")));
    await assertSucceeds(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/clients`)));
  });

  it("🔒 com o token antigo e a ficha solta: não lê agenda, clientes nem comissão", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/clients`, "cli-1"), { name: "Cliente", uid: null });
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/commissions`, "c-alfa"), {
        staffId: "s-alfa", uid: null, commissionAmount: 25,
      });
    });
    await tirarAcesso();
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1")));
    await assertFails(
      getDocs(query(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`), where("staffId", "==", "s-alfa")))
    );
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/clients`)));
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c-alfa")));
  });

  it("🔒 com o token antigo e a ficha solta: não fecha atendimento nem marca falta", async () => {
    await tirarAcesso();
    const bk = doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1");
    await assertFails(updateDoc(bk, { status: "completed", paymentMethod: "pix" }));
    await assertFails(updateDoc(bk, { status: "no_show" }));
  });

  it("🔒 com a ficha solta: não lê comissão pelo `uid` do documento nem taxas e comissão da casa", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/commissions`, "c-uid"), {
        uid: BARBEIRO_ALFA.sub, commissionAmount: 25,
      });
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/private`, "financeiro"), { commissionSplit: {} });
    });
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c-uid")));
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/private`, "financeiro")));
    await tirarAcesso();
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/commissions`, "c-uid")));
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/private`, "financeiro")));
    await assertSucceeds(getDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/private`, "financeiro")));
  });

  it("🔒 a ficha ligada a OUTRA conta não serve ao claim desta", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "s-alfa"), { uid: "outra-conta" });
    });
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1")));
  });
});

describe("o que o barbeiro não lê (08/10)", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `barbershops/${ALFA}/members`, BARBEIRO_ALFA.sub), {
        role: "staff", staffId: "s-alfa", email: "barbeiro@exemplo.com",
      });
      await setDoc(doc(db, `barbershops/${ALFA}/members`, DONO_ALFA.sub), {
        role: "owner", email: "dono@exemplo.com",
      });
      await setDoc(doc(db, `barbershops/${ALFA}/subscriptions`, "sub-1"), {
        clientId: CLIENTE.sub, status: "ativo", planName: "Ilimitado", price: 149,
      });
    });
  });

  it("lê o PRÓPRIO `members`, não o dos outros", async () => {
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/members`, BARBEIRO_ALFA.sub)));
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/members`, DONO_ALFA.sub)));
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/members`)));
    await assertSucceeds(getDocs(collection(as(DONO_ALFA), `barbershops/${ALFA}/members`)));
  });

  it("🔒 não lê as assinaturas — preço e vencimento são receita da casa", async () => {
    await assertFails(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/subscriptions`, "sub-1")));
    await assertFails(getDocs(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/subscriptions`)));
    await assertFails(
      getDocs(query(collection(as(BARBEIRO_ALFA), `barbershops/${ALFA}/subscriptions`), where("clientId", "==", CLIENTE.sub)))
    );
  });

  it("o dono lê as assinaturas, e o cliente a dele", async () => {
    await assertSucceeds(getDocs(collection(as(DONO_ALFA), `barbershops/${ALFA}/subscriptions`)));
    await assertSucceeds(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/subscriptions`, "sub-1")));
    await assertFails(getDoc(doc(as(OUTRO_CLIENTE), `barbershops/${ALFA}/subscriptions`, "sub-1")));
  });
});

describe("remover barbeiro (08/10)", () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "sem-conta"), {
        name: "Sem conta", active: true, uid: null,
      });
    });
  });

  it("o dono apaga direto a ficha SEM conta ligada", async () => {
    await assertSucceeds(deleteDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "sem-conta")));
  });

  it("🔒 ficha com conta ligada só sai pelo servidor (`removerBarbeiro`)", async () => {
    /* Apagando direto, a conta seguia com o papel de barbeiro, o `members`, o
     * celular recebendo notificação e o Telegram da cadeira. */
    await assertFails(deleteDoc(doc(as(DONO_ALFA), `barbershops/${ALFA}/staff`, "s-alfa")));
  });

  it("🔒 o barbeiro não apaga ficha nenhuma", async () => {
    await assertFails(deleteDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/staff`, "sem-conta")));
  });
});

describe("a conta ligada à cadeira é do servidor (09/10)", () => {
  const ficha = (id: string, quem = DONO_ALFA) => doc(as(quem), `barbershops/${ALFA}/staff`, id);

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "sem-conta"), {
        name: "Sem conta", active: true, uid: null,
      });
    });
  });

  it("o dono cria ficha sem conta e edita o que é da ficha", async () => {
    await assertSucceeds(setDoc(ficha("novo"), { name: "Novo", active: true, uid: null, serviceIds: [] }));
    await assertSucceeds(setDoc(ficha("novo2"), { name: "Novo", active: true }));
    await assertSucceeds(updateDoc(ficha("sem-conta"), { name: "Renomeado", active: false }));
    await assertSucceeds(updateDoc(ficha("s-alfa"), { name: "Renomeado" }));
  });

  it("🔒 o dono não cria ficha já ligada a uma conta nem com convite forjado", async () => {
    await assertFails(setDoc(ficha("novo"), { name: "X", active: true, uid: "vitima" }));
    await assertFails(
      setDoc(ficha("novo"), { name: "X", active: true, uid: null, convitePendente: { expiraEmMs: 1, porEmail: false } })
    );
  });

  it("🔒 o dono não liga a ficha à conta de terceiro, nem troca nem zera a ligação", async () => {
    await assertFails(updateDoc(ficha("sem-conta"), { uid: "vitima" }));
    await assertFails(updateDoc(ficha("s-alfa"), { uid: "vitima" }));
    /* Zerar o `uid` e apagar a ficha contornava o "só o servidor remove ficha com conta". */
    await assertFails(updateDoc(ficha("s-alfa"), { uid: null }));
    await assertFails(updateDoc(ficha("s-alfa"), { uid: deleteField() }));
    await assertFails(deleteDoc(ficha("s-alfa")));
  });

  it("🔒 o dono não grava nem apaga `convitePendente` — é o estado do convite do servidor", async () => {
    await assertFails(updateDoc(ficha("sem-conta"), { convitePendente: { expiraEmMs: 1, porEmail: false } }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/staff`, "sem-conta"), {
        convitePendente: { expiraEmMs: 9, porEmail: true },
      });
    });
    await assertFails(updateDoc(ficha("sem-conta"), { convitePendente: deleteField() }));
    await assertSucceeds(updateDoc(ficha("sem-conta"), { name: "Só o nome" }));
  });

  it("🔒 o barbeiro não grava a própria ficha", async () => {
    await assertFails(updateDoc(ficha("s-alfa", BARBEIRO_ALFA), { uid: BARBEIRO_ALFA.sub, name: "Eu" }));
  });
});

describe("concluir e marcar falta só a partir do dia (08/10)", () => {
  const comData = (date: string) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `barbershops/${ALFA}/bookings`, "bk-1"), { date, time: "10:00" });
    });
  const bk = (quem: { sub: string } & Record<string, unknown>) =>
    doc(as(quem), `barbershops/${ALFA}/bookings`, "bk-1");

  it("🔒 reserva de dia futuro: nem o barbeiro nem o dono concluem ou marcam falta", async () => {
    await comData("2099-12-31");
    await assertFails(updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "pix" }));
    await assertFails(updateDoc(bk(BARBEIRO_ALFA), { status: "no_show" }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "pix" }));
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "no_show" }));
  });

  it("reserva de dia que já passou: conclui e marca falta normalmente", async () => {
    await comData("2026-01-15");
    await assertSucceeds(updateDoc(bk(BARBEIRO_ALFA), { status: "no_show" }));
  });

  it("dia que já passou: o dono conclui", async () => {
    await comData("2026-01-15");
    await assertSucceeds(updateDoc(bk(DONO_ALFA), { status: "completed", paymentMethod: "cash" }));
  });

  it("hoje (no fuso de São Paulo) conclui — a hora fica com a tela", async () => {
    const hojeEmSaoPaulo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await comData(hojeEmSaoPaulo);
    await assertSucceeds(updateDoc(bk(BARBEIRO_ALFA), { status: "completed", paymentMethod: "pix" }));
  });

  it("🔒 data fora do formato não passa", async () => {
    await comData("amanhã");
    await assertFails(updateDoc(bk(DONO_ALFA), { status: "no_show" }));
  });
});
