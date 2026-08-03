import { describe, expect, it } from "vitest";
import {
  bookableDays,
  firstBookableIndex,
  slotsForDate,
  workdayTimes,
} from "@/lib/slots";
import { bookingPolicy } from "@/lib/business-rules";
import { DEFAULT_SCHEDULE } from "@/lib/tenant";

const WORKDAY_TIMES = workdayTimes(DEFAULT_SCHEDULE);
const isOpenOn = (d: Date) => DEFAULT_SCHEDULE.weekdays.includes(d.getDay());

// Quinta-feira, 02/07/2026 — dia útil, usado como referência estável.
const QUINTA = "2026-07-02";
const DOMINGO = "2026-07-05";
const madrugada = new Date(`${QUINTA}T06:00:00`);

describe("dias agendáveis", () => {
  const days = bookableDays(new Date(`${QUINTA}T10:00:00`));

  it("oferece a quantidade configurada", () => {
    expect(days).toHaveLength(bookingPolicy.visibleDays);
  });

  it("marca domingo como fechado em vez de oferecer grade cheia", () => {
    const domingos = days.filter((d) => !isOpenOn(d.date));
    expect(domingos.length).toBeGreaterThan(0);
    for (const d of domingos) {
      expect(d.disabled).toBe(true);
      expect(d.reason).toBe("fechado");
    }
  });
});

describe("antecedência mínima", () => {
  it("não oferece horário que já passou", () => {
    const slots = slotsForDate(QUINTA, { now: new Date(`${QUINTA}T16:00:00`) });
    const dezDaManha = slots.find((s) => s.time === "09:00");
    expect(dezDaManha?.available).toBe(false);
  });

  it("respeita a janela mínima antes do horário", () => {
    // 08:45 — faltam 15 min para 09:00, menos que a antecedência mínima.
    const slots = slotsForDate(QUINTA, { now: new Date(`${QUINTA}T08:45:00`) });
    expect(slots.find((s) => s.time === "09:00")?.available).toBe(false);
    expect(slots.find((s) => s.time === "10:00")?.available).toBe(true);
  });
});

describe("duração total dos serviços", () => {
  it("não oferece o último slot da jornada para um serviço de 60 min", () => {
    const ultimo = WORKDAY_TIMES[WORKDAY_TIMES.length - 1];
    const slots = slotsForDate(QUINTA, { durationMin: 60, now: madrugada });
    expect(slots.find((s) => s.time === ultimo)?.available).toBe(false);
  });

  it("não atravessa o intervalo do almoço", () => {
    // Último horário antes do intervalo: um serviço de 60 min não cabe nele,
    // porque o slot seguinte na grade já é depois do almoço.
    const antesDoAlmoco = WORKDAY_TIMES[WORKDAY_TIMES.indexOf("14:00") - 1];
    const slots = slotsForDate(QUINTA, { durationMin: 60, now: madrugada });
    expect(slots.find((s) => s.time === antesDoAlmoco)?.available).toBe(false);
    expect(slots.find((s) => s.time === "14:00")?.available).toBe(true);
  });

  it("um serviço curto ainda cabe onde o longo não cabe", () => {
    const curto = slotsForDate(QUINTA, { durationMin: 30, now: madrugada });
    const longo = slotsForDate(QUINTA, { durationMin: 120, now: madrugada });
    expect(curto.filter((s) => s.available).length).toBeGreaterThan(
      longo.filter((s) => s.available).length
    );
  });
});

describe("encaixes", () => {
  it("horário ocupado vira encaixe quando permitido", () => {
    const slots = slotsForDate(QUINTA, {
      now: madrugada, allowFitIn: true, ocupados: ["10:00"],
    });
    expect(slots.find((s) => s.time === "10:00")?.isFitIn).toBe(true);
  });

  it("no reagendamento não há encaixe", () => {
    const slots = slotsForDate(QUINTA, {
      now: madrugada, allowFitIn: false, ocupados: ["10:00"],
    });
    expect(slots.every((s) => !s.isFitIn)).toBe(true);
    expect(slots.find((s) => s.time === "10:00")?.available).toBe(false);
  });

  it("a ocupação vem das reservas, não de padrão inventado", () => {
    const semReservas = slotsForDate(QUINTA, { now: madrugada });
    expect(semReservas.every((s) => s.available)).toBe(true);

    const comReserva = slotsForDate(QUINTA, { now: madrugada, ocupados: ["09:00"] });
    expect(comReserva.find((s) => s.time === "09:00")?.available).toBe(false);
  });

  it("respeita a jornada do tenant, não uma grade fixa", () => {
    const curta = slotsForDate(QUINTA, {
      now: madrugada,
      schedule: { weekdays: [1,2,3,4,5,6], opensAt: "09:00", closesAt: "11:00", breaks: [], slotMinutes: 30 },
    });
    expect(curta).toHaveLength(4);
    expect(curta.map((s) => s.time)).toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("dia fechado não é oferecido pelo seletor", () => {
    const days = bookableDays(new Date(`${QUINTA}T10:00:00`));
    expect(days.find((d) => d.iso === DOMINGO)?.disabled).toBe(true);
  });
});

describe("dia fechado", () => {
  // 02/08/2026 é um domingo — e foi o "hoje" real quando isto foi escrito.
  const DOMINGO_HOJE = new Date("2026-08-02T10:00:00");

  it("não devolve horário livre em dia fechado", () => {
    const slots = slotsForDate("2026-08-02", { now: new Date("2026-08-02T06:00:00") });
    expect(slots.every((s) => !s.available)).toBe(true);
  });

  it("o seletor não abre num dia fechado quando hoje é domingo", () => {
    const days = bookableDays(DOMINGO_HOJE);
    expect(days[0].disabled).toBe(true);
    const inicial = firstBookableIndex(days);
    expect(days[inicial].disabled).toBe(false);
  });

  it("firstBookableIndex devolve 0 se nada for agendável", () => {
    expect(firstBookableIndex([])).toBe(0);
  });
});
