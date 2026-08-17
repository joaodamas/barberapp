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
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Isolamento multi-tenant — ATAQUE SISTEMÁTICO.
 *
 * O teste de regras existente prova o isolamento em algumas coleções. Este
 * varre **todas**, e a diferença de método é o ponto:
 *
 *   não basta saber que as queries filtram por barbearia.
 *   é preciso TENTAR a violação e provar que ela falha.
 *
 * O atacante é o dono da Alfa — autenticado, legítimo, com claim válido para a
 * própria barbearia. Ele conhece os ids da Beta (um slug é público, e um id de
 * documento vaza em qualquer print de tela) e tenta usá-los.
 *
 * Toda tentativa aqui é de VIOLAÇÃO. `assertFails` é o resultado esperado, e um
 * `assertSucceeds` neste arquivo significa que a plataforma vaza dado de um
 * cliente pagante para outro.
 *
 * Exige o emulador:  npm run test:rules
 */

const ALFA = "barbearia-alfa";
const BETA = "barbearia-beta";

const DONO_ALFA = { sub: "dono-alfa", barbershops: { [ALFA]: "owner" } };
const BARBEIRO_ALFA = { sub: "barbeiro-alfa", barbershops: { [ALFA]: "staff" } };
const CLIENTE_ALFA = { sub: "cliente-alfa" };
const CLIENTE_BETA = { sub: "cliente-beta" };

/** Todas as subcoleções da barbearia, de `web/src/lib/db/paths.ts`. */
const SUBCOLECOES = [
  "members",
  "staff",
  "services",
  "plans",
  "products",
  /* Entrou com G3. Uma coleção nova que não passa por este ataque nasce fora da
   * prova — e `clients` é a que guarda nome e WhatsApp de todo mundo, ou seja,
   * a lista de contatos comercial da barbearia. */
  "clients",
  "bookings",
  "schedules",
  "expenses",
  "cash_entries",
  "commissions",
  "inventory_movements",
  "payments",
  "refunds",
  "subscriptions",
  "subscription_invoices",
  "loyalty_transactions",
  "client_occurrences",
  "whatsapp_messages",
  "audit_log",
] as const;

let testEnv: RulesTestEnvironment;

