import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MOTIVO_EMAIL_NAO_VERIFICADO,
  RESERVAS_POR_DIA,
  excedeuLimiteDiario,
  podeAgendarComEstaConta,
} from "../booking";

/**
 * Proteção da agenda contra contas descartáveis — auditoria de 28/09, M2.
 *
 * O ataque: um script cria dezenas de contas de e-mail e senha (sem confirmar
 * e-mail nenhum), cada uma com as 3 reservas do teto por cliente, e lota a
 * agenda de uma barbearia numa tarde. Duas travas fecham isso:
 *
 * 1. a conta precisa provar que é de alguém (e-mail confirmado, telefone ou
 *    Google) para AGENDAR — `podeAgendarComEstaConta`;
 * 2. cada conta cria no máximo `RESERVAS_POR_DIA` por dia, o que corta o laço
 *    de criar-e-cancelar que o teto de ativas não vê.
 *
 * A regra é testada como função pura; que ela está LIGADA ao handler certo (e
 * só a ele) é conferido lendo o código, pelo mesmo motivo de
 * `autorizacao-functions.test.ts`: o `onCall` só se exerce com emulador e
 * autenticação.
 */

describe("quem pode agendar", () => {
  it("conta Google verificada passa", () => {
    expect(
      podeAgendarComEstaConta({
        email_verified: true,
        firebase: { sign_in_provider: "google.com" },
      })
    ).toBe(true);
  });

  it("conta Google antiga sem a marca de verificado também passa", () => {
    expect(podeAgendarComEstaConta({ firebase: { sign_in_provider: "google.com" } })).toBe(true);
  });

  it("e-mail e senha com e-mail confirmado passa", () => {
    expect(
      podeAgendarComEstaConta({ email_verified: true, firebase: { sign_in_provider: "password" } })
    ).toBe(true);
  });

  it("🔒 e-mail e senha SEM confirmar é recusada", () => {
    expect(
      podeAgendarComEstaConta({ email_verified: false, firebase: { sign_in_provider: "password" } })
    ).toBe(false);
    expect(podeAgendarComEstaConta({ firebase: { sign_in_provider: "password" } })).toBe(false);
  });

  it("login por telefone passa (o SMS já é a prova)", () => {
    expect(
      podeAgendarComEstaConta({ phone_number: "+5511999999999", firebase: { sign_in_provider: "phone" } })
    ).toBe(true);
  });

  it("🔒 só o valor booleano `true` conta — string ou telefone vazio não", () => {
    expect(podeAgendarComEstaConta({ email_verified: "true" })).toBe(false);
    expect(podeAgendarComEstaConta({ phone_number: "  " })).toBe(false);
    expect(podeAgendarComEstaConta({ phone_number: 5511999999999 })).toBe(false);
  });

  it("🔒 sem token não passa", () => {
    expect(podeAgendarComEstaConta(undefined)).toBe(false);
    expect(podeAgendarComEstaConta(null)).toBe(false);
    expect(podeAgendarComEstaConta({})).toBe(false);
  });

  it("o motivo é um identificador estável que a tela reconhece", () => {
    /* A tela do agendar compara com esta string (web/src/lib/verificacao-de-email.ts).
     * Trocar aqui sem trocar lá faz o cliente receber o texto cru em vez do
     * cartão com "Reenviar o link". */
    expect(MOTIVO_EMAIL_NAO_VERIFICADO).toBe("email-nao-verificado");
  });
});

describe("teto diário de criações por conta", () => {
  it("dez por dia: a décima passa, a décima primeira não", () => {
    expect(RESERVAS_POR_DIA).toBe(10);
    expect(excedeuLimiteDiario(undefined, RESERVAS_POR_DIA)).toBe(false);
    expect(excedeuLimiteDiario(9, RESERVAS_POR_DIA)).toBe(false);
    expect(excedeuLimiteDiario(10, RESERVAS_POR_DIA)).toBe(true);
    expect(excedeuLimiteDiario(57, RESERVAS_POR_DIA)).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* A regra está ligada ao handler certo — e só a ele                   */
/* ------------------------------------------------------------------ */

const FONTE = readFileSync(resolve(__dirname, "../booking.ts"), "utf8");

/** Corpo de `export const nome = onCall(...)` até o próximo export. */
function corpoDe(nome: string): string {
  const inicio = FONTE.indexOf(`export const ${nome} = onCall`);
  expect(inicio, `${nome} não encontrado em booking.ts`).toBeGreaterThanOrEqual(0);
  const fim = FONTE.indexOf("\nexport ", inicio + 1);
  return FONTE.slice(inicio, fim === -1 ? undefined : fim);
}

describe("onde a exigência vale", () => {
  it("🔒 createBooking exige a conta verificada ANTES de ler a barbearia", () => {
    const corpo = corpoDe("createBooking");
    const guarda = corpo.indexOf("podeAgendarComEstaConta(request.auth?.token)");
    expect(guarda).toBeGreaterThan(0);
    expect(guarda).toBeLessThan(corpo.indexOf("shopRef.get()"));
    expect(corpo).toMatch(/motivo: MOTIVO_EMAIL_NAO_VERIFICADO/);
  });

  it("🔒 createBooking passa o teto diário para a transação", () => {
    const corpo = corpoDe("createBooking");
    expect(corpo).toMatch(/limiteDiario:\s*\{[\s\S]*?refDoLimiteDiario\(db, uid,[\s\S]*?RESERVAS_POR_DIA/);
  });

  it("o balcão (dono marcando por alguém) NÃO exige e NÃO conta", () => {
    const corpo = corpoDe("createBookingAtCounter");
    expect(corpo).not.toMatch(/podeAgendarComEstaConta/);
    expect(corpo).not.toMatch(/limiteDiario/);
  });

  it("remarcar e cancelar mexem em reserva que já existe: sem exigência nova", () => {
    for (const nome of ["rescheduleBooking", "cancelBooking"]) {
      expect(corpoDe(nome)).not.toMatch(/podeAgendarComEstaConta|limiteDiario/);
    }
  });
});
