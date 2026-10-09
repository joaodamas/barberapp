import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { limparAvisosDoUid } from "../avisos-por-uid";
import { PRAZO_DO_CONVITE_MS, aceitarNaTransacao, contaEhDaCadeira, desligarCadeira } from "../convite-equipe";

/**
 * Convite e retirada de acesso do barbeiro (08/10) contra o emulador.
 *
 * O que só aqui pode ser provado é o que acontece com os DOCUMENTOS:
 *  1. aceitar liga a conta à cadeira (ficha, `members`, convite usado);
 *  2. a repetição do aceite (resposta perdida) devolve o mesmo resultado;
 *  3. tirar o acesso marca o convite como revogado, apaga os aparelhos da
 *     conta, desliga o Telegram da cadeira e apaga o `members`;
 *  4. depois disso, o token antigo do convite NÃO devolve o papel;
 *  5. convite por e-mail exige o e-mail confirmado;
 *  6. a cadeira do dono não perde a conta.
 *
 * O claim (Auth) fica de fora: o emulador desta suíte é só o Firestore, e a
 * gravação do claim é injetada.
 *
 * Exige o emulador: roda em `npm run test:emulador` (CI).
 */

const PROJETO = "convite-equipe";
const SHOP = "barbearia-convite";
const AGORA = Date.parse("2026-10-08T12:00:00Z");
const TOKEN = "a".repeat(48);
const TOKEN_EMAIL = "b".repeat(48);
const UID = "conta-barbeiro";

let app: App;
let db: Firestore;
const shopRef = () => db.doc(`barbershops/${SHOP}`);
const staffRef = () => shopRef().collection("staff").doc("s1");

async function limpar() {
  for (const col of ["staff", "members", "push_tokens", "telegram_contatos"]) {
    const snap = await shopRef().collection(col).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  const convites = await db.collection("convites_equipe").get();
  await Promise.all(convites.docs.map((d) => d.ref.delete()));
  await Promise.all(["111", "222"].map((c) => db.doc(`telegram_chats/${c}`).delete()));
}

async function semear(params: { email?: string | null } = {}) {
  await shopRef().set({ status: "ativo", brand: { name: "Barbearia Convite" } });
  await staffRef().set({ name: "Barbeiro Um", active: true, uid: null });
  await db.doc(`convites_equipe/${params.email ? TOKEN_EMAIL : TOKEN}`).set({
    barbershopId: SHOP,
    staffId: "s1",
    email: params.email ?? null,
    criadoPor: "conta-dono",
    expiraEmMs: AGORA + PRAZO_DO_CONVITE_MS,
    usadoEm: null,
    usadoPor: null,
    canceladoEm: null,
  });
}

const aceitar = (extra: Partial<Parameters<typeof aceitarNaTransacao>[0]> = {}) =>
  aceitarNaTransacao({
    db,
    token: TOKEN,
    uid: UID,
    emailDaConta: null,
    emailVerificado: false,
    agoraMs: AGORA,
    ...extra,
  });

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Este teste exige o emulador.");
  app = initializeApp({ projectId: PROJETO }, `convite-${Date.now()}`);
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  await limpar();
});

describe("aceitar o convite", () => {
  it("liga a conta à cadeira: ficha, members e convite usado", async () => {
    await semear();
    const r = await aceitar();
    expect(r).toEqual({ barbershopId: SHOP, staffId: "s1", repetido: false });
    expect((await staffRef().get()).get("uid")).toBe(UID);
    expect((await shopRef().collection("members").doc(UID).get()).get("staffId")).toBe("s1");
    const convite = await db.doc(`convites_equipe/${TOKEN}`).get();
    expect(convite.get("usadoPor")).toBe(UID);
  });

  it("a resposta perdida: chamar de novo devolve o mesmo, sem erro", async () => {
    await semear();
    await aceitar();
    expect(await aceitar()).toEqual({ barbershopId: SHOP, staffId: "s1", repetido: true });
  });

  it("🔒 convite por e-mail recusa o e-mail certo NÃO confirmado, e aceita o confirmado", async () => {
    await semear({ email: "barbeiro.um@exemplo.com" });
    await expect(
      aceitar({ token: TOKEN_EMAIL, emailDaConta: "barbeiro.um@exemplo.com", emailVerificado: false })
    ).rejects.toThrow(/Confirme o seu e-mail/);
    expect((await staffRef().get()).get("uid")).toBeNull();
    const r = await aceitar({ token: TOKEN_EMAIL, emailDaConta: "barbeiro.um@exemplo.com", emailVerificado: true });
    expect(r.repetido).toBe(false);
  });
});

