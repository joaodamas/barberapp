import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES,
  DEFAULT_TENANT,
  featuresForPlan,
  isTrialExpired,
  PLATFORM_DEFAULT_POLICIES,
  shortNameFrom,
  shouldWarnAboutTrial,
  slugFromHost,
  tenantCssVars,
  tenantUrl,
  trialDaysLeft,
} from "@/lib/tenant";

describe("resolução do subdomínio", () => {
  it("extrai o slug da barbearia", () => {
    expect(slugFromHost("osiqueira.jpproject.com.br")).toBe("osiqueira");
    expect(slugFromHost("barbearia-do-ze.jpproject.com.br")).toBe("barbearia-do-ze");
  });

  it("ignora a porta", () => {
    expect(slugFromHost("osiqueira.jpproject.com.br:3000")).toBe("osiqueira");
  });

  it("não trata o site institucional como barbearia", () => {
    expect(slugFromHost("www.jpproject.com.br")).toBeNull();
    expect(slugFromHost("app.jpproject.com.br")).toBeNull();
  });

  it("cai no padrão em desenvolvimento e preview", () => {
    for (const host of [
      "localhost:3000",
      "127.0.0.1:3000",
      "axon-barber.web.app",
      "axon-barber.firebaseapp.com",
      "jpproject.com.br",
      null,
      undefined,
      "",
    ]) {
      expect(slugFromHost(host)).toBeNull();
    }
  });

  it("é insensível a maiúsculas e ao ponto final", () => {
    expect(slugFromHost("OSiqueira.JPProject.com.br")).toBe("osiqueira");
    expect(slugFromHost("osiqueira.jpproject.com.br.")).toBe("osiqueira");
  });

  it("não confunde o apex com um slug — .com.br tem três rótulos", () => {
    expect(slugFromHost("jpproject.com.br")).toBeNull();
  });

  it("ignora host de outro domínio e subdomínio de segundo nível", () => {
    expect(slugFromHost("osiqueira.outrodominio.com.br")).toBeNull();
    expect(slugFromHost("a.b.jpproject.com.br")).toBeNull();
  });
});

describe("tenant padrão", () => {
  it("usa as políticas da plataforma como ponto de partida", () => {
    expect(DEFAULT_TENANT.policies).toEqual(PLATFORM_DEFAULT_POLICIES);
  });

  it("tem todos os recursos liberados", () => {
    expect(DEFAULT_TENANT.features).toEqual(ALL_FEATURES);
  });

  it("só personaliza a cor de destaque, não o contraste do sistema", () => {
    const vars = tenantCssVars(DEFAULT_TENANT) as Record<string, string>;
    expect(Object.keys(vars)).toEqual(["--color-gold"]);
  });

  it("monta a URL pública da barbearia", () => {
    expect(tenantUrl("osiqueira", "/agendar")).toContain("osiqueira.");
    expect(tenantUrl("osiqueira", "/agendar")).toMatch(/\/agendar$/);
  });
});

describe("host atrás de proxy", () => {
  it("o subdomínio sobrevive ao encaminhamento do Hosting", () => {
    // O Firebase Hosting reescreve `Host` para *.run.app e guarda o original
    // em `x-forwarded-host`. Ler o header errado derruba o multi-tenant
    // inteiro em silêncio.
    expect(slugFromHost("ssraxonbarber-n75dlgtbka-uc.a.run.app")).toBeNull();
    expect(slugFromHost("osiqueira.jpproject.com.br")).toBe("osiqueira");
  });
});

describe("nome curto sob o ícone", () => {
  it("corta por palavra, não no meio dela", () => {
    // O caso real: a barbearia piloto ficou com "O Siqueira Bar" no ícone do
    // celular porque o onboarding cortava por caractere.
    expect(shortNameFrom("O Siqueira Barbearia")).toBe("O Siqueira");
    expect(shortNameFrom("Barbearia do Zé")).toBe("Barbearia do");
  });

  it("deixa passar o que já cabe", () => {
    expect(shortNameFrom("Corte Fino")).toBe("Corte Fino");
    expect(shortNameFrom("  Studio  Rei ")).toBe("Studio Rei");
  });

  it("uma palavra sozinha maior que o limite ainda precisa caber", () => {
    expect(shortNameFrom("Barbeariadoseuze").length).toBeLessThanOrEqual(14);
  });
});

describe("período de teste", () => {
  /* Estas três funções existiam desde a fundação do multi-tenant sem um único
   * chamador, e agora decidem se o painel abre. Sem teste, o trial de 7 dias
   * era uma promessa de documento. */
  const trial = { startedAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-08T00:00:00.000Z" };

  it("conta os dias que faltam, e fica negativo depois de vencer", () => {
    expect(trialDaysLeft(trial, new Date("2026-08-05T00:00:00Z"))).toBe(3);
    expect(trialDaysLeft(trial, new Date("2026-08-08T00:00:00Z"))).toBe(0);
    expect(trialDaysLeft(trial, new Date("2026-08-10T00:00:00Z"))).toBe(-2);
  });

  it("barbearia sem trial nunca vence — é cliente pagante ou o tenant piloto", () => {
    expect(trialDaysLeft(null)).toBeNull();
    expect(isTrialExpired(null)).toBe(false);
    expect(shouldWarnAboutTrial(null)).toBe(false);
  });

  it("o painel fecha no dia do vencimento, não no dia seguinte", () => {
    expect(isTrialExpired(trial, new Date("2026-08-07T23:00:00Z"))).toBe(false);
    expect(isTrialExpired(trial, new Date("2026-08-08T00:00:00Z"))).toBe(true);
  });

  it("o aviso aparece só na reta final, para não virar ruído", () => {
    expect(shouldWarnAboutTrial(trial, new Date("2026-08-02T00:00:00Z"))).toBe(false);
    expect(shouldWarnAboutTrial(trial, new Date("2026-08-04T00:00:00Z"))).toBe(true);
    expect(shouldWarnAboutTrial(trial, new Date("2026-08-07T00:00:00Z"))).toBe(true);
  });
});

describe("recursos por plano", () => {
  it("o plano de entrada não entrega o que o de cima vende", () => {
    const entrada = featuresForPlan("entrada");
    expect(entrada.subscriptions).toBe(false);
    expect(entrada.store).toBe(false);
    expect(entrada.advancedFinance).toBe(false);
  });

  it("WhatsApp e fidelidade entram já no plano de entrada", () => {
    const entrada = featuresForPlan("entrada");
    expect(entrada.whatsapp).toBe(true);
    expect(entrada.loyalty).toBe(true);
  });

  it("o plano completo libera tudo", () => {
    expect(featuresForPlan("completo")).toEqual(ALL_FEATURES);
  });
});
