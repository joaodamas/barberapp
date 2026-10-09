/**
 * Coletor de erros do navegador. O que não pode regredir: pedido de fora do
 * produto é recusado, dado pessoal não chega ao log, o campo fixo `origem`
 * (que a política de alerta filtra) está sempre lá, e o navegador não manda
 * enxurrada.
 */
import { describe, expect, it, vi } from "vitest";
import {
  criarRelator,
  hostConhecido,
  montarLinhaDeLog,
  normalizarErro,
  origemPermitida,
  tenantDoHost,
  tirarDadosPessoais,
} from "@/lib/erro-front";

describe("origem permitida", () => {
  it("aceita o domínio raiz, subdomínios de barbearia e os sites do Hosting", () => {
    expect(origemPermitida("https://osiqueira.jpproject.com.br", null)).toBe(true);
    expect(origemPermitida("https://topete.com.br", null)).toBe(true);
    expect(origemPermitida("https://cortehub-dev.web.app", null)).toBe(true);
    expect(origemPermitida("https://axon-barber.web.app", null)).toBe(true);
  });

  it("recusa host de fora, inclusive os que só parecem com o nosso", () => {
    expect(origemPermitida("https://evil.com", null)).toBe(false);
    expect(origemPermitida("https://topete.com.br.evil.com", null)).toBe(false);
    expect(origemPermitida("https://eviltopete.com.br", null)).toBe(false);
    expect(hostConhecido("jpproject.com.br.x.io")).toBe(false);
  });

  it("sem Origin cai no Referer; sem nenhum dos dois, recusa", () => {
    expect(origemPermitida(null, "https://osiqueira.jpproject.com.br/painel?x=1")).toBe(true);
    expect(origemPermitida(null, null)).toBe(false);
    expect(origemPermitida("null", null)).toBe(false);
  });

  it("a Origin vale mais que o Referer", () => {
    expect(origemPermitida("https://evil.com", "https://topete.com.br/")).toBe(false);
  });

  it("localhost só quando pedido (desenvolvimento)", () => {
    expect(origemPermitida("http://localhost:3000", null)).toBe(false);
    expect(origemPermitida("http://localhost:3000", null, { aceitarLocal: true })).toBe(true);
    expect(origemPermitida("http://osiqueira.lvh.me:3000", null, { aceitarLocal: true })).toBe(true);
  });
});

describe("tenant do host", () => {
  it("é o rótulo antes da raiz", () => {
    expect(tenantDoHost("osiqueira.jpproject.com.br")).toBe("osiqueira");
    expect(tenantDoHost("jpproject.com.br")).toBeNull();
    expect(tenantDoHost("www.topete.com.br")).toBeNull();
    expect(tenantDoHost("cortehub-dev.web.app")).toBeNull();
    expect(tenantDoHost(null)).toBeNull();
  });
});

describe("dados pessoais", () => {
  it("tira e-mail e telefone da mensagem", () => {
    const t = tirarDadosPessoais("falhou para joao.silva@gmail.com tel (11) 99999-8888 ou 5511999998888");
    expect(t).not.toContain("@");
    expect(t).not.toMatch(/9999/);
    expect(t).toContain("[e-mail]");
  });

  it("mantém o texto técnico", () => {
    expect(tirarDadosPessoais("Cannot read properties of undefined (reading 'map')")).toBe(
      "Cannot read properties of undefined (reading 'map')",
    );
  });
});

describe("normalizar o corpo", () => {
  it("trunca campos e guarda só o caminho da rota", () => {
    const e = normalizarErro({
      tipo: "tela",
      mensagem: "x".repeat(5000),
      digest: "abc123",
      rota: "/painel/clientes?telefone=11999998888#fim",
      userAgent: "u".repeat(900),
      campoExtra: "ignorado",
    });
    expect(e).not.toBeNull();
    expect(e!.mensagem).toHaveLength(300);
    expect(e!.userAgent).toHaveLength(200);
    expect(e!.rota).toBe("/painel/clientes");
    expect(e).not.toHaveProperty("campoExtra");
  });

  it("sem mensagem, ou corpo que não é objeto, não vira registro", () => {
    expect(normalizarErro({ tipo: "tela" })).toBeNull();
    expect(normalizarErro({ mensagem: "   " })).toBeNull();
    expect(normalizarErro("texto")).toBeNull();
    expect(normalizarErro(null)).toBeNull();
    expect(normalizarErro({ mensagem: 42 })).toBeNull();
  });
});

describe("linha de log", () => {
  it("traz severity ERROR e o marcador origem=front", () => {
    const erro = normalizarErro({ tipo: "tela", mensagem: "quebrou", digest: "d1", rota: "/painel" })!;
    const linha = montarLinhaDeLog(erro, "osiqueira");
    expect(linha.severity).toBe("ERROR");
    expect(linha.origem).toBe("front");
    expect(linha.message).toBe("[front] quebrou");
    expect(linha.tenant).toBe("osiqueira");
    expect(linha.digest).toBe("d1");
  });
});

describe("relator do navegador", () => {
  const entrada = (mensagem: string) => ({ tipo: "onerror", mensagem, digest: "" });

  it("deduplica a mesma mensagem", () => {
    const enviar = vi.fn();
    const relatar = criarRelator(enviar);
    expect(relatar(entrada("a"))).toBe(true);
    expect(relatar(entrada("a"))).toBe(false);
    expect(relatar(entrada("b"))).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(2);
  });

  it("para depois do máximo por sessão", () => {
    const enviar = vi.fn();
    const relatar = criarRelator(enviar, { maximo: 3 });
    for (let i = 0; i < 10; i++) relatar(entrada(`erro ${i}`));
    expect(enviar).toHaveBeenCalledTimes(3);
  });

  it("completa rota e userAgent na hora do envio", () => {
    const enviar = vi.fn();
    criarRelator(enviar, { rota: () => "/agendar", userAgent: () => "UA" })(entrada("x"));
    expect(enviar).toHaveBeenCalledWith({ tipo: "onerror", mensagem: "x", digest: "", rota: "/agendar", userAgent: "UA" });
  });
});
