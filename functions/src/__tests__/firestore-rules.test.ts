import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
const BARBEIRO_ALFA = { sub: "barbeiro-alfa", barbershops: { [ALFA]: "staff" } };
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
        status: "confirmed",
        value: 90,
      });
      await setDoc(doc(db, `barbershops/${bid}/audit_log`, "log-1"), { action: "criou" });
    }
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
  it("o barbeiro lê a agenda", async () => {
    await assertSucceeds(getDoc(doc(as(BARBEIRO_ALFA), `barbershops/${ALFA}/bookings`, "bk-1")));
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

  it("cria a própria reserva", async () => {
    await assertSucceeds(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova"), {
        clientId: CLIENTE.sub,
        date: "2026-08-10",
        time: "10:00",
      })
    );
  });

  it("🔒 NÃO cria reserva em nome de outro", async () => {
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova"), {
        clientId: OUTRO_CLIENTE.sub,
        date: "2026-08-10",
      })
    );
  });

  it("🔒 NÃO define status nem valor da própria reserva", async () => {
    // Senão dá para marcar "confirmed" de R$ 0 sem passar pelo pagamento.
    await assertFails(
      setDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "nova"), {
        clientId: CLIENTE.sub,
        status: "confirmed",
        value: 0,
      })
    );
  });

  it("🔒 NÃO cancela a própria reserva direto no banco", async () => {
    // Cancelamento passa por Cloud Function: aplica política e calcula reembolso.
    await assertFails(
      updateDoc(doc(as(CLIENTE), `barbershops/${ALFA}/bookings`, "bk-1"), {
        status: "cancelled_by_client",
      })
    );
  });

  it("lê o próprio pagamento e não o dos outros", async () => {
    await assertSucceeds(getDoc(doc(as(CLIENTE), `barbershops/${ALFA}/payments`, "pg-1")));
    await assertFails(getDoc(doc(as(OUTRO_CLIENTE), `barbershops/${ALFA}/payments`, "pg-1")));
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
});

describe("contrato com a plataforma", () => {
  it("🔒 o dono NÃO muda o próprio plano, status ou slug", async () => {
    // Valores DIFERENTES dos semeados: `diff()` não acusa mudança quando se
    // grava o mesmo valor, e um teste com valor igual passaria por acidente.
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { plan: "completo+" }));
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { status: "suspenso" }));
    await assertFails(updateDoc(doc(as(DONO_ALFA), "barbershops", ALFA), { slug: "outro" }));
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
