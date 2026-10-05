import { describe, expect, it } from "vitest";
import {
  elegiveis,
  escolherBarbeiro,
  fazTodosOsServicos,
  ordemDoBarbeiro,
  regraDaBarbearia,
  type Candidato,
} from "../distribuicao";

/** Três cadeiras, na ordem do dono: Ana(1), Beto(2), Caio(3). */
const c = (staffId: string, ordem: number, atendimentosNoDia: number, livre = true): Candidato => ({
  staffId,
  ordem,
  atendimentosNoDia,
  livre,
});

describe("05/10 · regra gravada pelo dono", () => {
  it("vale a gravada; ausente ou estranha é equilíbrio", () => {
    expect(regraDaBarbearia({ distribuicao: "rodizio" })).toBe("rodizio");
    expect(regraDaBarbearia({ distribuicao: "prioridade" })).toBe("prioridade");
    expect(regraDaBarbearia({})).toBe("equilibrio");
    expect(regraDaBarbearia({ distribuicao: "sorteio" })).toBe("equilibrio");
    expect(regraDaBarbearia(undefined)).toBe("equilibrio");
  });
});

describe("05/10 · equilíbrio do dia", () => {
  it("vai para o livre com menos atendimentos", () => {
    expect(
      escolherBarbeiro({ regra: "equilibrio", candidatos: [c("ana", 1, 5), c("beto", 2, 2), c("caio", 3, 4)] })
    ).toBe("beto");
  });
  it("empate desempata pela ordem do dono", () => {
    expect(
      escolherBarbeiro({ regra: "equilibrio", candidatos: [c("caio", 3, 2), c("beto", 2, 2), c("ana", 1, 4)] })
    ).toBe("beto");
  });
  it("quem está ocupado no horário não entra, mesmo com agenda vazia", () => {
    expect(
      escolherBarbeiro({ regra: "equilibrio", candidatos: [c("ana", 1, 0, false), c("beto", 2, 3)] })
    ).toBe("beto");
  });
});

describe("05/10 · rodízio", () => {
  const equipe = [c("ana", 1, 0), c("beto", 2, 0), c("caio", 3, 0)];
  it("depois do último, o próximo da fila", () => {
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: equipe, ultimoDoRodizio: "ana" })).toBe("beto");
  });
  it("depois do último da fila, volta ao início", () => {
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: equipe, ultimoDoRodizio: "caio" })).toBe("ana");
  });
  it("pula quem está ocupado", () => {
    const comBetoOcupado = [c("ana", 1, 0), c("beto", 2, 0, false), c("caio", 3, 0)];
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: comBetoOcupado, ultimoDoRodizio: "ana" })).toBe("caio");
  });
  it("pula ocupado e dá a volta", () => {
    const comAnaOcupada = [c("ana", 1, 0, false), c("beto", 2, 0), c("caio", 3, 0)];
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: comAnaOcupada, ultimoDoRodizio: "caio" })).toBe("beto");
  });
  it("sem último (ou último que saiu da equipe), começa do primeiro", () => {
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: equipe })).toBe("ana");
    expect(escolherBarbeiro({ regra: "rodizio", candidatos: equipe, ultimoDoRodizio: "saiu" })).toBe("ana");
  });
});

describe("05/10 · prioridade do dono", () => {
  it("o primeiro livre da lista leva, sem olhar a carga do dia", () => {
    expect(
      escolherBarbeiro({ regra: "prioridade", candidatos: [c("beto", 2, 0), c("ana", 1, 9)] })
    ).toBe("ana");
  });
  it("primeiro ocupado: o seguinte", () => {
    expect(
      escolherBarbeiro({ regra: "prioridade", candidatos: [c("ana", 1, 0, false), c("beto", 2, 9)] })
    ).toBe("beto");
  });
});

describe("05/10 · ninguém livre", () => {
  it("nenhuma regra inventa barbeiro", () => {
    const ocupados = [c("ana", 1, 0, false), c("beto", 2, 0, false)];
    for (const regra of ["equilibrio", "rodizio", "prioridade"] as const) {
      expect(escolherBarbeiro({ regra, candidatos: ocupados, ultimoDoRodizio: "ana" })).toBeNull();
      expect(escolherBarbeiro({ regra, candidatos: [] })).toBeNull();
    }
  });
});

describe("05/10 · quem pode atender", () => {
  it("lista vazia de serviços é faz-tudo; senão precisa fazer TODOS", () => {
    expect(fazTodosOsServicos([], ["corte", "barba"])).toBe(true);
    expect(fazTodosOsServicos(undefined, ["corte"])).toBe(true);
    expect(fazTodosOsServicos(["corte", "barba"], ["corte", "barba"])).toBe(true);
    expect(fazTodosOsServicos(["corte"], ["corte", "barba"])).toBe(false);
  });

  it("tira quem não faz o serviço e quem está de folga, e ordena pelo dono", () => {
    const equipe = [
      { staffId: "caio", ordem: 3, servicos: [], trabalhaNoDia: true },
      { staffId: "ana", ordem: 1, servicos: ["corte"], trabalhaNoDia: true },
      { staffId: "beto", ordem: 2, servicos: [], trabalhaNoDia: false },
      { staffId: "duda", ordem: 4, servicos: ["corte", "barba"], trabalhaNoDia: true },
    ];
    expect(elegiveis(equipe, ["corte", "barba"]).map((b) => b.staffId)).toEqual(["caio", "duda"]);
    expect(elegiveis(equipe, ["corte"]).map((b) => b.staffId)).toEqual(["ana", "caio", "duda"]);
  });

  it("sem ordem gravada vai para o fim", () => {
    expect(ordemDoBarbeiro(undefined)).toBeGreaterThan(ordemDoBarbeiro(99));
    expect(ordemDoBarbeiro("2")).toBe(2);
  });
});
