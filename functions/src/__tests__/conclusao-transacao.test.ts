import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { materializarConclusao, reverterConclusao, type PaymentFees } from "../financial-events";
import { gravarEdicao } from "../edicao-de-cobranca";
import { gravarCorrecao } from "../correcao-de-pagamento";
import type { ServicoDoCatalogo } from "../combos";

/**
 * Revisão do #135 (08/10) — a conclusão contra o emulador.
 *
 * Com `retry` ligado, o gatilho de conclusão pode ser entregue mais de uma
 * vez, e cada entrega traz o retrato `depois` DAQUELE evento. O que só aqui se
 * prova:
 *  1. reentrega depois de uma edição de cobrança não desfaz a edição;
 *  2. reentrega depois de uma correção do meio de pagamento não a desfaz;
 *  3. reentrega simples não duplica nem altera nada;
 *  4. duas conclusões SIMULTÂNEAS do mesmo cliente não estouram a cota.
 *
 * Exige o emulador: roda em `npm run test:emulador` (CI).
 */

const PROJETO = "conclusao-reentrega";
const SHOP = "barbearia-conclusao";
const HOJE = "2026-10-02";
const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };
const CATALOGO: ServicoDoCatalogo[] = [
  { id: "corte", name: "Corte", price: 50, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 30 },
  { id: "corte-barba", name: "Corte + barba", price: 75, durationMin: 60, composicao: ["corte", "barba"] },
];

let app: App;
let db: Firestore;
const shopRef = () => db.doc(`barbershops/${SHOP}`);
const reservaRef = (id: string) => shopRef().collection("bookings").doc(id);
const pagamentoRef = (id: string) => shopRef().collection("payments").doc(`pagamento_${id}`);

/** A reserva como fica no instante em que o dono conclui — o retrato do evento. */
function reservaConcluida(params: {
  value: number;
  metodo: string | null;
  clientId?: string;
  serviceIds?: string[];
  serviceNames?: string[];
}) {
  return {
    status: "completed",
    clientId: params.clientId ?? "c1",
    date: HOJE,
    time: "10:00",
    staffId: "s1",
    staffName: "Otávio",
    serviceIds: params.serviceIds ?? ["corte-barba"],
    serviceNames: params.serviceNames ?? ["Corte + barba"],
    value: params.value,
    durationMin: 60,
    paymentMethod: params.metodo,
    paymentOrigin: "in_person",
  };
}

async function concluir(id: string, depois: Record<string, unknown>, chave = `evento-${id}`) {
  await reservaRef(id).set(depois);
  return entregar(id, depois, chave);
}

/** Uma entrega do gatilho: o MESMO caminho que o gatilho e a conferência usam. */
function entregar(id: string, depois: Record<string, unknown>, chave = `evento-${id}`) {
  return materializarConclusao({ db, barbershopId: SHOP, bookingId: id, depois, chaveDoEvento: chave });
}

async function comissoes() {
  const s = await shopRef().collection("commissions").get();
  return s.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }));
}
const saldo = (linhas: Record<string, unknown>[]) =>
  Math.round(linhas.reduce((t, c) => t + (Number(c.commissionAmount) || 0), 0) * 100) / 100;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Este teste exige o emulador.");
  app = initializeApp({ projectId: PROJETO }, `conclusao-${Date.now()}`);
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  for (const col of ["payments", "bookings", "audit_log", "refunds", "commissions", "subscriptions"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({
    locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" },
    policies: { paymentFees: TAXAS, commissionSplit: { barberPct: 40 } },
  });
});

