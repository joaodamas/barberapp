import { describe, expect, it } from "vitest";
import { somarExtras } from "../servicos-extras";

/** Serviço a mais no fechamento (01/10): soma com o preço do catálogo. */
describe("somarExtras", () => {
  it("corte marcado, saiu com corte e barba", () => {
    const r = somarExtras(
      { value: 60, durationMin: 30, serviceIds: ["corte"], serviceNames: ["Corte adulto"] },
      [{ id: "barba", nome: "Barba", preco: 35, duracao: 20 }]
    );
    expect(r).toEqual({
      serviceIds: ["corte", "barba"],
      serviceNames: ["Corte adulto", "Barba"],
      value: 95,
      durationMin: 50,
      valorExtra: 35,
    });
  });

  it("centavos não acumulam erro de ponto flutuante", () => {
    expect(somarExtras({ value: 0.1 }, [{ id: "a", nome: "A", preco: 0.2, duracao: 0 }]).value).toBe(0.3);
  });

  it("reserva antiga sem listas não quebra", () => {
    const r = somarExtras({}, [{ id: "x", nome: "X", preco: 10, duracao: 15 }]);
    expect(r.serviceIds).toEqual(["x"]);
    expect(r.value).toBe(10);
  });
});
