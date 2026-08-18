import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatDatePtBR,
  formatDateShortPtBR,
  formatPctPtBR,
  formatWeekdayAndDay,
  parseISODate,
  safeDiv,
  safePct,
  toISODate,
} from "@/lib/format";

describe("datas", () => {
  it("formatDateShortPtBR devolve a DATA, não o dia da semana", () => {
    // O bug: formatDatePtBR(...).split(",")[0] devolvia "domingo".
    expect(formatDatePtBR("2026-07-05")).toBe("domingo, 05 de julho");
    expect(formatDateShortPtBR("2026-07-05")).toBe("05 de julho");
    expect(formatDateShortPtBR("2026-07-05")).not.toContain("domingo");
  });

  it("formatWeekdayAndDay traz dia da semana E número", () => {
    expect(formatWeekdayAndDay("2026-07-05")).toBe("Dom 05");
  });

  it("interpreta ISO no fuso local, sem deslocar o dia", () => {
    expect(parseISODate("2026-07-05").getDate()).toBe(5);
    expect(toISODate(parseISODate("2026-07-05"))).toBe("2026-07-05");
  });
});

describe("números seguros", () => {
  it("safeDiv não devolve Infinity nem NaN", () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(0, 0)).toBe(0);
    expect(safeDiv(NaN, 2)).toBe(0);
    expect(safeDiv(10, 4)).toBe(2.5);
  });

  it("safePct fica sempre em [0, max]", () => {
    expect(safePct(5, 0)).toBe(0);
    expect(safePct(200, 100)).toBe(100);
    expect(safePct(-5, 100)).toBe(0);
    expect(safePct(25, 100)).toBe(25);
  });

  it("formatBRL não imprime 'R$ ∞'", () => {
    expect(formatBRL(Infinity)).not.toContain("∞");
    expect(formatBRL(NaN)).toBe(formatBRL(0));
  });
});

describe("percentual em português — A10", () => {
  it("separa com vírgula, nunca com ponto", () => {
    /* `toFixed(1)` devolvia `27.7`, e o ponto é separador de MILHAR em
     * português: "27.7%" lê-se como vinte e sete mil antes de o leitor
     * perceber o engano. O DRE mostrava `27.7%` e `77.7%`. */
    expect(formatPctPtBR(27.7)).toBe("27,7%");
    expect(formatPctPtBR(77.7)).toBe("77,7%");
    expect(formatPctPtBR(27.7)).not.toContain(".");
  });

  it("mantém o número de casas fixo entre vizinhos", () => {
    // "8.5%" tinha uma casa entre vizinhos de duas, e a coluna desalinhava.
    expect(formatPctPtBR(0.99, 2)).toBe("0,99%");
    expect(formatPctPtBR(8.5, 2)).toBe("8,50%");
    expect(formatPctPtBR(3.15, 2)).toBe("3,15%");
  });

  it("zero de verdade continua sendo zero", () => {
    expect(formatPctPtBR(0)).toBe("0,0%");
    expect(formatPctPtBR(0, 0)).toBe("0%");
  });

  it("valor diferente de zero NUNCA sai como zero", () => {
    /* É a mesma classe de D3 uma casa abaixo: o produto transformando "quase
     * nada" em "nada". "0%" é a única leitura que autoriza o dono a concluir
     * que não houve movimento nenhum. */
    expect(formatPctPtBR(0.02)).toBe("< 0,1%");
    expect(formatPctPtBR(0.0001)).toBe("< 0,1%");
    expect(formatPctPtBR(0.2, 0)).toBe("< 1%");

    for (const v of [0.04, 0.001, 1e-6]) {
      expect(formatPctPtBR(v), String(v)).not.toBe("0,0%");
      expect(formatPctPtBR(v), String(v)).not.toBe("0%");
    }
  });

  it("preserva o sinal perto de zero", () => {
    // Margem levemente negativa apresentada como levemente positiva é o
    // defeito de novo, menor.
    expect(formatPctPtBR(-0.02)).toBe("> −0,1%");
    expect(formatPctPtBR(-0.02)).not.toBe("< 0,1%");
  });

  it("arredonda normalmente longe de zero, e aceita negativo cheio", () => {
    expect(formatPctPtBR(0.06)).toBe("0,1%");
    expect(formatPctPtBR(-550)).toBe("-550,0%");
  });

  it("não deixa NaN nem Infinity chegarem à tela", () => {
    expect(formatPctPtBR(NaN)).toBe("0,0%");
    expect(formatPctPtBR(Infinity)).toBe("0,0%");
  });
});
