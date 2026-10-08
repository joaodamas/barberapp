import { describe, expect, it } from "vitest";
import { decidirOnboarding } from "@/lib/onboarding-concluido";

/**
 * O dono que acabou de concluir o onboarding não volta ao passo 1.
 *
 * A ficha do servidor tem cache de 300 s: ao chegar ao painel logo depois do
 * último passo, ela ainda dizia "incompleto" e o `AuthGuard` mandava o dono
 * de volta para `/comecar`.
 */
const base = { isOwner: true, completo: false, concluidoAgora: false } as const;

describe("decidirOnboarding", () => {
  it("quem não é dono, ou já concluiu, segue", () => {
    expect(decidirOnboarding({ ...base, isOwner: false, estadoDaFicha: "confirmada" })).toBe("seguir");
    expect(decidirOnboarding({ ...base, completo: true, estadoDaFicha: "aguardando" })).toBe("seguir");
  });

  it("ficha incompleta e a ao vivo ainda não veio do servidor: espera, não redireciona", () => {
    expect(decidirOnboarding({ ...base, estadoDaFicha: "aguardando" })).toBe("esperar");
    expect(decidirOnboarding({ ...base, estadoDaFicha: "aguardando", concluidoAgora: true })).toBe("esperar");
  });

  it("acabou de concluir e a ficha ao vivo não pôde ser confirmada: confia na conclusão", () => {
    expect(decidirOnboarding({ ...base, estadoDaFicha: "sem-confirmacao", concluidoAgora: true })).toBe("seguir");
    expect(decidirOnboarding({ ...base, estadoDaFicha: "sem-escuta", concluidoAgora: true })).toBe("seguir");
  });

  it("o servidor confirmou que está incompleto: onboarding, com ou sem marcador", () => {
    expect(decidirOnboarding({ ...base, estadoDaFicha: "confirmada" })).toBe("onboarding");
    expect(decidirOnboarding({ ...base, estadoDaFicha: "confirmada", concluidoAgora: true })).toBe("onboarding");
  });

  it("sem marcador e sem como confirmar: o comportamento de antes (onboarding)", () => {
    expect(decidirOnboarding({ ...base, estadoDaFicha: "sem-escuta" })).toBe("onboarding");
    expect(decidirOnboarding({ ...base, estadoDaFicha: "sem-confirmacao" })).toBe("onboarding");
  });
});
