import { describe, expect, it } from "vitest";

/**
 * Regras de provisionamento que não dependem do Admin SDK.
 *
 * O fluxo completo (transação + claim) é exercitado pelo teste de regras e
 * pelo emulador; aqui ficam as validações de entrada, que são onde o operador
 * erra na prática.
 */
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;
const RESERVED = new Set(["www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail"]);

const isValidSlug = (slug: string) => SLUG_PATTERN.test(slug) && !RESERVED.has(slug);

describe("slug da barbearia", () => {
  it("aceita nomes reais", () => {
    for (const slug of ["osiqueira", "barbearia-do-ze", "corte-fino-2", "ab1"]) {
      expect(isValidSlug(slug)).toBe(true);
    }
  });

  it("recusa o que quebraria o subdomínio", () => {
    for (const slug of [
      "ab",                    // curto demais
      "-comeca-com-hifen",
      "termina-com-hifen-",
      "MAIUSCULA",
      "com espaco",
      "com_underscore",
      "acentuação",
      "a".repeat(31),          // longo demais
      "",
    ]) {
      expect(isValidSlug(slug), slug).toBe(false);
    }
  });

  it("recusa subdomínios reservados da plataforma", () => {
    for (const slug of [...RESERVED]) {
      expect(isValidSlug(slug), slug).toBe(false);
    }
  });
});

describe("recursos por plano", () => {
  const featuresFor = (plan: "entrada" | "completo") => ({
    whatsapp: true,
    loyalty: true,
    subscriptions: plan === "completo",
    store: plan === "completo",
    advancedFinance: plan === "completo",
  });

  it("WhatsApp entra no plano de entrada — é o argumento contra o Trinks", () => {
    expect(featuresFor("entrada").whatsapp).toBe(true);
  });

  it("o financeiro avançado é o que sustenta o plano superior", () => {
    expect(featuresFor("entrada").advancedFinance).toBe(false);
    expect(featuresFor("completo").advancedFinance).toBe(true);
  });
});
