import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { podeAssumirContaExistente, precisaDeEmailDeAcesso } from "../provisioning";

/**
 * Posse da conta no provisionamento (08/10).
 *
 * O Hub e o operador criam a barbearia para um E-MAIL. Se já existe uma conta
 * com esse e-mail, ela recebe o papel de dono — e o Firebase aceita conta com
 * senha sem verificar o e-mail. Quem cadastrasse antes o e-mail de outra
 * pessoa ficava com a barbearia dela.
 */

const senha = { providerId: "password" };
const google = { providerId: "google.com" };
const telefone = { providerId: "phone" };

describe("quem pode receber a barbearia", () => {
  it("🔒 conta com senha e e-mail NÃO confirmado é recusada", () => {
    expect(podeAssumirContaExistente({ emailVerified: false, providerData: [senha] })).toBe(false);
    expect(podeAssumirContaExistente({ emailVerified: false, providerData: [telefone] })).toBe(false);
  });

  it("e-mail confirmado ou Google valem", () => {
    expect(podeAssumirContaExistente({ emailVerified: true, providerData: [senha] })).toBe(true);
    expect(podeAssumirContaExistente({ emailVerified: false, providerData: [google] })).toBe(true);
  });

  it("conta sem provedor nenhum (criada pelo próprio provisionamento) vale — ninguém entra nela", () => {
    /* É a conta que `createUser` deixou numa tentativa que caiu no meio: sem
     * aceitá-la, a nova tentativa do Hub nunca terminaria. */
    expect(podeAssumirContaExistente({ emailVerified: false, providerData: [] })).toBe(true);
    expect(podeAssumirContaExistente({})).toBe(true);
  });
});

describe("quando vai o e-mail de definir senha", () => {
  it("só para conta sem senha e sem Google", () => {
    expect(precisaDeEmailDeAcesso({ providerData: [] })).toBe(true);
    expect(precisaDeEmailDeAcesso({ providerData: [senha] })).toBe(false);
    expect(precisaDeEmailDeAcesso({ providerData: [google] })).toBe(false);
  });
});

describe("o código usa as duas decisões nos dois caminhos", () => {
  const plataforma = readFileSync(resolve(__dirname, "../hub/plataforma.ts"), "utf8");
  const provisioning = readFileSync(resolve(__dirname, "../provisioning.ts"), "utf8");

  it("🔒 Hub e operador conferem a posse antes de dar o papel", () => {
    expect(plataforma.indexOf("podeAssumirContaExistente(dono)")).toBeGreaterThan(-1);
    expect(plataforma.indexOf("podeAssumirContaExistente(dono)")).toBeLessThan(
      plataforma.indexOf("criarBarbeariaAssistida(db")
    );
    expect(plataforma).toContain("MOTIVO_CONTA_NAO_VERIFICADA");
    const corpo = provisioning.slice(provisioning.indexOf("export const provisionBarbershop"));
    expect(corpo.indexOf("podeAssumirContaExistente(owner)")).toBeGreaterThan(-1);
    expect(corpo.indexOf("podeAssumirContaExistente(owner)")).toBeLessThan(corpo.indexOf("criarBarbeariaAssistida("));
  });

  it("a chamada repetida do Hub também devolve `acesso`", () => {
    const repetido = plataforma.slice(plataforma.indexOf("garantirVinculoDoDono(barbershopId"), plataforma.indexOf("repetido: true"));
    expect(repetido).toContain("entregarAcesso(");
    expect(plataforma).toMatch(/acesso, repetido: true/);
  });
});
