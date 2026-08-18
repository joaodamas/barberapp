import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarCorrecao, idDaCorrecao } from "../correcao-de-pagamento";
import { documentoDePagamento, valoresDoPagamento } from "../payments";
import type { PaymentFees, PaymentMethod } from "../financial-events";

/**
 * R1 — a correção de pagamento contra o emulador.
 *
 * `correcao-de-pagamento.test.ts` prova as regras puras. O que só aqui pode ser
 * provado é o que ACONTECE com os documentos:
 *
 *  1. pagamento e reserva terminam IGUAIS — nunca divergentes;
 *  2. um único `PaymentDoc`, com a mesma identidade de antes;
 *  3. os campos congelados ficam parados, um a um;
 *  4. só os quatro campos mudam;
 *  5. atomicidade: o log falha e o pagamento NÃO muda;
 *  6. atomicidade ao contrário: a correção recusada não deixa log;
 *  7. idempotência: duas chamadas, um pagamento e UM `audit_log`;
 *  8. a taxa entra uma vez só — caixa e DRE não somam duas;
 *  9. nada é implementado como `delete` + `create`.
 *
 * Exige o emulador:  npm run test:correcao
 */

const PROJETO = "correcao-r1";
const SHOP = "barbearia-teste";
const ATENDIMENTO_EM = "2026-08-10";
const HOJE = "2026-08-18";

/** A tabela vigente HOJE — R1.1. */
const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

const BRUTO = 50;
const BOOKING = "b1";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);
const pagamentoRef = () => shopRef().collection("payments").doc(`pagamento_${BOOKING}`);
const reservaRef = () => shopRef().collection("bookings").doc(BOOKING);

/** Chama a MESMA transação da function, não uma cópia da sequência. */
function corrigir(params: {
  metodo: PaymentMethod;
  chave?: string;
  hoje?: string;
  bookingId?: string;
  autor?: string | null;
}) {
  return gravarCorrecao({
    db,
    shopRef: shopRef(),
    bookingId: params.bookingId ?? BOOKING,
    metodo: params.metodo,
    fees: TAXAS,
    hoje: params.hoje ?? HOJE,
    chave: params.chave ?? "k1",
    autor: params.autor === undefined ? "dono-1" : params.autor,
  });
}

/**
 * O estado que o servidor produz hoje ao concluir um atendimento.
 *
 * Espelha `materializeFinancialsOnCompletion`: o mesmo `documentoDePagamento`,
 * mais o `createdAt` que o trigger acrescenta. Semear à mão os campos um a um
 * faria o teste provar a correção contra um documento que o produto não gera.
 */
async function semearAtendimentoConcluido(metodo: PaymentMethod | null) {
  await pagamentoRef().set({
    ...documentoDePagamento({
      ref: { origem: "servico", bookingId: BOOKING },
      clientId: "c1",
      date: ATENDIMENTO_EM,
      bruto: BRUTO,
      metodo,
      fees: TAXAS,
    }),
    createdAt: FieldValue.serverTimestamp(),
  });

  await reservaRef().set({
    status: "completed",
    clientId: "c1",
    clientName: "Joana",
    date: ATENDIMENTO_EM,
    time: "10:00",
    value: BRUTO,
    staffId: "s1",
    paymentMethod: metodo,
    paymentOrigin: "in_person",
    serviceIds: ["corte"],
  });
}

const lerPagamento = async () => (await pagamentoRef().get()).data() ?? {};
const lerReserva = async () => (await reservaRef().get()).data() ?? {};

async function todosOsLogs() {
  const s = await shopRef().collection("audit_log").get();
  return s.docs.map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string });
}

async function quantosPagamentos() {
  return (await shopRef().collection("payments").get()).size;
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:correcao");
  }
  app = initializeApp({ projectId: PROJETO }, `correcao-${Date.now()}`);
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
  await shopRef().set({
    locale: { timeZone: "America/Sao_Paulo", currency: "BRL", locale: "pt-BR" },
    policies: { paymentFees: TAXAS },
  });
});

/* ================================================================== */
/* Cenários 3 e 5 · um pagamento só, e os dois documentos concordando  */
/* ================================================================== */