describe("reentrega do gatilho de conclusão", () => {
  it("reentrega simples não duplica nem altera o fato", async () => {
    const depois = reservaConcluida({ value: 75, metodo: "pix" });
    await concluir("b1", depois);
    const antes = (await pagamentoRef("b1").get()).data()!;
    await entregar("b1", depois);
    await entregar("b1", depois);

    expect((await shopRef().collection("payments").get()).size).toBe(1);
    const linhas = await comissoes();
    expect(linhas).toHaveLength(1);
    expect(saldo(linhas)).toBe(30);
    const p = (await pagamentoRef("b1").get()).data()!;
    expect(p.grossAmount).toBe(75);
    expect(p.createdAt).toEqual(antes.createdAt);
  });

  it("reentrega DEPOIS de editar a cobrança não desfaz a edição", async () => {
    /* O retrato do evento ainda diz "corte + barba, R$ 75 no Pix". */
    const depois = reservaConcluida({ value: 75, metodo: "pix" });
    await concluir("b1", depois);

    await gravarEdicao({
      db,
      shopRef: shopRef(),
      bookingId: "b1",
      papel: "owner",
      staffIdDoAutor: null,
      serviceIds: ["corte"],
      catalogo: CATALOGO,
      desconto: undefined,
      formaId: null,
      metodo: "credit",
      fees: TAXAS,
      padraoPct: 40,
      hoje: HOJE,
      chave: "k1",
      autor: "uid-dono",
    });

    await entregar("b1", depois);

    const p = (await pagamentoRef("b1").get()).data()!;
    expect(p.grossAmount).toBe(50);
    expect(p.paymentMethod).toBe("credit");
    expect(p.feeAmount).toBe(1.75);
    expect(p.netAmount).toBe(48.25);
    /* Comissão: nega R$ 30 e vale R$ 20 — a reentrega não ressuscita os R$ 30. */
    const linhas = await comissoes();
    expect(linhas).toHaveLength(3);
    expect(saldo(linhas)).toBe(20);
    const b = (await reservaRef("b1").get()).data()!;
    expect(b.value).toBe(50);
    expect(b.paymentMethod).toBe("credit");
    expect(b.cicloFinanceiro.comissaoVigenteId).toBe("comissao_b1_edicao-k1");
  });

  it("reentrega DEPOIS de corrigir o meio de pagamento não desfaz a correção", async () => {
    const depois = reservaConcluida({ value: 50, metodo: "pix" });
    await concluir("b1", depois);

    await gravarCorrecao({
      db,
      shopRef: shopRef(),
      bookingId: "b1",
      metodo: "cash",
      fees: TAXAS,
      hoje: HOJE,
      chave: "k1",
      autor: "uid-dono",
    });

    await entregar("b1", depois);

    const p = (await pagamentoRef("b1").get()).data()!;
    expect(p.paymentMethod).toBe("cash");
    expect(p.feeAmount).toBe(0);
    expect(p.netAmount).toBe(50);
  });

  it("a conferência recria o que FALTA: sem comissão, a conclusão nasce", async () => {
    const depois = reservaConcluida({ value: 50, metodo: "pix" });
    await reservaRef("b1").set(depois);
    /* Gatilho perdido: nada existe. A conferência passa com a reserva atual. */
    await entregar("b1", depois, "conferencia-2026-10-03");
    expect((await pagamentoRef("b1").get()).get("grossAmount")).toBe(50);
    expect(saldo(await comissoes())).toBe(20);
  });
});