describe("tirar o acesso", () => {
  async function ligadoComAparelhoETelegram() {
    await semear();
    await aceitar();
    await shopRef().collection("push_tokens").doc("aparelho-barbeiro").set({ token: "t1", uid: UID, papel: "staff", staffId: "s1" });
    await shopRef().collection("push_tokens").doc("aparelho-dono").set({ token: "t2", uid: "conta-dono", papel: "owner" });
    await shopRef().collection("telegram_contatos").doc("111").set({ chatId: "111", alvo: "barbeiro", staffId: "s1", ativo: true });
    await shopRef().collection("telegram_contatos").doc("222").set({ chatId: "222", alvo: "dono", staffId: null, ativo: true });
  }

  it("desfaz tudo que liga a conta à cadeira", async () => {
    await ligadoComAparelhoETelegram();
    const retirados: string[] = [];
    await staffRef().update({ uid: null }); // o que `revogarAcessoDoBarbeiro` faz primeiro
    await desligarCadeira({
      db,
      barbershopId: SHOP,
      staffId: "s1",
      uid: UID,
      donoDaCadeira: false,
      retirarClaims: async (u) => {
        retirados.push(u);
      },
    });

    expect(retirados).toEqual([UID]);
    expect((await db.doc(`convites_equipe/${TOKEN}`).get()).get("revogadoEm")).toBeTruthy();
    expect((await shopRef().collection("members").doc(UID).get()).exists).toBe(false);
    expect((await shopRef().collection("push_tokens").doc("aparelho-barbeiro").get()).exists).toBe(false);
    // O aparelho do dono fica.
    expect((await shopRef().collection("push_tokens").doc("aparelho-dono").get()).exists).toBe(true);
    expect((await shopRef().collection("telegram_contatos").doc("111").get()).get("ativo")).toBe(false);
    expect((await shopRef().collection("telegram_contatos").doc("222").get()).get("ativo")).toBe(true);
  });

  it("🔒 depois de tirado, o token antigo do convite NÃO devolve o papel", async () => {
    await ligadoComAparelhoETelegram();
    await staffRef().update({ uid: null });
    await desligarCadeira({ db, barbershopId: SHOP, staffId: "s1", uid: UID, donoDaCadeira: false, retirarClaims: async () => {} });

    await expect(aceitar()).rejects.toThrow(/retirado pelo dono/);
    expect((await staffRef().get()).get("uid")).toBeNull();
    expect((await shopRef().collection("members").doc(UID).get()).exists).toBe(false);
  });

  it("🔒 sem a marca no convite (revogação antiga), a cadeira solta já basta para recusar", async () => {
    await semear();
    await aceitar();
    await staffRef().update({ uid: null });
    await expect(aceitar()).rejects.toThrow(/retirado pelo dono/);
  });

  it("convites em aberto da cadeira são cancelados", async () => {
    await semear();
    await desligarCadeira({ db, barbershopId: SHOP, staffId: "s1", uid: null, donoDaCadeira: false });
    expect((await db.doc(`convites_equipe/${TOKEN}`).get()).get("canceladoEm")).toBeTruthy();
  });

  it("a cadeira do DONO: desliga o Telegram da cadeira, mas não mexe na conta", async () => {
    await shopRef().set({ status: "ativo" });
    await staffRef().set({ name: "Dono", active: true, uid: "conta-dono" });
    await shopRef().collection("members").doc("conta-dono").set({ role: "owner" });
    await shopRef().collection("push_tokens").doc("aparelho-dono").set({ token: "t2", uid: "conta-dono", papel: "owner" });
    const retirados: string[] = [];
    await desligarCadeira({
      db,
      barbershopId: SHOP,
      staffId: "s1",
      uid: "conta-dono",
      donoDaCadeira: true,
      retirarClaims: async (u) => {
        retirados.push(u);
      },
    });
    expect(retirados).toEqual([]);
    expect((await shopRef().collection("members").doc("conta-dono").get()).exists).toBe(true);
    expect((await shopRef().collection("push_tokens").doc("aparelho-dono").get()).exists).toBe(true);
  });
});

