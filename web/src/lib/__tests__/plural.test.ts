import { describe, expect, it } from "vitest";
import { contar, contarDeTotal, plural } from "@/lib/plural";

/**
 * UX-05 · a regra de concordância.
 *
 * O caso que originou o arquivo está no primeiro `describe`: **"1 dias com
 * movimento"**, visto na tela em 17/08. Os demais cobrem os pontos onde o
 * produto já errava por outro caminho — o `(s)` — e os que ninguém tinha
 * exercido, como o zero e o negativo.
 */

describe("a contagem que apareceu errada na tela", () => {
  it("um dia é singular — era 1 dias no Fluxo de Caixa", () => {
    expect(contar(1, "dia", "dias")).toBe("1 dia");
  });

  it("dois ou mais é plural", () => {
    expect(contar(2, "dia", "dias")).toBe("2 dias");
    expect(contar(31, "dia", "dias")).toBe("31 dias");
  });
});

describe("zero é plural em português", () => {
  /* Quem escreve `n < 2` acerta o zero por acidente. O teste existe para que a
   * regra seja uma decisão registrada, e não uma coincidência de operador. */
  it("nenhum dia se escreve 0 dias", () => {
    expect(contar(0, "dia", "dias")).toBe("0 dias");
  });

  it("vale para qualquer substantivo", () => {
    expect(contar(0, "lançamento", "lançamentos")).toBe("0 lançamentos");
    expect(contar(0, "mensalidade", "mensalidades")).toBe("0 mensalidades");
  });
});

describe("negativo concorda pela grandeza, não pelo sinal", () => {
  /* Saldo e variação chegam com sinal. `n === 1` sozinho mandaria "−1 dias". */
  it("menos um é singular", () => {
    expect(contar(-1, "dia", "dias")).toBe("-1 dia");
    expect(plural(-1, "cancelamento", "cancelamentos")).toBe("cancelamento");
  });

  it("menos dois é plural", () => {
    expect(plural(-2, "cancelamento", "cancelamentos")).toBe("cancelamentos");
  });
});

describe("plural devolve só a palavra, para o número que já está na frase", () => {
  /* O caso das guidelines §9, literalmente: a abreviação de unidade é
   * invariável e quem concorda é o verbo ao lado dela. */
  it("1 un. voltou · 2 un. voltaram", () => {
    expect(`1 un. ${plural(1, "voltou", "voltaram")}`).toBe("1 un. voltou");
    expect(`2 un. ${plural(2, "voltou", "voltaram")}`).toBe("2 un. voltaram");
  });

  it("serve a adjetivo irregular, que nenhuma dedução acertaria", () => {
    expect(plural(1, "visível", "visíveis")).toBe("visível");
    expect(plural(3, "visível", "visíveis")).toBe("visíveis");
  });

  it("serve a substantivo irregular", () => {
    expect(plural(1, "mês", "meses")).toBe("mês");
    expect(plural(6, "mês", "meses")).toBe("meses");
  });
});

describe("na forma X de Y, quem manda na concordância é Y", () => {
  /* A barbearia com um serviço só é o estado inicial de toda barbearia nova —
   * este é o caso que aparece no primeiro dia de uso, não o exótico. */
  it("um de um é singular", () => {
    expect(contarDeTotal(1, 1, "serviço", "serviços")).toBe("1 de 1 serviço");
  });

  it("um de três é plural, porque o total é três", () => {
    expect(contarDeTotal(1, 3, "serviço", "serviços")).toBe("1 de 3 serviços");
  });

  it("zero de um continua singular", () => {
    expect(contarDeTotal(0, 1, "serviço", "serviços")).toBe("0 de 1 serviço");
  });
});

describe("nenhuma saída contém a desistência (s)", () => {
  /* Trava de regressão sobre a forma, não sobre um caso: o `(s)` era a solução
   * anterior em nove pontos do produto, e voltar a ele é o modo mais provável
   * de alguém "resolver" um plural difícil no futuro. */
  const casos = [
    contar(0, "mensalidade", "mensalidades"),
    contar(1, "mensalidade", "mensalidades"),
    contar(2, "mensalidade", "mensalidades"),
    contarDeTotal(1, 1, "serviço", "serviços"),
    plural(1, "visível", "visíveis"),
  ];

  it("nem (s) nem (is) sobrevivem à regra", () => {
    for (const saida of casos) {
      expect(saida).not.toMatch(/\((s|is|es)\)/);
    }
  });
});
