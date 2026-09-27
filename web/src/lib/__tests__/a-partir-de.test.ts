import { describe, expect, it } from "vitest";
import { separarAPartirDe } from "@/lib/a-partir-de";

describe("'a partir de' sai do nome e vira marca do preço", () => {
  it("tira do fim do nome e liga a marca", () => {
    expect(separarAPartirDe({ name: "Pigmentação a partir de" })).toEqual({
      name: "Pigmentação",
      priceFrom: true,
    });
    expect(separarAPartirDe({ name: "Luzes A PARTIR DE", priceFrom: true })).toEqual({
      name: "Luzes",
      priceFrom: true,
    });
  });

  it("aceita pontuação e o começo do nome", () => {
    expect(separarAPartirDe({ name: "Alinhamento dos fios (a partir de)" }).name).toBe(
      "Alinhamento dos fios"
    );
    expect(separarAPartirDe({ name: "Luzes - a partir de:" }).name).toBe("Luzes");
    expect(separarAPartirDe({ name: "A partir de: Luzes" }).name).toBe("Luzes");
  });

  it("não mexe em nome normal nem apaga o nome inteiro", () => {
    const corte = { name: "Corte", priceFrom: false };
    expect(separarAPartirDe(corte)).toBe(corte);
    expect(separarAPartirDe({ name: "a partir de" }).name).toBe("a partir de");
  });
});
