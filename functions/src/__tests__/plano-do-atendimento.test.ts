import { describe, expect, it } from "vitest";
import { recorteDoPlano } from "../plano-do-atendimento";

/**
 * O que o barbeiro fica sabendo do plano do cliente no fechamento (08/10):
 * nome e cobertura. Preço, vencimento e horário fixo são da casa.
 */
describe("recorteDoPlano", () => {
  const assinatura = {
    clientId: "cliente-1",
    status: "ativo",
    planName: "Ilimitado",
    price: 149,
    billingDay: 10,
    nextCharge: "2026-11-10",
    unlimited: true,
    servicesIncluded: null,
    horarioFixo: { dia: 6, hora: "09:00" },
  };

  it("devolve só nome e cobertura", () => {
    expect(recorteDoPlano(assinatura)).toEqual({ planName: "Ilimitado", unlimited: true, servicesIncluded: null });
  });

  it("🔒 nada de preço, vencimento ou horário fixo", () => {
    const r = recorteDoPlano(assinatura) as Record<string, unknown>;
    for (const campo of ["price", "billingDay", "nextCharge", "horarioFixo", "clientId"]) {
      expect(r, campo).not.toHaveProperty(campo);
    }
  });

  it("plano de cota leva o número; sem cota é o plano que não cobre", () => {
    expect(recorteDoPlano({ ...assinatura, unlimited: false, servicesIncluded: 4 })?.servicesIncluded).toBe(4);
    expect(recorteDoPlano({ ...assinatura, unlimited: undefined, servicesIncluded: undefined })).toEqual({
      planName: "Ilimitado",
      unlimited: false,
      servicesIncluded: null,
    });
  });

  it("assinatura que não está ativa não é plano", () => {
    expect(recorteDoPlano({ ...assinatura, status: "cancelado" })).toBeNull();
    expect(recorteDoPlano(undefined)).toBeNull();
  });

  it("cancelada com o mês pago ainda é plano naquela competência, e só nela", () => {
    const cancelada = { ...assinatura, status: "cancelado", startedAt: "2026-01-10", canceledAt: "2026-10-05" };
    expect(recorteDoPlano(cancelada, "2026-10", true)).toMatchObject({ planName: "Ilimitado" });
    expect(recorteDoPlano(cancelada, "2026-11", true)).toBeNull();
    // Sem a fatura do mês paga, cancelada não é plano.
    expect(recorteDoPlano(cancelada, "2026-10", false)).toBeNull();
    expect(recorteDoPlano(cancelada, "2026-10")).toBeNull();
  });
});
