import { describe, expect, it } from "vitest";
import {
  formatBRL,
  formatDatePtBR,
  formatDateShortPtBR,
  formatWeekdayAndDay,
  parseISODate,
  safeDiv,
  safePct,
  toISODate,
} from "@/lib/format";

describe("datas", () => {
  it("formatDateShortPtBR devolve a DATA, não o dia da semana", () => {
    // O bug: formatDatePtBR(...).split(",")[0] devolvia "domingo".
    expect(formatDatePtBR("2026-07-05")).toBe("domingo, 05 de julho");
    expect(formatDateShortPtBR("2026-07-05")).toBe("05 de julho");
    expect(formatDateShortPtBR("2026-07-05")).not.toContain("domingo");
  });

  it("formatWeekdayAndDay traz dia da semana E número", () => {
    expect(formatWeekdayAndDay("2026-07-05")).toBe("Dom 05");
  });

  it("interpreta ISO no fuso local, sem deslocar o dia", () => {
    expect(parseISODate("2026-07-05").getDate()).toBe(5);
    expect(toISODate(parseISODate("2026-07-05"))).toBe("2026-07-05");
  });
});

describe("números seguros", () => {
  it("safeDiv não devolve Infinity nem NaN", () => {
    expect(safeDiv(10, 0)).toBe(0);
    expect(safeDiv(0, 0)).toBe(0);
    expect(safeDiv(NaN, 2)).toBe(0);
    expect(safeDiv(10, 4)).toBe(2.5);
  });

  it("safePct fica sempre em [0, max]", () => {
    expect(safePct(5, 0)).toBe(0);
    expect(safePct(200, 100)).toBe(100);
    expect(safePct(-5, 100)).toBe(0);
    expect(safePct(25, 100)).toBe(25);
  });

  it("formatBRL não imprime 'R$ ∞'", () => {
    expect(formatBRL(Infinity)).not.toContain("∞");
    expect(formatBRL(NaN)).toBe(formatBRL(0));
  });
});
