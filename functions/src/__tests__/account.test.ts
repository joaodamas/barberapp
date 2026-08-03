import { describe, expect, it } from "vitest";
import { hashInitialPassword, validatePassword } from "../account";

describe("senha do primeiro acesso", () => {
  it("aceita o que uma pessoa real escolheria", () => {
    for (const senha of ["barbearia2026", "MeuCorte#1", "siqueira barber"]) {
      expect(validatePassword(senha), senha).toBeNull();
    }
  });

  it("explica o que está errado — quem lê é o barbeiro, não um desenvolvedor", () => {
    expect(validatePassword("abc123")).toMatch(/8 caracteres/);
    expect(validatePassword("123456789")).toMatch(/só números/);
    expect(validatePassword("aaaaaaaa")).toMatch(/repetido/);
  });

  it("o hash distingue a senha provisória de qualquer outra", () => {
    // É o que impede "trocar a senha" digitando de volta a que chegou por
    // mensagem: a comparação precisa bater exata e não bater em nada perto.
    expect(hashInitialPassword("Barber@2026")).toBe(hashInitialPassword("Barber@2026"));
    expect(hashInitialPassword("Barber@2026")).not.toBe(hashInitialPassword("Barber@2027"));
    expect(hashInitialPassword("Barber@2026")).not.toBe(hashInitialPassword("barber@2026"));
  });
});
