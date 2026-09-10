import { describe, expect, it } from "vitest";
import { horariosDaJornada, jornadaDoDia, type EntradaDeJornada } from "../jornada";

/**
 * A régua da jornada, do lado que DECIDE.
 *
 * O contrato completo — precedência, herança, poda — é exercido em
 * `web/src/lib/__tests__/jornada.test.ts`, que também prova que os dois
 * arquivos não divergiram. O que estes casos guardam é o que só importa aqui:
 * o servidor é a autoridade, e ele recebe o documento **cru** do Firestore, em
 * que todo campo pode faltar e nenhum tipo é garantido.
 *
 * Uma barbearia criada antes de `perDay` e `exceptions` existirem — que são
 * todas as de hoje — precisa continuar abrindo exatamente como abria.
 */

const CRU: EntradaDeJornada = {
  weekdays: [2, 3, 4, 5, 6],
  opensAt: "09:00",
  closesAt: "19:30",
  breaks: [{ from: "12:00", to: "14:00" }],
  slotMinutes: 30,
};

/* 2026-09-15 é terça. */
const TERCA = "2026-09-15";

describe("jornada · o documento antigo continua valendo", () => {
  it("sem `perDay` nem `exceptions`, a terça abre como sempre abriu", () => {
    const j = jornadaDoDia({ schedule: CRU, weekday: 2, date: TERCA });
    expect(j).toMatchObject({ aberto: true, opensAt: "09:00", closesAt: "19:30" });
  });

  it("documento sem `schedule` nenhum não derruba a agenda", () => {
    /* O servidor entrega `shop.schedule ?? {}`. Se esta função explodisse com
     * objeto vazio, `availableSlots` deixaria de responder — e a tela de
     * agendar ficaria carregando para sempre, sem erro em log nenhum. */
    const j = jornadaDoDia({ schedule: {}, weekday: 2, date: TERCA });
    expect(j.aberto).toBe(true);
  });

  it("campo corrompido não vira dia sem horário", () => {
    const j = jornadaDoDia({
      schedule: { ...CRU, breaks: [{ from: "meio-dia", to: "14:00" }] },
      weekday: 2,
      date: TERCA,
    });
    /* Pausa ilegível é DESCARTADA, não tratada como o dia inteiro: o oposto
     * fecharia a barbearia por causa de um campo mal digitado. */
    expect(j.aberto && j.breaks).toEqual([]);
    expect(horariosDaJornada({ jornada: j as never, slotMinutes: 30 })).toContain("12:00");
  });
});

describe("jornada · o que o servidor recusa", () => {
  it("dia fechado por exceção não oferece horário nenhum", () => {
    const j = jornadaDoDia({
      schedule: { ...CRU, exceptions: [{ date: TERCA, closed: true, note: "feriado" }] },
      weekday: 2,
      date: TERCA,
    });
    expect(j).toMatchObject({ aberto: false, origem: "excecao", nota: "feriado" });
  });

  it("a terça que fecha às 17:30 não oferece 18:00", () => {
    const j = jornadaDoDia({
      schedule: { ...CRU, perDay: { "2": { closesAt: "17:30" } } },
      weekday: 2,
      date: TERCA,
    });
    const grade = horariosDaJornada({ jornada: j as never, slotMinutes: 30 });
    expect(grade).toContain("17:00");
    expect(grade).not.toContain("18:00");
    expect(grade.at(-1)).toBe("17:00");
  });
});
