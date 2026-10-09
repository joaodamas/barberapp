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

  it("conexão recusada ou DNS são passageiros", () => {
    const recusada = new TypeError("fetch failed", { cause: { code: "ECONNREFUSED" } });
    const dns = new TypeError("fetch failed", { cause: { code: "ENOTFOUND" } });
    expect(erroPassageiro(recusada)).toBe(true);
    expect(erroPassageiro(dns)).toBe(true);
  });

  it("timeout NÃO é passageiro: a mensagem pode ter sido entregue", () => {
    const timeout = Object.assign(new Error("tempo"), { name: "TimeoutError" });
    expect(erroPassageiro(timeout)).toBe(false);
    expect(erroPassageiro(new TypeError("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }))).toBe(false);
    expect(erroPassageiro(new TypeError("fetch failed"))).toBe(false);
    expect(erroPassageiro(new Error("Faltam parâmetros"))).toBe(false);
    expect(erroPassageiro("texto")).toBe(false);
  });
});
