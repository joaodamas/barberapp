import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarComTravaDeHorario } from "../booking";
import type { OrigemDoCliente } from "../clients";

/**
 * G3 — o cadastro do cliente, dentro da transação que grava a reserva.
 *
 * `clients.test.ts` prova as decisões puras: o que serve de chave, como o nome
 * é normalizado. Nada ali consegue afirmar o que este arquivo afirma:
 *
 * 1. que a ordem leitura → escrita da transação está correta — uma leitura
 *    depois de uma escrita é erro de RUNTIME, invisível para typecheck e para
 *    teste puro;
 * 2. que o mesmo WhatsApp não vira dois cadastros quando duas reservas chegam
 *    no mesmo instante;
 * 3. que o cadastro e a reserva nascem juntos, ou nenhum dos dois nasce.
 *
 * Exige o emulador:  npm run test:clientes
 */

const PROJETO = "clientes-g3";
const SHOP = "barbearia-teste";
const DATA = "2026-09-15";

let app: App;
let db: Firestore;

function pedido(over: {
  time?: string;
  uid?: string | null;
  name?: string;
  whatsapp?: string;
  origin?: OrigemDoCliente;
  staffId?: string;
}) {
  const time = over.time ?? "15:00";
  return {
    db,
    shopRef: db.doc(`barbershops/${SHOP}`),
    /* `clientId` de params vira irrelevante quando `cliente` está presente — e
     * é exatamente isso que um dos testes abaixo verifica. */
    clientId: "IGNORADO",
    staffId: over.staffId ?? "barbeiro-1",
    date: DATA,
    time,
    duracaoDaReserva: 30,
    slotMinutes: 30,
    maxAtivas: 3,
    hojeNaBarbearia: "2026-09-01",
    cliente: {
      barbershopId: SHOP,
      uid: over.uid ?? null,
      name: over.name ?? "Cliente",
      whatsapp: over.whatsapp ?? "11988887777",
      origin: over.origin ?? ("balcao" as OrigemDoCliente),
    },
    documento: {
      clientId: "IGNORADO",
      staffId: over.staffId ?? "barbeiro-1",
      date: DATA,
      time,
      durationMin: 30,
      status: "confirmed",
      value: 50,
    },
  } as Parameters<typeof gravarComTravaDeHorario>[0];
}

type ClienteNoBanco = Record<string, unknown> & { id: string };

async function clientes(): Promise<ClienteNoBanco[]> {
  const snap = await db.collection(`barbershops/${SHOP}/clients`).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as ClienteNoBanco);
}