function as(claims: { sub: string } & Record<string, unknown>) {
  const { sub, ...rest } = claims;
  return testEnv.authenticatedContext(sub, rest).firestore();
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "isolamento-multi-tenant",
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
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();

    for (const bid of [ALFA, BETA]) {
      const cliente = bid === ALFA ? CLIENTE_ALFA.sub : CLIENTE_BETA.sub;

      await setDoc(doc(db, "barbershops", bid), {
        slug: bid,
        status: "ativo",
        plan: "gestao",
        brand: { name: bid },
      });
      await setDoc(doc(db, "slugs", bid), { barbershopId: bid });

      // Um documento em CADA subcoleção, com id previsível.
      await setDoc(doc(db, `barbershops/${bid}/members`, "membro-1"), { role: "owner" });
      await setDoc(doc(db, `barbershops/${bid}/staff`, "staff-1"), { name: "Barbeiro", uid: null });
      await setDoc(doc(db, `barbershops/${bid}/services`, "corte"), { name: "Corte", price: 60 });
      await setDoc(doc(db, `barbershops/${bid}/plans`, "plano-1"), { name: "Ilimitado", price: 149 });
      await setDoc(doc(db, `barbershops/${bid}/products`, "pomada"), { name: "Pomada", cost: 18 });
      await setDoc(doc(db, `barbershops/${bid}/bookings`, "bk-1"), {
        clientId: cliente,
        status: "completed",
        value: 90,
      });
      await setDoc(doc(db, `barbershops/${bid}/schedules`, "sch-1"), { weekdays: [1] });
      /* G3 · dois cadastros por barbearia: o do cliente COM conta, cujo id é o
       * uid, e o de balcão, com id gerado e `uid: null`. Os dois casos precisam
       * ser atacados, porque a regra os trata de forma diferente. */
      await setDoc(doc(db, `barbershops/${bid}/clients`, cliente), {
        uid: cliente,
        name: "Cliente com conta",
        whatsapp: "11988887777",
        origin: "app",
        active: true,
      });
      await setDoc(doc(db, `barbershops/${bid}/clients`, "cli-1"), {
        uid: null,
        name: "Cliente de balcão",
        whatsapp: "11977776666",
        origin: "balcao",
        active: true,
      });
      await setDoc(doc(db, `barbershops/${bid}/expenses`, "exp-1"), { value: 1800 });
      await setDoc(doc(db, `barbershops/${bid}/cash_entries`, "cx-1"), { value: 300 });
      await setDoc(doc(db, `barbershops/${bid}/commissions`, "com-1"), {
        uid: "staff-uid",
        commissionAmount: 36,
      });
      await setDoc(doc(db, `barbershops/${bid}/inventory_movements`, "mov-1"), { value: 180 });
      await setDoc(doc(db, `barbershops/${bid}/payments`, "pg-1"), {
        clientId: cliente,
        grossAmount: 90,
      });
      await setDoc(doc(db, `barbershops/${bid}/refunds`, "ref-1"), { clientId: cliente, value: 90 });
      await setDoc(doc(db, `barbershops/${bid}/subscriptions`, "sub-1"), {
        clientId: cliente,
        price: 149,
      });
      await setDoc(doc(db, `barbershops/${bid}/subscription_invoices`, "inv-1"), {
        clientId: cliente,
        value: 149,
      });
      await setDoc(doc(db, `barbershops/${bid}/loyalty_transactions`, "loy-1"), {
        clientId: cliente,
        stamps: 1,
      });
      await setDoc(doc(db, `barbershops/${bid}/client_occurrences`, "oc-1"), { tipo: "no_show" });
      await setDoc(doc(db, `barbershops/${bid}/whatsapp_messages`, "msg-1"), { to: "5511999" });
      await setDoc(doc(db, `barbershops/${bid}/audit_log`, "log-1"), { action: "criou" });
      await setDoc(doc(db, `barbershops/${bid}/private`, "billing"), { paidUntil: "2026-12-31" });
    }

    // Índices da raiz, que só o servidor deveria alcançar.
    await setDoc(doc(db, "platform_users", "dono-beta"), { initialPasswordHash: "abc" });
    await setDoc(doc(db, "whatsapp_numbers", "num-1"), { barbershopId: BETA });
    await setDoc(doc(db, "whatsapp_sent", "msg-1"), { barbershopId: BETA });
    await setDoc(doc(db, "whatsapp_conversations", "5511999"), { barbershopId: BETA });
    await setDoc(doc(db, "users", CLIENTE_BETA.sub), { name: "Cliente da Beta" });
  });
});

/* ================================================================== */
/* 1 · LEITURA CRUZADA — o dono da Alfa tenta ler tudo da Beta        */
/* ================================================================== */

