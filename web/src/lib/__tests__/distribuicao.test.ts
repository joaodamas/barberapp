import { describe, expect, it } from "vitest";
import { emOrdem, mover, proximaOrdem, regraDe } from "@/lib/distribuicao";

describe("05/10 · distribuição na tela de Ajustes", () => {
  it("regra gravada ou o padrão", () => {
    expect(regraDe("rodizio")).toBe("rodizio");
    expect(regraDe(undefined)).toBe("equilibrio");
    expect(regraDe("sorteio")).toBe("equilibrio");
  });

  it("equipe na ordem do dono; sem ordem vai para o fim; empate pelo id, como o servidor", () => {
    const equipe = [
      { id: "c", name: "Caio", order: 3 },
      { id: "b", name: "Beto" },
      { id: "a2", name: "Ana", order: 1 },
      { id: "a1", name: "Alan" },
      { id: "z", name: "Zeca", order: null },
    ];
    expect(emOrdem(equipe).map((b) => b.id)).toEqual(["a2", "c", "a1", "b", "z"]);
  });

  /* 08/10: a tela desempatava pelo nome e o servidor pelo id — com dois
   * `order` iguais, a fila mostrada não era a usada. */
  it("dois com a mesma ordem: decide o id, não o nome", () => {
    const equipe = [
      { id: "s2", name: "Abel", order: 2 },
      { id: "s1", name: "Zuza", order: 2 },
    ];
    expect(emOrdem(equipe).map((b) => b.id)).toEqual(["s1", "s2"]);
    // Renomear não muda a fila.
    expect(emOrdem([{ ...equipe[0], name: "Zé" }, equipe[1]]).map((b) => b.id)).toEqual(["s1", "s2"]);
  });

  it("quem entra vai depois do maior, e não na posição do tamanho da equipe", () => {
    /* Eram três (1, 2, 3); o 2 foi removido. `length + 1` daria 3 de novo. */
    expect(proximaOrdem([{ order: 1 }, { order: 3 }])).toBe(4);
    expect(proximaOrdem([])).toBe(1);
    expect(proximaOrdem([{}, { order: null }])).toBe(1);
    expect(proximaOrdem([{ order: 2 }, {}])).toBe(3);
  });

  it("subir e descer trocam com o vizinho e param nas pontas", () => {
    expect(mover(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(mover(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(mover(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
});
