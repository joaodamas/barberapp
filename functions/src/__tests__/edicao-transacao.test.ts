import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarEdicao, idDaEdicao, type PedidoDeDesconto } from "../edicao-de-cobranca";
import { calcularEventoFinanceiro, type PaymentFees, type PaymentMethod } from "../financial-events";
import type { ServicoDoCatalogo } from "../combos";

/**
 * Editar cobrança de atendimento concluído (02/10) contra o emulador.
 *
 * O que só aqui pode ser provado é o que acontece com os DOCUMENTOS:
 *  1. a comissão soma — a vigente é negada e a nova entra; o saldo do barbeiro
 *     é exatamente a comissão nova;
 *  2. o pagamento continua sendo UM documento, com bruto, taxa e líquido novos;
 *  3. reserva e pagamento terminam concordando;
 *  4. a próxima edição nega a linha certa (a vigente aponta para a nova);
 *  5. idempotência: a mesma chave não edita duas vezes;
 *  6. recusas não deixam rastro;
 *  7. barbeiro: só o próprio atendimento e só no mesmo dia.
 *
 * Exige o emulador: roda em `npm run test:emulador` (CI).
 */

const PROJETO = "edicao-cobranca";
const SHOP = "barbearia-edicao";
const HOJE = "2026-10-02";
const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };
const BOOKING = "b1";
const CATALOGO: ServicoDoCatalogo[] = [
  { id: "corte", name: "Corte", price: 50, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 30 },
  { id: "sobrancelha", name: "Sobrancelha", price: 15, durationMin: 20 },
  { id: "corte-barba", name: "Corte + barba", price: 75, durationMin: 60, composicao: ["corte", "barba"] },
];

let app: App;
let db: Firestore;
const shopRef = () => db.doc(`barbershops/${SHOP}`);
const pagamentoRef = () => shopRef().collection("payments").doc(`pagamento_${BOOKING}`);
const reservaRef = () => shopRef().collection("bookings").doc(BOOKING);