describe("cota do plano com conclusões simultâneas", () => {
  it("duas conclusões ao mesmo tempo com 3 de 4 usados: só uma sai coberta", async () => {
    await shopRef().collection("subscriptions").doc("a1").set({
      clientId: "c-plano",
      clientName: "Cliente do plano",
      planId: "plano-4",
      planName: "Quatro cortes",
      status: "ativo",
      startedAt: "2026-01-10",
      canceledAt: null,
      unlimited: false,
      servicesIncluded: 4,
      price: 149,
      billingDay: 5,
    });
    /* Três já cobertos na competência de outubro. */
    for (const id of ["u1", "u2", "u3"]) {
      await reservaRef(id).set({
        ...reservaConcluida({ value: 50, metodo: null, clientId: "c-plano" }),
        date: "2026-10-01",
        cobertura: {
          tipo: "plano",
          subscriptionId: "a1",
          planId: "plano-4",
          planName: "Quatro cortes",
          competencia: "2026-10",
          valorCoberto: 50,
          usoNaCompetencia: 1,
          cota: 4,
        },
      });
    }

    const d4 = reservaConcluida({ value: 50, metodo: null, clientId: "c-plano" });
    const d5 = reservaConcluida({ value: 50, metodo: null, clientId: "c-plano" });
    await Promise.all([reservaRef("n4").set(d4), reservaRef("n5").set(d5)]);
    await Promise.all([entregar("n4", d4), entregar("n5", d5)]);

    const coberturas = await Promise.all(
      ["n4", "n5"].map(async (id) => (await reservaRef(id).get()).get("cobertura"))
    );
    const cobertas = coberturas.filter((c) => c?.tipo === "plano");
    expect(cobertas).toHaveLength(1);
    expect(cobertas[0].usoNaCompetencia).toBe(4);
    expect(coberturas.filter((c) => c?.motivo === "cota_esgotada")).toHaveLength(1);
  });

  it("reprocessar a quarta não a conta duas vezes", async () => {
    await shopRef().collection("subscriptions").doc("a1").set({
      clientId: "c-plano",
      planId: "plano-4",
      planName: "Quatro cortes",
      status: "ativo",
      startedAt: "2026-01-10",
      canceledAt: null,
      unlimited: false,
      servicesIncluded: 4,
    });
    const d = reservaConcluida({ value: 50, metodo: null, clientId: "c-plano" });
    await concluir("n1", d);
    /* Simula a perda da comissão (o que a conferência veria) com a reserva já
     * marcada: o recálculo exclui a própria reserva da contagem. */
    await shopRef().collection("commissions").doc("comissao_n1").delete();
    await entregar("n1", { ...d, cobertura: undefined }, "conferencia-2026-10-03");
    const c = (await reservaRef("n1").get()).get("cobertura");
    expect(c.tipo).toBe("plano");
    expect(c.usoNaCompetencia).toBe(1);
  });
});

