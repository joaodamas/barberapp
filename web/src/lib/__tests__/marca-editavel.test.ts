import { describe, expect, it } from "vitest";
import {
  avaliarCor,
  CORES_PRONTAS,
  formatarContraste,
  NOME_CURTO_MAXIMO,
  normalizarHex,
  problemaNoNome,
  problemaNoNomeCurto,
} from "@/lib/marca-editavel";
import { shortNameFrom } from "@/lib/tenant";

describe("nome e nome curto", () => {
  it("nome precisa de pelo menos duas letras e no máximo 60", () => {
    expect(problemaNoNome("Barbearia Navalha")).toBeNull();
    expect(problemaNoNome(" a ")).not.toBeNull();
    expect(problemaNoNome("x".repeat(61))).toMatch(/60/);
  });

  it("nome curto cabe debaixo do ícone", () => {
    expect(problemaNoNomeCurto("Navalha")).toBeNull();
    expect(problemaNoNomeCurto("   ")).not.toBeNull();
    expect(problemaNoNomeCurto("x".repeat(NOME_CURTO_MAXIMO + 1))).toMatch(/reticências/);
  });

  it("o nome curto que o cadastro gera sempre passa", () => {
    for (const nome of ["Barbearia Navalha do Centro Histórico", "Zé", "Corte & Cia Barbearia Premium"]) {
      expect(problemaNoNomeCurto(shortNameFrom(nome)), nome).toBeNull();
    }
  });
});

describe("cor", () => {
  it("normaliza o que o dono digita", () => {
    expect(normalizarHex("#B8863A")).toBe("#b8863a");
    expect(normalizarHex("b8863a")).toBe("#b8863a");
    expect(normalizarHex(" #abc ")).toBe("#aabbcc");
    expect(normalizarHex("#b8863")).toBeNull();
    expect(normalizarHex("dourado")).toBeNull();
  });

  it("toda cor pronta passa nas duas conferências, sem ajuste nem aviso", () => {
    for (const c of CORES_PRONTAS) {
      const a = avaliarCor(c.hex)!;
      expect(a.botaoAjustado, c.nome).toBe(false);
      expect(a.contrasteDoBotao, c.nome).toBeGreaterThanOrEqual(4.5);
      expect(a.fracaNoFundo, c.nome).toBe(false);
    }
  });

  it("cor escura: o botão é clareado até 4,5:1 e a tela avisa", () => {
    const a = avaliarCor("#0b1f3a")!;
    expect(a.botaoAjustado).toBe(true);
    expect(a.contrasteDoBotao).toBeGreaterThanOrEqual(4.5);
    expect(a.fracaNoFundo).toBe(false);
  });

  it("cor clara: o botão lê bem, mas some sobre o fundo branco", () => {
    const a = avaliarCor("#f5e9a8")!;
    expect(a.botaoAjustado).toBe(false);
    expect(a.fracaNoFundo).toBe(true);
    expect(a.contrasteNoFundo).toBeLessThan(3);
  });

  it("cor inválida não é avaliada", () => {
    expect(avaliarCor("azul")).toBeNull();
  });

  it("contraste escrito como o WCAG, arredondado para baixo — 4,49 não vira 4,5", () => {
    expect(formatarContraste(4.49)).toBe("4,4:1");
    expect(formatarContraste(7.123)).toBe("7,1:1");
  });
});
