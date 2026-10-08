import { describe, expect, it } from "vitest";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";

describe("mensagemDaFuncao", () => {
  it("repassa a mensagem que nós escrevemos", () => {
    expect(
      mensagemDaFuncao({ code: "functions/failed-precondition", message: "Este convite venceu." }, "padrão")
    ).toBe("Este convite venceu.");
  });
  it("esconde o jargão do servidor", () => {
    expect(mensagemDaFuncao({ code: "functions/internal", message: "internal" }, "Tente de novo.")).toBe("Tente de novo.");
  });
  it("rede vira aviso de conexão", () => {
    expect(mensagemDaFuncao({ code: "functions/unavailable", message: "x" }, "p")).toMatch(/conexão/);
  });
  it("qualquer coisa estranha cai no padrão", () => {
    expect(mensagemDaFuncao(null, "p")).toBe("p");
    expect(mensagemDaFuncao("texto", "p")).toBe("p");
  });
});
