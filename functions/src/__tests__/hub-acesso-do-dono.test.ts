import { describe, expect, it } from "vitest";
import { autorizarDominio, enviarEmailDeDefinirSenha } from "../hub/acesso-do-dono";

/**
 * As chamadas ao Identity Toolkit, com o `fetch` trocado por um que só anota.
 * Confere O QUE seria enviado — a parte que, errada, derruba o login de todo
 * mundo (a lista de domínios) ou manda o e-mail errado.
 */

type Chamada = { url: string; init?: RequestInit };

function fetchFalso(respostas: Array<{ status: number; json?: unknown }>) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    chamadas.push({ url, init });
    const r = respostas.shift() ?? { status: 200, json: {} };
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

describe("e-mail de definir senha", () => {
  it("pede um PASSWORD_RESET com a chave web e o endereço de volta", async () => {
    const { f, chamadas } = fetchFalso([{ status: 200 }]);
    await enviarEmailDeDefinirSenha({
      email: "dono@x.com",
      chaveWeb: " chave-web \n",
      continueUrl: "https://x.topete.com.br/login",
      fetch: f,
    });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toBe("https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=chave-web");
    expect(JSON.parse(String(chamadas[0].init?.body))).toEqual({
      requestType: "PASSWORD_RESET",
      email: "dono@x.com",
      continueUrl: "https://x.topete.com.br/login",
    });
  });

  it("sem endereço de volta quando o domínio não foi autorizado", async () => {
    const { f, chamadas } = fetchFalso([{ status: 200 }]);
    await enviarEmailDeDefinirSenha({ email: "dono@x.com", chaveWeb: "k", continueUrl: null, fetch: f });
    expect(JSON.parse(String(chamadas[0].init?.body))).not.toHaveProperty("continueUrl");
  });

  it("chave vazia falha antes de chamar, e a falha aparece", async () => {
    const { f, chamadas } = fetchFalso([]);
    await expect(enviarEmailDeDefinirSenha({ email: "d@x.com", chaveWeb: "", fetch: f })).rejects.toThrow(
      /TOPETE_WEB_API_KEY/
    );
    expect(chamadas).toHaveLength(0);
  });

  it("resposta de erro vira exceção", async () => {
    const { f } = fetchFalso([{ status: 400, json: { error: { message: "EMAIL_NOT_FOUND" } } }]);
    await expect(enviarEmailDeDefinirSenha({ email: "d@x.com", chaveWeb: "k", fetch: f })).rejects.toThrow(/400/);
  });
});

describe("domínio autorizado", () => {
  const token = async () => "tok";

  it("lê a lista, acrescenta o domínio e grava só esse campo", async () => {
    const { f, chamadas } = fetchFalso([
      { status: 200, json: { authorizedDomains: ["localhost", "osiqueira.jpproject.com.br"] } },
      { status: 200 },
    ]);
    const r = await autorizarDominio({ projeto: "axon-barber", dominio: "x.topete.com.br", fetch: f, token });
    expect(r).toBe("acrescentado");
    expect(chamadas[0].url).toBe("https://identitytoolkit.googleapis.com/admin/v2/projects/axon-barber/config");
    expect(chamadas[1].url).toBe(
      "https://identitytoolkit.googleapis.com/admin/v2/projects/axon-barber/config?updateMask=authorizedDomains"
    );
    expect(chamadas[1].init?.method).toBe("PATCH");
    expect(JSON.parse(String(chamadas[1].init?.body))).toEqual({
      authorizedDomains: ["localhost", "osiqueira.jpproject.com.br", "x.topete.com.br"],
    });
  });

  it("🔒 se a leitura falha, NÃO grava — uma lista vazia derrubaria o login de todos", async () => {
    const { f, chamadas } = fetchFalso([{ status: 403 }]);
    await expect(
      autorizarDominio({ projeto: "axon-barber", dominio: "x.topete.com.br", fetch: f, token })
    ).rejects.toThrow(/403/);
    expect(chamadas).toHaveLength(1);
  });

  it("domínio que já está não gera escrita", async () => {
    const { f, chamadas } = fetchFalso([{ status: 200, json: { authorizedDomains: ["x.topete.com.br"] } }]);
    const r = await autorizarDominio({ projeto: "p", dominio: "x.topete.com.br", fetch: f, token });
    expect(r).toBe("ja_estava");
    expect(chamadas).toHaveLength(1);
  });
});
