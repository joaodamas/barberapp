import { describe, expect, it } from "vitest";
import { recalcularComExtras } from "../servicos-extras";

const CAT = [
  { id: "corte", name: "Corte adulto", price: 60, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 20 },
  { id: "pez", name: "Pezinho", price: 15, durationMin: 10 },
  { id: "cb", name: "Corte + barba", price: 90, durationMin: 45, composicao: ["corte", "barba"] },
];

/** Serviço a mais no fechamento (01/10), já com combo. */
describe("recalcularComExtras", () => {
  it("marcou corte, somou barba: vira o combo (R$ 90)", () => {
    expect(recalcularComExtras({ serviceIds: ["corte"] }, ["barba"], CAT)).toEqual({
      serviceIds: ["cb"],
      serviceNames: ["Corte + barba"],
      value: 90,
      durationMin: 45,
      combos: ["Corte + barba"],
    });
  });
  it("extra sem combo soma normal", () => {
    expect(recalcularComExtras({ serviceIds: ["corte"] }, ["pez"], CAT).value).toBe(75);
  });
  it("reserva antiga sem lista não quebra", () => {
    expect(recalcularComExtras({}, ["barba"], CAT).value).toBe(35);
  });
});
