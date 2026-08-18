import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAMPOS_CORRIGIVEIS,
  camposDaCorrecao,
  dentroDaJanela,
  FRASE_DA_RECUSA,
  idDaCorrecao,
  motivoDaRecusa,
} from "../correcao-de-pagamento";
import { decidirEfeito, SEM_TAXA, type PaymentFees } from "../financial-events";
import { valoresDoPagamento } from "../payments";
import { hojeNoFuso } from "../locale";

/**
 * R1 — as decisões puras da correção de pagamento.
 *
 * O que só o emulador prova (atomicidade, congelados, idempotência de verdade)
 * está em `correcao-transacao.test.ts`. Aqui ficam as regras que decidem, e que
 * dentro de um `runTransaction` só se exerceriam com infraestrutura.
 */

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0.99, debito: 1.99, credito: 3.49 };

/** O caso feliz, para cada teste mudar só o que lhe interessa. */
const PODE = {
  temPagamento: true,
  origemDoPagamento: "servico" as string | null | undefined,
  jaEstornado: false,
  temReserva: true,
  statusDaReserva: "completed" as string | null | undefined,
  dataDoPagamento: "2026-08-10",
  hoje: "2026-08-18",
  metodoAtual: "pix" as const,
  metodoNovo: "cash" as const,
};

const FONTE = readFileSync(resolve(__dirname, "../correcao-de-pagamento.ts"), "utf8");

/* ================================================================== */
/* T9 · a fórmula NÃO foi reimplementada                              */
/* ================================================================== */

describe("R1 · os quatro campos saem de `valoresDoPagamento`", () => {
  /* O defeito mais encontrado nesta base é a mesma fórmula escrita três vezes,
   * com a correção aplicada num caminho só. Este bloco é o que impede a quarta
   * cópia: se alguém recalcular a taxa aqui dentro, os números divergem. */
  it.each(["pix", "cash", "debit", "credit"] as const)(
    "%s bate exatamente com a fonte única",
    (metodo) => {
      const bruto = 137.77;
      const nossos = camposDaCorrecao({ bruto, metodo, fees: TAXAS });
      const dela = valoresDoPagamento({ bruto, metodo, fees: TAXAS });

      expect(nossos.feePct).toBe(dela.feePct);
      expect(nossos.feeAmount).toBe(dela.feeAmount);
      expect(nossos.netAmount).toBe(dela.netAmount);
      expect(nossos.paymentMethod).toBe(metodo);
    }
  );

  it("a fonte não tem conta de taxa própria — ela delega", () => {
    /* Estrutural, e vale pelo mesmo motivo que `autorizacao-functions.test.ts`
     * lê código-fonte: pega a cópia NOVA, que é a que ninguém lembra de testar. */
    expect(FONTE).toContain("valoresDoPagamento");
    expect(FONTE).not.toMatch(/\*\s*feePct\s*\)\s*\/\s*100/);
    expect(FONTE).not.toContain("taxaDoMetodo(");
  });

  it("devolve EXATAMENTE os quatro campos, e nada mais", () => {
    /* `valoresDoPagamento` também calcula `grossAmount`. Se ele vazar para o
     * `update`, a correção reescreve um campo congelado. */
    const campos = camposDaCorrecao({ bruto: 50, metodo: "credit", fees: TAXAS });
    expect(Object.keys(campos).sort()).toEqual([...CAMPOS_CORRIGIVEIS].sort());
    expect(campos).not.toHaveProperty("grossAmount");
  });

  it("os quatro são o conjunto que o contrato declara", () => {
    expect([...CAMPOS_CORRIGIVEIS]).toEqual([
      "paymentMethod",
      "feePct",
      "feeAmount",
      "netAmount",
    ]);
  });

  it("nunca devolve `netAmount` indefinido — as telas cairiam no bruto sem erro", () => {
    /* `analytics.ts:350` e `fluxo-de-caixa.ts:138` fazem `netAmount ??
     * grossAmount`: um `undefined` gravado aqui não quebraria nada, só faria o
     * caixa mostrar o valor errado em silêncio. */
    for (const metodo of ["pix", "cash", "debit", "credit"] as const) {
      const c = camposDaCorrecao({ bruto: 0, metodo, fees: SEM_TAXA });
      expect(Number.isFinite(c.netAmount)).toBe(true);
      expect(Number.isFinite(c.feeAmount)).toBe(true);
      expect(Number.isFinite(c.feePct)).toBe(true);
    }
  });

  it("taxa zerada é taxa zero, não taxa ausente", () => {
    const c = camposDaCorrecao({ bruto: 50, metodo: "credit", fees: SEM_TAXA });
    expect(c).toEqual({
      paymentMethod: "credit",
      feePct: 0,
      feeAmount: 0,
      netAmount: 50,
    });
  });
});