describe("1 · o dono da Alfa NÃO lê nenhuma coleção da Beta", () => {
  /* Documento a documento, com id conhecido: é o ataque mais simples e o mais
   * provável — um id vaza num print, numa URL ou num export. */
  it.each(SUBCOLECOES)("🔒 leitura direta de barbershops/BETA/%s/{id}", async (colecao) => {
    const db = as(DONO_ALFA);
    const idPorColecao: Record<string, string> = {
      members: "membro-1",
      staff: "staff-1",
      services: "corte",
      plans: "plano-1",
      products: "pomada",
      bookings: "bk-1",
      schedules: "sch-1",
      expenses: "exp-1",
      cash_entries: "cx-1",
      commissions: "com-1",
      inventory_movements: "mov-1",
      payments: "pg-1",
      refunds: "ref-1",
      subscriptions: "sub-1",
      subscription_invoices: "inv-1",
      loyalty_transactions: "loy-1",
      client_occurrences: "oc-1",
      whatsapp_messages: "msg-1",
      audit_log: "log-1",
      /* Id que NÃO é o uid de ninguém: o ataque precisa medir a regra do
       * tenant, não esbarrar no casamento `clientId == request.auth.uid`. O
       * caso do próprio cadastro tem bloco separado, mais abaixo. */
      clients: "cli-1",
    };

    /* `services`, `staff`, `plans`, `products` e `schedules` são legíveis por
     * QUALQUER autenticado, de propósito: o cliente precisa ver o catálogo e os
     * barbeiros para escolher. São vitrine, e o comentário das regras diz isso.
     * O que não pode vazar é operação e dinheiro. */
    const vitrine = ["services", "staff", "plans", "products", "schedules"];

    const alvo = doc(db, `barbershops/${BETA}/${colecao}`, idPorColecao[colecao]);

    if (vitrine.includes(colecao)) {
      await assertSucceeds(getDoc(alvo));
    } else {
      await assertFails(getDoc(alvo));
    }
  });

  it("🔒 listagem da coleção inteira também falha", async () => {
    /* Ler documento a documento é um ataque; listar a coleção é outro. As duas
     * portas precisam estar fechadas. */
    const db = as(DONO_ALFA);
    for (const colecao of ["expenses", "bookings", "payments", "commissions", "audit_log"]) {
      await assertFails(getDocs(collection(db, `barbershops/${BETA}/${colecao}`)));
    }
  });

  it("🔒 o contrato da Beta (private) é inalcançável", async () => {
    const db = as(DONO_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/private`, "billing")));
    await assertFails(getDocs(collection(db, `barbershops/${BETA}/private`)));
  });

  it("🔒 a lista de CLIENTES da Beta é inalcançável — é a agenda comercial dela", async () => {
    /* `clients` guarda nome e WhatsApp de todo mundo que já passou pela loja.
     * Se vazasse entre barbearias, um concorrente baixaria a carteira inteira
     * de outro numa chamada — é o dado com maior valor de mercado no banco. */
    const db = as(DONO_ALFA);
    await assertFails(getDocs(collection(db, `barbershops/${BETA}/clients`)));
    await assertFails(
      getDocs(
        query(
          collection(db, `barbershops/${BETA}/clients`),
          where("whatsapp", "==", "11988887777")
        )
      )
    );
  });

  it("🔒 nem com query filtrada por um cliente da Beta", async () => {
    /* Tentativa mais sofisticada: em vez de pedir a coleção, pedir só o que
     * "é do cliente". A regra de `ownsResource` compara com o PRÓPRIO uid, e o
     * dono da Alfa não é aquele cliente. */
    const db = as(DONO_ALFA);
    await assertFails(
      getDocs(
        query(
          collection(db, `barbershops/${BETA}/payments`),
          where("clientId", "==", CLIENTE_BETA.sub)
        )
      )
    );
  });
});

/* ================================================================== */
/* 2 · ESCRITA CRUZADA                                                */
/* ================================================================== */

describe("2 · o dono da Alfa NÃO escreve em nada da Beta", () => {
  it.each(SUBCOLECOES)("🔒 criar documento em barbershops/BETA/%s", async (colecao) => {
    const db = as(DONO_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${BETA}/${colecao}`, "invadido"), { origem: "alfa" })
    );
  });

  it("🔒 alterar documento existente da Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(updateDoc(doc(db, `barbershops/${BETA}/services`, "corte"), { price: 1 }));
    await assertFails(updateDoc(doc(db, `barbershops/${BETA}/expenses`, "exp-1"), { value: 0 }));
  });

  it("🔒 apagar documento da Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(deleteDoc(doc(db, `barbershops/${BETA}/bookings`, "bk-1")));
    await assertFails(deleteDoc(doc(db, `barbershops/${BETA}/services`, "corte")));
  });

  it("🔒 alterar a ficha da própria Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(updateDoc(doc(db, "barbershops", BETA), { "brand.name": "Invadida" }));
  });

  it("🔒 sequestrar o slug da Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(setDoc(doc(db, "slugs", BETA), { barbershopId: ALFA }));
  });

  it("🔒 apagar a barbearia Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(deleteDoc(doc(db, "barbershops", BETA)));
  });
});

/* ================================================================== */
/* 3 · COLLECTION GROUP — a porta lateral                             */
/* ================================================================== */

