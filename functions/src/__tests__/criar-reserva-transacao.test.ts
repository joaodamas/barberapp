import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { createBooking } from "../booking";
import { hojeNoFuso } from "../locale";

/**
 * O `createBooking` inteiro, contra o emulador (revisão de 08/10).
 *
 * Os outros testes de emulador exercem `gravarComTravaDeHorario` isolada. Os
 * dois defeitos desta rodada moravam no HANDLER, em volta dela:
 *
 * 1. a repetição pela chave devolvia sucesso sem comparar o pedido — o cliente
 *    confirmava 15h, a resposta se perdia, ele escolhia 16h com a mesma chave
 *    e recebia "confirmado" para a reserva das 15h;
 * 2. pedido de encaixe era aceito com a loja em modo leitura, onde ninguém
 *    consegue aprovar nem recusar.
 *
 * Por isso a chamada passa pelo `onCall` (`.run`), com o app padrão do Admin
 * apontando para o emulador — é o `getFirestore()` que o handler usa.
 *
 * Exige o emulador:  npm run test:emulador
 */

const PROJETO = "suites-emulador";
const SHOP = "barbearia-criar-reserva";
const CLIENTE = "cliente-a";
const FUSO = "America/Sao_Paulo";

let db: Firestore;

/** Uma semana à frente, no fuso da barbearia: dentro da janela e da antecedência. */
function daquiUmaSemana(): string {
  const [a, m, d] = hojeNoFuso(FUSO).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + 7)).toISOString().slice(0, 10);
}
const DATA = daquiUmaSemana();

function chamar(data: Record<string, unknown>, uid = CLIENTE) {
  return createBooking.run({
    data: { barbershopId: SHOP, ...data },
    auth: { uid, token: { email_verified: true, name: "Cliente A" } },
    rawRequest: {},
  } as unknown as CallableRequest<never>) as Promise<Record<string, unknown>>;
}

const pedidoDas15 = {
  serviceIds: ["corte", "barba"],
  staffId: "barbeiro-1",
  date: DATA,
  time: "15:00",
  clientName: "Cliente A",
  clientWhatsapp: "11999990000",
  chave: "chave-de-teste-0001",
};

async function reservas() {
  const snap = await db.collection(`barbershops/${SHOP}/bookings`).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:emulador");
  }
  if (getApps().length === 0) initializeApp({ projectId: PROJETO });
  db = getFirestore();
});

afterAll(async () => {
  await Promise.all(getApps().map((a) => deleteApp(a)));
});

beforeEach(async () => {
  for (const col of ["bookings", "clients", "staff", "services", "subscriptions"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const limites = await db.collection("limites_de_reserva").get();
  await Promise.all(limites.docs.map((d) => d.ref.delete()));

  await db.doc(`barbershops/${SHOP}`).set({
    status: "active",
    schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], opensAt: "08:00", closesAt: "20:00", slotMinutes: 30 },
    policies: { booking: { minAdvanceMinutes: 60, maxActivePerClient: 3 } },
    locale: { timeZone: FUSO, currency: "BRL", locale: "pt-BR" },
  });
  await db.doc(`barbershops/${SHOP}/staff/barbeiro-1`).set({ name: "Barbeiro Um", active: true, order: 0 });
  await db.doc(`barbershops/${SHOP}/services/corte`).set({ name: "Corte", price: 50, durationMin: 30, active: true });
  await db.doc(`barbershops/${SHOP}/services/barba`).set({ name: "Barba", price: 30, durationMin: 30, active: true });
  await db.doc(`barbershops/${SHOP}/services/corte-barba`).set({
    name: "Corte + barba",
    price: 70,
    durationMin: 60,
    active: true,
    composicao: ["corte", "barba"],
  });
});

describe("createBooking · serviços gravados com o combo", () => {
  it("corte + barba escolhidos separados gravam o id do combo, como o balcão", async () => {
    const r = await chamar(pedidoDas15);
    const [gravada] = await reservas();
    expect(gravada.id).toBe(r.bookingId);
    expect(gravada.serviceIds).toEqual(["corte-barba"]);
    expect(gravada.serviceNames).toEqual(["Corte + barba"]);
    expect(gravada.value).toBe(70);
  });
});

describe("createBooking · repetição pela chave", () => {
  it("mesmo pedido, mesma chave: devolve a mesma reserva com os dados GRAVADOS", async () => {
    const primeira = await chamar(pedidoDas15);
    const repeticao = await chamar(pedidoDas15);
    expect(repeticao.bookingId).toBe(primeira.bookingId);
    expect(repeticao).toMatchObject({
      date: DATA,
      time: "15:00",
      value: 70,
      staffId: "barbeiro-1",
      staffName: "Barbeiro Um",
      status: "confirmed",
    });
    expect(await reservas()).toHaveLength(1);
  });

  it("mesma chave com outra hora: recusa, e a reserva das 15h fica como estava", async () => {
    await chamar(pedidoDas15);
    await expect(chamar({ ...pedidoDas15, time: "16:00" })).rejects.toThrow(/já foi usada em outro agendamento/);
    const todas = await reservas();
    expect(todas).toHaveLength(1);
    expect(todas[0].time).toBe("15:00");
  });

  it("mesma chave com outros serviços: recusa", async () => {
    await chamar(pedidoDas15);
    await expect(chamar({ ...pedidoDas15, serviceIds: ["corte"] })).rejects.toThrow(/já foi usada/);
  });

  it("chave nova para o pedido novo: grava normalmente", async () => {
    await chamar(pedidoDas15);
    await chamar({ ...pedidoDas15, time: "17:00", chave: "chave-de-teste-0002" });
    expect((await reservas()).map((b) => b.time).sort()).toEqual(["15:00", "17:00"]);
  });
});

describe("createBooking · encaixe com a loja em modo leitura", () => {
  it("pedido de encaixe é recusado, e nada é gravado", async () => {
    /* Horário das 15h ocupado por outra pessoa, loja suspensa. */
    await chamar({ ...pedidoDas15, chave: "chave-de-outro-0001" }, "cliente-b");
    await db.doc(`barbershops/${SHOP}`).update({ status: "suspenso" });

    await expect(chamar({ ...pedidoDas15, isFitIn: true })).rejects.toThrow(
      /não está aceitando encaixes agora/
    );
    const todas = await reservas();
    expect(todas).toHaveLength(1);
    expect(todas[0].clientId).toBe("cliente-b");
  });

  it("teste vencido também recusa o encaixe", async () => {
    await db.doc(`barbershops/${SHOP}`).update({ status: "trial", trial: { endsAt: new Date(Date.now() - 60_000) } });
    await expect(chamar({ ...pedidoDas15, isFitIn: true })).rejects.toThrow(/não está aceitando encaixes/);
  });

  it("reserva normal continua aceita em modo leitura (o link do cliente segue funcionando)", async () => {
    await db.doc(`barbershops/${SHOP}`).update({ status: "suspenso" });
    const r = await chamar(pedidoDas15);
    expect(r.status).toBe("confirmed");
  });
});
