import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore";
import { anonimizarNaBarbearia, excluirContaDoCliente, exportarDoCliente } from "../titular";
import { expurgarBarbearia, type Balde } from "../data-deletion";
import { MARCADOR_ANONIMO } from "../anonimizacao";

/**
 * Direitos do titular e expurgo — contra o banco de verdade (emulador).
 *
 * `titular.test.ts` e `data-deletion.test.ts` provam as decisões puras. Nada
 * ali afirma o que este arquivo afirma: que as consultas alcançam cada
 * documento onde o nome e o telefone moram, que o valor fica, que a segunda
 * chamada não grava nada, e que uma falha no meio do expurgo deixa a conta
 * encontrável para a próxima execução.
 *
 * O Auth e o Storage são dublês que registram as chamadas: o que importa aqui
 * é a ORDEM e a DECISÃO, e ambas são do nosso código.
 *
 * Exige o emulador:  npm run test:titular
 */

const PROJETO = "titular-lgpd";
const ALFA = "alfa";
const BETA = "beta";
const UID = "cliente-joao";
const HOJE = new Date().toISOString().slice(0, 10);
const ONTEM = "2020-01-10";
const FUTURO = "2099-01-10";

let app: App;
let db: Firestore;

type Chamada = { fn: string; uid: string; claims?: unknown };

function dubleDoAuth(usuarios: Record<string, Record<string, unknown>>) {
  const chamadas: Chamada[] = [];
  return {
    chamadas,
    auth: {
      async getUser(uid: string) {
        if (!(uid in usuarios)) throw Object.assign(new Error("x"), { code: "auth/user-not-found" });
        return { uid, customClaims: usuarios[uid] } as never;
      },
      async setCustomUserClaims(uid: string, claims: unknown) {
        chamadas.push({ fn: "setCustomUserClaims", uid, claims });
      },
      async revokeRefreshTokens(uid: string) {
        chamadas.push({ fn: "revokeRefreshTokens", uid });
      },
      async deleteUser(uid: string) {
        chamadas.push({ fn: "deleteUser", uid });
      },
    },
  };
}

function dubleDoBalde(opts: { falhar?: boolean } = {}): Balde & { apagados: string[] } {
  const apagados: string[] = [];
  return {
    apagados,
    async getFiles({ prefix }) {
      return [[{ name: `${prefix}logo.png` }]];
    },
    async deleteFiles({ prefix }) {
      if (opts.falhar) throw new Error("storage fora do ar");
      apagados.push(prefix);
    },
  };
}

async function semear() {
  for (const shop of [ALFA, BETA]) {
    await db.doc(`barbershops/${shop}`).set({
      slug: shop,
      status: "ativo",
      brand: { name: `Barbearia ${shop}` },
    });
    await db.doc(`barbershops/${shop}/clients/${UID}`).set({
      uid: UID,
      name: "João da Silva",
      whatsapp: "11988887777",
      origin: "app",
      active: true,
    });
    await db.doc(`barbershops/${shop}/bookings/bk-${shop}`).set({
      clientId: UID,
      clientName: "João da Silva",
      clientWhatsapp: "11988887777",
      staffName: "Pedro",
      date: ONTEM,
      time: "10:00",
      value: 50,
      status: "completed",
      paymentMethod: "pix",
      cicloFinanceiro: { comissao: { commissionPct: 40 } },
      createdAt: Timestamp.fromDate(new Date("2020-01-09T12:00:00Z")),
    });
    await db.doc(`barbershops/${shop}/payments/pg-${shop}`).set({
      clientId: UID,
      bookingId: `bk-${shop}`,
      grossAmount: 50,
      feePct: 2,
      method: "pix",
      date: ONTEM,
    });
    await db.doc(`barbershops/${shop}/loyalty_transactions/credito_bk-${shop}`).set({
      clientId: UID,
      kind: "credito",
      stamps: 1,
    });
  }
  // Cadastro de balcão da mesma pessoa, fundido no da conta — só na Alfa.
  await db.doc(`barbershops/${ALFA}/clients/balcao-1`).set({
    uid: null,
    name: "João S.",
    whatsapp: "11988887777",
    origin: "balcao",
    active: false,
    mergedInto: UID,
  });
  await db.doc(`barbershops/${ALFA}/bookings/bk-balcao`).set({
    clientId: "balcao-1",
    clientName: "João S.",
    clientWhatsapp: "11988887777",
    date: "2019-12-01",
    value: 40,
    status: "completed",
  });
  await db.doc(`barbershops/${ALFA}/subscriptions/ass-1`).set({
    clientId: UID,
    clientName: "João da Silva",
    name: "João da Silva",
    price: 149,
    status: "cancelado",
  });
  await db.doc(`barbershops/${ALFA}/whatsapp_messages/m1`).set({
    template: "confirmacao_reserva",
    to: "5511988887777",
    status: "enviado",
  });
  await db.doc(`barbershops/${ALFA}/whatsapp_messages/m2`).set({
    direcao: "recebida",
    de: "5511988887777",
    texto: "oi, aqui é o João",
  });
  await db.doc(`whatsapp_conversations/5511988887777`).set({ barbershopId: ALFA });
  await db.doc(`users/${UID}`).set({ name: "João da Silva", whatsapp: "5511988887777" });
}