describe("3 · collection group não atravessa barbearias", () => {
  /* A armadilha clássica do Firestore: `match /barbershops/{id}/bookings/{id}`
   * NÃO autoriza uma consulta de collection group. Ela exigiria
   * `match /{path=**}/bookings/{id}`, que as regras não têm — e é por isso que
   * a consulta falha.
   *
   * Se um dia alguém acrescentar essa regra para "resolver" uma consulta, abre
   * exatamente esta porta. O teste existe para o dia em que isso for tentado. */
  it.each(["bookings", "payments", "commissions", "expenses", "subscriptions"])(
    "🔒 collectionGroup(%s) é negado",
    async (colecao) => {
      const db = as(DONO_ALFA);
      await assertFails(getDocs(query(collectionGroup(db, colecao))));
    }
  );

  it("🔒 nem filtrando o collection group pelo próprio uid", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(
      getDocs(query(collectionGroup(db, "bookings"), where("clientId", "==", CLIENTE_ALFA.sub)))
    );
  });
});

/* ================================================================== */
/* 4 · O BARBEIRO DA ALFA                                             */
/* ================================================================== */

describe("4 · o barbeiro da Alfa não alcança a Beta", () => {
  it("🔒 não lê a agenda da Beta", async () => {
    const db = as(BARBEIRO_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/bookings`, "bk-1")));
  });

  it("🔒 não lê comissão de ninguém na Beta", async () => {
    const db = as(BARBEIRO_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/commissions`, "com-1")));
  });

  it("🔒 não movimenta estoque da Beta", async () => {
    const db = as(BARBEIRO_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${BETA}/inventory_movements`, "mov-2"), { value: 1 })
    );
  });
});

/* ================================================================== */
/* 5 · O CLIENTE ATRAVESSA BARBEARIAS — e não deve levar nada         */
/* ================================================================== */

describe("5 · o cliente da Alfa não vira cliente da Beta", () => {
  it("🔒 não lê a reserva de um cliente da Beta", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/bookings`, "bk-1")));
  });

  it("🔒 não lê o pagamento de um cliente da Beta", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/payments`, "pg-1")));
  });

  it("🔒 não lê a fidelidade de um cliente da Beta", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${BETA}/loyalty_transactions`, "loy-1")));
  });

  it("🔒 não lê o perfil de outro cliente", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, "users", CLIENTE_BETA.sub)));
  });

  it("🔒 não forja reserva na Beta em nome de outro", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${BETA}/bookings`, "forjada"), {
        clientId: CLIENTE_BETA.sub,
        status: "confirmed",
        value: 0,
      })
    );
  });

  /* ---- G3 · o cadastro do cliente ---- */

  it("✅ lê o PRÓPRIO cadastro na Alfa — é o casamento clients/{uid}", async () => {
    /* A decisão arquitetural de G3 depende deste caso: com o id do documento
     * sendo o uid, a regra funciona sem campo extra e sem join. Se isto falhar,
     * `clients/{uid}` não se sustenta. */
    const db = as(CLIENTE_ALFA);
    await assertSucceeds(getDoc(doc(db, `barbershops/${ALFA}/clients`, CLIENTE_ALFA.sub)));
  });

  it("🔒 não lê o cadastro de OUTRO cliente da mesma barbearia", async () => {
    /* Nome e WhatsApp de outra pessoa, dentro da loja que os dois frequentam.
     * O isolamento aqui não é entre barbearias, é entre clientes. */
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${ALFA}/clients`, CLIENTE_BETA.sub)));
  });

  it("🔒 não lê cadastro de BALCÃO, nem o da própria barbearia", async () => {
    /* O id gerado não iguala uid nenhum. É por isso que a reserva de balcão só
     * é visível para quem toca a loja — consequência declarada em clients.ts. */
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, `barbershops/${ALFA}/clients`, "cli-1")));
  });

  it("🔒 não lista os clientes da barbearia que frequenta", async () => {
    /* Ler o próprio é uma porta; listar a coleção é outra. Sem esta, qualquer
     * cliente autenticado baixaria a carteira inteira da loja. */
    const db = as(CLIENTE_ALFA);
    await assertFails(getDocs(collection(db, `barbershops/${ALFA}/clients`)));
  });

  it("🔒 não escreve o próprio cadastro — nem o próprio", async () => {
    /* `allow write: if false` para todos. O cadastro nasce dentro da transação
     * da reserva; deixar o cliente gravar aqui permitiria criar cadastro
     * fantasma e, pior, plantar o WhatsApp de outra pessoa para sequestrar a
     * deduplicação dela. */
    const db = as(CLIENTE_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${ALFA}/clients`, CLIENTE_ALFA.sub), {
        uid: CLIENTE_ALFA.sub,
        name: "Eu mesmo",
        whatsapp: "11900000000",
        origin: "app",
        active: true,
      })
    );
  });
});

/* ================================================================== */
/* 6 · ESCALADA DE PRIVILÉGIO                                         */
/* ================================================================== */

describe("6 · o dono da Alfa não se torna dono da Beta", () => {
  it("🔒 não se adiciona como membro da Beta", async () => {
    const db = as(DONO_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${BETA}/members`, DONO_ALFA.sub), { role: "owner" })
    );
  });

  it("🔒 não planta vínculo no próprio documento de usuário", async () => {
    /* O claim é a autoridade, e não este campo — mas gravá-lo prepararia a
     * escalada para o dia em que alguém escrever um painel que o leia. */
    const db = as(DONO_ALFA);
    await assertFails(
      setDoc(doc(db, "users", DONO_ALFA.sub), {
        name: "Dono",
        barbershops: { [BETA]: "owner" },
      })
    );
  });

  it("🔒 não se promove a platformAdmin", async () => {
    const db = as(DONO_ALFA);
    await assertFails(setDoc(doc(db, "users", DONO_ALFA.sub), { platformAdmin: true }));
  });

  it("🔒 não lê a senha provisória de outro dono", async () => {
    const db = as(DONO_ALFA);
    await assertFails(getDoc(doc(db, "platform_users", "dono-beta")));
  });
});

