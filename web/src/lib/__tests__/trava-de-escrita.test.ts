import { afterEach, describe, expect, it } from "vitest";
import {
  conferirEscrita,
  definirTravaDeEscrita,
  EscritaBloqueada,
  travaAtual,
} from "@/lib/db/trava-de-escrita";
import { acessoDaBarbearia, DEFAULT_TENANT, type Tenant } from "@/lib/tenant";

/**
 * O modo leitura precisava existir de verdade.
 *
 * `acessoDaBarbearia` já decidia `podeEditar` corretamente, e nenhuma tela
 * consultava a resposta: a barra dizia ao dono "você não consegue alterar"
 * enquanto ele concluía atendimento, editava serviço e salvava configurações.
 * Estes testes cobrem a trava que fecha isso, e — tão importante quanto — que
 * ela **desliga** quando a conta volta a ficar em dia.
 */

const tenantCom = (over: Partial<Tenant>): Tenant => ({ ...DEFAULT_TENANT, ...over });

const emDias = (dias: number) =>
  new Date(Date.now() + dias * 24 * 60 * 60 * 1000).toISOString();

afterEach(() => definirTravaDeEscrita(null));

describe("a trava", () => {
  it("deixa passar quando não há motivo", () => {
    definirTravaDeEscrita(null);
    expect(() => conferirEscrita()).not.toThrow();
  });

  it("bloqueia com a mensagem que o dono lê, não com jargão", () => {
    definirTravaDeEscrita("trial_vencido");
    expect(() => conferirEscrita()).toThrow(EscritaBloqueada);

    try {
      conferirEscrita();
    } catch (e) {
      const erro = e as EscritaBloqueada;
      expect(erro.motivo).toBe("trial_vencido");
      // Diz o que aconteceu, que nada foi perdido, e o que fazer.
      expect(erro.message).toMatch(/teste terminou/i);
      expect(erro.message).toMatch(/nada foi alterado/i);
      expect(erro.message).toMatch(/plano/i);
      // E não fala a língua do banco.
      expect(erro.message).not.toMatch(/permission|firestore|denied/i);
    }
  });

  it("cada motivo tem a sua explicação", () => {
    for (const motivo of ["trial_vencido", "suspensa", "cancelada"] as const) {
      definirTravaDeEscrita(motivo);
      expect(() => conferirEscrita(), motivo).toThrow(EscritaBloqueada);
    }
  });

  it("desliga quando a conta volta a ficar em dia", () => {
    /* O caminho de volta importa tanto quanto o de ida: contratar um plano
     * precisa devolver a edição na hora, sem recarregar. */
    definirTravaDeEscrita("suspensa");
    expect(() => conferirEscrita()).toThrow();

    definirTravaDeEscrita(null);
    expect(() => conferirEscrita()).not.toThrow();
    expect(travaAtual()).toBeNull();
  });
});

describe("o motivo vem de acessoDaBarbearia — uma fonte só", () => {
  it.each([
    ["suspenso", "suspensa"],
    ["encerrada", "cancelada"],
  ])("status %s trava por %s", (status, esperado) => {
    const acesso = acessoDaBarbearia(tenantCom({ status: status as Tenant["status"] }));
    expect(acesso.motivo).toBe(esperado);

    definirTravaDeEscrita(acesso.motivo);
    expect(() => conferirEscrita()).toThrow(EscritaBloqueada);
  });

  it("trial vencido trava", () => {
    const acesso = acessoDaBarbearia(
      tenantCom({
        status: "trial",
        trial: { startedAt: emDias(-10), endsAt: emDias(-1) },
      })
    );
    expect(acesso.podeEditar).toBe(false);

    definirTravaDeEscrita(acesso.motivo);
    expect(() => conferirEscrita()).toThrow(EscritaBloqueada);
  });

  it("trial correndo NÃO trava", () => {
    const acesso = acessoDaBarbearia(
      tenantCom({
        status: "trial",
        trial: { startedAt: emDias(-2), endsAt: emDias(5) },
      })
    );
    expect(acesso.podeEditar).toBe(true);

    definirTravaDeEscrita(acesso.motivo);
    expect(() => conferirEscrita()).not.toThrow();
  });

  it("barbearia ativa NÃO trava", () => {
    const acesso = acessoDaBarbearia(tenantCom({ status: "ativo", plan: "agenda" }));
    expect(acesso.podeEditar).toBe(true);

    definirTravaDeEscrita(acesso.motivo);
    expect(() => conferirEscrita()).not.toThrow();
  });
});

describe("plano continua sendo outra pergunta", () => {
  it("plano de entrada edita normalmente — o que ele não tem é recurso", () => {
    /* Modo leitura e gate de plano são coisas diferentes, e confundi-las
     * impediria o cliente do plano Agenda de operar a própria agenda. */
    const acesso = acessoDaBarbearia(tenantCom({ status: "ativo", plan: "agenda" }));

    expect(acesso.podeEditar).toBe(true);
    expect(acesso.features.advancedFinance).toBe(false);

    definirTravaDeEscrita(acesso.motivo);
    expect(() => conferirEscrita()).not.toThrow();
  });
});