/* ================================================================== */
/* T5 · a janela do mês corrente, e a virada no fuso da barbearia     */
/* ================================================================== */

describe("R1 · a janela é o mês corrente, pelo `date` do pagamento", () => {
  it("aceita o mesmo mês", () => {
    expect(dentroDaJanela("2026-08-01", "2026-08-31")).toBe(true);
    expect(dentroDaJanela("2026-08-31", "2026-08-01")).toBe(true);
  });

  it("recusa o mês anterior, ainda que por um dia", () => {
    expect(dentroDaJanela("2026-07-31", "2026-08-01")).toBe(false);
  });

  it("recusa o mesmo mês de outro ano", () => {
    expect(dentroDaJanela("2025-08-10", "2026-08-10")).toBe(false);
  });

  it("🕐 31/07 23:50 em São Paulo NÃO é agosto", () => {
    /* O caso que o briefing nomeia. O processo roda em UTC: às 23h50 de 31/07
     * em São Paulo já é 01/08 em UTC, e uma janela decidida com `new Date()`
     * recusaria uma correção legítima do último dia do mês — por três horas de
     * diferença, sem deixar rastro.
     *
     * A prova é dupla: o instante REALMENTE já virou em UTC, e mesmo assim a
     * janela da barbearia continua em julho. */
    const instante = new Date("2026-08-01T02:50:00Z"); // 31/07 23:50 em São Paulo

    expect(hojeNoFuso("UTC", instante)).toBe("2026-08-01");
    const hoje = hojeNoFuso("America/Sao_Paulo", instante);
    expect(hoje).toBe("2026-07-31");

    expect(dentroDaJanela("2026-07-15", hoje)).toBe(true);
    // E o mesmo pagamento seria recusado se a janela tivesse sido decidida em UTC.
    expect(dentroDaJanela("2026-07-15", hojeNoFuso("UTC", instante))).toBe(false);
  });

  it("🕐 e a virada ao contrário: 01/08 00:10 em São Paulo já é agosto", () => {
    const instante = new Date("2026-08-01T03:10:00Z");
    const hoje = hojeNoFuso("America/Sao_Paulo", instante);
    expect(hoje).toBe("2026-08-01");
    expect(dentroDaJanela("2026-07-31", hoje)).toBe(false);
  });

  it("a callable lê `hojeNoFuso` da barbearia, e não a data do processo", () => {
    expect(FONTE).toContain("hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone)");
  });
});

/* ================================================================== */
/* T7 e T8 · as recusas                                               */
/* ================================================================== */