/* ================================================================== */
/* 7 · ÍNDICES DA RAIZ — o mapa da plataforma                         */
/* ================================================================== */

describe("7 · os índices de WhatsApp são inalcançáveis", () => {
  /* Expostos, `whatsapp_conversations` é uma lista de qual telefone é cliente
   * de qual barbearia — dado de terceiro, e mapa comercial da plataforma. */
  it.each(["whatsapp_numbers", "whatsapp_sent", "whatsapp_conversations"])(
    "🔒 %s negado para o dono",
    async (colecao) => {
      const db = as(DONO_ALFA);
      await assertFails(getDocs(collection(db, colecao)));
    }
  );

  it("🔒 e para o cliente", async () => {
    const db = as(CLIENTE_ALFA);
    await assertFails(getDoc(doc(db, "whatsapp_conversations", "5511999")));
  });
});

/* ================================================================== */
/* 8 · O QUE A ALFA PODE — o isolamento não pode travar a operação    */
/* ================================================================== */

describe("8 · a Alfa opera normalmente a própria casa", () => {
  it("o dono lê e escreve o que é dele", async () => {
    const db = as(DONO_ALFA);
    await assertSucceeds(getDoc(doc(db, `barbershops/${ALFA}/expenses`, "exp-1")));
    await assertSucceeds(getDocs(collection(db, `barbershops/${ALFA}/bookings`)));
    await assertSucceeds(updateDoc(doc(db, `barbershops/${ALFA}/services`, "corte"), { price: 70 }));
    await assertSucceeds(setDoc(doc(db, `barbershops/${ALFA}/expenses`, "exp-2"), { value: 90 }));
  });

  it("o dono lê o próprio contrato", async () => {
    const db = as(DONO_ALFA);
    await assertSucceeds(getDoc(doc(db, `barbershops/${ALFA}/private`, "billing")));
  });

  it("o barbeiro da Alfa lê a agenda da Alfa", async () => {
    const db = as(BARBEIRO_ALFA);
    await assertSucceeds(getDocs(collection(db, `barbershops/${ALFA}/bookings`)));
  });

  it("o dono lê a carteira de clientes DELE — inclusive os de balcão", async () => {
    /* A contraprova do bloco 5: fechar `clients` para o cliente não pode fechar
     * para a barbearia, que precisa da lista para atender no balcão. Se este
     * caso falhasse, G3 teria criado uma coleção que ninguém consegue usar. */
    const db = as(DONO_ALFA);
    await assertSucceeds(getDocs(collection(db, `barbershops/${ALFA}/clients`)));
    await assertSucceeds(getDoc(doc(db, `barbershops/${ALFA}/clients`, "cli-1")));
  });

  it("o barbeiro também lê — é ele quem atende", async () => {
    const db = as(BARBEIRO_ALFA);
    await assertSucceeds(getDocs(collection(db, `barbershops/${ALFA}/clients`)));
  });

  it("o dono LÊ o próprio estoque, e NÃO escreve direto — G1", async () => {
    /* A escrita era `if isStaffOf(...)` e ficou assim enquanto ninguém escrevia
     * a coleção. Com `registrarVendaDeProduto` existindo, deixá-la aberta
     * reabriria tudo que a transação protege: baixar estoque sem registrar a
     * venda, gravar `unitCost` a dedo — que é escrever o CMV na mão —, furar a
     * checagem de estoque, e duas vendas consumindo a mesma unidade. */
    const db = as(DONO_ALFA);
    await assertSucceeds(getDocs(collection(db, `barbershops/${ALFA}/inventory_movements`)));
    await assertFails(
      setDoc(doc(db, `barbershops/${ALFA}/inventory_movements`, "na-mao"), {
        productId: "pomada",
        kind: "venda",
        quantity: 1,
        unitCost: 0,
        value: 45,
        date: "2026-08-17",
      })
    );
  });

  it("mas nem o dono ESCREVE direto — o cadastro nasce pelo servidor", async () => {
    /* Mesmo desenho de `bookings`: a tela nunca grava direto. Sem isso, o
     * cadastro poderia nascer sem a reserva e a deduplicação por WhatsApp
     * perderia o único lugar onde é garantida — a transação. */
    const db = as(DONO_ALFA);
    await assertFails(
      setDoc(doc(db, `barbershops/${ALFA}/clients`, "novo"), {
        uid: null,
        name: "Direto na regra",
        whatsapp: "11911112222",
        origin: "balcao",
        active: true,
      })
    );
  });

  it("o cliente lê a própria reserva na Alfa", async () => {
    const db = as(CLIENTE_ALFA);
    await assertSucceeds(getDoc(doc(db, `barbershops/${ALFA}/bookings`, "bk-1")));
  });

  it("a vitrine é pública — é o que resolve o subdomínio antes do login", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "slugs", ALFA)));
    await assertSucceeds(getDoc(doc(anon, "barbershops", ALFA)));
  });
});

