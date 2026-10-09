import { describe, expect, it } from "vitest";
import { mensalistaDoHorario } from "@/lib/mensalista-do-horario";

describe("mensalista na agenda do barbeiro", () => {
  it("coberto pelo plano é fato gravado pelo servidor", () => {
    expect(
      mensalistaDoHorario({
        cobertura: {
          tipo: "plano",
          subscriptionId: "s1",
          planId: "p1",
          planName: "Ilimitado",
          competencia: "2026-10",
          valorCoberto: 45,
          usoNaCompetencia: 1,
          cota: null,
        },
      })
    ).toBe("coberto");
  });

  it("horário fixo só existe para mensalista, mas a cota ainda é decidida depois", () => {
    expect(mensalistaDoHorario({ horarioFixoId: "h1" })).toBe("fixo");
    expect(mensalistaDoHorario({ origin: "fixo" })).toBe("fixo");
  });

  it("sem sinal na reserva, não afirma nada", () => {
    expect(mensalistaDoHorario({})).toBeNull();
    expect(mensalistaDoHorario({ origin: "app" })).toBeNull();
    expect(mensalistaDoHorario({ cobertura: { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 } })).toBeNull();
  });
});
