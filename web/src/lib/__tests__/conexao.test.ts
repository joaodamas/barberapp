import { describe, expect, it } from "vitest";
import { textoDoAvisoDeConexao } from "@/lib/conexao";

describe("aviso de conexão", () => {
  it("diz de que hora são os dados", () => {
    const quatorzeECinco = new Date(2026, 9, 9, 14, 5).getTime();
    expect(textoDoAvisoDeConexao(quatorzeECinco)).toBe("Sem conexão — mostrando dados de 14:05");
  });

  it("sem hora conhecida, não inventa uma", () => {
    const texto = textoDoAvisoDeConexao(null);
    expect(texto).toMatch(/Sem conexão/);
    expect(texto).not.toMatch(/\d{2}:\d{2}/);
  });
});
