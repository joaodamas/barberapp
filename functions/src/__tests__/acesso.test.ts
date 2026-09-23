import { describe, expect, it } from "vitest";
import { motivoDeLeitura } from "../acesso";

/**
 * O modo leitura existia só no navegador; as callables passavam por fora e
 * uma barbearia suspensa seguia vendendo, estornando e mexendo no caixa
 * (rodada E2E de 23/09). Mesma decisão de `acessoDaBarbearia` no web.
 */
describe("modo leitura no servidor", () => {
  const agora = new Date("2026-09-23T12:00:00Z");

  it("teste no prazo edita; vencido não", () => {
    expect(motivoDeLeitura({ status: "trial", trial: { endsAt: new Date("2026-09-24T00:00:00Z") } }, agora)).toBeNull();
    expect(motivoDeLeitura({ status: "trial", trial: { endsAt: new Date("2026-09-23T11:59:00Z") } }, agora)).toBe("trial_vencido");
    // Timestamp do Firestore chega com `toDate`.
    expect(
      motivoDeLeitura({ status: "trial", trial: { endsAt: { toDate: () => new Date("2026-09-01") } } }, agora)
    ).toBe("trial_vencido");
  });

  it("suspensa e encerrada ficam em leitura; ativa edita", () => {
    expect(motivoDeLeitura({ status: "suspenso" }, agora)).toBe("suspensa");
    expect(motivoDeLeitura({ status: "encerrada" }, agora)).toBe("cancelada");
    expect(motivoDeLeitura({ status: "ativo" }, agora)).toBeNull();
  });
});
