import { describe, expect, it } from "vitest";
import { erroPassageiro, podeRetomar } from "../whatsapp/client";

describe("WhatsApp: erro passageiro não trava a nova tentativa", () => {
  it("só registro de erro marcado como passageiro pode ser retomado", () => {
    expect(podeRetomar({ status: "erro", passageiro: true })).toBe(true);
    expect(podeRetomar({ status: "erro" })).toBe(false); // definitivo: número inválido, template recusado
    expect(podeRetomar({ status: "enviado", passageiro: true })).toBe(false);
    expect(podeRetomar({ status: "enviando" })).toBe(false); // outra execução está enviando
    expect(podeRetomar(undefined)).toBe(false);
  });

  it("timeout e falha de rede são passageiros; erro comum não", () => {
    const timeout = Object.assign(new Error("tempo"), { name: "TimeoutError" });
    expect(erroPassageiro(timeout)).toBe(true);
    expect(erroPassageiro(new TypeError("fetch failed"))).toBe(true);
    expect(erroPassageiro(new Error("Faltam parâmetros"))).toBe(false);
    expect(erroPassageiro("texto")).toBe(false);
  });
});
