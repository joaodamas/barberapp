import { describe, expect, it } from "vitest";
import {
  diaDaSemanaNoFuso,
  hojeNoFuso,
  instanteNoFuso,
  localeDoDocumento,
} from "../locale";

/**
 * Estes testes existem porque o erro de fuso é invisível.
 *
 * Não há exceção, não há log, não há tela vermelha: a mensagem sai com o dia
 * errado e alguém aparece na barbearia no dia seguinte. O único jeito de pegar
 * é afirmar o comportamento em fusos diferentes, aqui.
 */

describe("hoje depende de onde a barbearia está", () => {
  it("às 22h em São Paulo ainda é hoje lá, e já é amanhã em UTC", () => {
    // 2026-08-03 22:30 em São Paulo = 2026-08-04 01:30 UTC.
    const instante = new Date("2026-08-04T01:30:00Z");
    expect(hojeNoFuso("America/Sao_Paulo", instante)).toBe("2026-08-03");
    expect(hojeNoFuso("UTC", instante)).toBe("2026-08-04");
  });

  it("em Dublin, o mesmo instante já é outro dia", () => {
    const instante = new Date("2026-08-04T01:30:00Z");
    expect(hojeNoFuso("Europe/Dublin", instante)).toBe("2026-08-04");
  });
});

describe("um horário da agenda é um instante diferente em cada lugar", () => {
  it("15:00 em São Paulo é 18:00 UTC (inverno de lá)", () => {
    expect(instanteNoFuso("2026-08-04", "15:00", "America/Sao_Paulo").toISOString()).toBe(
      "2026-08-04T18:00:00.000Z"
    );
  });

  it("15:00 em Dublin no verão é 14:00 UTC — horário de verão incluído", () => {
    expect(instanteNoFuso("2026-08-04", "15:00", "Europe/Dublin").toISOString()).toBe(
      "2026-08-04T14:00:00.000Z"
    );
  });

  it("15:00 em Dublin no inverno é 15:00 UTC — o deslocamento muda no ano", () => {
    // Se o offset fosse calculado uma vez e reaproveitado, este caso quebraria.
    expect(instanteNoFuso("2026-12-04", "15:00", "Europe/Dublin").toISOString()).toBe(
      "2026-12-04T15:00:00.000Z"
    );
  });

  it("a diferença entre os dois vira 3h de antecedência calculada errado", () => {
    const sp = instanteNoFuso("2026-08-04", "15:00", "America/Sao_Paulo").getTime();
    const dub = instanteNoFuso("2026-08-04", "15:00", "Europe/Dublin").getTime();
    expect((sp - dub) / 3_600_000).toBe(4);
  });
});

describe("dia da semana no fuso certo", () => {
  it("04/08/2026 é terça", () => {
    expect(diaDaSemanaNoFuso("2026-08-04", "America/Sao_Paulo")).toBe(2);
    expect(diaDaSemanaNoFuso("2026-08-04", "Europe/Dublin")).toBe(2);
  });

  it("02/08/2026 é domingo — o dia em que a barbearia não abre", () => {
    expect(diaDaSemanaNoFuso("2026-08-02", "America/Sao_Paulo")).toBe(0);
  });
});

describe("barbearia sem locale gravado", () => {
  it("herda o padrão da plataforma em vez de virar undefined", () => {
    // `Intl` com fuso undefined cai no fuso do PROCESSO, que é UTC na Cloud
    // Function — o erro mais silencioso possível.
    expect(localeDoDocumento({})).toEqual({
      timeZone: "America/Sao_Paulo",
      currency: "BRL",
      locale: "pt-BR",
    });
  });

  it("respeita o que estiver gravado, campo a campo", () => {
    expect(localeDoDocumento({ locale: { timeZone: "Europe/Dublin", currency: "EUR" } })).toEqual({
      timeZone: "Europe/Dublin",
      currency: "EUR",
      locale: "pt-BR",
    });
  });
});