describe("caixinha (gorjeta) no fechamento", () => {
  const caixinhaPagamentoRef = (id: string) =>
    shopRef().collection("payments").doc(`pagamento_caixinha_${id}`);
  const doServico = (linhas: Record<string, unknown>[]) => linhas.filter((l) => l.origin === "servico");
  const daCaixinha = (linhas: Record<string, unknown>[]) => linhas.filter((l) => l.origin === "caixinha");
  const taxas = (credito: number) =>
    shopRef().update({ "policies.paymentFees": { dinheiro: 0, pix: 0, debito: 0, credito } });

  it("R$ 50 no Pix + R$ 10 de caixinha (taxa 0): serviço e caixinha separados, 100% do barbeiro", async () => {
    await taxas(0);
    await concluir("b1", { ...reservaConcluida({ value: 50, metodo: "pix", serviceIds: ["corte"] }), tipAmount: 10 });

    const servico = (await pagamentoRef("b1").get()).data()!;
    expect(servico.origin).toBe("servico");
    expect(servico.grossAmount).toBe(50);

    const tip = (await caixinhaPagamentoRef("b1").get()).data()!;
    expect(tip).toMatchObject({
      origin: "caixinha",
      bookingId: "b1",
      clientId: "c1",
      staffId: "s1",
      date: HOJE,
      grossAmount: 10,
      netAmount: 10,
      paymentMethod: "pix",
    });

    const linhas = await comissoes();
    expect(doServico(linhas)).toHaveLength(1);
    expect(saldo(doServico(linhas))).toBe(20);
    const c = daCaixinha(linhas);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({
      id: "comissao_b1_caixinha",
      commissionPct: 100,
      commissionBase: 10,
      feeAmount: 0,
      commissionAmount: 10,
      staffId: "s1",
      staffName: "Otávio",
    });
  });

  it("crédito a 3%: a taxa da caixinha é do barbeiro, que recebe R$ 9,70", async () => {
    await taxas(3);
    await concluir("b1", { ...reservaConcluida({ value: 50, metodo: "credit", serviceIds: ["corte"] }), tipAmount: 10 });
    const tip = (await caixinhaPagamentoRef("b1").get()).data()!;
    expect(tip.feeAmount).toBe(0.3);
    expect(tip.netAmount).toBe(9.7);
    const c = daCaixinha(await comissoes())[0];
    expect(c.commissionAmount).toBe(9.7);
    expect(c.commissionBase).toBe(10);
    expect(c.feeAmount).toBe(0.3);
    /* A taxa do SERVIÇO continua sendo da casa e não é tocada: 3% de R$ 50. */
    expect((await pagamentoRef("b1").get()).get("feeAmount")).toBe(1.5);
  });

  it("desconto + caixinha: a base do serviço é o cobrado, a caixinha não entra nela", async () => {
    await taxas(0);
    await concluir("b1", {
      ...reservaConcluida({ value: 50, metodo: "cash", serviceIds: ["corte"] }),
      discountAmount: 10,
      tipAmount: 5,
    });
    expect((await pagamentoRef("b1").get()).get("grossAmount")).toBe(40);
    const linhas = await comissoes();
    expect(doServico(linhas)[0].commissionBase).toBe(40);
    expect(saldo(doServico(linhas))).toBe(16);
    expect((await caixinhaPagamentoRef("b1").get()).get("grossAmount")).toBe(5);
    expect(saldo(daCaixinha(linhas))).toBe(5);
  });

  it("sem caixinha informada: nada de caixinha", async () => {
    await concluir("b1", reservaConcluida({ value: 50, metodo: "pix", serviceIds: ["corte"] }));
    expect((await caixinhaPagamentoRef("b1").get()).exists).toBe(false);
    expect(daCaixinha(await comissoes())).toHaveLength(0);
  });

  it("cortesia e coberto não têm caixinha, e o campo solto na reserva é apagado", async () => {
    await concluir("b1", {
      ...reservaConcluida({ value: 50, metodo: null, serviceIds: ["corte"] }),
      discountAmount: 50,
      tipAmount: 10,
    });
    expect((await caixinhaPagamentoRef("b1").get()).exists).toBe(false);
    expect(daCaixinha(await comissoes())).toHaveLength(0);
    expect((await reservaRef("b1").get()).get("tipAmount")).toBeUndefined();

    /* Mensalista sem cobrar: sem forma de pagamento, sem caixinha. */
    await concluir("b2", { ...reservaConcluida({ value: 50, metodo: null, serviceIds: ["corte"] }), tipAmount: 10 });
    expect((await caixinhaPagamentoRef("b2").get()).exists).toBe(false);
    expect(daCaixinha(await comissoes())).toHaveLength(0);
  });

  it("retry do gatilho não duplica a caixinha nem o repasse", async () => {
    await taxas(3);
    const depois = { ...reservaConcluida({ value: 50, metodo: "credit", serviceIds: ["corte"] }), tipAmount: 10 };
    await concluir("b1", depois);
    await entregar("b1", depois);
    await entregar("b1", depois);
    expect((await shopRef().collection("payments").get()).size).toBe(2);
    const linhas = await comissoes();
    expect(daCaixinha(linhas)).toHaveLength(1);
    expect(saldo(daCaixinha(linhas))).toBe(9.7);
  });

  it("a conferência noturna materializa a caixinha que o gatilho perdeu", async () => {
    await taxas(0);
    const depois = { ...reservaConcluida({ value: 50, metodo: "cash", serviceIds: ["corte"] }), tipAmount: 8 };
    await reservaRef("b1").set(depois);
    await entregar("b1", depois, "conferencia-2026-10-03");
    expect((await caixinhaPagamentoRef("b1").get()).get("grossAmount")).toBe(8);
    expect(saldo(daCaixinha(await comissoes()))).toBe(8);
  });

  describe("reversão e reconclusão", () => {
    const desfazer = async (id: string, depois: Record<string, unknown>, chave: string) => {
      const aberta = { ...depois, status: "no_show" };
      await reservaRef(id).update({ status: "no_show" });
      await reverterConclusao({ db, barbershopId: SHOP, bookingId: id, depois: aberta, chave });
    };

    it("desfazer a conclusão nega a caixinha, apaga o pagamento e limpa a reserva", async () => {
      await taxas(3);
      const depois = { ...reservaConcluida({ value: 50, metodo: "credit", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);
      await desfazer("b1", depois, "ev-rev1");

      expect((await caixinhaPagamentoRef("b1").get()).exists).toBe(false);
      expect((await pagamentoRef("b1").get()).exists).toBe(false);
      const linhas = await comissoes();
      /* Soma, nunca apaga: linha original + estorno. */
      expect(daCaixinha(linhas)).toHaveLength(2);
      expect(saldo(daCaixinha(linhas))).toBe(0);
      expect(saldo(doServico(linhas))).toBe(0);
      expect(daCaixinha(linhas).find((l) => l.id === "comissao_estorno_caixinha_b1_ev-rev1")?.commissionAmount).toBe(-9.7);
      const r = (await reservaRef("b1").get()).data()!;
      expect(r.tipAmount).toBeUndefined();
      expect(r.paymentMethod).toBeNull();
    });

    it("reentrega da MESMA reversão não nega duas vezes", async () => {
      await taxas(0);
      const depois = { ...reservaConcluida({ value: 50, metodo: "cash", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);
      await desfazer("b1", depois, "ev-rev1");
      await reverterConclusao({ db, barbershopId: SHOP, bookingId: "b1", depois: { ...depois, status: "no_show" }, chave: "ev-rev1" });
      expect(saldo(daCaixinha(await comissoes()))).toBe(0);
      expect(daCaixinha(await comissoes())).toHaveLength(2);
    });

    it("reconcluir com OUTRA caixinha: a anterior não volta, vale a nova", async () => {
      await taxas(0);
      const depois = { ...reservaConcluida({ value: 50, metodo: "cash", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);
      await desfazer("b1", depois, "ev-rev1");

      /* O dono conclui de novo, agora com R$ 4 e Pix. A reserva carrega o ciclo. */
      await reservaRef("b1").update({ status: "completed", paymentMethod: "pix", tipAmount: 4 });
      const nova = (await reservaRef("b1").get()).data()!;
      await entregar("b1", nova, "ev-concl2");

      expect((await caixinhaPagamentoRef("b1").get()).get("grossAmount")).toBe(4);
      const linhas = daCaixinha(await comissoes());
      expect(saldo(linhas)).toBe(4);
      expect(linhas.map((l) => l.id).sort()).toEqual(
        ["comissao_b1_caixinha", "comissao_b1_ev-concl2_caixinha", "comissao_estorno_caixinha_b1_ev-rev1"].sort()
      );
    });

    it("reconcluir SEM caixinha: o repasse anterior fica negado e nada novo nasce", async () => {
      await taxas(0);
      const depois = { ...reservaConcluida({ value: 50, metodo: "cash", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);
      await desfazer("b1", depois, "ev-rev1");
      await reservaRef("b1").update({ status: "completed", paymentMethod: "cash" });
      await entregar("b1", (await reservaRef("b1").get()).data()!, "ev-concl2");
      expect((await caixinhaPagamentoRef("b1").get()).exists).toBe(false);
      expect(saldo(daCaixinha(await comissoes()))).toBe(0);
    });
  });

  describe("correção do meio de pagamento", () => {
    it("Pix -> crédito a 3% corrige o pagamento da caixinha e soma um ajuste de -R$ 0,30", async () => {
      await taxas(3);
      await shopRef().update({ "policies.paymentFees.pix": 0 });
      const depois = { ...reservaConcluida({ value: 50, metodo: "pix", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);

      await gravarCorrecao({
        db,
        shopRef: shopRef(),
        bookingId: "b1",
        metodo: "credit",
        fees: { dinheiro: 0, pix: 0, debito: 0, credito: 3 },
        hoje: HOJE,
        chave: "k1",
        autor: "uid-dono",
      });

      const tip = (await caixinhaPagamentoRef("b1").get()).data()!;
      expect(tip).toMatchObject({ paymentMethod: "credit", feeAmount: 0.3, netAmount: 9.7, grossAmount: 10 });
      const linhas = daCaixinha(await comissoes());
      expect(linhas).toHaveLength(2);
      const ajuste = linhas.find((l) => l.id === "comissao_ajuste_caixinha_b1_k1")!;
      expect(ajuste.commissionAmount).toBe(-0.3);
      expect(ajuste.commissionBase).toBe(0);
      expect(ajuste.feeAmount).toBe(0.3);
      expect(saldo(linhas)).toBe(9.7);
      /* A linha original não foi reescrita. */
      expect(linhas.find((l) => l.id === "comissao_b1_caixinha")?.commissionAmount).toBe(10);
    });

    it("depois do ajuste, desfazer a conclusão fecha a caixinha em zero (não sobra o -0,30)", async () => {
      await taxas(3);
      await shopRef().update({ "policies.paymentFees.pix": 0 });
      const depois = { ...reservaConcluida({ value: 50, metodo: "pix", serviceIds: ["corte"] }), tipAmount: 10 };
      await concluir("b1", depois);
      await gravarCorrecao({
        db,
        shopRef: shopRef(),
        bookingId: "b1",
        metodo: "credit",
        fees: { dinheiro: 0, pix: 0, debito: 0, credito: 3 },
        hoje: HOJE,
        chave: "k1",
        autor: "uid-dono",
      });
      await reservaRef("b1").update({ status: "no_show" });
      await reverterConclusao({ db, barbershopId: SHOP, bookingId: "b1", depois: { ...depois, status: "no_show" }, chave: "ev-rev1" });
      expect(saldo(daCaixinha(await comissoes()))).toBe(0);
      expect((await caixinhaPagamentoRef("b1").get()).exists).toBe(false);
    });
  });

  it("a edição de cobrança não toca na caixinha, e desfazer depois dela ainda a nega", async () => {
    await taxas(0);
    const depois = { ...reservaConcluida({ value: 75, metodo: "cash" }), tipAmount: 10 };
    await concluir("b1", depois);
    await gravarEdicao({
      db,
      shopRef: shopRef(),
      bookingId: "b1",
      papel: "owner",
      staffIdDoAutor: null,
      serviceIds: ["corte"],
      catalogo: CATALOGO,
      desconto: undefined,
      formaId: null,
      metodo: "cash",
      fees: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
      padraoPct: 40,
      hoje: HOJE,
      chave: "k1",
      autor: "uid-dono",
    });
    expect((await caixinhaPagamentoRef("b1").get()).get("grossAmount")).toBe(10);
    expect(saldo(daCaixinha(await comissoes()))).toBe(10);

    /* A comissão vigente do serviço mudou de id; a caixinha é achada por reserva. */
    await reservaRef("b1").update({ status: "no_show" });
    await reverterConclusao({ db, barbershopId: SHOP, bookingId: "b1", depois: { ...depois, status: "no_show", cicloFinanceiro: (await reservaRef("b1").get()).get("cicloFinanceiro") }, chave: "ev-rev1" });
    expect(saldo(daCaixinha(await comissoes()))).toBe(0);
  });

  it("a edição que TROCA o meio leva a caixinha junto (Pix → crédito 3%: ajuste −R$ 0,30)", async () => {
    await taxas(0);
    const depois = { ...reservaConcluida({ value: 50, metodo: "pix" }), tipAmount: 10 };
    await concluir("b1", depois);
    const editarPara = (chave: string) =>
      gravarEdicao({
        db,
        shopRef: shopRef(),
        bookingId: "b1",
        papel: "owner",
        staffIdDoAutor: null,
        serviceIds: ["corte"],
        catalogo: CATALOGO,
        desconto: undefined,
        formaId: null,
        metodo: "credit",
        fees: { dinheiro: 0, pix: 0, debito: 0, credito: 3 },
        padraoPct: 40,
        hoje: HOJE,
        chave,
        autor: "uid-dono",
      });
    await editarPara("k1");

    const tip = (await caixinhaPagamentoRef("b1").get()).data()!;
    expect(tip).toMatchObject({ paymentMethod: "credit", grossAmount: 10, feeAmount: 0.3, netAmount: 9.7 });
    const linhas = daCaixinha(await comissoes());
    expect(linhas.find((l) => l.id === "comissao_ajuste_caixinha_b1_edicao-k1")?.commissionAmount).toBe(-0.3);
    expect(saldo(linhas)).toBe(9.7);

    /* Retry da mesma edição: nada novo. */
    await editarPara("k1");
    expect(saldo(daCaixinha(await comissoes()))).toBe(9.7);
  });
});
