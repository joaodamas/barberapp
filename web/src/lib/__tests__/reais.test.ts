import { describe, expect, it } from "vitest";
import { lerPercentual, lerReais, reaisParaCampo } from "@/lib/reais";

/**
 * `Number("1.500")` é 1,5. Uma despesa de aluguel de R$ 1.500 entrava como
 * R$ 1,50 sem nenhum aviso — estes casos são o que o dono de fato digita.
 */
describe("lerReais", () => {
  it.each([
    ["1.500", 1500],
    ["1.500,50", 1500.5],
    ["150,5", 150.5],
    ["150,50", 150.5],
    ["150.50", 150.5],
    ["150.5", 150.5],
    ["R$ 80", 80],
    ["R$80,00", 80],
    ["80", 80],
    ["12.000.000", 12000000],
    ["0", 0],
    [" 1.234,56 ", 1234.56],
  ])("lê %j como %d", (texto, esperado) => {
    expect(lerReais(texto)).toBe(esperado);
  });

  it.each([
    [""],
    ["   "],
    ["abc"],
    ["R$"],
    ["1,2,3"],
    ["1.50.0"],
    ["150,555"],
    ["-80"],
    ["1.5000"],
    ["12abc"],
  ])("recusa %j em vez de adivinhar", (texto) => {
    expect(lerReais(texto)).toBeNull();
  });

  it("número de verdade passa direto, negativo não", () => {
    expect(lerReais(1500.5)).toBe(1500.5);
    expect(lerReais(-1)).toBeNull();
    expect(lerReais(Number.NaN)).toBeNull();
  });
});

describe("lerPercentual — taxa não tem milhar", () => {
  it("4.199 é 4,199%, não R$ 4.199", () => {
    expect(lerPercentual("4.199")).toBe(4.2);
    expect(lerReais("4.199")).toBe(4199); // o defeito que o leitor de dinheiro causaria
  });
  it("vírgula ou ponto são decimais", () => {
    expect(lerPercentual("3,49")).toBe(3.49);
    expect(lerPercentual("3.49")).toBe(3.49);
    expect(lerPercentual("2")).toBe(2);
    expect(lerPercentual(" 1,99 % ")).toBe(1.99);
  });
  it("fora de 0–100 ou ilegível é null", () => {
    expect(lerPercentual("100,5")).toBeNull();
    expect(lerPercentual("-1")).toBeNull();
    expect(lerPercentual("abc")).toBeNull();
    expect(lerPercentual("")).toBeNull();
    expect(lerPercentual("1,2345")).toBeNull();
    expect(lerPercentual(100)).toBe(100);
  });
});

describe("reaisParaCampo", () => {
  it("volta para o campo do jeito que o leitor entende igual", () => {
    for (const n of [1500, 1500.5, 80, 0.5, 1234.56]) {
      expect(lerReais(reaisParaCampo(n))).toBe(n);
    }
  });

  it("escreve com vírgula, não com ponto", () => {
    expect(reaisParaCampo(1500.5)).toBe("1500,50");
    expect(reaisParaCampo(80)).toBe("80");
    expect(reaisParaCampo(undefined)).toBe("");
  });
});
