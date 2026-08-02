import { describe, expect, it } from "vitest";
import { bookableDays, slotsForDate, WORKDAY_TIMES } from "@/lib/slots";
import { bookingPolicy, isOpenOn } from "@/lib/business-rules";

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

  it("não atravessa o intervalo entre 11:00 e 14:00", () => {
    const slots = slotsForDate(QUINTA, { durationMin: 60, now: madrugada });
    expect(slots.find((s) => s.time === "11:00")?.available).toBe(false);
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
    const slots = slotsForDate(QUINTA, { now: madrugada, allowFitIn: true });
    expect(slots.some((s) => s.isFitIn)).toBe(true);
  });

  it("no reagendamento não há encaixe", () => {
    const slots = slotsForDate(QUINTA, { now: madrugada, allowFitIn: false });
    expect(slots.every((s) => !s.isFitIn)).toBe(true);
  });

  it("ocupação depende da data, não da posição na lista", () => {
    const a = slotsForDate(QUINTA, { now: madrugada });
    const b = slotsForDate("2026-07-03", { now: new Date("2026-07-03T06:00:00") });
    expect(a.map((s) => s.available).join()).not.toBe(b.map((s) => s.available).join());
  });

  it("dia fechado não é oferecido pelo seletor", () => {
    const days = bookableDays(new Date(`${QUINTA}T10:00:00`));
    expect(days.find((d) => d.iso === DOMINGO)?.disabled).toBe(true);
  });
});
