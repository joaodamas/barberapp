import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarServicosAdicionados } from "../servicos-extras";
import type { ServicoDoCatalogo } from "../combos";

/**
 * "+ Adicionar serviço" contra o emulador (revisão financeira de 08/10).
 *
 * O que só aqui pode ser provado é o DOCUMENTO depois da transação:
 *  1. o que já estava na reserva fica com o preço gravado nela — reajuste do
 *     catálogo depois da marcação não sobe o corte;
 *  2. serviço que saiu do catálogo mantém nome e preço (nada de R$ 0,00 e
 *     "Serviço");
 *  3. o rastro (`servicosAdicionados` e `audit_log`) diz antes e depois;
 *  4. atendimento concluído e de outro barbeiro são recusados sem escrita.
 *
 * Exige o emulador: roda em `npm run test:emulador` (CI).
 */

const PROJETO = "servicos-extras";
const SHOP = "barbearia-extras";
const BOOKING = "b1";
const CATALOGO: ServicoDoCatalogo[] = [
  { id: "corte", name: "Corte", price: 65, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 20 },
  { id: "pezinho", name: "Pezinho", price: 15, durationMin: 10 },
  { id: "corte-barba", name: "Corte + barba", price: 90, durationMin: 45, composicao: ["corte", "barba"] },
];

let app: App;
let db: Firestore;
const shopRef = () => db.doc(`barbershops/${SHOP}`);
const reservaRef = () => shopRef().collection("bookings").doc(BOOKING);

async function semear(campos: Record<string, unknown> = {}) {
  await reservaRef().set({
    status: "confirmed",
    clientId: "c1",
    date: "2026-10-08",
    time: "10:00",
    staffId: "s1",
    staffName: "Otávio",
    /* Marcado quando o corte custava R$ 60 — hoje o catálogo diz R$ 65. */
    serviceIds: ["corte"],
    serviceNames: ["Corte"],
    value: 60,
    durationMin: 30,
    ...campos,
  });
}

function somar(ids: string[], p: { papel?: "owner" | "staff"; meuStaffId?: string | null } = {}) {
  return gravarServicosAdicionados({
    db,
    shopRef: shopRef(),
    bookingId: BOOKING,
    ids,
    catalogo: CATALOGO,
    papel: p.papel ?? "owner",
    meuStaffId: p.meuStaffId ?? null,
    uid: "uid-dono",
  });
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Este teste exige o emulador.");
  app = initializeApp({ projectId: PROJETO }, `extras-${Date.now()}`);
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  for (const col of ["bookings", "audit_log"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
});

describe("preço congelado da reserva", () => {
  it("corte reajustado depois da marcação: 60 + pezinho 15 = 75 (não 80)", async () => {
    await semear();
    const r = await somar(["pezinho"]);
    expect(r.value).toBe(75);
    const b = (await reservaRef().get()).data()!;
    expect(b.value).toBe(75);
    expect(b.serviceIds).toEqual(["corte", "pezinho"]);
    expect(b.serviceNames).toEqual(["Corte", "Pezinho"]);
    expect(b.durationMin).toBe(40);
    expect(b.servicosAdicionados).toHaveLength(1);
    expect(b.servicosAdicionados[0]).toMatchObject({ valorAntes: 60, valorDepois: 75 });
  });

  it("combo mais barato que o congelado + extra continua valendo (60 + 35 → 90)", async () => {
    await semear();
    const r = await somar(["barba"]);
    expect(r.value).toBe(90);
    expect(r.serviceIds).toEqual(["corte-barba"]);
  });

  it("serviço que saiu do catálogo mantém nome e preço gravados", async () => {
    await semear({ serviceIds: ["navalhado"], serviceNames: ["Navalhado"], value: 55, durationMin: 40 });
    const r = await somar(["barba"]);
    expect(r.value).toBe(90);
    const b = (await reservaRef().get()).data()!;
    expect(b.serviceNames).toEqual(["Navalhado", "Barba"]);
    expect(b.value).toBe(90);
  });

  it("deixa o rastro no audit_log com antes e depois", async () => {
    await semear();
    await somar(["pezinho"]);
    const log = await shopRef().collection("audit_log").get();
    expect(log.size).toBe(1);
    expect(log.docs[0].get("detail")).toMatchObject({ valorAntes: 60, valorFinal: 75 });
  });
});

describe("recusas não escrevem", () => {
  it("atendimento concluído", async () => {
    await semear({ status: "completed" });
    await expect(somar(["pezinho"])).rejects.toThrow(/antes de concluir/);
    expect((await reservaRef().get()).get("value")).toBe(60);
    expect((await shopRef().collection("audit_log").get()).size).toBe(0);
  });
  it("barbeiro em atendimento de outro", async () => {
    await semear();
    await expect(somar(["pezinho"], { papel: "staff", meuStaffId: "s2" })).rejects.toThrow(/outro barbeiro/);
    expect((await reservaRef().get()).get("value")).toBe(60);
  });
});