/** O estado que o gatilho produz ao concluir "corte + barba" (combo) a 40% em Pix. */
async function semearConcluido(params: { date?: string; metodo?: PaymentMethod } = {}) {
  const date = params.date ?? HOJE;
  const metodo = params.metodo ?? "pix";
  const { commission, payment } = calcularEventoFinanceiro({
    valor: 75,
    metodo,
    commissionPctDoBarbeiro: 40,
    padraoPct: 50,
    fees: TAXAS,
  });
  await reservaRef().set({
    status: "completed",
    clientId: "c1",
    date,
    time: "10:00",
    staffId: "s1",
    staffName: "Otávio",
    serviceIds: ["corte-barba"],
    serviceNames: ["Corte + barba"],
    value: 75,
    durationMin: 60,
    paymentMethod: metodo,
    paymentOrigin: "in_person",
    cobertura: { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 },
  });
  await shopRef().collection("commissions").doc(`comissao_${BOOKING}`).set({
    bookingId: BOOKING,
    staffId: "s1",
    uid: "uid-otavio",
    staffName: "Otávio",
    date,
    origin: "servico",
    cobertoPeloPlano: false,
    ...commission,
    createdAt: FieldValue.serverTimestamp(),
  });
  await pagamentoRef().set({
    origin: "servico",
    bookingId: BOOKING,
    clientId: "c1",
    date,
    ...payment,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function editar(p: {
  serviceIds: string[];
  metodo?: PaymentMethod;
  desconto?: PedidoDeDesconto;
  chave?: string;
  papel?: "owner" | "staff";
  staffIdDoAutor?: string | null;
  hoje?: string;
  formaId?: string | null;
  formas?: { id: string; label: string; base: PaymentMethod; feePct: number; active: boolean }[];
  catalogo?: ServicoDoCatalogo[];
  fees?: PaymentFees;
}) {
  return gravarEdicao({
    db,
    shopRef: shopRef(),
    bookingId: BOOKING,
    papel: p.papel ?? "owner",
    staffIdDoAutor: p.staffIdDoAutor ?? null,
    serviceIds: p.serviceIds,
    catalogo: p.catalogo ?? CATALOGO,
    desconto: p.desconto,
    formaId: p.formaId ?? null,
    formas: p.formas,
    metodo: p.metodo ?? "pix",
    fees: p.fees ?? TAXAS,
    padraoPct: 50,
    hoje: p.hoje ?? HOJE,
    chave: p.chave ?? "k1",
    autor: p.papel === "staff" ? "uid-otavio" : "uid-dono",
  });
}

async function comissoes() {
  const s = await shopRef().collection("commissions").get();
  return s.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }) as Record<string, unknown> & { id: string });
}
const saldo = (linhas: Record<string, unknown>[]) =>
  Math.round(linhas.reduce((t, c) => t + (Number(c.commissionAmount) || 0), 0) * 100) / 100;

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Este teste exige o emulador.");
  app = initializeApp({ projectId: PROJETO }, `edicao-${Date.now()}`);
  db = getFirestore(app);
});
afterAll(async () => {
  await deleteApp(app);
});
beforeEach(async () => {
  for (const col of ["payments", "bookings", "audit_log", "refunds", "commissions"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({ locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" } });
});

describe("tirar a barba somada por engano (combo R$ 75 → corte R$ 50)", () => {
  it("comissão soma: nega R$ 30 e grava R$ 20 — saldo do barbeiro R$ 20", async () => {
    await semearConcluido();
    const r = await editar({ serviceIds: ["corte"] });
    expect(r.antes.commissionAmount).toBe(30);
    expect(r.depois.commissionAmount).toBe(20);
    const linhas = await comissoes();
    expect(linhas).toHaveLength(3);
    expect(saldo(linhas)).toBe(20);
    expect(linhas.find((c) => c.id.startsWith("comissao_estorno_"))?.commissionAmount).toBe(-30);
  });

  it("pagamento continua UM documento, com bruto, taxa e líquido novos", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte"], metodo: "credit" });
    expect((await shopRef().collection("payments").get()).size).toBe(1);
    const p = (await pagamentoRef().get()).data()!;
    expect(p.grossAmount).toBe(50);
    expect(p.paymentMethod).toBe("credit");
    expect(p.feeAmount).toBe(1.75);
    expect(p.netAmount).toBe(48.25);
    expect(p.origin).toBe("servico");
    expect(p.createdAt).toBeDefined();
  });

  it("reserva concorda com o pagamento e guarda o histórico", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte"] });
    const b = (await reservaRef().get()).data()!;
    expect(b.value).toBe(50);
    expect(b.serviceNames).toEqual(["Corte"]);
    expect(b.durationMin).toBe(30);
    expect(b.status).toBe("completed");
    expect(b.edicoesDeCobranca).toHaveLength(1);
    expect(b.cicloFinanceiro.comissaoVigenteId).toBe("comissao_b1_edicao-k1");
  });

  it("a segunda edição nega a linha certa — o saldo segue a última", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte"], chave: "k1" });
    await editar({ serviceIds: ["corte", "sobrancelha"], chave: "k2" });
    const linhas = await comissoes();
    expect(saldo(linhas)).toBe(26);
    expect(linhas.filter((c) => Number(c.commissionAmount) < 0)).toHaveLength(2);
  });
});

describe("desconto", () => {
  it("dono dá desconto: comissão e pagamento sobre o cobrado", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte-barba"], desconto: { tipo: "valor", valor: 5 } });
    const p = (await pagamentoRef().get()).data()!;
    expect(p.grossAmount).toBe(70);
    expect(p.originalAmount).toBe(75);
    expect(p.discountAmount).toBe(5);
    expect(saldo(await comissoes())).toBe(28);
    expect((await reservaRef().get()).get("discountAmount")).toBe(5);
  });
  it("tirar o desconto apaga o par no pagamento e na reserva", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte-barba"], desconto: { tipo: "valor", valor: 5 }, chave: "k1" });
    await editar({ serviceIds: ["corte-barba"], desconto: null, chave: "k2" });
    const p = (await pagamentoRef().get()).data()!;
    expect(p.grossAmount).toBe(75);
    expect(p.originalAmount).toBeUndefined();
    expect(p.discountAmount).toBeUndefined();
    expect((await reservaRef().get()).get("discountAmount")).toBeUndefined();
  });
});

describe("idempotência e recusas", () => {
  it("a mesma chave não edita duas vezes", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte"] });
    const r = await editar({ serviceIds: ["corte"] });
    expect(r.repetida).toBe(true);
    expect(await comissoes()).toHaveLength(3);
    expect((await shopRef().collection("audit_log").doc(idDaEdicao(BOOKING, "k1")).get()).exists).toBe(true);
  });
  it("nada mudou é recusado e não deixa rastro", async () => {
    await semearConcluido();
    await expect(editar({ serviceIds: ["corte-barba"] })).rejects.toThrow(/Nada mudou/);
    expect(await comissoes()).toHaveLength(1);
    expect((await shopRef().collection("audit_log").get()).size).toBe(0);
  });
  it("com estorno registrado, recusa", async () => {
    await semearConcluido();
    await shopRef().collection("refunds").doc("r1").set({ paymentId: `pagamento_${BOOKING}`, amount: 10 });
    await expect(editar({ serviceIds: ["corte"] })).rejects.toThrow(/devolução/);
  });
  it("dono fora do mês, recusa", async () => {
    await semearConcluido({ date: "2026-09-30" });
    await expect(editar({ serviceIds: ["corte"] })).rejects.toThrow(/outro mês/);
  });
});

