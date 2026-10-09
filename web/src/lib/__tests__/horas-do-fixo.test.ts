import { describe, expect, it } from "vitest";
import { contarLiberaveis, horasDoFixo, inicioDoFixo } from "@/lib/horas-do-fixo";
import { cabeNaJornada, impactoDaJornada } from "@/lib/impacto-da-jornada";
import { contarPresos } from "@/lib/presos-do-barbeiro";

describe("contarPresos — o que a saída do barbeiro deixa para trás (09/10)", () => {
  it("conta o futuro em aberto dele e os mensalistas ativos com fixo nele", () => {
    const r = contarPresos({
      staffId: "a",
      hoje: "2026-10-09",
      reservas: [
        { staffId: "a", date: "2026-10-10", status: "confirmed" },
        { staffId: "a", date: "2026-10-09", status: "confirmed_by_client" },
        { staffId: "a", date: "2026-10-08", status: "confirmed" },
        { staffId: "a", date: "2026-10-12", status: "cancelled_by_client" },
        { staffId: "b", date: "2026-10-12", status: "confirmed" },
      ],
      fixos: [
        { status: "ativo", horarioFixo: { staffId: "a" } },
        { status: "ativo", horarioFixo: { staffId: "b" } },
        { status: "encerrado", horarioFixo: { staffId: "a" } },
        { status: "ativo", horarioFixo: null },
      ],
    });
    expect(r).toEqual({ reservas: 2, fixos: 1 });
  });
});

const LOJA = {
  weekdays: [1, 2, 3, 4, 5, 6],
  opensAt: "09:00",
  closesAt: "19:00",
  breaks: [{ from: "12:00", to: "14:00" }],
  slotMinutes: 30,
};

describe("horasDoFixo — só o que o servidor aceita (09/10)", () => {
  it("a duração do atendimento tira o horário que invade o almoço", () => {
    const curto = horasDoFixo({ schedule: LOJA, weekday: 5, date: "2026-10-16", duracao: 30 });
    const longo = horasDoFixo({ schedule: LOJA, weekday: 5, date: "2026-10-16", duracao: 60 });
    expect(curto).toContain("11:30");
    expect(longo).not.toContain("11:30");
    expect(longo).toContain("11:00");
  });

  it("a jornada do barbeiro vale sobre a da loja", () => {
    const horas = horasDoFixo({
      schedule: LOJA,
      barbeiro: { schedule: { ...LOJA, opensAt: "13:00", closesAt: "18:00", breaks: [] } },
      weekday: 5,
      date: "2026-10-16",
    });
    expect(horas[0]).toBe("13:00");
    expect(horas).not.toContain("09:00");
  });

  it("dia que a loja não abre não tem horário", () => {
    expect(horasDoFixo({ schedule: LOJA, weekday: 0, date: "2026-10-18" })).toEqual([]);
  });

  it("um feriado na data não tira o dia da semana inteiro", () => {
    const comFeriado = { ...LOJA, exceptions: [{ date: "2026-10-16", closed: true }] };
    expect(horasDoFixo({ schedule: comFeriado, weekday: 5, date: "2026-10-16" }).length).toBeGreaterThan(0);
  });
});

describe("inicioDoFixo — o primeiro instante futuro (09/10)", () => {
  /* Sexta, 09/10/2026, 14:00 (hora local da máquina). */
  const agora = new Date(2026, 9, 9, 14, 0);

  it("hoje só vale se o horário ainda não chegou", () => {
    expect(inicioDoFixo({ diaDaSemana: 5, hora: "16:00", agora })).toBe("2026-10-09");
    expect(inicioDoFixo({ diaDaSemana: 5, hora: "10:00", agora })).toBe("2026-10-16");
    expect(inicioDoFixo({ diaDaSemana: 5, hora: "14:00", agora })).toBe("2026-10-16");
  });

  it("outro dia da semana é a próxima ocorrência", () => {
    expect(inicioDoFixo({ diaDaSemana: 2, hora: "10:00", agora })).toBe("2026-10-13");
  });
});

describe("contarLiberaveis — o que 'Tirar horário fixo' cancela", () => {
  const agora = new Date(2026, 9, 9, 14, 0);
  it("conta o futuro em aberto e deixa o remarcado, o passado e o fechado", () => {
    const reservas = [
      { status: "confirmed", date: "2026-10-16", time: "10:00" },
      { status: "confirmed_by_client", date: "2026-10-23", time: "10:00" },
      { status: "confirmed", date: "2026-10-30", time: "10:00", rescheduledFrom: { date: "2026-10-30" } },
      { status: "confirmed", date: "2026-10-09", time: "10:00" },
      { status: "completed", date: "2026-10-02", time: "10:00" },
      { status: "cancelled_by_client", date: "2026-11-06", time: "10:00" },
    ];
    expect(contarLiberaveis(reservas, agora)).toBe(2);
  });
});

describe("impactoDaJornada — o que mudar a semana faz com quem já marcou (09/10)", () => {
  const sempre = () => false;
  const depoisSemSabado = { ...LOJA, weekdays: [1, 2, 3, 4, 5] };

  it("reserva de sábado deixa de caber; a de sexta continua", () => {
    const r = impactoDaJornada({
      antes: LOJA,
      depois: depoisSemSabado,
      hoje: "2026-10-09",
      temJornadaPropria: sempre,
      reservas: [
        { date: "2026-10-17", time: "10:00", status: "confirmed" }, // sábado
        { date: "2026-10-16", time: "10:00", status: "confirmed" }, // sexta
        { date: "2026-10-24", time: "10:00", status: "cancelled_by_client" },
      ],
      fixos: [],
    });
    expect(r).toEqual({ reservas: 1, fixos: 0 });
  });

  it("fixo de sábado conta; o que já estava fora do expediente, não", () => {
    const r = impactoDaJornada({
      antes: LOJA,
      depois: depoisSemSabado,
      hoje: "2026-10-09",
      temJornadaPropria: sempre,
      reservas: [{ date: "2026-10-17", time: "20:00", status: "confirmed" }],
      fixos: [
        { staffId: "a", diaDaSemana: 6, hora: "10:00", duracao: 30 },
        { staffId: "a", diaDaSemana: 5, hora: "10:00", duracao: 30 },
      ],
    });
    expect(r).toEqual({ reservas: 0, fixos: 1 });
  });

  it("barbeiro com jornada própria não é afetado pela da loja", () => {
    const r = impactoDaJornada({
      antes: LOJA,
      depois: depoisSemSabado,
      hoje: "2026-10-09",
      temJornadaPropria: (id) => id === "b",
      reservas: [{ staffId: "b", date: "2026-10-17", time: "10:00", status: "confirmed" }],
      fixos: [{ staffId: "b", diaDaSemana: 6, hora: "10:00", duracao: 30 }],
    });
    expect(r).toEqual({ reservas: 0, fixos: 0 });
  });

  it("cabeNaJornada respeita a duração e o almoço", () => {
    expect(cabeNaJornada(LOJA, { date: "2026-10-16", time: "11:30", duracao: 30 })).toBe(true);
    expect(cabeNaJornada(LOJA, { date: "2026-10-16", time: "11:30", duracao: 60 })).toBe(false);
  });
});
