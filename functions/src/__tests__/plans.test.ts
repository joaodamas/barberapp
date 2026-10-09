import { describe, expect, it } from "vitest";
import {
  DESCONTO_FUNDADOR,
  PRECOS_POR_PLANO,
  barbeirosExtras,
  ANUAL_DISPONIVEL,
  economiaDoAnual,
  equivalenteMensalDoAnual,
  precoDoPlano,
  valorMensal,
} from "../plans";

describe("tabela de preços (29/09)", () => {
  it("mensalidade e teto de cada plano", () => {
    expect(precoDoPlano("agenda")).toEqual({ mensal: 97, anual: 970, tetoDeBarbeiros: 3, barbeiroExtra: 19 });
    expect(precoDoPlano("crescimento")).toEqual({ mensal: 197, anual: 1970, tetoDeBarbeiros: 6, barbeiroExtra: 19 });
    expect(precoDoPlano("gestao")).toEqual({ mensal: 247, anual: 2470, tetoDeBarbeiros: 10, barbeiroExtra: 19 });
  });

  it("plano de cima nunca cobre menos gente que o de baixo", () => {
    const { agenda, crescimento, gestao } = PRECOS_POR_PLANO;
    expect(agenda.tetoDeBarbeiros).toBeLessThan(crescimento.tetoDeBarbeiros);
    expect(crescimento.tetoDeBarbeiros).toBeLessThan(gestao.tetoDeBarbeiros);
  });

  it("fundadores: 30% nas 20 primeiras", () => {
    expect(DESCONTO_FUNDADOR).toEqual({ percentual: 30, vagas: 20, meses: 1 });
  });
});

describe("plano anual (2 meses grátis)", () => {
  it("paga 10 mensalidades de tabela", () => {
    for (const p of Object.values(PRECOS_POR_PLANO)) expect(p.anual).toBe(p.mensal * 10);
  });

  it("equivalente por mês, em centavos, e economia", () => {
    expect(equivalenteMensalDoAnual(970)).toBe(80.83);
    expect(equivalenteMensalDoAnual(1970)).toBe(164.17);
    expect(equivalenteMensalDoAnual(2470)).toBe(205.83);
    expect(economiaDoAnual("agenda")).toBe(194);
    expect(economiaDoAnual("crescimento")).toBe(394);
    expect(economiaDoAnual("gestao")).toBe(494);
  });

  it("a trava nasce desligada", () => {
    expect(ANUAL_DISPONIVEL).toBe(false);
  });
});

describe("barbeiro extra", () => {
  it("até o teto não há extra", () => {
    expect(barbeirosExtras("agenda", 1)).toBe(0);
    expect(barbeirosExtras("agenda", 3)).toBe(0);
    expect(valorMensal("agenda", 3)).toBe(97);
  });

  it("Agenda com 5 barbeiros = 97 + 2 × 19", () => {
    expect(barbeirosExtras("agenda", 5)).toBe(2);
    expect(valorMensal("agenda", 5)).toBe(97 + 2 * 19);
  });

  it("Gestão com 12 barbeiros = 247 + 2 × 19", () => {
    expect(valorMensal("gestao", 12)).toBe(247 + 2 * 19);
  });

  it("entrada estranha não vira extra negativo nem NaN", () => {
    expect(barbeirosExtras("crescimento", 0)).toBe(0);
    expect(barbeirosExtras("crescimento", -4)).toBe(0);
    expect(barbeirosExtras("crescimento", Number.NaN)).toBe(0);
    expect(valorMensal("crescimento", Number.NaN)).toBe(197);
  });
});
