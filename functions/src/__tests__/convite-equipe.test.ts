import { describe, expect, it } from "vitest";
import {
  PRAZO_DO_CONVITE_MS,
  emailConfirmadoNoToken,
  emailDoConvite,
  podeRepetirAceite,
  recusaDoConvite,
} from "../convite-equipe";

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
    expect(
      recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "Barbeiro.Novo@Exemplo.com", emailVerificado: true })
    ).toBeNull();
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "outra.pessoa@exemplo.com" })).toBe("outro_email");
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: null })).toBe("outro_email");
  });

  it("usado vem antes de expirado: a mensagem certa é 'já foi usado'", () => {
    expect(
      recusaDoConvite({ convite: aberto({ usadoEm: 1, expiraEmMs: AGORA - 1 }), agoraMs: AGORA, emailDaConta: null })
    ).toBe("usado");
  });
});

describe("recusaDoConvite · e-mail confirmado e acesso retirado (08/10)", () => {
  it("convite por e-mail recusa a conta com o e-mail certo mas NÃO confirmado", () => {
    /* Qualquer um cria conta de e-mail e senha com o endereço de outra pessoa
     * sem nunca abrir a caixa de entrada. */
    const c = aberto({ email: "barbeiro.novo@exemplo.com" });
    expect(recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "barbeiro.novo@exemplo.com" })).toBe(
      "email_nao_verificado"
    );
    expect(
      recusaDoConvite({ convite: c, agoraMs: AGORA, emailDaConta: "barbeiro.novo@exemplo.com", emailVerificado: false })
    ).toBe("email_nao_verificado");
  });

  it("convite pelo WhatsApp não depende de e-mail confirmado", () => {
    expect(recusaDoConvite({ convite: aberto(), agoraMs: AGORA, emailDaConta: "x@exemplo.com", emailVerificado: false })).toBeNull();
  });

  it("revogado vem antes de tudo", () => {
    expect(
      recusaDoConvite({ convite: aberto({ usadoEm: 1, revogadoEm: 2 }), agoraMs: AGORA, emailDaConta: null })
    ).toBe("revogado");
  });

  it("o token confia no e-mail verificado ou no Google", () => {
    expect(emailConfirmadoNoToken({ email_verified: true })).toBe(true);
    expect(emailConfirmadoNoToken({ email_verified: false, firebase: { sign_in_provider: "google.com" } })).toBe(true);
    expect(emailConfirmadoNoToken({ email_verified: false, firebase: { sign_in_provider: "password" } })).toBe(false);
    expect(emailConfirmadoNoToken({})).toBe(false);
    expect(emailConfirmadoNoToken(undefined)).toBe(false);
  });
});

describe("podeRepetirAceite (08/10)", () => {
  const usado = (extra: Record<string, unknown> = {}) => ({
    usadoEm: AGORA - 1000,
    usadoPor: "conta-do-barbeiro",
    expiraEmMs: AGORA + PRAZO_DO_CONVITE_MS,
    revogadoEm: null,
    ...extra,
  });

  it("a resposta perdida: mesma conta, cadeira ainda dela — repete", () => {
    expect(podeRepetirAceite({ convite: usado(), uid: "conta-do-barbeiro", uidDaCadeira: "conta-do-barbeiro", agoraMs: AGORA })).toBe(true);
  });

  it("🔒 depois que o dono tirou o acesso, o token antigo NÃO devolve o papel", () => {
    expect(
      podeRepetirAceite({ convite: usado({ revogadoEm: AGORA - 10 }), uid: "conta-do-barbeiro", uidDaCadeira: null, agoraMs: AGORA })
    ).toBe(false);
    /* Mesmo sem a marca no convite (revogação anterior a ela): a cadeira solta
     * já basta. */
    expect(podeRepetirAceite({ convite: usado(), uid: "conta-do-barbeiro", uidDaCadeira: null, agoraMs: AGORA })).toBe(false);
    expect(podeRepetirAceite({ convite: usado(), uid: "conta-do-barbeiro", uidDaCadeira: "outra-conta", agoraMs: AGORA })).toBe(false);
  });

  it("🔒 vencido não repete", () => {
    expect(
      podeRepetirAceite({ convite: usado({ expiraEmMs: AGORA - 1 }), uid: "conta-do-barbeiro", uidDaCadeira: "conta-do-barbeiro", agoraMs: AGORA })
    ).toBe(false);
  });

  it("🔒 outra conta ou convite não usado não é repetição", () => {
    expect(podeRepetirAceite({ convite: usado(), uid: "intrusa", uidDaCadeira: "intrusa", agoraMs: AGORA })).toBe(false);
    expect(podeRepetirAceite({ convite: usado({ usadoEm: null }), uid: "conta-do-barbeiro", uidDaCadeira: "conta-do-barbeiro", agoraMs: AGORA })).toBe(false);
    expect(podeRepetirAceite({ convite: null, uid: "conta-do-barbeiro", uidDaCadeira: "conta-do-barbeiro", agoraMs: AGORA })).toBe(false);
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