describe("R1 · o que a correção recusa", () => {
  it("o caso feliz não é recusado", () => {
    expect(motivoDaRecusa(PODE)).toBeNull();
  });

  it("T7 · sem `PaymentDoc` — coberto pelo plano — recusa", () => {
    /* R1.3 proíbe criar fato novo. A mensalidade já é a receita daquele corte:
     * criar um pagamento aqui somaria o mesmo dinheiro duas vezes. */
    expect(motivoDaRecusa({ ...PODE, temPagamento: false })).toBe("sem_pagamento");
  });

  it("T8 · método novo igual ao atual — recusa", () => {
    /* Cenário 4 da matriz: Pix → Pix não tem efeito financeiro adicional, e não
     * pode gerar evento de auditoria de uma correção que não corrigiu. */
    expect(motivoDaRecusa({ ...PODE, metodoAtual: "pix", metodoNovo: "pix" })).toBe(
      "mesmo_metodo"
    );
  });

  it("pagamento JÁ ESTORNADO — recusa, e não propaga", () => {
    /* `refunds.ts:386` congelou o método antigo dentro do `RefundDoc`. Corrigir
     * o pagamento deixaria os dois documentos contando histórias diferentes, e
     * escolher qual deles muda é decisão que o R1 não tem. */
    expect(motivoDaRecusa({ ...PODE, jaEstornado: true })).toBe("ja_estornado");
  });

  it("fora do mês corrente — recusa", () => {
    expect(motivoDaRecusa({ ...PODE, dataDoPagamento: "2026-07-30" })).toBe(
      "fora_da_janela"
    );
  });

  it("reserva que não está mais lá — recusa", () => {
    expect(motivoDaRecusa({ ...PODE, temReserva: false })).toBe("reserva_ausente");
  });

  it.each(["confirmed", "no_show", "cancelled_by_shop", "pending_payment"])(
    "reserva em `%s` — recusa: só concluído tem pagamento a corrigir",
    (status) => {
      expect(motivoDaRecusa({ ...PODE, statusDaReserva: status })).toBe("nao_concluido");
    }
  );

  it("pagamento de produto ou mensalidade — recusa: o escopo é serviço", () => {
    /* Decisão D: `inventory.ts:586` e `mensalistas.ts:543` exigem o método na
     * origem, então o caso 1 é impossível ali. */
    expect(motivoDaRecusa({ ...PODE, origemDoPagamento: "produto" })).toBe("nao_e_servico");
    expect(motivoDaRecusa({ ...PODE, origemDoPagamento: "mensalidade" })).toBe(
      "nao_e_servico"
    );
  });

  it("pagamento de serviço ANTERIOR ao G1.6, sem `origin`, é aceito", () => {
    /* O campo só passou a ser gravado nesta origem no G1.6. Recusar por ausência
     * excluiria justamente o histórico mais antigo — que é o que mais precisa
     * de correção. */
    expect(motivoDaRecusa({ ...PODE, origemDoPagamento: undefined })).toBeNull();
    expect(motivoDaRecusa({ ...PODE, origemDoPagamento: null })).toBeNull();
  });

  it("corrigir a partir de `null` é o caso 1, e é permitido", () => {
    /* O atendimento que o plano não cobriu: `PaymentDoc` existe com
     * `paymentMethod: null` e taxa zero. É a razão de o R1 existir. */
    expect(motivoDaRecusa({ ...PODE, metodoAtual: null, metodoNovo: "cash" })).toBeNull();
  });

  it("o estorno é recusado ANTES da janela — é o fato mais forte", () => {
    /* Ordem deliberada: mudar de mês não resolveria um estorno. A frase que o
     * dono lê precisa ser a que explica o que de fato aconteceu. */
    expect(
      motivoDaRecusa({ ...PODE, jaEstornado: true, dataDoPagamento: "2026-01-02" })
    ).toBe("ja_estornado");
  });

  it("toda recusa tem uma frase, e nenhuma é técnica", () => {
    for (const [motivo, frase] of Object.entries(FRASE_DA_RECUSA)) {
      expect(frase.length, motivo).toBeGreaterThan(20);
      expect(frase, motivo).not.toMatch(/undefined|null|PaymentDoc|Firestore|error/i);
    }
  });
});

/* ================================================================== */
/* T4 · idempotência por construção                                   */
/* ================================================================== */

