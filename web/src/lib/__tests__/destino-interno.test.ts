import { describe, expect, it } from "vitest";
import { destinoInterno } from "@/lib/destino-interno";

const O = "https://navalha.cortehub.com.br";

describe("destino depois do login", () => {
  it("aceita caminho do próprio site, com busca e âncora", () => {
    expect(destinoInterno("/criar-conta", O)).toBe("/criar-conta");
    expect(destinoInterno("/painel/financeiro?mes=2026-09#dre", O)).toBe("/painel/financeiro?mes=2026-09#dre");
  });

  it("🔒 recusa tudo que o navegador resolveria para outro site", () => {
    for (const v of [
      "/\\example.com", // o caso reproduzido na rodada E2E
      "/\\/example.com",
      "//example.com",
      "https://example.com",
      "javascript:alert(1)",
      "/\texample.com",
      "\\\\example.com",
      "example.com",
    ]) {
      expect(destinoInterno(v, O), v).toBeNull();
    }
  });

  it("sem destino, nada", () => {
    expect(destinoInterno(null, O)).toBeNull();
    expect(destinoInterno("", O)).toBeNull();
  });
});