async function reservas() {
  const snap = await db.collection(`barbershops/${SHOP}/bookings`).get();
  return snap.docs.map((d) => d.data());
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:clientes");
  }
  app = initializeApp({ projectId: PROJETO }, `clientes-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["bookings", "clients"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

/* ================================================================== */
/* A ordem da transação                                               */
/* ================================================================== */

describe("G3 · a transação executa", () => {
  it("grava cliente e reserva sem violar leitura-depois-de-escrita", async () => {
    /* Este teste existe por um motivo específico: a primeira versão de
     * `garantirCliente` lia e gravava numa função só, e teria explodido aqui
     * com "Firestore transactions require all reads to be executed before all
     * writes" — depois de passar por typecheck e pelos testes puros.
     *
     * Se ele passa, a separação em duas fases está correta. */
    await gravarComTravaDeHorario(pedido({ name: "João Damas" }));

    expect(await clientes()).toHaveLength(1);
    expect(await reservas()).toHaveLength(1);
  });

  it("a reserva aponta para o cadastro, e não para o clientId recebido", async () => {
    await gravarComTravaDeHorario(pedido({ name: "João Damas" }));

    const [cliente] = await clientes();
    const [reserva] = await reservas();
    expect(reserva.clientId).toBe(cliente.id);
    expect(reserva.clientId).not.toBe("IGNORADO");
  });
});

/* ================================================================== */
/* Identidade: com conta e sem conta                                  */
/* ================================================================== */

describe("G3 · identidade", () => {
  it("cliente COM conta nasce em clients/{uid} — é o que mantém as regras válidas", async () => {
    /* A decisão arquitetural inteira depende disto. Se o id não for o uid,
     * `resource.data.clientId == request.auth.uid` para de valer e a suíte de
     * isolamento precisaria ser refeita. */
    await gravarComTravaDeHorario(
      pedido({ uid: "uid-do-joao", origin: "app", name: "João", whatsapp: "11988887777" })
    );

    const [cliente] = await clientes();
    expect(cliente.id).toBe("uid-do-joao");
    expect(cliente.uid).toBe("uid-do-joao");
    expect(cliente.origin).toBe("app");

    const [reserva] = await reservas();
    expect(reserva.clientId).toBe("uid-do-joao");
  });

  it("cliente de BALCÃO nasce sem uid, com id gerado", async () => {
    await gravarComTravaDeHorario(pedido({ name: "Seu Zé", whatsapp: "11977776666" }));

    const [cliente] = await clientes();
    expect(cliente.uid).toBeNull();
    expect(cliente.origin).toBe("balcao");
    expect(cliente.name).toBe("Seu Zé");
    expect(String(cliente.id).length).toBeGreaterThan(10);
  });

  it("a reserva de balcão é invisível para qualquer conta — consequência declarada", async () => {
    /* Não é efeito colateral: é o desenho. O `clientId` gerado não iguala
     * nenhum `request.auth.uid`, então a regra do Firestore só libera a leitura
     * para quem toca a barbearia. O limite conhecido — o walk-in que criar
     * conta depois não vê o histórico antigo — está registrado em clients.ts. */
    await gravarComTravaDeHorario(pedido({ name: "Seu Zé", whatsapp: "11977776666" }));

    const [reserva] = await reservas();
    const [cliente] = await clientes();
    expect(reserva.clientId).toBe(cliente.id);
    expect(cliente.uid).toBeNull();
  });
});

/* ================================================================== */
/* Deduplicação — a invariante do WhatsApp                            */
/* ================================================================== */

describe("G3 · WhatsApp único por barbearia", () => {
  it("o mesmo número duas vezes reusa o cadastro", async () => {
    await gravarComTravaDeHorario(pedido({ time: "15:00", name: "Seu Zé", whatsapp: "11977776666" }));
    await gravarComTravaDeHorario(pedido({ time: "16:00", name: "Seu Zé", whatsapp: "11977776666" }));

    expect(await clientes()).toHaveLength(1);
    const rs = await reservas();
    expect(rs).toHaveLength(2);
    expect(rs[0].clientId).toBe(rs[1].clientId);
  });

  it("o mesmo número formatado diferente ainda é a mesma pessoa", async () => {
    await gravarComTravaDeHorario(pedido({ time: "15:00", whatsapp: "11977776666" }));
    await gravarComTravaDeHorario(pedido({ time: "16:00", whatsapp: "(11) 97777-6666" }));

    expect(await clientes()).toHaveLength(1);
  });

  it("números diferentes são pessoas diferentes", async () => {
    await gravarComTravaDeHorario(pedido({ time: "15:00", whatsapp: "11977776666" }));
    await gravarComTravaDeHorario(pedido({ time: "16:00", whatsapp: "11955554444" }));

    expect(await clientes()).toHaveLength(2);
  });

  it("número incompleto NÃO agrupa pessoas diferentes", async () => {
    /* O risco espelhado da deduplicação: se um número pela metade servisse de
     * chave, duas pessoas com digitação incompleta virariam um cadastro só — e
     * a reserva de uma apareceria no histórico da outra. Pior que duplicar. */
    await gravarComTravaDeHorario(pedido({ time: "15:00", name: "Ana", whatsapp: "119" }));
    await gravarComTravaDeHorario(pedido({ time: "16:00", name: "Bruno", whatsapp: "119" }));

    const cs = await clientes();
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.name).sort()).toEqual(["Ana", "Bruno"]);
  });

  it("nome de verdade substitui o genérico; o inverso não acontece", async () => {
    await gravarComTravaDeHorario(pedido({ time: "15:00", name: "", whatsapp: "11977776666" }));
    expect((await clientes())[0].name).toBe("Cliente");

    await gravarComTravaDeHorario(pedido({ time: "16:00", name: "Seu Zé", whatsapp: "11977776666" }));
    expect((await clientes())[0].name).toBe("Seu Zé");

    /* E o caminho de volta: uma reserva sem nome não pode apagar o que já se
     * sabia sobre a pessoa. */
    await gravarComTravaDeHorario(pedido({ time: "17:00", name: "", whatsapp: "11977776666" }));
    expect((await clientes())[0].name).toBe("Seu Zé");
  });

  it("duas reservas SIMULTÂNEAS do mesmo número não criam dois cadastros", async () => {
    /* A invariante só é real se sobreviver à concorrência. Fora da transação,
     * as duas leituras diriam "não existe" e as duas criariam. */
    await Promise.allSettled([
      gravarComTravaDeHorario(pedido({ time: "15:00", whatsapp: "11966665555" })),
      gravarComTravaDeHorario(pedido({ time: "16:00", whatsapp: "11966665555" })),
    ]);

    expect(await clientes()).toHaveLength(1);
  });
});

/* ================================================================== */
/* Fusão: o balcão que depois vira conta                              */
/* ================================================================== */

describe("G3 · fusão do cadastro de balcão com a conta", () => {
  it("o cadastro antigo é desativado e aponta para o novo", async () => {
    await gravarComTravaDeHorario(pedido({ time: "15:00", name: "Seu Zé", whatsapp: "11944443333" }));
    const [balcao] = await clientes();

    await gravarComTravaDeHorario(
      pedido({ time: "16:00", uid: "uid-do-ze", origin: "app", name: "Zé", whatsapp: "11944443333" })
    );

    const cs = await clientes();
    expect(cs).toHaveLength(2);

    const antigo = cs.find((c) => c.id === balcao.id)!;
    const novo = cs.find((c) => c.id === "uid-do-ze")!;
    expect(antigo.active).toBe(false);
    expect(antigo.mergedInto).toBe("uid-do-ze");
    expect(novo.active).toBe(true);
  });

  it("a reserva antiga CONTINUA apontando para o cadastro antigo", async () => {
    /* Reescrever histórico para arrumar um cadastro seria trocar o fato pelo
     * cadastro. O ponteiro `mergedInto` existe justamente para reconciliar sem
     * mexer no que já aconteceu. */
    await gravarComTravaDeHorario(pedido({ time: "15:00", name: "Seu Zé", whatsapp: "11944443333" }));
    const [balcao] = await clientes();

    await gravarComTravaDeHorario(
      pedido({ time: "16:00", uid: "uid-do-ze", origin: "app", whatsapp: "11944443333" })
    );

    const rs = await reservas();
    const antiga = rs.find((r) => r.time === "15:00")!;
    const nova = rs.find((r) => r.time === "16:00")!;
    expect(antiga.clientId).toBe(balcao.id);
    expect(nova.clientId).toBe("uid-do-ze");
  });

  it("não funde um cadastro que JÁ tem conta — seriam duas pessoas", async () => {
    await gravarComTravaDeHorario(
      pedido({ time: "15:00", uid: "uid-da-ana", origin: "app", whatsapp: "11933332222" })
    );
    await gravarComTravaDeHorario(
      pedido({ time: "16:00", uid: "uid-do-bruno", origin: "app", whatsapp: "11933332222" })
    );

    const cs = await clientes();
    const ana = cs.find((c) => c.id === "uid-da-ana")!;
    /* Dois números iguais em contas diferentes é caso raro e ambíguo — troca de
     * número, celular herdado. Desativar a conta da Ana com base num palpite
     * derrubaria o acesso dela ao próprio histórico. */
    expect(ana.active).toBe(true);
    expect(ana.mergedInto ?? null).toBeNull();
  });
});

/* ================================================================== */
/* O teto por cliente passa a valer por PESSOA                        */
/* ================================================================== */

describe("G3 · o teto de reservas ativas segue a pessoa", () => {
  it("o mesmo cliente de balcão soma no próprio teto", async () => {
    /* Antes, cada reserva de balcão teria um clientId novo e o teto nunca
     * valeria. Com o cadastro reusado, a terceira reserva do Seu Zé conta como
     * terceira — e a quarta é recusada. */
    for (const time of ["15:00", "16:00", "17:00"]) {
      await gravarComTravaDeHorario(pedido({ time, whatsapp: "11922221111" }));
    }
    expect(await reservas()).toHaveLength(3);

    await expect(
      gravarComTravaDeHorario(pedido({ time: "18:00", whatsapp: "11922221111" }))
    ).rejects.toThrow(/horário\(s\) marcado\(s\)/);
  });
});