describe("cenário 3 e 5 · corrige Pix → dinheiro", () => {
  it("continua existindo UM único `PaymentDoc`", async () => {
    await semearAtendimentoConcluido("pix");
    expect(await quantosPagamentos()).toBe(1);

    await corrigir({ metodo: "cash" });

    expect(await quantosPagamentos()).toBe(1);
  });

  it("e é o MESMO documento — a identidade não muda", async () => {
    await semearAtendimentoConcluido("pix");
    const antes = await pagamentoRef().get();
    const criadoEm = antes.get("createdAt");

    await corrigir({ metodo: "cash" });

    const depois = await pagamentoRef().get();
    expect(depois.id).toBe(`pagamento_${BOOKING}`);
    /* `createdAt` idêntico prova que não houve `delete` + `create`: um documento
     * recriado teria um carimbo novo. */
    expect(depois.get("createdAt")).toEqual(criadoEm);
  });

  it("🔒 `booking` e `payment` terminam IGUAIS", async () => {
    /* O invariante inteiro da decisão B. Corrigir só o pagamento deixa o card
     * crítico na tela para sempre; corrigir só a reserva é o vazamento de hoje. */
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "cash" });

    const pagamento = await lerPagamento();
    const reserva = await lerReserva();
    expect(pagamento.paymentMethod).toBe("cash");
    expect(reserva.paymentMethod).toBe("cash");
    expect(reserva.paymentMethod).toBe(pagamento.paymentMethod);
  });

  it("os quatro campos batem com `valoresDoPagamento` — a fórmula não foi copiada", async () => {
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "credit" });

    const esperado = valoresDoPagamento({ bruto: BRUTO, metodo: "credit", fees: TAXAS });
    const p = await lerPagamento();
    expect(p.paymentMethod).toBe("credit");
    expect(p.feePct).toBe(esperado.feePct);
    expect(p.feeAmount).toBe(esperado.feeAmount);
    expect(p.netAmount).toBe(esperado.netAmount);
    // R$ 50,00 a 3,49% = R$ 1,745 → R$ 1,75 (meio centavo arredondado para cima)
    expect(p.feeAmount).toBe(1.75);
    expect(p.netAmount).toBe(48.25);
  });

  it("`netAmount` é gravado como número, nunca `undefined`", async () => {
    /* `analytics.ts:350` e `fluxo-de-caixa.ts:138` fazem `netAmount ??
     * grossAmount`: um `undefined` faria as telas caírem no bruto sem erro
     * visível — o dono veria R$ 50,00 onde entraram R$ 48,25. */
    await semearAtendimentoConcluido("pix");
    await corrigir({ metodo: "credit" });

    const p = await lerPagamento();
    expect(typeof p.netAmount).toBe("number");
    expect(p.netAmount).not.toBeUndefined();
  });
});

/* ================================================================== */
/* Caso 1 · o atendimento que o plano não cobriu                      */
/* ================================================================== */

describe("caso 1 · o `PaymentDoc` que nasceu sem método", () => {
  it("corrige de `null` para dinheiro, e a taxa deixa de ser zero por ignorância", async () => {
    /* O caso estrutural do R1: o dono concluiu como coberto, o plano não
     * cobriu, e o pagamento nasceu com método nulo e taxa zero. */
    await semearAtendimentoConcluido(null);
    const antes = await lerPagamento();
    expect(antes.paymentMethod).toBeNull();
    expect(antes.feePct).toBe(0);

    const r = await corrigir({ metodo: "debit" });

    expect(r.de.paymentMethod).toBeNull();
    expect(r.para.paymentMethod).toBe("debit");
    const p = await lerPagamento();
    expect(p.paymentMethod).toBe("debit");
    expect(p.feePct).toBe(1.99);
    expect(p.feeAmount).toBe(1);
    expect(p.netAmount).toBe(49);
  });

  it("e a reserva deixa de estar sem método — o card crítico some pelo motivo certo", async () => {
    await semearAtendimentoConcluido(null);
    await corrigir({ metodo: "cash" });

    /* O filtro do card é `completed && !paymentMethod && !cobertoPeloPlano`. Ele
     * some porque o pagamento agora EXISTE com método — não porque alguém
     * preencheu `bookings` e deixou o dinheiro para trás. */
    expect((await lerReserva()).paymentMethod).toBe("cash");
    expect((await lerPagamento()).paymentMethod).toBe("cash");
  });
});

