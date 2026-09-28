import { describe, expect, it } from "vitest";
import { COR_PADRAO, contraste, hexParaRgb, tonsDaMarca } from "@/lib/tons-da-marca";

const INK = hexParaRgb("#0f172a")!;
const FUNDO = hexParaRgb("#f1f5f9")!;
const rgb = (hex: string) => hexParaRgb(hex)!;

describe("tons derivados da cor da barbearia (white-label)", () => {
  it("na cor padrão não sobrescreve nada — valem os tons medidos do globals.css", () => {
    expect(tonsDaMarca(COR_PADRAO)).toEqual({});
    expect(tonsDaMarca(COR_PADRAO.toUpperCase())).toEqual({});
  });

  it("cor inválida ou ausente não quebra o layout", () => {
    expect(tonsDaMarca(undefined)).toEqual({});
    expect(tonsDaMarca("azul")).toEqual({});
  });

  it.each(["#1d4ed8", "#0f766e", "#be123c", "#facc15", "#111827", "#a3e635"])(
    "%s: texto forte, hover e botão passam no contraste AA",
    (cor) => {
      const t = tonsDaMarca(cor);
      expect(Object.keys(t).sort()).toEqual(
        ["--color-gold", "--color-gold-hover", "--color-gold-strong", "--shadow-gold"].sort()
      );
      // Botão: texto ink sobre a cor.
      expect(contraste(rgb(t["--color-gold"]), INK)).toBeGreaterThanOrEqual(4.5);
      // Hover clareia, então continua legível.
      expect(contraste(rgb(t["--color-gold-hover"]), INK)).toBeGreaterThanOrEqual(4.5);
      // Texto de destaque sobre o fundo claro.
      expect(contraste(rgb(t["--color-gold-strong"]), FUNDO)).toBeGreaterThanOrEqual(4.5);
    }
  );

  it("uma cor que já é legível fica exatamente como o dono escolheu", () => {
    expect(tonsDaMarca("#facc15")["--color-gold"]).toBe("#facc15");
  });
});
