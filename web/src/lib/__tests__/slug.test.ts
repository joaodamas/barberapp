import { describe, expect, it } from "vitest";
import { slugSugerido, validateSlug } from "@/lib/slug";

/**
 * O endereço vira o subdomínio do cliente e é irreversível. A regra do servidor
 * é a que vale; estes testes protegem o espelho do cliente de divergir dela a
 * ponto de aceitar na tela o que a função vai recusar no envio.
 */
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
    expect(validateSlug("painel").reason).toMatch(/reservado/);
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

  it("protege as rotas da própria aplicação", () => {
    for (const slug of ["painel", "login", "cadastro", "comecar", "www", "api"]) {
      expect(validateSlug(slug).available, slug).toBe(false);
    }
  });
});

describe("sugestão a partir do nome", () => {
  it("transforma o nome comercial num endereço válido", () => {
    expect(slugSugerido("Barbearia do Zé")).toBe("barbearia-do-ze");
    expect(slugSugerido("O Siqueira Barbearia")).toBe("o-siqueira-barbearia");
    expect(slugSugerido("Corte & Cia")).toBe("corte-cia");
    expect(slugSugerido("  Studio  Rei  ")).toBe("studio-rei");
  });

  it("o que ela sugere é sempre aceito pela validação", () => {
    // Sugerir um endereço que a própria tela recusa em seguida seria pior que
    // não sugerir nada.
    const nomes = [
      "Barbearia do Zé", "Corte & Cia", "O Siqueira",
      "Barbearia São João da Boa Vista Premium", "Studio 27",
    ];
    for (const nome of nomes) {
      expect(validateSlug(slugSugerido(nome)).available, nome).toBe(true);
    }
  });

  it("nome longo é cortado sem deixar hífen na ponta", () => {
    const s = slugSugerido("Barbearia São João da Boa Vista Premium");
    expect(s.length).toBeLessThanOrEqual(30);
    expect(s.endsWith("-")).toBe(false);
  });

  it("nome sem letra utilizável não vira endereço inválido, e sim vazio", () => {
    // O campo fica em branco e o dono digita o dele — melhor que sugerir "---".
    expect(slugSugerido("!!!")).toBe("");
    expect(slugSugerido("   ")).toBe("");
  });
});
