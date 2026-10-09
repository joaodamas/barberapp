import { describe, expect, it } from "vitest";
import { faturaAceitaReajuste, valorDoMensalValido } from "../mensalistas";

describe("faturaAceitaReajuste — só o mês atual em diante", () => {
  it("a fatura vencida de mês anterior não sobe", () => {
    expect(faturaAceitaReajuste("2026-09", "2026-10-09")).toBe(false);
  });
  it("a do mês atual e as futuras acompanham o novo valor", () => {
    expect(faturaAceitaReajuste("2026-10", "2026-10-09")).toBe(true);
    expect(faturaAceitaReajuste("2026-11", "2026-10-09")).toBe(true);
  });
});

/** O valor novo de um mensalista (30/09): só número positivo, em centavos. */
describe("valorDoMensalValido", () => {
  it("aceita valor positivo e arredonda para centavos", () => {
    expect(valorDoMensalValido(180)).toBe(180);
    expect(valorDoMensalValido("149.9")).toBe(149.9);
    expect(valorDoMensalValido(99.999)).toBe(100);
  });

  it("recusa zero, negativo, texto e absurdo", () => {
    expect(valorDoMensalValido(0)).toBeNull();
    expect(valorDoMensalValido(-10)).toBeNull();
    expect(valorDoMensalValido("abc")).toBeNull();
    expect(valorDoMensalValido(1_000_000)).toBeNull();
    expect(valorDoMensalValido(undefined)).toBeNull();
  });
});
