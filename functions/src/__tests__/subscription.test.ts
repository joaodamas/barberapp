import { describe, expect, it } from "vitest";
import { mudancaDePlano } from "../subscription";
import { featuresFor, toPlanId, type PlanId } from "../plans";

/**
 * A invariante que fecha o ciclo de cobrança: **`plan` e `features` nunca se
 * separam.**
 *
 * Enquanto só o `plan` fosse reescrito, o `features` gravado na criação
 * continuaria valendo — e como o trial roda no plano de cima, toda barbearia
 * que contratasse o plano de entrada manteria DRE, loja e mensalistas de graça.
 * O downgrade era silenciosamente ineficaz, e ninguém perceberia: a tela
 * continua funcionando.
 */

const PLANOS: PlanId[] = ["agenda", "crescimento", "gestao"];

describe("plano e recursos andam juntos", () => {
  it.each(PLANOS)("%s grava exatamente os recursos do plano", (plan) => {
    const patch = mudancaDePlano({ plan, status: "ativo" });

    expect(patch.plan).toBe(plan);
    expect(patch.features).toEqual(featuresFor(plan));
  });

  it("descer de Gestão para Agenda tira o que a Agenda não tem", () => {
    const patch = mudancaDePlano({ plan: "agenda", status: "ativo" });

    expect(patch.features.advancedFinance).toBe(false);
    expect(patch.features.store).toBe(false);
    expect(patch.features.subscriptions).toBe(false);
    expect(patch.features.loyalty).toBe(false);
    // WhatsApp fica: está no plano de entrada por decisão comercial.
    expect(patch.features.whatsapp).toBe(true);
  });

  it("subir de Agenda para Gestão abre tudo", () => {
    const patch = mudancaDePlano({ plan: "gestao", status: "ativo" });
    expect(Object.values(patch.features).every(Boolean)).toBe(true);
  });
});

describe("o que a mudança limpa do estado anterior", () => {
  it("apaga a marca da suspensão ao reativar", () => {
    /* Sem isto, a barbearia reativada carregaria para sempre o motivo pelo qual
     * foi suspensa, e a próxima leitura contaria uma história errada. */
    const patch = mudancaDePlano({ plan: "crescimento", status: "ativo" });

    expect(patch.suspendedAt).toBeDefined();
    expect(patch.suspendedReason).toBeDefined();
    // São sentinelas de remoção do Firestore, não valores.
    expect(String(patch.suspendedAt)).not.toContain("Timestamp");
  });

  it("registra quando o plano foi definido e por quê", () => {
    const patch = mudancaDePlano({
      plan: "gestao",
      status: "ativo",
      motivo: "contratou no WhatsApp, pago via Pix",
    });

    expect(patch.planoDefinidoEm).toBeDefined();
    expect(patch.planoDefinidoMotivo).toBe("contratou no WhatsApp, pago via Pix");
  });

  it("motivo ausente vira nulo explícito, não `undefined`", () => {
    // O Firestore rejeita `undefined` em tempo de execução.
    const patch = mudancaDePlano({ plan: "agenda", status: "ativo" });
    expect(patch.planoDefinidoMotivo).toBeNull();
  });
});

describe("suspender também passa por aqui", () => {
  it("mantém o plano contratado e muda só o estado", () => {
    /* Suspensão não é downgrade: a barbearia continua contratada no plano dela,
     * e quem tira o acesso é o `status`. Confundir os dois faria a reativação
     * devolver o plano errado. */
    const patch = mudancaDePlano({ plan: "gestao", status: "suspenso" });

    expect(patch.status).toBe("suspenso");
    expect(patch.plan).toBe("gestao");
    expect(patch.features).toEqual(featuresFor("gestao"));
  });
});

describe("normalização de plano — leitura e escrita são diferentes", () => {
  it("na LEITURA, valor desconhecido cai no mínimo", () => {
    /* Uma barbearia com o campo corrompido precisa continuar funcionando, e o
     * mínimo é a resposta segura. */
    expect(toPlanId("gestão")).toBe("agenda");
    expect(toPlanId(undefined)).toBe("agenda");
    expect(toPlanId("")).toBe("agenda");
  });

  it("os planos antigos são traduzidos, não rebaixados", () => {
    /* `entrada`/`completo` valeram entre 11 e 12/08. Rebaixar tiraria da
     * barbearia algo que ela contratou. */
    expect(toPlanId("entrada")).toBe("agenda");
    expect(toPlanId("completo")).toBe("gestao");
  });

  it("os três planos atuais atravessam intactos", () => {
    for (const p of PLANOS) expect(toPlanId(p)).toBe(p);
  });
});
