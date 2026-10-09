import { describe, expect, it } from "vitest";
import { numeroDaReservaConfere } from "../notify";

/**
 * A confirmação da reserva só vai para número que é de quem reservou (09/10).
 * O número digitado numa reserva do app não é prova de nada: com ele alheio, o
 * WhatsApp da barbearia viraria disparador de mensagem para terceiros.
 */
describe("a confirmação por WhatsApp só vai para número confiável", () => {
  const base = {
    origem: "app",
    numeroDaReserva: "11988887777",
    cliente: { whatsapp: "11988887777", telefoneConfirmado: false },
    jaEscreveuParaALoja: false,
  };

  it("🔒 número digitado por uma conta do app, sem prova, não recebe", () => {
    expect(numeroDaReservaConfere(base)).toBe(false);
    expect(numeroDaReservaConfere({ ...base, cliente: null })).toBe(false);
  });

  it("recebe quando a conta tem o telefone confirmado E é este número", () => {
    expect(numeroDaReservaConfere({ ...base, cliente: { whatsapp: "(11) 98888-7777", telefoneConfirmado: true } })).toBe(true);
  });

  it("🔒 telefone confirmado de OUTRO número não vale para o número digitado agora", () => {
    expect(numeroDaReservaConfere({ ...base, cliente: { whatsapp: "11911112222", telefoneConfirmado: true } })).toBe(false);
  });

  it("recebe quando o número já escreveu para a barbearia", () => {
    expect(numeroDaReservaConfere({ ...base, jaEscreveuParaALoja: true })).toBe(true);
  });

  it("reserva de balcão: o número é do cadastro da própria barbearia", () => {
    expect(numeroDaReservaConfere({ ...base, origem: "balcao", cliente: null })).toBe(true);
  });

  it("🔒 número que não é telefone nunca recebe, nem do balcão", () => {
    expect(numeroDaReservaConfere({ ...base, origem: "balcao", numeroDaReserva: "123" })).toBe(false);
    expect(numeroDaReservaConfere({ ...base, jaEscreveuParaALoja: true, numeroDaReserva: "" })).toBe(false);
  });
});
