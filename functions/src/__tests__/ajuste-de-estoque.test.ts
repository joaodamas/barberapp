import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assinaturaDoAjuste,
  calcularAjuste,
  custoDoAjuste,
  motivoCompleto,
  motivoDeAjusteValido,
  movimentoDeAjuste,
  MOTIVOS_DE_AJUSTE,
} from "../ajuste-de-estoque";

/**
 * Ajustar o estoque — as regras puras.
 *
 * O que só o emulador prova (transação, saldo sob concorrência, idempotência)
 * está em `ajuste-de-estoque-transacao.test.ts`.
 */

describe("calcularAjuste · contagem (define o saldo)", () => {
  it("contou a menos: a diferença é negativa", () => {
    expect(calcularAjuste({ estoqueAtual: 10, pedido: { modo: "contagem", contado: 7 } })).toEqual({
      ok: true,
      delta: -3,
      estoqueDepois: 7,
    });
  });

  it("contou a mais: a diferença é positiva", () => {
    expect(calcularAjuste({ estoqueAtual: 4, pedido: { modo: "contagem", contado: 6 } })).toEqual({
      ok: true,
      delta: 2,
      estoqueDepois: 6,
    });
  });

  it("zerar o estoque é uma contagem válida", () => {
    expect(calcularAjuste({ estoqueAtual: 3, pedido: { modo: "contagem", contado: 0 } })).toEqual({
      ok: true,
      delta: -3,
      estoqueDepois: 0,
    });
  });

  it("contou o mesmo que o sistema diz: nada a ajustar", () => {
    expect(calcularAjuste({ estoqueAtual: 5, pedido: { modo: "contagem", contado: 5 } })).toEqual({
      ok: false,
      motivo: "sem_mudanca",
    });
  });

  it("recusa saldo negativo, fração e texto", () => {
    for (const contado of [-1, 2.5, Number.NaN, "7" as unknown as number, null as unknown as number]) {
      expect(calcularAjuste({ estoqueAtual: 5, pedido: { modo: "contagem", contado } }), String(contado)).toEqual({
        ok: false,
        motivo: "invalido",
      });
    }
  });
});

