import { describe, expect, it } from "vitest";
import {
  DESCONTO_FUNDADOR,
  PRECOS_POR_PLANO,
  barbeirosExtras,
  valorMensal,
} from "@/lib/tenant";

/**
 * Tabela de preços e teto de barbeiros (29/09).
 *
 * A mesma tabela vive em `functions/src/plans.ts`. Divergência entre os dois é
 * a landing prometendo um teto e o painel avisando outro — por isso o teste de
 * paridade lê o arquivo do servidor, como o de `RESERVED_SLUGS`.
 */

describe("tabela de preços (29/09)", () => {
  it("Agenda R$ 97 até 3, Crescimento R$ 197 até 6, Gestão R$ 247 até 10", () => {
    expect(PRECOS_POR_PLANO).toEqual({
      agenda: { mensal: 97, tetoDeBarbeiros: 3, barbeiroExtra: 19 },
      crescimento: { mensal: 197, tetoDeBarbeiros: 6, barbeiroExtra: 19 },
      gestao: { mensal: 247, tetoDeBarbeiros: 10, barbeiroExtra: 19 },
    });
  });

  it("fundadores: 30% vitalício nas 20 primeiras", () => {
    expect(DESCONTO_FUNDADOR).toEqual({ percentual: 30, vagas: 20 });
  });

  it("a tabela do site é a mesma do servidor", async () => {
    const servidor = await import("../../../../functions/src/plans");
    expect(PRECOS_POR_PLANO).toEqual(servidor.PRECOS_POR_PLANO);
    expect(DESCONTO_FUNDADOR).toEqual(servidor.DESCONTO_FUNDADOR);
    for (const plano of ["agenda", "crescimento", "gestao"] as const) {
      for (const ativos of [0, 1, 3, 5, 6, 7, 10, 12]) {
        expect(valorMensal(plano, ativos)).toBe(servidor.valorMensal(plano, ativos));
      }
    }
  });
});

describe("barbeiro extra acima do teto", () => {
  it("dentro do teto, só a mensalidade", () => {
    expect(barbeirosExtras("agenda", 3)).toBe(0);
    expect(valorMensal("agenda", 3)).toBe(97);
    expect(valorMensal("crescimento", 6)).toBe(197);
    expect(valorMensal("gestao", 10)).toBe(247);
  });

  it("Agenda com 5 barbeiros = 97 + 2 × 19", () => {
    expect(barbeirosExtras("agenda", 5)).toBe(2);
    expect(valorMensal("agenda", 5)).toBe(97 + 2 * 19);
  });

  it("Crescimento com 7 barbeiros = 197 + 19", () => {
    expect(valorMensal("crescimento", 7)).toBe(216);
  });

  it("contagem estranha não vira extra negativo nem NaN", () => {
    expect(barbeirosExtras("gestao", 0)).toBe(0);
    expect(barbeirosExtras("gestao", -1)).toBe(0);
    expect(valorMensal("gestao", Number.NaN)).toBe(247);
  });
});
