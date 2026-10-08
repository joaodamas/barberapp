import { describe, expect, it } from "vitest";
import { aplicarCombos, aplicarCombosComCongelados, type ServicoDoCatalogo } from "../combos";

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
  it("sem combo, mantém a ordem que a pessoa escolheu", () => {
    expect(aplicarCombos(["corte", "pez"], CAT).ids).toEqual(["corte", "pez"]);
    expect(aplicarCombos(["pez", "barba"], CAT).ids).toEqual(["pez", "barba"]);
  });
  it("combo entra na posição da primeira peça", () => {
    expect(aplicarCombos(["pez", "corte", "barba"], CAT).ids).toEqual(["pez", "cb"]);
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

/**
 * Somar a uma reserva que já tem preço (08/10) — mesma tabela nos dois lados:
 * a tela diz "Fica R$ X" com esta conta e o servidor grava com ela.
 */
describe("aplicarCombosComCongelados", () => {
  const reajustado = CAT.map((s) => (s.id === "corte" ? { ...s, price: 65 } : s));
  it("o corte marcado a 60 continua 60 depois do reajuste: + pezinho = 75", () => {
    expect(aplicarCombosComCongelados({ serviceIds: ["corte"], value: 60 }, ["pez"], reajustado).valor).toBe(75);
  });
  it("combo vale quando sai mais barato que congelado + extra", () => {
    expect(aplicarCombosComCongelados({ serviceIds: ["corte"], value: 60 }, ["barba"], reajustado)).toMatchObject({
      ids: ["cb"],
      valor: 90,
    });
  });
  it("corte promocional de 50 + barba: 85, sem combo", () => {
    expect(aplicarCombosComCongelados({ serviceIds: ["corte"], value: 50 }, ["barba"], CAT)).toMatchObject({
      ids: ["corte", "barba"],
      valor: 85,
    });
  });
  it("serviço fora do catálogo mantém nome e preço gravados", () => {
    const r = aplicarCombosComCongelados(
      { serviceIds: ["navalhado"], serviceNames: ["Navalhado"], value: 55 },
      ["barba"],
      CAT
    );
    expect(r.valor).toBe(90);
    expect(r.nomes).toEqual(["Navalhado", "Barba"]);
  });
  it("combo de 3 a partir de um combo gravado: cb (90) + sobrancelha → cbs 100", () => {
    expect(aplicarCombosComCongelados({ serviceIds: ["cb"], value: 90 }, ["sobr"], CAT)).toMatchObject({
      ids: ["cbs"],
      valor: 100,
    });
  });
});
