import { describe, expect, it } from "vitest";
import { toTenant } from "@/lib/tenant-shape";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";

/**
 * A mesma normalização atende dois caminhos de leitura: a REST do Firestore no
 * servidor e o SDK cliente no painel. Estes testes protegem o que diverge
 * entre eles — formato de data — e o que a gravação por caminho pontilhado faz
 * com o documento.
 */
describe("documento da barbearia → Tenant", () => {
  it("política gravada pela metade não apaga o resto — o caso real de 11/08", () => {
    /* Salvar a tolerância em Configurações grava
     * `policies.booking.lateToleranceMinutes` por caminho pontilhado, e o
     * documento em produção ficou com ESTE formato: um campo só. Sem o merge,
     * `minAdvanceMinutes` vira undefined e a agenda passa a aceitar reserva
     * para horário que já passou — longe da tela onde a mudança foi feita. */
    const tenant = toTenant("shop1", {
      policies: { booking: { lateToleranceMinutes: 5 } },
    });

    expect(tenant.policies.booking.lateToleranceMinutes).toBe(5);
    expect(tenant.policies.booking.minAdvanceMinutes).toBe(
      PLATFORM_DEFAULT_POLICIES.booking.minAdvanceMinutes
    );
    expect(tenant.policies.booking.fitInExpirationMinutes).toBe(
      PLATFORM_DEFAULT_POLICIES.booking.fitInExpirationMinutes
    );
  });

  it("taxa gravada sozinha não zera as outras", () => {
    // Zero é taxa válida; `undefined` vira NaN no cálculo do líquido.
    const tenant = toTenant("shop1", {
      policies: { paymentFees: { credito: 3.49 } },
    });

    expect(tenant.policies.paymentFees.credito).toBe(3.49);
    expect(tenant.policies.paymentFees.debito).toBe(0);
    expect(tenant.policies.paymentFees.pix).toBe(0);
  });

  it("as demais políticas continuam completas", () => {
    const tenant = toTenant("shop1", {
      policies: { booking: { lateToleranceMinutes: 5 } },
    });

    expect(tenant.policies.cancellation).toEqual(PLATFORM_DEFAULT_POLICIES.cancellation);
    expect(tenant.policies.commissionSplit).toEqual(PLATFORM_DEFAULT_POLICIES.commissionSplit);
  });

  it("Timestamp do SDK cliente vira ISO", () => {
    /* O painel agora normaliza o documento que veio pelo SDK, e lá as datas
     * são `Timestamp`, não string. Sem isto, o trial do painel seria sempre
     * nulo — e barbearia em teste apareceria como contratada. */
    const timestamp = { toDate: () => new Date("2026-08-18T12:00:00.000Z") };
    const tenant = toTenant("shop1", {
      trial: { startedAt: timestamp, endsAt: timestamp },
    });

    expect(tenant.trial?.endsAt).toBe("2026-08-18T12:00:00.000Z");
  });

  it("data em string, como vem da REST, atravessa igual", () => {
    const tenant = toTenant("shop1", {
      trial: { startedAt: "2026-08-11T12:00:00.000Z", endsAt: "2026-08-18T12:00:00.000Z" },
    });

    expect(tenant.trial?.endsAt).toBe("2026-08-18T12:00:00.000Z");
  });

  it("documento vazio vira barbearia com o padrão da plataforma", () => {
    const tenant = toTenant("shop1", {});

    expect(tenant.policies).toEqual(PLATFORM_DEFAULT_POLICIES);
    expect(tenant.trial).toBeNull();
    // Plano ausente recebe o MÍNIMO, não o máximo.
    expect(tenant.plan).toBe("entrada");
  });
});