/* ================================================================== */
/* T3 · os congelados, um a um                                        */
/* ================================================================== */

describe("T3 · o histórico fica parado", () => {
  it("🔒 cada campo congelado continua idêntico, conferido um a um", async () => {
    await semearAtendimentoConcluido("pix");
    const antes = await lerPagamento();

    await corrigir({ metodo: "credit" });
    const depois = await lerPagamento();

    for (const campo of [
      "origin",
      "bookingId",
      "clientId",
      "date",
      "paymentOrigin",
      "grossAmount",
      "createdAt",
    ]) {
      expect(depois[campo], campo).toEqual(antes[campo]);
    }
  });

  it("🔒 e SÓ os quatro campos mudaram — nenhum outro se mexeu", async () => {
    await semearAtendimentoConcluido("pix");
    const antes = await lerPagamento();

    await corrigir({ metodo: "credit" });
    const depois = await lerPagamento();

    const mudaram = Object.keys(depois).filter(
      (k) => JSON.stringify(depois[k]) !== JSON.stringify(antes[k])
    );
    expect(mudaram.sort()).toEqual(["feeAmount", "feePct", "netAmount", "paymentMethod"]);
  });

  it("🔒 nenhum campo é acrescentado nem removido", async () => {
    /* Uma flag de "corrigido" no `PaymentDoc` entraria aqui — decisão C diz que
     * ela não existe: o rastro é o `audit_log`. */
    await semearAtendimentoConcluido("pix");
    const antes = Object.keys(await lerPagamento()).sort();

    await corrigir({ metodo: "cash" });

    expect(Object.keys(await lerPagamento()).sort()).toEqual(antes);
  });

  it("🔒 a data NÃO muda — nada atravessa mês", async () => {
    /* É o que sustenta a decisão R1.2. O efeito da correção é de seis leituras
     * DENTRO do mês; se `date` andasse, o fechamento de dois meses mudaria. */
    await semearAtendimentoConcluido("pix");
    await corrigir({ metodo: "credit" });

    expect((await lerPagamento()).date).toBe(ATENDIMENTO_EM);
  });

  it("🔒 a reserva só muda `paymentMethod` — status, valor e data ficam", async () => {
    await semearAtendimentoConcluido("pix");
    const antes = await lerReserva();

    await corrigir({ metodo: "cash" });
    const depois = await lerReserva();

    const mudaram = Object.keys(depois).filter(
      (k) => JSON.stringify(depois[k]) !== JSON.stringify(antes[k])
    );
    expect(mudaram).toEqual(["paymentMethod"]);
    expect(depois.status).toBe("completed");
    expect(depois.value).toBe(BRUTO);
  });

  it("🔒 o bruto é o CONGELADO, mesmo que o preço do serviço tenha mudado", async () => {
    await semearAtendimentoConcluido("pix");
    // O serviço subiu de preço depois do atendimento.
    await reservaRef().update({ value: 90 });

    await corrigir({ metodo: "credit" });

    const p = await lerPagamento();
    expect(p.grossAmount).toBe(BRUTO);
    // A taxa é sobre 50, não sobre 90.
    expect(p.feeAmount).toBe(1.75);
  });
});

/* ================================================================== */
/* T1 · atomicidade                                                   */
/* ================================================================== */

