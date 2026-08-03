import { describe, expect, it } from "vitest";
import {
  ALL_FEATURES,
  DEFAULT_TENANT,
  PLATFORM_DEFAULT_POLICIES,
  slugFromHost,
  tenantCssVars,
  tenantUrl,
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