describe("R1 · o id do evento de auditoria é DERIVADO", () => {
  it("mesma correção, mesmo id", () => {
    expect(idDaCorrecao("b1", "k1")).toBe(idDaCorrecao("b1", "k1"));
  });

  it("correções diferentes, ids diferentes", () => {
    expect(idDaCorrecao("b1", "k1")).not.toBe(idDaCorrecao("b1", "k2"));
    expect(idDaCorrecao("b1", "k1")).not.toBe(idDaCorrecao("b2", "k1"));
  });

  it("o `audit_log` NUNCA é gravado com `.doc()` automático", () => {
    /* É o único ponto do R1 que duplica: não existe trigger sobre `payments` e
     * nenhum agregado é pré-computado, então o dinheiro não soma duas vezes —
     * mas o log ganharia uma linha por retry se o id fosse sorteado. */
    expect(FONTE).toContain('doc(idDaCorrecao(bookingId, params.chave))');
    expect(FONTE).not.toMatch(/collection\("audit_log"\)\.doc\(\)/);
    expect(FONTE).not.toMatch(/audit_log[\s\S]{0,80}\.add\(/);
  });

  it("a chave vira id de documento, e é sanitizada antes", () => {
    /* Uma chave com "/" criaria uma subcoleção em vez de um evento, e o
     * Firestore aceitaria sem reclamar. */
    expect(FONTE).toContain('replace(/[^A-Za-z0-9_-]/g, "")');
  });
});

/* ================================================================== */
/* T6 · O INVARIANTE DO QUAL O R1 PASSA A DEPENDER                    */
/* ================================================================== */

describe("R1 · o invariante do qual a correção depende — cenário 6", () => {
  /**
   * Este bloco não testa código do R1. Testa a premissa que o R1 assume sobre
   * um arquivo que ele não pode alterar, e é o teste mais importante do
   * conjunto.
   *
   * A correção escreve em `bookings.paymentMethod`, e toda escrita em `bookings`
   * acorda `materializeFinancialsOnCompletion`. O que impede o trigger de
   * rematerializar o pagamento por cima da correção — relendo policies e staff
   * de HOJE, com `set` sem merge (`financial-events.ts:513`) — é uma única
   * linha: `decidirEfeito("completed", "completed") === "nada"`.
   *
   * Se essa linha mudar, a correção do R1 é apagada em silêncio e a comissão
   * volta a ser recalculada do cadastro atual. Sem este teste, a dependência
   * seria confiança.
   */
  it("🔒 `completed` → `completed` não faz NADA — a correção não é rematerializada", () => {
    expect(decidirEfeito("completed", "completed")).toBe("nada");
  });

  it("🔒 e as duas pernas do 'Veio depois' continuam sendo o que eram", () => {
    /* Documentado, não consertado: `financial-events.ts` é território bloqueado.
     * O R1 registra de que caminho ele depende, para que a integração saiba
     * onde olhar.
     *
     *   completed → no_show   "reverter"      → pagamentoRef.delete()   :387
     *   no_show → completed   "materializar"  → pagamentoRef.set({...}) :513  sem merge
     *
     * Uma correção do R1 PODE ser apagada por esse par. O botão existe
     * ("Veio depois", `page.tsx:691`), e a verificação é da integração. */
    expect(decidirEfeito("completed", "no_show")).toBe("reverter");
    expect(decidirEfeito("no_show", "completed")).toBe("materializar");
  });

  it("🔒 e a rematerialização continua sendo `set` sem merge — o risco é real, não hipotético", () => {
    const fonte = readFileSync(resolve(__dirname, "../financial-events.ts"), "utf8");
    /* Se um dia isto virar `set(..., { merge: true })`, este teste falha — e a
     * falha é uma BOA notícia que precisa ser lida, não silenciada: significa
     * que o risco do cenário 6 mudou de natureza. */
    expect(fonte).toContain("pagamentoRef.delete()");
    expect(fonte).toMatch(/pagamentoRef\.set\(\{/);
  });
});

/* ================================================================== */
/* T3 (parte estrutural) · `update`, nunca `set`, nunca delete+create */
/* ================================================================== */

describe("R1 · a correção ALTERA, não reescreve", () => {
  it("🔒 usa `tx.update` no pagamento e na reserva", () => {
    expect(FONTE).toContain("tx.update(pagamentoRef, para)");
    expect(FONTE).toContain("tx.update(reservaRef, { paymentMethod: params.metodo })");
  });

  it("🔒 NUNCA usa `set` sem merge no pagamento nem na reserva", () => {
    /* É o caminho de fuga que apaga histórico: `set` sem `{ merge: true }`
     * reescreve o documento inteiro e leva junto `createdAt`, `origin` e
     * `paymentOrigin`. O único `set` permitido aqui é o do `audit_log`, que é um
     * documento NOVO. */
    expect(FONTE).not.toMatch(/tx\.set\(pagamentoRef/);
    expect(FONTE).not.toMatch(/tx\.set\(reservaRef/);
    expect(FONTE).not.toMatch(/pagamentoRef\.set\(/);
    expect(FONTE).not.toMatch(/reservaRef\.set\(/);
  });

  it("🔒 NUNCA apaga nada", () => {
    expect(FONTE).not.toMatch(/\.delete\(\)/);
    expect(FONTE).not.toContain("FieldValue.delete");
  });

  it("🔒 o `PaymentDoc` não ganha flag de corrigido", () => {
    /* Decisão C: o rastro é o `audit_log`, imutável. Uma marca no pagamento
     * contradiria a trava dos quatro campos. */
    expect(FONTE).not.toMatch(/corrigidoEm|corrigidoPor|corrigido:/);
  });

  it("🔒 pagamento, reserva e log estão na MESMA transação", () => {
    /* "booking e payment nunca podem terminar divergentes." O log entra junto
     * porque `subscription.ts:156` usa `.add()` fora da transação e NÃO é
     * atômico — a atomicidade exigida escolhe o outro precedente. */
    const transacao = FONTE.slice(
      FONTE.indexOf("return db.runTransaction"),
      FONTE.indexOf("/* ==================================================================\n/* A porta de entrada")
    );
    expect(transacao).toContain("tx.update(pagamentoRef");
    expect(transacao).toContain("tx.update(reservaRef");
    expect(transacao).toContain("tx.set(logRef");
  });

  it("🔒 todas as leituras vêm antes de qualquer escrita", () => {
    /* O Firestore recusa uma leitura posterior a uma escrita na mesma
     * transação, e o erro só aparece em runtime. */
    const primeiraEscrita = FONTE.indexOf("tx.update(");
    for (const leitura of ["tx.get(pagamentoRef)", "tx.get(reservaRef)", "tx.get(logRef)"]) {
      expect(FONTE.indexOf(leitura), leitura).toBeLessThan(primeiraEscrita);
    }
  });
});

/* ================================================================== */
/* A guarda, o escopo e o rastro                                      */
/* ================================================================== */

describe("R1 · permissão e rastro", () => {
  it("🔒 é DONO-ONLY, como `registrarEstorno`", () => {
    expect(FONTE).toContain('papel !== "owner"');
    expect(FONTE).toContain("token.barbershops");
    expect(FONTE).toContain("permission-denied");
  });

  it("🔒 exige autenticação antes de qualquer coisa", () => {
    const inicio = FONTE.indexOf("export const corrigirPagamentoDeAtendimento");
    const corpo = FONTE.slice(inicio);
    expect(corpo.indexOf("unauthenticated")).toBeLessThan(corpo.indexOf("getFirestore()"));
  });

  it("o evento segue o vocabulário da casa: dominio.verbo_no_particípio", () => {
    expect(FONTE).toContain('action: "payment.corrigido"');
  });

  it("o evento guarda de/para dos quatro campos, quem e quando", () => {
    /* §26 item 1. As chaves `de`/`para` seguem `subscription.ts:160`, o único
     * precedente com esse formato. */
    expect(FONTE).toContain("detail: { bookingId, paymentId, de, para }");
    expect(FONTE).toContain("by: params.autor");
    expect(FONTE).toContain("at: FieldValue.serverTimestamp()");
  });

  it("valida o método com a MESMA função de venda e mensalidade", () => {
    expect(FONTE).toContain("metodoValido(data.paymentMethod)");
  });

  it("a taxa é a de HOJE, com o merge raso sobre `SEM_TAXA`", () => {
    /* R1.1: tabela vigente na correção, sem versionamento. */
    expect(FONTE).toContain("{ ...SEM_TAXA, ...(policies.paymentFees ?? {}) }");
  });

  it("o bruto sai do PAGAMENTO congelado, nunca de `booking.value`", () => {
    /* O preço do serviço pode ter mudado; recalcular a taxa sobre o preço de
     * hoje faria a correção do meio de pagamento alterar o valor recebido. */
    expect(FONTE).toContain('Number(pagamentoSnap.get("grossAmount"))');
    expect(FONTE).not.toMatch(/reservaSnap\.get\("value"\)/);
  });
});