describe("T1 · atomicidade — os três nunca terminam divergentes", () => {
  it("🔒 o log falha DENTRO da transação e o pagamento NÃO muda", async () => {
    /* A falha é real, e o ponto dela é ONDE acontece: o Firestore recusa array
     * aninhado como valor de campo, e a recusa estoura no `tx.set` do log —
     * DEPOIS de os dois `tx.update` já terem sido enfileirados. Se as escritas
     * não fossem atômicas, o pagamento sairia corrigido e o histórico ficaria
     * sem o registro que o §26 exige.
     *
     * O `by` é só o canal de injeção mais curto; a callable sempre passa o
     * `uid`. O que está sob teste é a transação, não o campo.
     *
     * ⚠️ `undefined` NÃO serve aqui: o Admin SDK o aceita em silêncio (a
     * primeira versão deste teste tentou por aí e a correção passou inteira). */
    await semearAtendimentoConcluido("pix");
    const antes = await lerPagamento();

    await expect(
      corrigir({ metodo: "cash", autor: [[1]] as unknown as null })
    ).rejects.toThrow();

    expect(await lerPagamento()).toEqual(antes);
    expect((await lerReserva()).paymentMethod).toBe("pix");
    expect(await todosOsLogs()).toHaveLength(0);
  });

  it("🔒 e a correção recusada não deixa log nem toca no pagamento", async () => {
    /* O outro sentido: nunca existe evento de auditoria sem a alteração
     * correspondente. */
    await semearAtendimentoConcluido("pix");
    const antes = await lerPagamento();

    await expect(corrigir({ metodo: "pix" })).rejects.toThrow(/já é o meio de pagamento/);

    expect(await lerPagamento()).toEqual(antes);
    expect((await lerReserva()).paymentMethod).toBe("pix");
    expect(await todosOsLogs()).toHaveLength(0);
  });

  it("🔒 depois de uma correção bem-sucedida, os três contam a MESMA história", async () => {
    await semearAtendimentoConcluido(null);

    await corrigir({ metodo: "credit" });

    const pagamento = await lerPagamento();
    const reserva = await lerReserva();
    const [log] = await todosOsLogs();
    const detail = log.detail as { para: { paymentMethod: string }; de: { paymentMethod: null } };

    expect(pagamento.paymentMethod).toBe("credit");
    expect(reserva.paymentMethod).toBe("credit");
    expect(detail.para.paymentMethod).toBe("credit");
    expect(detail.de.paymentMethod).toBeNull();
  });
});

/* ================================================================== */
/* T4 e cenário 9 · idempotência e auditoria                          */
/* ================================================================== */

describe("T4 e cenário 9 · corrigir duas vezes", () => {
  it("🔒 a mesma chave devolve a correção anterior, sem gravar de novo", async () => {
    await semearAtendimentoConcluido("pix");

    const primeira = await corrigir({ metodo: "cash", chave: "k1" });
    const segunda = await corrigir({ metodo: "cash", chave: "k1" });

    expect(primeira.repetida).toBe(false);
    expect(segunda.repetida).toBe(true);
    expect(segunda.para).toEqual(primeira.para);
    expect(segunda.de).toEqual(primeira.de);
  });

  it("🔒 duas chamadas → UM pagamento e EXATAMENTE UM `audit_log`", async () => {
    /* O `audit_log` é o único ponto do R1 que duplicaria: não existe trigger
     * sobre `payments`, então o dinheiro não soma duas vezes — mas o log
     * ganharia uma linha por retry se o id fosse sorteado. */
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "cash", chave: "k1" });
    await corrigir({ metodo: "cash", chave: "k1" });

    expect(await quantosPagamentos()).toBe(1);
    const logs = await todosOsLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(idDaCorrecao(BOOKING, "k1"));
    expect(logs[0].action).toBe("payment.corrigido");
  });

  it("🔒 o retry NÃO reaplica a taxa nem muda o valor", async () => {
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "credit", chave: "k1" });
    const depoisDaPrimeira = await lerPagamento();
    await corrigir({ metodo: "credit", chave: "k1" });

    expect(await lerPagamento()).toEqual(depoisDaPrimeira);
  });

  it("🔒 mesma chave em concorrência não grava dois logs", async () => {
    await semearAtendimentoConcluido("pix");

    const rs = await Promise.allSettled([
      corrigir({ metodo: "cash", chave: "k1" }),
      corrigir({ metodo: "cash", chave: "k1" }),
    ]);

    /* Uma das duas pode falhar por contenção — o que não pode é as duas
     * gravarem. O que se prova aqui é o estado final, não qual delas venceu. */
    expect(rs.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await todosOsLogs()).toHaveLength(1);
    expect(await quantosPagamentos()).toBe(1);
    expect((await lerPagamento()).paymentMethod).toBe("cash");
  });

  it("uma correção NOVA, com chave nova, é um segundo evento — e está certo", async () => {
    /* Dinheiro → crédito depois de Pix → dinheiro são duas correções de
     * verdade. "Um único evento" é sobre o retry, não sobre o histórico. */
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "cash", chave: "k1" });
    await corrigir({ metodo: "credit", chave: "k2" });

    expect(await todosOsLogs()).toHaveLength(2);
    expect(await quantosPagamentos()).toBe(1);
    expect((await lerPagamento()).paymentMethod).toBe("credit");
  });

  it("o evento guarda de/para dos quatro campos, quem e quando", async () => {
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "credit", chave: "k1" });

    const [log] = await todosOsLogs();
    expect(log.by).toBe("dono-1");
    expect(log.at).toBeTruthy();
    const detail = log.detail as Record<string, Record<string, unknown>>;
    expect(detail.bookingId).toBe(BOOKING);
    expect(detail.paymentId).toBe(`pagamento_${BOOKING}`);
    expect(Object.keys(detail.de).sort()).toEqual([
      "feeAmount",
      "feePct",
      "netAmount",
      "paymentMethod",
    ]);
    expect(Object.keys(detail.para).sort()).toEqual([
      "feeAmount",
      "feePct",
      "netAmount",
      "paymentMethod",
    ]);
    expect(detail.de.paymentMethod).toBe("pix");
    expect(detail.de.feePct).toBe(0.99);
    expect(detail.para.paymentMethod).toBe("credit");
    expect(detail.para.feePct).toBe(3.49);
  });
});

