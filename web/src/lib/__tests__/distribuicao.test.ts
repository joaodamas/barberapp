import { describe, expect, it } from "vitest";
import { emOrdem, mover, regraDe } from "@/lib/distribuicao";

describe("05/10 · distribuição na tela de Ajustes", () => {
  it("regra gravada ou o padrão", () => {
    expect(regraDe("rodizio")).toBe("rodizio");
    expect(regraDe(undefined)).toBe("equilibrio");
    expect(regraDe("sorteio")).toBe("equilibrio");
  });

  it("equipe na ordem do dono; sem ordem vai para o fim, por nome", () => {
    const equipe = [
      { name: "Caio", order: 3 },
      { name: "Beto" },
      { name: "Ana", order: 1 },
      { name: "Alan" },
    ];
    expect(emOrdem(equipe).map((b) => b.name)).toEqual(["Ana", "Caio", "Alan", "Beto"]);
  });

  it("subir e descer trocam com o vizinho e param nas pontas", () => {
    expect(mover(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(mover(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(mover(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
