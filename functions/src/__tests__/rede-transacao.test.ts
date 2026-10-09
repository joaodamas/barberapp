import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { sincronizarAcessoDaRede, type OpcoesDaSincronizacao } from "../rede";

/**
 * Sincronização do acesso da rede — contra o banco de verdade (emulador).
 *
 * O que `rede.test.ts` não prova: que a segunda rodada não grava nem revoga
 * nada, que retirar mexe SÓ no que tem origem "rede", e que um claim que
 * estouraria o limite não deixa a rede meio sincronizada.
 *
 * O Auth é um dublê que guarda claims e registra as revogações.
 *
 * Exige o emulador:  npm run test:rede
 */

const PROJETO = "rede-fundacao";
const REDE = "rede-navalha";
const UNIDADES = ["un-centro", "un-moema", "un-pinheiros"];
const DONO = "uid-dono";
const GERENTE = "uid-gerente";

let app: App;
let db: Firestore;

type AuthDaRede = NonNullable<OpcoesDaSincronizacao["auth"]>;

function dubleDoAuth(inicial: Record<string, Record<string, unknown>>) {
  const claims = structuredClone(inicial);
  const gravacoes: string[] = [];
  const revogacoes: string[] = [];
  const auth = {
    async getUser(uid: string) {
      return { uid, customClaims: claims[uid] ?? {} };
    },
    async setCustomUserClaims(uid: string, novos: Record<string, unknown> | null) {
      gravacoes.push(uid);
      claims[uid] = (novos ?? {}) as Record<string, unknown>;
    },
    async revokeRefreshTokens(uid: string) {
      revogacoes.push(uid);
    },
  } as unknown as AuthDaRede;
  return { auth, claims, gravacoes, revogacoes };
}

async function montarRede(donos: string[], unidades: string[]) {
  await db.doc(`redes/${REDE}`).set({
    nome: "Navalha",
    slug: "navalha",
    unidades: unidades.map((id) => ({ id, slug: id, nome: id })),
    status: "ativa",
  });
  await db.doc(`redes/${REDE}/private/contrato`).set({ donos, maxUnidades: 20 });
  for (const id of UNIDADES) await db.doc(`barbershops/${id}`).set({ slug: id, status: "ativo" });
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:rede");
  }
  app = initializeApp({ projectId: PROJETO }, `rede-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection("redes"));
  await db.recursiveDelete(db.collection("barbershops"));
});

describe("sincronizarAcessoDaRede", () => {
  it("concede: claims derivados e membro com origem rede, sem revogar", async () => {
    await montarRede([DONO], UNIDADES);
    const { auth, claims, revogacoes } = dubleDoAuth({ [DONO]: { platformAdmin: false } });

    await sincronizarAcessoDaRede(REDE, { db, auth });

    expect(claims[DONO].redes).toEqual({ [REDE]: "dono" });
    expect(claims[DONO].barbershops).toEqual({
      "un-centro": "owner",
      "un-moema": "owner",
      "un-pinheiros": "owner",
    });
    for (const u of UNIDADES) {
      const m = (await db.doc(`barbershops/${u}/members/${DONO}`).get()).data();
      expect(m).toMatchObject({ role: "owner", origem: "rede", redeId: REDE });
    }
    expect(revogacoes).toHaveLength(0); // conceder não derruba a sessão
  });

  it("é idempotente: a segunda rodada não grava claims nem revoga", async () => {
    await montarRede([DONO], UNIDADES);
    const d = dubleDoAuth({});
    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth });
    const gravadas = d.gravacoes.length;
    const antes = structuredClone(d.claims);

    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth });

    expect(d.gravacoes.length).toBe(gravadas);
    expect(d.revogacoes).toHaveLength(0);
    expect(d.claims).toEqual(antes);
  });

  it("quem já era dono da unidade por conta própria não ganha a marca da rede", async () => {
    await montarRede([DONO], UNIDADES);
    await db.doc(`barbershops/un-centro/members/${DONO}`).set({ role: "owner", email: "a@b.c" });
    const d = dubleDoAuth({ [DONO]: { barbershops: { "un-centro": "owner" } } });

    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth });

    const m = (await db.doc(`barbershops/un-centro/members/${DONO}`).get()).data();
    expect(m?.origem).toBeUndefined();
    expect(m?.email).toBe("a@b.c");
  });

  it("retirar a unidade remove SÓ o papel de origem rede e revoga; o gerente da unidade fica", async () => {
    await montarRede([DONO], UNIDADES);
    const d = dubleDoAuth({ [GERENTE]: { barbershops: { "un-moema": "owner" } } });
    await db.doc(`barbershops/un-moema/members/${GERENTE}`).set({ role: "owner" });
    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth });

    // desvincula Moema
    await db.doc(`redes/${REDE}`).update({
      unidades: UNIDADES.filter((u) => u !== "un-moema").map((id) => ({ id, slug: id, nome: id })),
    });
    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth, unidadesRetiradas: ["un-moema"] });

    expect(d.claims[DONO].barbershops).toEqual({ "un-centro": "owner", "un-pinheiros": "owner" });
    expect((await db.doc(`barbershops/un-moema/members/${DONO}`).get()).exists).toBe(false);
    expect((await db.doc(`barbershops/un-centro/members/${DONO}`).get()).exists).toBe(true);
    expect(d.revogacoes).toContain(DONO);
    // o gerente da Moema (owner por conta própria) segue
    expect((await db.doc(`barbershops/un-moema/members/${GERENTE}`).get()).exists).toBe(true);
    expect(d.claims[GERENTE].barbershops).toEqual({ "un-moema": "owner" });
  });

  it("trocar o dono: o antigo perde redes e as unidades de origem rede; o novo ganha", async () => {
    await montarRede([DONO], UNIDADES);
    const d = dubleDoAuth({});
    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth });

    await db.doc(`redes/${REDE}/private/contrato`).update({ donos: ["uid-novo"] });
    await sincronizarAcessoDaRede(REDE, { db, auth: d.auth, donosRetirados: [DONO] });

    expect(d.claims[DONO].redes).toBeUndefined();
    expect(d.claims[DONO].barbershops).toEqual({});
    expect(d.claims["uid-novo"].redes).toEqual({ [REDE]: "dono" });
    expect(d.revogacoes).toContain(DONO);
    expect(d.revogacoes).not.toContain("uid-novo");
    expect((await db.doc(`barbershops/un-centro/members/${DONO}`).get()).exists).toBe(false);
    expect((await db.doc(`barbershops/un-centro/members/uid-novo`).get()).exists).toBe(true);
  });

  it("não deixa a rede pela metade quando o claim de alguém estouraria", async () => {
    await montarRede(["uid-ok", "uid-cheio"], UNIDADES);
    const lotado: Record<string, string> = {};
    for (let i = 0; i < 28; i++) lotado[`loja-${String(i).padStart(15, "0")}`] = "owner";
    const d = dubleDoAuth({ "uid-cheio": { barbershops: lotado } });

    await expect(sincronizarAcessoDaRede(REDE, { db, auth: d.auth })).rejects.toThrow(/não comporta/);

    expect(d.gravacoes).toHaveLength(0);
    expect((await db.doc(`barbershops/un-centro/members/uid-ok`).get()).exists).toBe(false);
  });
});