describe("barbeiro", () => {
  it("edita o próprio atendimento no mesmo dia", async () => {
    await semearConcluido();
    const r = await editar({ serviceIds: ["corte"], papel: "staff", staffIdDoAutor: "s1" });
    expect(r.depois.value).toBe(50);
  });
  it("não edita atendimento de outro dia", async () => {
    await semearConcluido({ date: "2026-10-01" });
    await expect(editar({ serviceIds: ["corte"], papel: "staff", staffIdDoAutor: "s1" })).rejects.toThrow(
      /mesmo dia/
    );
  });
  it("não edita atendimento de outro barbeiro", async () => {
    await semearConcluido();
    await expect(editar({ serviceIds: ["corte"], papel: "staff", staffIdDoAutor: "s2" })).rejects.toThrow(
      /seus atendimentos/
    );
  });
  it("não tira o desconto que o dono deu (08/10)", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte-barba"], desconto: { tipo: "valor", valor: 5 }, chave: "k1" });
    await expect(
      editar({ serviceIds: ["corte-barba"], papel: "staff", staffIdDoAutor: "s1", desconto: null, chave: "k2" })
    ).rejects.toThrow(/Só o dono/);
    expect((await pagamentoRef().get()).get("discountAmount")).toBe(5);
    expect((await reservaRef().get()).get("discountAmount")).toBe(5);
  });
  it("mantém o desconto do dono ao corrigir serviço", async () => {
    await semearConcluido();
    await editar({ serviceIds: ["corte-barba"], desconto: { tipo: "valor", valor: 5 }, chave: "k1" });
    const r = await editar({ serviceIds: ["corte"], papel: "staff", staffIdDoAutor: "s1", chave: "k2" });
    expect(r.depois.discountAmount).toBe(5);
    expect(r.depois.cobrado).toBe(45);
  });
  it("não dá desconto novo", async () => {
    await semearConcluido();
    await expect(
      editar({ serviceIds: ["corte"], papel: "staff", staffIdDoAutor: "s1", desconto: { tipo: "valor", valor: 5 } })
    ).rejects.toThrow(/Só o dono/);
  });
});

describe("revisão #116", () => {
  const FORMAS = [
    { id: "pix", label: "Pix", base: "pix" as const, feePct: 0.99, active: true },
    { id: "dinheiro", label: "Dinheiro", base: "cash" as const, feePct: 0, active: true },
    { id: "credito", label: "Crédito", base: "credit" as const, feePct: 3.49, active: true },
  ];
  it("recusa dinheiro com a forma do crédito, sem rastro", async () => {
    await semearConcluido();
    await expect(
      editar({ serviceIds: ["corte"], metodo: "cash", formaId: "credito", formas: FORMAS })
    ).rejects.toThrow(/não é desse meio/);
    expect((await pagamentoRef().get()).get("grossAmount")).toBe(75);
    expect((await shopRef().collection("audit_log").get()).size).toBe(0);
  });
  it("combo desativado + edição só de forma: valor e serviços iguais", async () => {
    await semearConcluido();
    const semCombo = CATALOGO.map((s) => (s.id === "corte-barba" ? { ...s, active: false } : s));
    const r = await editar({ serviceIds: ["corte-barba"], metodo: "cash", formaId: "dinheiro", formas: FORMAS, catalogo: semCombo });
    expect(r.depois.value).toBe(75);
    const b = (await reservaRef().get()).data()!;
    expect(b.serviceIds).toEqual(["corte-barba"]);
    expect(b.serviceNames).toEqual(["Corte + barba"]);
    expect(b.value).toBe(75);
    expect((await pagamentoRef().get()).get("grossAmount")).toBe(75);
    expect((await pagamentoRef().get()).get("paymentMethod")).toBe("cash");
  });
});

describe("taxa congelada (08/10)", () => {
  it("forma trocada: vale a taxa de hoje da forma nova", async () => {
    await semearConcluido({ metodo: "credit" });
    await editar({ serviceIds: ["corte"], metodo: "debit", fees: { ...TAXAS, debito: 2.5 } });
    const p = (await pagamentoRef().get()).data()!;
    expect(p.feePct).toBe(2.5);
    expect(p.feeAmount).toBe(1.25);
  });
  it("forma igual: a edição de serviço reaproveita a taxa do dia do pagamento", async () => {
    await semearConcluido({ metodo: "credit" });
    /* Pago a 3,49%; o dono subiu o crédito para 4,99% depois. */
    const r = await editar({ serviceIds: ["corte"], metodo: "credit", fees: { ...TAXAS, credito: 4.99 } });
    expect(r.depois.cobrado).toBe(50);
    const p = (await pagamentoRef().get()).data()!;
    expect(p.feePct).toBe(3.49);
    expect(p.feeAmount).toBe(1.75);
    expect(p.netAmount).toBe(48.25);
  });
});
