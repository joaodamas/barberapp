import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTIVO_EMAIL_NAO_VERIFICADO,
  ehRecusaPorEmailNaoVerificado,
  mensagemDeFalhaNoEnvio,
  precisaConfirmarEmail,
  type ContaParaAgendar,
} from "@/lib/verificacao-de-email";

/**
 * Agendar exige e-mail confirmado — auditoria de 28/09, M2.
 *
 * A tela antecipa a recusa do servidor para o cliente ver o cartão "Confirme
 * seu e-mail" em vez de um erro. As duas pontas precisam concordar: se a tela
 * pedir confirmação a quem o servidor aceita, trava um cliente legítimo; se
 * não pedir a quem ele recusa, o cartão ainda aparece, pelo motivo do erro.
 */

const senha: ContaParaAgendar = {
  email: "cliente@exemplo.com",
  emailVerified: false,
  phoneNumber: null,
  providerData: [{ providerId: "password" }],
};

describe("quem precisa confirmar o e-mail para agendar", () => {
  it("e-mail e senha sem confirmar: precisa", () => {
    expect(precisaConfirmarEmail(senha)).toBe(true);
  });

  it("e-mail e senha já confirmado: não precisa", () => {
    expect(precisaConfirmarEmail({ ...senha, emailVerified: true })).toBe(false);
  });

  it("Google: não precisa, mesmo sem a marca de verificado", () => {
    expect(
      precisaConfirmarEmail({ ...senha, providerData: [{ providerId: "google.com" }] })
    ).toBe(false);
  });

  it("telefone: não precisa", () => {
    expect(
      precisaConfirmarEmail({
        email: null,
        emailVerified: false,
        phoneNumber: "+5511999999999",
        providerData: [{ providerId: "phone" }],
      })
    ).toBe(false);
  });

  it("sem conta ou sem e-mail, a tela não pede (o servidor decide)", () => {
    expect(precisaConfirmarEmail(null)).toBe(false);
    expect(precisaConfirmarEmail({ ...senha, email: null })).toBe(false);
  });
});

describe("a recusa do servidor é reconhecida pelo motivo, não pelo texto", () => {
  it("reconhece `details.motivo`", () => {
    expect(
      ehRecusaPorEmailNaoVerificado({
        code: "functions/failed-precondition",
        message: "qualquer texto",
        details: { motivo: "email-nao-verificado" },
      })
    ).toBe(true);
  });

  it("não confunde com outra recusa", () => {
    expect(ehRecusaPorEmailNaoVerificado({ details: { motivo: "limite-diario" } })).toBe(false);
    expect(ehRecusaPorEmailNaoVerificado({ message: "Confirme seu e-mail" })).toBe(false);
    expect(ehRecusaPorEmailNaoVerificado(null)).toBe(false);
    expect(ehRecusaPorEmailNaoVerificado(new Error("x"))).toBe(false);
  });

  it("o identificador é o MESMO do servidor", () => {
    const servidor = readFileSync(
      resolve(__dirname, "../../../../functions/src/booking.ts"),
      "utf8"
    );
    expect(servidor).toContain(
      `export const MOTIVO_EMAIL_NAO_VERIFICADO = "${MOTIVO_EMAIL_NAO_VERIFICADO}"`
    );
  });
});

describe("falha no envio do link nunca vira 'enviamos'", () => {
  it("muitas tentativas tem mensagem própria", () => {
    expect(mensagemDeFalhaNoEnvio({ code: "auth/too-many-requests" })).toMatch(/Muitos envios/);
  });

  it("nenhuma mensagem de falha afirma o envio", () => {
    for (const code of ["auth/too-many-requests", "auth/network-request-failed", "outro", undefined]) {
      expect(mensagemDeFalhaNoEnvio({ code })).not.toMatch(/enviamos|enviado/i);
    }
  });
});
