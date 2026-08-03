import { describe, expect, it } from "vitest";
import { validateSlug, TRIAL_DAYS } from "../signup";

describe("endereço da barbearia", () => {
  it("aceita nomes reais", () => {
    for (const slug of ["osiqueira", "barbearia-do-ze", "corte-fino-2", "ab1"]) {
      expect(validateSlug(slug).available, slug).toBe(true);
    }
  });

  it("explica o motivo quando recusa — o dono precisa saber o que corrigir", () => {
    expect(validateSlug("ab").reason).toMatch(/3 caracteres/);
    expect(validateSlug("a".repeat(31)).reason).toMatch(/30 caracteres/);
    expect(validateSlug("com espaço").reason).toMatch(/letras minúsculas/);
    expect(validateSlug("www").reason).toMatch(/reservado/);
    expect(validateSlug("").reason).toMatch(/Escolha/);
  });

  it("recusa o que quebraria o subdomínio", () => {
    for (const slug of [
      "-comeca-com-hifen", "termina-com-hifen-",
      "com espaco", "com_underscore", "acentuação", "ponto.no.meio",
    ]) {
      expect(validateSlug(slug).available, slug).toBe(false);
    }
  });

  it("normaliza espaços e caixa em vez de recusar", () => {
    // Quem digita "OSiqueira" deve receber "osiqueira", não um erro.
    // ⚠️ REQUISITO DE UI: o campo precisa mostrar a versão normalizada
    // enquanto ele digita. O endereço é irreversível — transformar em silêncio
    // faz o dono achar que registrou uma coisa e ter registrado outra.
    expect(validateSlug("  OSiqueira  ").available).toBe(true);
    expect(validateSlug("BARBEARIA-DO-ZE").available).toBe(true);
  });

  it("protege as rotas da própria aplicação", () => {
    // "painel", "login" e "comecar" são caminhos do app: um slug com esses
    // nomes criaria um subdomínio que confunde a navegação.
    for (const slug of ["painel", "login", "cadastro", "comecar"]) {
      expect(validateSlug(slug).available, slug).toBe(false);
    }
  });
});

describe("trial", () => {
  it("dura 7 dias", () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it("termina 7 dias depois de começar", () => {
    const inicio = new Date("2026-08-02T10:00:00Z").getTime();
    const fim = new Date(inicio + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    expect(fim.toISOString()).toBe("2026-08-09T10:00:00.000Z");
  });
});

describe("nome curto do ícone", () => {
  // Reproduz a regra de `shortNameFrom`, que é interna ao módulo.
  const shortNameFrom = (name: string, max = 14) => {
    const limpo = name.trim().replace(/\s+/g, " ");
    if (limpo.length <= max) return limpo;
    let curto = "";
    for (const p of limpo.split(" ")) {
      const prox = curto ? `${curto} ${p}` : p;
      if (prox.length > max) break;
      curto = prox;
    }
    return curto || limpo.slice(0, max).trim();
  };

  it("não corta no meio da palavra", () => {
    // É o texto que fica sob o ícone no celular do cliente.
    expect(shortNameFrom("O Siqueira Barbearia")).toBe("O Siqueira");
    expect(shortNameFrom("Barbearia do Zé")).toBe("Barbearia do");
    expect(shortNameFrom("Corte Fino")).toBe("Corte Fino");
  });

  it("cai no corte bruto quando a primeira palavra já estoura", () => {
    expect(shortNameFrom("Superbarbearia")).toBe("Superbarbearia");
    expect(shortNameFrom("Superbarbeariadobairro")).toBe("Superbarbearia");
  });
});
