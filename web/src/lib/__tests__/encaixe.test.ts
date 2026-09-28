import { describe, expect, it } from "vitest";
import { conflitosDoEncaixe, livresNoDia, recomendarEncaixe } from "@/lib/encaixe";
import type { BookingDoc } from "@/lib/domain";

const r = (o: Partial<BookingDoc>) =>
  ({ date: "2026-10-02", staffId: "romulo", status: "confirmed", durationMin: 30, ...o }) as BookingDoc;

const schedule = {
  opensAt: "09:00",
  closesAt: "19:30",
  slotMinutes: 30,
  weekdays: [2, 3, 4, 5, 6],
  breaks: [{ from: "12:00", to: "14:00" }],
};

describe("com quem o encaixe bate", () => {
  it("o caso do DUCA: 90 min às 18h passa por cima de três clientes", () => {
    const pedido = r({ time: "18:00", durationMin: 90, status: "fit_in_requested" });
    const agenda = [
      r({ time: "17:00" }),
      r({ time: "18:00" }),
      r({ time: "18:30" }),
      r({ time: "19:00" }),
      pedido,
    ];
    expect(conflitosDoEncaixe(pedido, agenda, 30).map((b) => b.time)).toEqual(["18:00", "18:30", "19:00"]);
  });

  it("encaixe curto dentro de um atendimento longo bate só com ele", () => {
    const pedido = r({ date: "2026-09-29", time: "14:00", durationMin: 30, status: "fit_in_requested" });
    const agenda = [r({ date: "2026-09-29", time: "14:00", durationMin: 90 }), r({ date: "2026-09-29", time: "17:30" })];
    expect(conflitosDoEncaixe(pedido, agenda, 30)).toHaveLength(1);
  });

  it("horários que só encostam, outra cadeira e cancelados não contam", () => {
    const pedido = r({ time: "17:00", durationMin: 30, status: "fit_in_requested" });
    const agenda = [
      r({ time: "16:30" }),
      r({ time: "17:30" }),
      r({ time: "17:00", staffId: "outro" }),
      r({ time: "17:00", status: "cancelled_by_client" }),
    ];
    expect(conflitosDoEncaixe(pedido, agenda, 30)).toEqual([]);
  });
});

describe("horários livres no mesmo dia", () => {
  it("oferece só onde a duração inteira cabe, fora do almoço e das reservas", () => {
    const livres = livresNoDia({
      schedule,
      date: "2026-10-02", // sexta
      staffId: "romulo",
      duracao: 60,
      todas: [r({ time: "09:00", durationMin: 60 }), r({ time: "10:30" })],
    });
    expect(livres).toContain("11:00");
    expect(livres).not.toContain("10:00"); // bateria nas 10:30
    expect(livres).not.toContain("11:30"); // invade o almoço
    expect(livres).not.toContain("09:30");
  });

  it("hoje, não oferece horário que já passou", () => {
    const livres = livresNoDia({ schedule, date: "2026-10-02", staffId: "romulo", duracao: 30, todas: [], agora: "16:10" });
    expect(livres[0]).toBe("16:30");
  });

  it("dia fechado não tem oferta", () => {
    expect(livresNoDia({ schedule, date: "2026-10-04", staffId: "romulo", duracao: 30, todas: [] })).toEqual([]);
  });
});

describe("sugestão de encaixe pelo tempo dos serviços", () => {
  it("DUCA: 90 min por cima de três clientes → não recomendado", () => {
    const r = recomendarEncaixe({
      pedido: { time: "18:00", durationMin: 90 },
      conflitos: [{ time: "18:00", durationMin: 30 }, { time: "18:30", durationMin: 30 }, { time: "19:00", durationMin: 30 }],
      grade: 30,
      livres: ["09:00", "16:30"],
    });
    expect(r.nivel).toBe("nao-recomendado");
    expect(r.minutosSobrepostos).toBe(90);
    expect(r.alternativa).toBe("16:30");
  });

  it("encaixe que só encosta 15 min → cabe", () => {
    const r = recomendarEncaixe({
      pedido: { time: "10:15", durationMin: 30 },
      conflitos: [{ time: "09:30", durationMin: 60 }],
      grade: 30,
      livres: [],
    });
    expect(r.nivel).toBe("cabe");
    expect(r.minutosSobrepostos).toBe(15);
  });

  it("um cliente, até metade do tempo → apertado", () => {
    const r = recomendarEncaixe({
      pedido: { time: "17:00", durationMin: 80 },
      conflitos: [{ time: "17:00", durationMin: 30 }],
      grade: 30,
      livres: [],
    });
    expect(r.nivel).toBe("apertado");
  });

  it("Tais: 30 min inteiros dentro de um atendimento de 90 → não recomendado", () => {
    const r = recomendarEncaixe({
      pedido: { time: "14:00", durationMin: 30 },
      conflitos: [{ time: "14:00", durationMin: 90 }],
      grade: 30,
      livres: ["15:30"],
    });
    expect(r.nivel).toBe("nao-recomendado");
    expect(r.alternativa).toBe("15:30");
  });

  it("sem conflito → vagou", () => {
    expect(recomendarEncaixe({ pedido: { time: "10:00", durationMin: 30 }, conflitos: [], grade: 30, livres: [] }).nivel).toBe("vagou");
  });
});
