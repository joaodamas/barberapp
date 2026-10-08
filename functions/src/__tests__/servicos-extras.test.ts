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
    expect(
      recalcularComExtras(
        { serviceIds: ["corte"], serviceNames: ["Corte adulto"], value: 60, durationMin: 30 },
        ["barba"],
        CAT
      )
    ).toEqual({
      serviceIds: ["cb"],
      serviceNames: ["Corte + barba"],
      value: 90,
      durationMin: 45,
      combos: ["Corte + barba"],
    });
  });
  it("extra sem combo soma normal", () => {
    expect(recalcularComExtras({ serviceIds: ["corte"], value: 60 }, ["pez"], CAT).value).toBe(75);
  });
  it("reserva antiga sem lista não quebra", () => {
    expect(recalcularComExtras({}, ["barba"], CAT).value).toBe(35);
  });
});

/**
 * Preço congelado (revisão de 08/10): o que já estava na reserva vale o que a
 * reserva diz; só o extra entra pelo catálogo de hoje.
 */
describe("recalcularComExtras · preço congelado da reserva", () => {
  it("corte reajustado depois da marcação: continua o preço gravado (60 + 15, não 65 + 15)", () => {
    const hoje = CAT.map((s) => (s.id === "corte" ? { ...s, price: 65 } : s));
    const r = recalcularComExtras({ serviceIds: ["corte"], serviceNames: ["Corte adulto"], value: 60, durationMin: 30 }, ["pez"], hoje);
    expect(r.value).toBe(75);
    expect(r.serviceIds).toEqual(["corte", "pez"]);
    expect(r.durationMin).toBe(40);
  });

  it("serviço que saiu do catálogo: mantém nome e preço gravados (nada de R$ 0 e 'Serviço')", () => {
    const r = recalcularComExtras(
      { serviceIds: ["navalhado"], serviceNames: ["Navalhado"], value: 55, durationMin: 40 },
      ["barba"],
      CAT
    );
    expect(r.value).toBe(90);
    expect(r.serviceIds).toEqual(["navalhado", "barba"]);
    expect(r.serviceNames).toEqual(["Navalhado", "Barba"]);
    expect(r.durationMin).toBe(60);
  });

  it("combo só entra se for mais barato que o congelado + o extra: corte promocional de 50 + barba = 85", () => {
    const r = recalcularComExtras({ serviceIds: ["corte"], value: 50 }, ["barba"], CAT);
    expect(r.value).toBe(85);
    expect(r.serviceIds).toEqual(["corte", "barba"]);
    expect(r.combos).toEqual([]);
  });

  it("combo mais barato que o congelado + extra continua valendo (corte reajustado a 65 + barba → combo 90)", () => {
    const hoje = CAT.map((s) => (s.id === "corte" ? { ...s, price: 65 } : s));
    const r = recalcularComExtras({ serviceIds: ["corte"], value: 60 }, ["barba"], hoje);
    expect(r.value).toBe(90);
    expect(r.serviceIds).toEqual(["cb"]);
  });

  it("dois serviços na reserva: repartição proporcional, soma exata do value gravado", () => {
    /* Marcados a 60 + 15 = 75 com desconto de tabela na época: 70. */
    const r = recalcularComExtras({ serviceIds: ["corte", "pez"], value: 70 }, ["pez"], CAT);
    expect(r.value).toBe(85);
  });

  it("mesmo serviço na reserva e no extra: o congelado e o de hoje somam (60 + 65)", () => {
    const hoje = CAT.map((s) => (s.id === "corte" ? { ...s, price: 65 } : s));
    const r = recalcularComExtras({ serviceIds: ["corte"], value: 60 }, ["corte"], hoje);
    expect(r.value).toBe(125);
  });

  it("combo da reserva desativado depois não é desmontado ao somar peça", () => {
    const hoje = CAT.map((s) => (s.id === "cb" ? { ...s, active: false } : s));
    const r = recalcularComExtras({ serviceIds: ["cb"], serviceNames: ["Corte + barba"], value: 90 }, ["pez"], hoje);
    expect(r.value).toBe(105);
    expect(r.serviceIds).toEqual(["cb", "pez"]);
  });
});
