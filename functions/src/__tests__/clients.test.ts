import { describe, expect, it } from "vitest";
import {
  nomeDoCliente,
  normalizarWhatsapp,
  whatsappServeComoChave,
} from "../clients";

/**
 * G3 — o cliente da barbearia.
 *
 * Este arquivo cobre as decisões PURAS. O comportamento transacional de
 * `garantirCliente` (reuso, fusão, criação) é exercido contra o emulador em
 * `clients-transacao.test.ts`, porque o que importa nele é o que acontece
 * quando duas escritas disputam o mesmo número ao mesmo tempo — e isso um teste
 * puro não consegue afirmar.
 */

describe("G3 · whatsapp como chave de deduplicação", () => {
  it("normaliza para dígitos — o mesmo número digitado de dois jeitos é um só", () => {
    /* Sem isso, "(11) 98888-7777" e "11988887777" viram dois cadastros da mesma
     * pessoa, e a invariante de unicidade não significa nada. */
    expect(normalizarWhatsapp("(11) 98888-7777")).toBe("11988887777");
    expect(normalizarWhatsapp("11 98888 7777")).toBe("11988887777");
    expect(normalizarWhatsapp("+55 11 98888-7777")).toBe("5511988887777");
  });

  it("nulo e vazio não explodem", () => {
    expect(normalizarWhatsapp(null)).toBe("");
    expect(normalizarWhatsapp(undefined)).toBe("");
    expect(normalizarWhatsapp("")).toBe("");
  });

  it("número incompleto NÃO serve de chave", () => {
    /* Este é o ponto que protege a invariante. Um número pela metade colidiria
     * com a próxima digitação pela metade de outra pessoa, e duas pessoas
     * diferentes virariam um cadastro só — pior que duplicar. */
    expect(whatsappServeComoChave("")).toBe(false);
    expect(whatsappServeComoChave("119888")).toBe(false);
    expect(whatsappServeComoChave("9")).toBe(false);
  });

  it("fixo com DDD e celular com o 9 servem", () => {
    expect(whatsappServeComoChave("1133334444")).toBe(true);
    expect(whatsappServeComoChave("11988887777")).toBe(true);
    expect(whatsappServeComoChave("5511988887777")).toBe(true);
  });

  it("número absurdamente longo não serve", () => {
    expect(whatsappServeComoChave("11988887777000000")).toBe(false);
  });
});

describe("G3 · nome", () => {
  it("cai em 'Cliente' quando não veio nada", () => {
    /* Honesto: diz que a pessoa existe e que o nome não foi informado. Gravar
     * string vazia deixaria um buraco na tela do dono. */
    expect(nomeDoCliente(undefined)).toBe("Cliente");
    expect(nomeDoCliente("")).toBe("Cliente");
    expect(nomeDoCliente("   ")).toBe("Cliente");
  });

  it("limpa espaço sem alterar o nome", () => {
    expect(nomeDoCliente("  João   Damas ")).toBe("João Damas");
  });
});
