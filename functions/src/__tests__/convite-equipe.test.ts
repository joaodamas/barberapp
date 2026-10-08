import { describe, expect, it } from "vitest";
import { PRAZO_DO_CONVITE_MS, emailDoConvite, recusaDoConvite } from "../convite-equipe";

/**
 * Convite de barbeiro (05/10) — as decisões puras.
 *
 * O token é o segredo; estas regras dizem quando ele deixa de valer.
 */
const AGORA = Date.parse("2026-10-05T12:00:00Z");
const aberto = (extra: Partial<Parameters<typeof recusaDoConvite>[0]["convite"]> = {}) => ({
  email: null,
  expiraEmMs: AGORA + PRAZO_DO_CONVITE_MS,
  usadoEm: null,
  canceladoEm: null,
  ...extra,
});

describe("recusaDoConvite", () => {
  it("convite aberto, dentro do prazo, pelo WhatsApp: aceita qualquer conta", () => {
    expect(recusaDoConvite({ convite: aberto(), agoraMs: AGORA, emailDaConta: "qualquer@exemplo.com" })).toBeNull();
    expect(recusaDoConvite({ convite: aberto(), agoraMs: AGORA, emailDaConta: null })).toBeNull();
  });

  it("vale 7 dias e não um minuto a mais", () => {
    const c = aberto({ expiraEmMs: AGORA });
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: null })).toBeNull();
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA + 60_000, emailDaConta: null })).toBe("expirado");
    expect(PRAZO_DO_CONVITE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("uso único: depois de usado, ninguém mais entra por ele", () => {
    expect(recusaDoConvite({ convite: aberto({ usadoEm: AGORA - 1 }), agoraMs: AGORA, emailDaConta: null })).toBe("usado");
  });

  it("cancelado pelo dono (ou substituído por um reenvio) não vale", () => {
    expect(recusaDoConvite({ convite: aberto({ canceladoEm: AGORA - 1 }), agoraMs: AGORA, emailDaConta: null })).toBe("cancelado");
  });

  it("inexistente", () => {
    expect(recusaDoConvite({ convite: null, agoraMs: AGORA, emailDaConta: null })).toBe("inexistente");
  });

  it("convite por e-mail exige a conta daquele e-mail, sem diferenciar maiúscula", () => {
    const c = aberto({ email: "barbeiro.novo@exemplo.com" });
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "Barbeiro.Novo@Exemplo.com" })).toBeNull();
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "outra.pessoa@exemplo.com" })).toBe("outro_email");
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: null })).toBe("outro_email");
  });

  it("usado vem antes de expirado: a mensagem certa é 'já foi usado'", () => {
    expect(
      recusaDoConvite({ convite: aberto({ usadoEm: 1, expiraEmMs: AGORA - 1 }), agoraMs: AGORA, emailDaConta: null })
    ).toBe("usado");
  });
});

describe("emailDoConvite", () => {
  it("vazio é convite pelo WhatsApp", () => {
    expect(emailDoConvite("")).toBeNull();
    expect(emailDoConvite(undefined)).toBeNull();
  });
  it("normaliza para minúsculo e sem espaço", () => {
    expect(emailDoConvite("  Barbeiro@Exemplo.COM ")).toBe("barbeiro@exemplo.com");
  });
  it("recusa o que não parece e-mail", () => {
    expect(() => emailDoConvite("barbeiro")).toThrow();
    expect(() => emailDoConvite("a@b")).toThrow();
  });
});
