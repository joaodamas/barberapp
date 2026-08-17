import { describe, expect, it } from "vitest";
import {
  mascararWhatsapp,
  normalizarWhatsapp,
  whatsappValido,
} from "@/lib/whatsapp-numero";

/**
 * O número do cliente é o dado de que o produto inteiro depende — confirmação
 * de horário, lembrete e aviso de cancelamento — e ele nunca era coletado:
 * `clientWhatsapp` vinha de `user.phoneNumber`, que só existe para quem entra
 * por SMS, num projeto onde o SMS não está habilitado.
 *
 * Estes testes cobrem o formato, porque é onde um número errado passa
 * despercebido: a Cloud API do WhatsApp aceita vários formatos e **falha em
 * silêncio** em alguns — responde 200 e a mensagem nunca chega.
 */

describe("normalização para a Cloud API", () => {
  it("acrescenta o DDI 55 quando falta", () => {
    // É o caso mais comum: a pessoa digita o número como fala.
    expect(normalizarWhatsapp("(11) 96173-3047")).toBe("5511961733047");
    expect(normalizarWhatsapp("11961733047")).toBe("5511961733047");
  });

  it("não duplica o DDI de quem já digitou com ele", () => {
    expect(normalizarWhatsapp("5511961733047")).toBe("5511961733047");
    expect(normalizarWhatsapp("+55 11 96173-3047")).toBe("5511961733047");
  });

  it("aceita fixo com 10 dígitos", () => {
    expect(normalizarWhatsapp("(11) 3333-4444")).toBe("551133334444");
  });

  it("devolve vazio para o que não é número utilizável", () => {
    /* Vazio é a resposta honesta: gravar um número truncado faria a mensagem
     * falhar no envio, longe daqui, quando ninguém mais está olhando. */
    expect(normalizarWhatsapp("")).toBe("");
    expect(normalizarWhatsapp("119617")).toBe("");
    expect(normalizarWhatsapp("abc")).toBe("");
  });
});

describe("validação", () => {
  it.each([
    ["(11) 96173-3047", true],
    ["11961733047", true],
    ["5511961733047", true],
    ["(11) 3333-4444", true],
    ["", false],
    ["11", false],
    ["119617330", false],
    ["119617330471234", false],
  ])("%s → %s", (entrada, esperado) => {
    expect(whatsappValido(entrada)).toBe(esperado);
  });
});

describe("máscara", () => {
  it("formata celular e fixo enquanto a pessoa digita", () => {
    expect(mascararWhatsapp("11")).toBe("11");
    expect(mascararWhatsapp("119")).toBe("(11) 9");
    expect(mascararWhatsapp("1196173")).toBe("(11) 9617-3");
    expect(mascararWhatsapp("11961733047")).toBe("(11) 96173-3047");
    expect(mascararWhatsapp("1133334444")).toBe("(11) 3333-4444");
  });

  it("tira o DDI da exibição — quem digita não pensa em 55", () => {
    expect(mascararWhatsapp("5511961733047")).toBe("(11) 96173-3047");
  });

  it("não deixa passar do tamanho de um número brasileiro", () => {
    expect(mascararWhatsapp("119617330479999")).toBe("(11) 96173-3047");
  });

  it("é idempotente — reaplicar sobre o já mascarado não corrompe", () => {
    /* A máscara roda a cada tecla, sobre o próprio valor exibido. */
    const uma = mascararWhatsapp("11961733047");
    expect(mascararWhatsapp(uma)).toBe(uma);
  });
});

describe("o que entra na reserva é o que sai da máscara", () => {
  it("digitar, mascarar e normalizar devolve o formato da API", () => {
    /* O ciclo real da tela: a pessoa digita, vê mascarado, e o que vai para o
     * `createBooking` é o normalizado. Se estes dois divergirem, o dono vê um
     * número na agenda e a mensagem sai para outro. */
    const digitado = "11961733047";
    const exibido = mascararWhatsapp(digitado);
    expect(normalizarWhatsapp(exibido)).toBe("5511961733047");
  });
});