/* ================================================================== */
/* Cenário 7 · a taxa entra uma vez só                                */
/* ================================================================== */

describe("cenário 7 · atualizar a taxa reflete UMA única vez", () => {
  it("🔒 a soma de `feeAmount` do mês é a da correção, não a das duas", async () => {
    /* O DRE soma `feeAmount` sobre `payments`, e o Fluxo soma `netAmount`. Com
     * um documento só e `update` no lugar de `set`, o antes não sobrevive para
     * ser somado junto. */
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "credit" });

    const snap = await shopRef().collection("payments").get();
    const totalTaxa = snap.docs.reduce((s, d) => s + (Number(d.get("feeAmount")) || 0), 0);
    const totalLiquido = snap.docs.reduce((s, d) => s + (Number(d.get("netAmount")) || 0), 0);
    const totalBruto = snap.docs.reduce((s, d) => s + (Number(d.get("grossAmount")) || 0), 0);

    expect(snap.size).toBe(1);
    expect(totalTaxa).toBe(1.75);
    expect(totalLiquido).toBe(48.25);
    /* O bruto NÃO muda: no "Caixa de hoje" a coluna migra e o total permanece.
     * É para ser lido como correto, não como bug. */
    expect(totalBruto).toBe(BRUTO);
  });

  it("🔒 três correções seguidas deixam UM pagamento com os valores da última", async () => {
    await semearAtendimentoConcluido(null);

    await corrigir({ metodo: "pix", chave: "k1" });
    await corrigir({ metodo: "debit", chave: "k2" });
    await corrigir({ metodo: "cash", chave: "k3" });

    expect(await quantosPagamentos()).toBe(1);
    const p = await lerPagamento();
    expect(p.paymentMethod).toBe("cash");
    expect(p.feePct).toBe(0);
    expect(p.feeAmount).toBe(0);
    expect(p.netAmount).toBe(BRUTO);
  });
});

/* ================================================================== */
/* T7, T8 e as recusas com o banco na mão                             */
/* ================================================================== */