async function limparTudo() {
  for (const raiz of ["barbershops", "users", "whatsapp_conversations", "slugs", "arquivo_fiscal", "platform_users", "whatsapp_sent", "whatsapp_numbers"]) {
    const snap = await db.collection(raiz).get();
    await Promise.all(snap.docs.map((d) => db.recursiveDelete(d.ref)));
  }
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:titular");
  }
  app = initializeApp({ projectId: PROJETO }, `titular-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await limparTudo();
  await semear();
});

const ler = async (caminho: string) => (await db.doc(caminho).get()).data();

/* ================================================================== */

describe("anonimizar — o dono atende ao pedido", () => {
  const anonimizar = () =>
    anonimizarNaBarbearia({
      db,
      barbershopId: ALFA,
      clientId: UID,
      autor: { uid: "dono-alfa", papel: "dono" },
    });

  it("sai quem; fica o quê, quando e quanto", async () => {
    const r = await anonimizar();
    expect(r.jaEstava).toBe(false);

    const cadastro = await ler(`barbershops/${ALFA}/clients/${UID}`);
    expect(cadastro).toMatchObject({ name: MARCADOR_ANONIMO, whatsapp: "", active: false, uid: UID });
    expect(cadastro?.anonimizadoEm).toBeDefined();

    const reserva = await ler(`barbershops/${ALFA}/bookings/bk-${ALFA}`);
    expect(reserva).toMatchObject({
      clientName: MARCADOR_ANONIMO,
      clientWhatsapp: "",
      value: 50,
      date: ONTEM,
      status: "completed",
      paymentMethod: "pix",
      staffName: "Pedro",
      clientId: UID,
    });

    // O pagamento não carrega nome — e não é tocado.
    expect(await ler(`barbershops/${ALFA}/payments/pg-${ALFA}`)).toMatchObject({
      grossAmount: 50,
      clientId: UID,
    });
  });

  it("alcança o cadastro de balcão fundido e a reserva dele", async () => {
    await anonimizar();
    expect(await ler(`barbershops/${ALFA}/clients/balcao-1`)).toMatchObject({
      name: MARCADOR_ANONIMO,
      whatsapp: "",
    });
    expect(await ler(`barbershops/${ALFA}/bookings/bk-balcao`)).toMatchObject({
      clientName: MARCADOR_ANONIMO,
      value: 40,
    });
  });

  it("alcança a mensalidade, as mensagens e o índice de conversa", async () => {
    await anonimizar();
    expect(await ler(`barbershops/${ALFA}/subscriptions/ass-1`)).toMatchObject({
      clientName: MARCADOR_ANONIMO,
      name: MARCADOR_ANONIMO,
      price: 149,
    });
    expect(await ler(`barbershops/${ALFA}/whatsapp_messages/m1`)).toMatchObject({
      to: "",
      template: "confirmacao_reserva",
    });
    expect(await ler(`barbershops/${ALFA}/whatsapp_messages/m2`)).toMatchObject({
      de: "",
      texto: null,
    });
    expect((await db.doc("whatsapp_conversations/5511988887777").get()).exists).toBe(false);
  });

  it("🔒 não toca na outra barbearia — ela é outro controlador", async () => {
    await anonimizar();
    expect(await ler(`barbershops/${BETA}/clients/${UID}`)).toMatchObject({
      name: "João da Silva",
    });
    expect(await ler(`barbershops/${BETA}/bookings/bk-${BETA}`)).toMatchObject({
      clientName: "João da Silva",
    });
  });

  it("deixa rastro no audit_log, sem o nome", async () => {
    await anonimizar();
    const log = await db
      .collection(`barbershops/${ALFA}/audit_log`)
      .where("action", "==", "titular.anonimizado")
      .get();
    expect(log.size).toBe(1);
    const texto = JSON.stringify(log.docs[0].data());
    expect(texto).not.toMatch(/João|11988887777/);
  });

  it("idempotente: a segunda chamada não grava nada", async () => {
    await anonimizar();
    const segunda = await anonimizar();
    expect(segunda.jaEstava).toBe(true);
    const log = await db
      .collection(`barbershops/${ALFA}/audit_log`)
      .where("action", "==", "titular.anonimizado")
      .get();
    expect(log.size).toBe(1);
  });

  it("recusa com horário marcado daqui para a frente, e não muda nada", async () => {
    await db.doc(`barbershops/${ALFA}/bookings/bk-futuro`).set({
      clientId: UID,
      clientName: "João da Silva",
      date: FUTURO,
      status: "confirmed",
      value: 50,
    });
    await expect(anonimizar()).rejects.toThrow(/horário marcado/);
    expect(await ler(`barbershops/${ALFA}/clients/${UID}`)).toMatchObject({
      name: "João da Silva",
    });
  });

  it("reserva em aberto de hoje também trava", async () => {
    await db.doc(`barbershops/${ALFA}/bookings/bk-hoje`).set({
      clientId: UID,
      date: HOJE,
      status: "confirmed",
    });
    await expect(anonimizar()).rejects.toThrow(/horário marcado/);
  });
});

describe("exportar", () => {
  it("entrega cadastro, fundidos, reservas, pagamentos e fidelidade, legíveis", async () => {
    const e = await exportarDoCliente({ db, barbershopId: ALFA, clientId: UID, autorUid: "dono-alfa" });
    expect(e.cadastro).toMatchObject({ id: UID, name: "João da Silva" });
    expect(e.cadastrosFundidos.map((c) => c.id)).toEqual(["balcao-1"]);
    expect(e.reservas.map((r) => r.id).sort()).toEqual([`bk-${ALFA}`, "bk-balcao"].sort());
    expect(e.pagamentos).toHaveLength(1);
    expect(e.fidelidade).toHaveLength(1);
    expect(e.mensalidades).toHaveLength(1);

    const reserva = e.reservas.find((r) => r.id === `bk-${ALFA}`)!;
    expect(reserva.createdAt).toBe("2020-01-09T12:00:00.000Z");
    // A comissão do barbeiro e a taxa da maquininha não são dado do titular.
    expect(reserva).not.toHaveProperty("cicloFinanceiro");
    expect(e.pagamentos[0]).not.toHaveProperty("feePct");
  });

  it("deixa rastro no audit_log", async () => {
    await exportarDoCliente({ db, barbershopId: ALFA, clientId: UID, autorUid: "dono-alfa" });
    const log = await db
      .collection(`barbershops/${ALFA}/audit_log`)
      .where("action", "==", "titular.exportado")
      .get();
    expect(log.size).toBe(1);
    expect(JSON.stringify(log.docs[0].data())).not.toMatch(/João/);
  });
});

describe("excluir minha conta", () => {
  it("anonimiza em TODAS as barbearias, apaga users e, por último, o Auth", async () => {
    const { auth, chamadas } = dubleDoAuth({});
    const r = await excluirContaDoCliente({ db, auth, uid: UID });

    expect(r.barbearias).toBe(2);
    for (const shop of [ALFA, BETA]) {
      expect(await ler(`barbershops/${shop}/clients/${UID}`)).toMatchObject({ name: MARCADOR_ANONIMO });
      expect(await ler(`barbershops/${shop}/bookings/bk-${shop}`)).toMatchObject({
        clientName: MARCADOR_ANONIMO,
        value: 50,
      });
      expect(await ler(`barbershops/${shop}/payments/pg-${shop}`)).toMatchObject({ grossAmount: 50 });
    }
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(false);
    expect(chamadas).toEqual([{ fn: "deleteUser", uid: UID }]);
  });

  it("tudo ou nada na verificação: bloqueada numa casa, não mexe em nenhuma", async () => {
    await db.doc(`barbershops/${BETA}/bookings/bk-futuro`).set({
      clientId: UID,
      date: FUTURO,
      status: "confirmed",
    });
    const { auth, chamadas } = dubleDoAuth({});
    await expect(excluirContaDoCliente({ db, auth, uid: UID })).rejects.toThrow(/Barbearia beta/);

    expect(await ler(`barbershops/${ALFA}/clients/${UID}`)).toMatchObject({ name: "João da Silva" });
    expect((await db.doc(`users/${UID}`).get()).exists).toBe(true);
    expect(chamadas).toEqual([]);
  });
});

describe("expurgo de uma barbearia encerrada", () => {
  beforeEach(async () => {
    await db.doc(`barbershops/${ALFA}`).update({ status: "encerrada", encerradaEmMs: 1 });
    await db.doc(`slugs/${ALFA}`).set({ barbershopId: ALFA });
    await db.doc(`barbershops/${ALFA}/members/dono-alfa`).set({ role: "owner", email: "dono@alfa.com" });
    await db.doc(`barbershops/${ALFA}/members/barbeiro-2casas`).set({ role: "staff" });
    await db.doc(`barbershops/${ALFA}/audit_log/prov`).set({
      action: "barbershop.provisioned",
      detail: { slug: ALFA, ownerEmail: "dono@alfa.com" },
    });
    await db.doc(`barbershops/${ALFA}/commissions/c1`).set({ staffName: "Pedro", uid: "barbeiro-2casas", commissionAmount: 20 });
    await db.doc(`platform_users/dono-alfa`).set({ hash: "x" });
    await db.doc(`whatsapp_numbers/pn-1`).set({ barbershopId: ALFA });
  });

  const usuarios = {
    "dono-alfa": { barbershops: { [ALFA]: "owner" } },
    "barbeiro-2casas": { barbershops: { [ALFA]: "staff", [BETA]: "staff" } },
  };

  it("DRY_RUN só lê: nada sai, e o log diz o que sairia", async () => {
    const { auth, chamadas } = dubleDoAuth(usuarios);
    const balde = dubleDoBalde();
    const linhas = await expurgarBarbearia(
      { db, auth, balde, barbershopId: ALFA, agora: Date.now(), dryRun: true },
      ALFA,
      "Barbearia alfa"
    );
    expect(linhas.join("\n")).toMatch(/conta dono-alfa: APAGAR/);
    expect(linhas.join("\n")).toMatch(/conta barbeiro-2casas: só retirar o vínculo/);
    expect((await db.doc(`barbershops/${ALFA}`).get()).exists).toBe(true);
    expect((await db.doc(`slugs/${ALFA}`).get()).exists).toBe(true);
    expect((await db.collection("arquivo_fiscal").get()).size).toBe(0);
    expect(chamadas).toEqual([]);
    expect(balde.apagados).toEqual([]);
  });

  it("de verdade: arquiva sem identificação, trata contas, e apaga a árvore por último", async () => {
    const { auth, chamadas } = dubleDoAuth(usuarios);
    const balde = dubleDoBalde();
    await expurgarBarbearia(
      { db, auth, balde, barbershopId: ALFA, agora: Date.now(), dryRun: false },
      ALFA,
      "Barbearia alfa"
    );

    // A árvore, o slug e os índices saíram.
    expect((await db.doc(`barbershops/${ALFA}`).get()).exists).toBe(false);
    expect((await db.collection(`barbershops/${ALFA}/clients`).get()).size).toBe(0);
    expect((await db.doc(`slugs/${ALFA}`).get()).exists).toBe(false);
    expect((await db.doc("whatsapp_conversations/5511988887777").get()).exists).toBe(false);
    expect((await db.doc("whatsapp_numbers/pn-1").get()).exists).toBe(false);
    expect(balde.apagados).toEqual([`barbershops/${ALFA}/`]);

    // O que a Política manda reter ficou — sem nome, sem e-mail.
    expect(await ler(`arquivo_fiscal/${ALFA}/payments/pg-${ALFA}`)).toMatchObject({ grossAmount: 50 });
    expect(await ler(`arquivo_fiscal/${ALFA}/commissions/c1`)).toEqual({
      uid: "barbeiro-2casas",
      commissionAmount: 20,
    });
    expect(await ler(`arquivo_fiscal/${ALFA}/audit_log/prov`)).toEqual({
      action: "barbershop.provisioned",
      detail: { slug: ALFA },
    });
    expect((await ler(`arquivo_fiscal/${ALFA}`))?.reterAteMs).toBeGreaterThan(Date.now());

    // O dono só desta casa: conta apagada. O barbeiro de duas: só o vínculo.
    expect(chamadas).toContainEqual({ fn: "deleteUser", uid: "dono-alfa" });
    expect((await db.doc("platform_users/dono-alfa").get()).exists).toBe(false);
    expect(chamadas).toContainEqual({
      fn: "setCustomUserClaims",
      uid: "barbeiro-2casas",
      claims: { barbershops: { [BETA]: "staff" } },
    });
    expect(chamadas).not.toContainEqual({ fn: "deleteUser", uid: "barbeiro-2casas" });

    // A outra barbearia não foi tocada.
    expect((await db.doc(`barbershops/${BETA}/clients/${UID}`).get()).exists).toBe(true);
  });

  it("falha no meio: a árvore fica, e a conta continua encontrável amanhã", async () => {
    const { auth } = dubleDoAuth(usuarios);
    await expect(
      expurgarBarbearia(
        { db, auth, balde: dubleDoBalde({ falhar: true }), barbershopId: ALFA, agora: Date.now(), dryRun: false },
        ALFA,
        "Barbearia alfa"
      )
    ).rejects.toThrow(/storage fora do ar/);

    const encerradas = await db.collection("barbershops").where("status", "==", "encerrada").get();
    expect(encerradas.docs.map((d) => d.id)).toContain(ALFA);
    expect((await db.doc(`slugs/${ALFA}`).get()).exists).toBe(true);

    // Amanhã, com o Storage de volta, termina — e o arquivo não duplica.
    await expurgarBarbearia(
      { db, auth, balde: dubleDoBalde(), barbershopId: ALFA, agora: Date.now(), dryRun: false },
      ALFA,
      "Barbearia alfa"
    );
    expect((await db.doc(`barbershops/${ALFA}`).get()).exists).toBe(false);
    expect((await db.collection(`arquivo_fiscal/${ALFA}/payments`).get()).size).toBe(1);
  });
});