describe("a conta da ficha é MESMO desta cadeira? (09/10)", () => {
  const semClaims = async () => null;
  const verificar = (uid: string, claimsDaConta: (u: string) => Promise<Record<string, unknown> | null> = semClaims) =>
    contaEhDaCadeira({ uid, barbershopId: SHOP, staffId: "s1", db, claimsDaConta });

  it("quem aceitou o convite é da cadeira (members gravado pelo servidor)", async () => {
    await semear();
    await aceitar();
    expect(await verificar(UID)).toBe(true);
  });

  it("conta com o claim `equipe` desta cadeira também é", async () => {
    await semear();
    expect(await verificar("outra", async () => ({ equipe: { [SHOP]: "s1" } }))).toBe(true);
  });

  it("🔒 `uid` gravado na ficha sem convite aceito NÃO é da cadeira — a conta de terceiro não é tocada", async () => {
    await semear();
    await staffRef().update({ uid: "conta-de-terceiro" });
    expect(await verificar("conta-de-terceiro")).toBe(false);
    /* Nem a conta de um dono de OUTRA barbearia, nem a de quem tem a cadeira de outro colega. */
    expect(await verificar("conta-de-terceiro", async () => ({ barbershops: { outra: "owner" } }))).toBe(false);
    expect(await verificar("conta-de-terceiro", async () => ({ equipe: { [SHOP]: "s2" } }))).toBe(false);
  });

  it("barbeiro legado (members de staff sem staffId, sem claim) é da cadeira se a ficha aponta para ele", async () => {
    await semear();
    await staffRef().update({ uid: "legado" });
    await shopRef().collection("members").doc("legado").set({ role: "staff", email: "l@exemplo.com" });
    expect(await verificar("legado")).toBe(true);
  });

  it("🔒 `members` de staff sem staffId NÃO prova a cadeira de uma ficha forjada para outra conta", async () => {
    await semear();
    await staffRef().update({ uid: "terceiro" });
    await shopRef().collection("members").doc("legado").set({ role: "staff" });
    expect(await verificar("terceiro")).toBe(false);
    expect(await verificar("legado")).toBe(false);
  });

  it("🔒 `members` de outra cadeira não prova esta", async () => {
    await semear();
    await shopRef().collection("members").doc("x").set({ role: "staff", staffId: "s2" });
    expect(await verificar("x")).toBe(false);
  });
});

describe("quem deixa de ser dono perde os avisos de dono (09/10)", () => {
  const COCONTA = "conta-co-dono";

  beforeEach(async () => {
    await shopRef().set({ status: "ativo" });
    await shopRef().collection("push_tokens").doc("a1").set({ uid: COCONTA, papel: "owner", token: "t1" });
    await shopRef().collection("push_tokens").doc("a3").set({ uid: COCONTA, papel: "staff", token: "t3" });
    await shopRef().collection("push_tokens").doc("a2").set({ uid: "dono-que-fica", papel: "owner", token: "t2" });
    await shopRef().collection("telegram_contatos").doc("111").set({ chatId: "111", alvo: "dono", ligadoPor: COCONTA, ativo: true });
    await shopRef().collection("telegram_contatos").doc("222").set({ chatId: "222", alvo: "dono", ligadoPor: "dono-que-fica", ativo: true });
    await shopRef().collection("telegram_contatos").doc("333").set({ chatId: "333", alvo: "barbeiro", ligadoPor: COCONTA, staffId: "s1", ativo: true });
    await db.doc("telegram_chats/111").set({ barbershopId: SHOP });
    await db.doc("telegram_chats/222").set({ barbershopId: SHOP });
  });

  it("apaga os aparelhos e o Telegram de dono daquela conta, e só dela", async () => {
    const r = await limparAvisosDoUid(SHOP, COCONTA, db);
    expect(r).toEqual({ aparelhos: 1, telegram: 1 });
    expect((await shopRef().collection("push_tokens").doc("a1").get()).exists).toBe(false);
    expect((await shopRef().collection("push_tokens").doc("a2").get()).exists).toBe(true);
    /* Aparelho de barbeiro da mesma conta não é de dono: fica. */
    expect((await shopRef().collection("push_tokens").doc("a3").get()).exists).toBe(true);
    expect((await shopRef().collection("telegram_contatos").doc("111").get()).exists).toBe(false);
    expect((await db.doc("telegram_chats/111").get()).exists).toBe(false);
    expect((await shopRef().collection("telegram_contatos").doc("222").get()).exists).toBe(true);
    expect((await db.doc("telegram_chats/222").get()).exists).toBe(true);
    /* O contato de barbeiro é da cadeira, e segue o caminho de `desligarCadeira`. */
    expect((await shopRef().collection("telegram_contatos").doc("333").get()).exists).toBe(true);
  });

  it("sem nada para apagar, não falha", async () => {
    expect(await limparAvisosDoUid(SHOP, "ninguem", db)).toEqual({ aparelhos: 0, telegram: 0 });
  });
});