describe("as recusas, contra o banco", () => {
  it("T7 · sem `PaymentDoc` — coberto pelo plano — recusa e não cria nada", async () => {
    /* R1.3 proíbe criar fato novo: a mensalidade já é a receita daquele corte. */
    await reservaRef().set({
      status: "completed",
      clientId: "c1",
      date: ATENDIMENTO_EM,
      value: BRUTO,
      paymentMethod: null,
      cobertura: { tipo: "plano", subscriptionId: "a1", competencia: "2026-08" },
    });

    await expect(corrigir({ metodo: "cash" })).rejects.toThrow(/não tem pagamento registrado/);

    expect(await quantosPagamentos()).toBe(0);
    expect(await todosOsLogs()).toHaveLength(0);
  });

  it("T8 · método igual ao atual — recusa", async () => {
    await semearAtendimentoConcluido("pix");
    await expect(corrigir({ metodo: "pix" })).rejects.toThrow(/já é o meio de pagamento/);
    expect(await todosOsLogs()).toHaveLength(0);
  });

  it("🔒 pagamento JÁ ESTORNADO — recusa, e o estorno continua intacto", async () => {
    /* `refunds.ts:386` congelou o método no `RefundDoc`. Propagar seria decidir
     * sozinho por onde o dinheiro voltou; aceitar a divergência seria pior. */
    await semearAtendimentoConcluido("pix");
    await shopRef().collection("refunds").doc("r1").set({
      paymentId: `pagamento_${BOOKING}`,
      origin: "servico",
      bookingId: BOOKING,
      grossAmount: 50,
      paymentMethod: "pix",
    });

    await expect(corrigir({ metodo: "cash" })).rejects.toThrow(/já teve devolução/);

    expect((await lerPagamento()).paymentMethod).toBe("pix");
    expect((await lerReserva()).paymentMethod).toBe("pix");
    expect(await todosOsLogs()).toHaveLength(0);
  });

  it("🔒 pagamento de outro mês — recusa", async () => {
    await semearAtendimentoConcluido("pix");
    await pagamentoRef().update({ date: "2026-07-30" });

    await expect(corrigir({ metodo: "cash", hoje: "2026-08-01" })).rejects.toThrow(
      /outro mês/
    );

    expect((await lerPagamento()).paymentMethod).toBe("pix");
  });

  it("🔒 31/07 23:50 em São Paulo ainda é julho, e a correção passa", async () => {
    /* A virada de mês no fuso da barbearia. Com a janela decidida em UTC, esta
     * correção legítima seria recusada por três horas de diferença. */
    await semearAtendimentoConcluido("pix");
    await pagamentoRef().update({ date: "2026-07-15" });

    await corrigir({ metodo: "cash", hoje: "2026-07-31" });

    expect((await lerPagamento()).paymentMethod).toBe("cash");
  });

  it("🔒 reserva NÃO concluída — recusa", async () => {
    await semearAtendimentoConcluido("pix");
    await reservaRef().update({ status: "confirmed" });

    await expect(corrigir({ metodo: "cash" })).rejects.toThrow(/concluído/);
    expect((await lerPagamento()).paymentMethod).toBe("pix");
  });

  it("🔒 pagamento de PRODUTO não é alcançável por aqui", async () => {
    /* O escopo é serviço. O id já separa (`pagamento_venda_{movementId}`), e a
     * origem é conferida de novo — interface não é guarda, e nem id é. */
    await semearAtendimentoConcluido("pix");
    await pagamentoRef().update({ origin: "produto" });

    await expect(corrigir({ metodo: "cash" })).rejects.toThrow(/só o pagamento de atendimento/);
  });
});

/* ================================================================== */
/* Nada é apagado                                                     */
/* ================================================================== */

describe("R1 · nada é implementado como `delete` + `create`", () => {
  it("🔒 a contagem de documentos nunca cai", async () => {
    await semearAtendimentoConcluido("pix");
    const antes = await quantosPagamentos();

    await corrigir({ metodo: "cash", chave: "k1" });
    await corrigir({ metodo: "credit", chave: "k2" });

    expect(await quantosPagamentos()).toBe(antes);
    expect((await reservaRef().get()).exists).toBe(true);
  });

  it("🔒 e o `audit_log` só cresce — o histórico não se reescreve", async () => {
    await semearAtendimentoConcluido("pix");

    await corrigir({ metodo: "cash", chave: "k1" });
    expect(await todosOsLogs()).toHaveLength(1);

    await corrigir({ metodo: "credit", chave: "k2" });
    expect(await todosOsLogs()).toHaveLength(2);

    /* O primeiro evento continua dizendo o que dizia: o segundo não o reescreve. */
    const logs = await todosOsLogs();
    const primeiro = logs.find((l) => l.id === idDaCorrecao(BOOKING, "k1"))!;
    const detail = primeiro.detail as Record<string, Record<string, unknown>>;
    expect(detail.de.paymentMethod).toBe("pix");
    expect(detail.para.paymentMethod).toBe("cash");
  });
});