/* ================================================================== */
/* 9 · O MAPA DE CLIENTES DA PLATAFORMA                               */
/* ================================================================== */

describe("9 · quanto a plataforma expõe de si mesma", () => {
  it("a ficha de cada barbearia é pública, uma a uma — decisão registrada", async () => {
    /* É vitrine: o servidor precisa pintar a tela antes de saber quem acessa, e
     * é a mesma informação da fachada. */
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anon, "barbershops", BETA)));
  });

  it("⚠️ e a LISTA de todas as barbearias também é", async () => {
    /* Consequência de `allow read: if true` no documento: a permissão vale para
     * a listagem da coleção. Qualquer pessoa, sem login, enumera todas as
     * barbearias da plataforma — nome, slug, status e plano.
     *
     * Não vaza operação nem dinheiro; vaza o MAPA COMERCIAL: quantos clientes a
     * plataforma tem, quem são, quem está suspenso e quem paga o plano de cima.
     * Um concorrente lê isso numa requisição.
     *
     * Registrado como achado, e não corrigido aqui: fechar a listagem sem
     * fechar a leitura por id exige separar as duas permissões, e a resolução
     * do subdomínio depende da segunda. */
    const anon = testEnv.unauthenticatedContext().firestore();
    const todas = await assertSucceeds(getDocs(collection(anon, "barbershops")));
    expect(todas.size).toBeGreaterThanOrEqual(2);
  });

  it("⚠️ o índice de slugs também é enumerável", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    const slugs = await assertSucceeds(getDocs(collection(anon, "slugs")));
    expect(slugs.size).toBeGreaterThanOrEqual(2);
  });
});
