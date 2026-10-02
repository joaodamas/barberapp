import { describe, expect, it } from "vitest";
import { aplicarCombos, type ServicoDoCatalogo } from "../combos";

/** Catálogo da O Siqueira (01/10), com as composições propostas. */
const CAT: ServicoDoCatalogo[] = [
  { id: "corte", name: "Corte adulto", price: 60, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 20 },
  { id: "sobr", name: "Sobrancelha", price: 15, durationMin: 10 },
  { id: "inf", name: "Corte infantil", price: 50, durationMin: 30 },
  { id: "pez", name: "Pezinho", price: 15, durationMin: 10 },
  { id: "cb", name: "Corte + barba", price: 90, durationMin: 45, composicao: ["corte", "barba"] },
  { id: "cs", name: "Corte + sobrancelha", price: 70, durationMin: 40, composicao: ["corte", "sobr"] },
  { id: "cbs", name: "Corte + barba + sobrancelha", price: 100, durationMin: 55, composicao: ["corte", "barba", "sobr"] },
  { id: "ci", name: "Corte adulto + infantil", price: 100, durationMin: 60, composicao: ["corte", "inf"] },
  { id: "c2i", name: "Corte adulto + 2 infantis", price: 140, durationMin: 90, composicao: ["corte", "inf", "inf"] },
];

describe("aplicarCombos", () => {
  it("marcou corte, fez barba: vira o combo corte + barba (R$ 90, não 95)", () => {
    expect(aplicarCombos(["corte", "barba"], CAT)).toMatchObject({ ids: ["cb"], valor: 90, combos: ["Corte + barba"] });
  });
  it("sem combo que sirva, soma normal", () => {
    expect(aplicarCombos(["barba", "pez"], CAT)).toMatchObject({ valor: 50, combos: [] });
  });
  it("combo + avulso: corte + barba + pezinho = 90 + 15", () => {
    const r = aplicarCombos(["corte", "barba", "pez"], CAT);
    expect(r.valor).toBe(105);
    expect(r.ids.sort()).toEqual(["cb", "pez"]);
  });
  it("escolhe o combo maior quando é mais barato: corte+barba+sobrancelha = 100", () => {
    expect(aplicarCombos(["corte", "barba", "sobr"], CAT)).toMatchObject({ ids: ["cbs"], valor: 100 });
  });
  it("já veio combo e somou peça: corte + barba (combo) + sobrancelha vira o combo de 3", () => {
    expect(aplicarCombos(["cb", "sobr"], CAT)).toMatchObject({ ids: ["cbs"], valor: 100 });
  });
  it("repetição conta: corte + 2 infantis = 140", () => {
    expect(aplicarCombos(["corte", "inf", "inf"], CAT)).toMatchObject({ ids: ["c2i"], valor: 140 });
  });
  it("duração vem do combo", () => {
    expect(aplicarCombos(["corte", "barba"], CAT).duracao).toBe(45);
  });
  it("combo inativo não entra", () => {
    const cat = CAT.map((s) => (s.id === "cb" ? { ...s, active: false } : s));
    expect(aplicarCombos(["corte", "barba"], cat).valor).toBe(95);
  });
  it("combo mais caro que as peças não é usado", () => {
    const cat = CAT.map((s) => (s.id === "cb" ? { ...s, price: 120 } : s));
    expect(aplicarCombos(["corte", "barba"], cat).valor).toBe(95);
  });
});