describe("calcularAjuste · saída sem venda", () => {
  it("baixa o saldo", () => {
    expect(calcularAjuste({ estoqueAtual: 10, pedido: { modo: "saida", quantidade: 2 } })).toEqual({
      ok: true,
      delta: -2,
      estoqueDepois: 8,
    });
  });

  it("pode levar o saldo a zero, nunca abaixo", () => {
    expect(calcularAjuste({ estoqueAtual: 3, pedido: { modo: "saida", quantidade: 3 } })).toMatchObject({
      ok: true,
      estoqueDepois: 0,
    });
    expect(calcularAjuste({ estoqueAtual: 3, pedido: { modo: "saida", quantidade: 4 } })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });

  it("recusa zero, negativo, fração e texto", () => {
    for (const quantidade of [0, -1, 1.5, "2" as unknown as number]) {
      expect(calcularAjuste({ estoqueAtual: 5, pedido: { modo: "saida", quantidade } }), String(quantidade)).toEqual({
        ok: false,
        motivo: "invalido",
      });
    }
  });

  it("estoque ausente ou corrompido vale zero — e a saída é recusada", () => {
    expect(calcularAjuste({ estoqueAtual: Number.NaN, pedido: { modo: "saida", quantidade: 1 } })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });
});

describe("custoDoAjuste · o que entra no DRE", () => {
  it("saída custa quantidade × custo congelado", () => {
    expect(custoDoAjuste(-2, 18)).toBe(36);
    expect(custoDoAjuste(-3, 8.333)).toBe(25); // arredondado ao centavo
  });

  it("entrada por contagem NÃO gera custo nem receita", () => {
    expect(custoDoAjuste(2, 18)).toBe(0);
    expect(custoDoAjuste(0, 18)).toBe(0);
  });

  it("custo ausente ou negativo vale zero", () => {
    expect(custoDoAjuste(-2, Number.NaN)).toBe(0);
    expect(custoDoAjuste(-2, -5)).toBe(0);
  });
});

describe("motivo", () => {
  it("os cinco motivos do pedido", () => {
    expect([...MOTIVOS_DE_AJUSTE]).toEqual(["perda", "uso_interno", "vencido", "contagem", "outro"]);
    expect(motivoDeAjusteValido("perda")).toBe(true);
    expect(motivoDeAjusteValido("roubo")).toBe(false);
    expect(motivoDeAjusteValido(undefined)).toBe(false);
  });

  it('"outro" exige explicação; os demais ignoram o texto', () => {
    expect(motivoCompleto("outro", "  ")).toEqual({ ok: false });
    expect(motivoCompleto("outro", "ab")).toEqual({ ok: false });
    expect(motivoCompleto("outro", "  amostra grátis  ")).toEqual({ ok: true, texto: "amostra grátis" });
    expect(motivoCompleto("perda", "lixo de uma escolha anterior")).toEqual({ ok: true, texto: null });
  });
});

describe("movimentoDeAjuste", () => {
  const base = { productId: "p1", unitCost: 18, reason: "perda" as const, reasonText: null, date: "2026-10-09" };

  it("quantidade ASSINADA, custo congelado, sem preço e SEM `refundOf`", () => {
    const m = movimentoDeAjuste({ ...base, delta: -2 });
    expect(m.kind).toBe("ajuste");
    expect(m.quantity).toBe(-2);
    expect(m.unitCost).toBe(18);
    expect(m.unitPrice).toBe(0);
    expect(m.value).toBe(36);
    expect(m.reason).toBe("perda");
    /* `refundOf` é o que o DRE usa para tratar o ajuste como devolução. Um
     * ajuste manual com ele reduziria o CMV em vez de virar perda. */
    expect(m).not.toHaveProperty("refundOf");
    expect(m.paymentMethod).toBeNull();
    expect(m.staffId).toBeNull();
  });

  it("`value` é sempre positivo, mesmo na entrada por contagem", () => {
    expect(movimentoDeAjuste({ ...base, reason: "contagem", delta: 3 }).value).toBe(54);
  });
});

describe("assinaturaDoAjuste", () => {
  const base = {
    productId: "p1",
    pedido: { modo: "saida", quantidade: 2 } as const,
    reason: "perda" as const,
    reasonText: null,
  };

  it("muda com produto, modo, quantidade, motivo e texto", () => {
    const sig = assinaturaDoAjuste(base);
    expect(assinaturaDoAjuste({ ...base })).toBe(sig);
    expect(assinaturaDoAjuste({ ...base, productId: "p2" })).not.toBe(sig);
    expect(assinaturaDoAjuste({ ...base, pedido: { modo: "saida", quantidade: 3 } })).not.toBe(sig);
    expect(assinaturaDoAjuste({ ...base, pedido: { modo: "contagem", contado: 2 } })).not.toBe(sig);
    expect(assinaturaDoAjuste({ ...base, reason: "vencido" })).not.toBe(sig);
    expect(assinaturaDoAjuste({ ...base, reason: "outro", reasonText: "amostra" })).not.toBe(sig);
  });
});

describe("a porta de entrada", () => {
  const FONTE = readFileSync(resolve(__dirname, "../ajuste-de-estoque.ts"), "utf8");

  it("🔒 só o dono, e a guarda vem antes de tocar no banco", () => {
    expect(FONTE).toContain('papel !== "owner"');
    expect(FONTE).toContain("vinculosDe(request)");
    expect(FONTE).toContain("exigirEdicao(barbershopId)");
    const corpo = FONTE.slice(FONTE.indexOf("export const ajustarEstoque"));
    expect(corpo.indexOf("permission-denied")).toBeLessThan(corpo.indexOf("getFirestore()"));
  });

  it("🔒 a transação lê tudo antes de escrever, e grava saldo e movimento juntos", () => {
    const transacao = FONTE.slice(FONTE.indexOf("return db.runTransaction"));
    expect(transacao.indexOf("tx.get(productRef)")).toBeLessThan(transacao.indexOf("tx.update(productRef"));
    expect(transacao).toContain("tx.update(productRef, { stock: calculo.estoqueDepois })");
    expect(transacao).toContain("tx.set(movementRef");
  });

  it("🔒 a chave de repetição é obrigatória e entra no id do movimento", () => {
    expect(FONTE).toContain("Chave de idempotência ausente");
    expect(FONTE).toContain("`ajuste_manual_${params.chave}`");
  });

  it("nunca apaga nada", () => {
    expect(FONTE).not.toMatch(/\.delete\(\)/);
  });
});
