import { describe, expect, it } from "vitest";
import { TEMPLATES, type TemplateDef } from "../templates";
import { validateAllTemplates, validateTemplate } from "../validate";

const all = Object.values(TEMPLATES) as TemplateDef[];

describe("catálogo de templates da Meta", () => {
  it("cobre todos os estados de reserva do modelo de domínio", () => {
    // Cada status de `BookingStatus` precisa de uma mensagem, senão o cliente
    // fica sem saber o que aconteceu com o horário dele.
    const porEstado: Record<string, string> = {
      pending_payment: "reserva_aguardando_pagamento",
      confirmed: "confirmacao_reserva",
      completed: "pos_atendimento",
      no_show: "ocorrencia_registrada",
      cancelled_by_client: "cancelamento_reserva",
      cancelled_by_shop: "cancelamento_reserva",
      expired: "reserva_expirada",
      fit_in_requested: "encaixe_solicitacao",
    };
    for (const [estado, template] of Object.entries(porEstado)) {
      expect(TEMPLATES, `estado ${estado} sem mensagem`).toHaveProperty(template);
    }
  });

  it("cobre o ciclo de vida do plano de mensalista", () => {
    for (const t of [
      "plano_ativado", "mensalidade_aviso", "mensalidade_hoje",
      "mensalidade_paga", "mensalidade_atraso", "mensalidade_suspensao",
      "plano_suspenso", "plano_reativado", "plano_cancelado",
    ]) {
      expect(TEMPLATES).toHaveProperty(t);
    }
  });

  it("mensagem da plataforma não sai do número da barbearia", () => {
    // Cobrança do SaaS e aviso de trial são a plataforma falando com a
    // barbearia — sair do WhatsApp dela confundiria o cliente final dela.
    for (const t of ["trial_terminando", "trial_encerrado", "cobranca_falhou"]) {
      expect((TEMPLATES as Record<string, TemplateDef>)[t].sender).toBe("plataforma");
    }
  });

  it("mensagem ao cliente final sai do número da barbearia", () => {
    for (const t of all.filter((x) => x.audience === "cliente")) {
      expect(t.sender ?? "barbearia", `${t.name} deveria sair da barbearia`).toBe("barbearia");
    }
  });

  it.each(all.map((t) => [t.name, t] as const))(
    "%s respeita as regras da Meta",
    (_name, template) => {
      expect(validateTemplate(template)).toEqual([]);
    }
  );

  it("nenhum template do catálogo tem pendência", () => {
    expect(validateAllTemplates()).toEqual([]);
  });

  it("reengajamento é MARKETING e transacional é UTILITY", () => {
    expect(TEMPLATES.confirmacao_reserva.category).toBe("UTILITY");
    expect(TEMPLATES.reativacao_cliente.category).toBe("MARKETING");
    expect(TEMPLATES.aniversario.category).toBe("MARKETING");
    expect(TEMPLATES.comunicado_geral.category).toBe("MARKETING");
  });

  it("detecta corpo formado só por variáveis", () => {
    const ruim = { ...TEMPLATES.comunicado_geral, body: "{{1}}\n\n{{2}}" } as TemplateDef;
    const rules = validateTemplate(ruim).map((i) => i.rule);
    expect(rules).toContain("corpo_sem_texto");
    expect(rules).toContain("placeholder_no_inicio");
  });

  it("recusa emoji em botão — a Meta aceita no corpo, mas não no botão", () => {
    // Regra descoberta numa submissão rejeitada: "Confirmo ✅" derrubou o
    // lembrete_confirmacao, que é o template mais importante do catálogo.
    const ruim = {
      ...TEMPLATES.lembrete_confirmacao,
      buttons: [{ label: "Confirmo ✅", action: "CONFIRM_BOOKING" }],
    } as TemplateDef;
    expect(validateTemplate(ruim).map((i) => i.rule)).toContain("botao_com_emoji");
  });

  it("recusa variável e quebra de linha em botão", () => {
    const ruim = {
      ...TEMPLATES.lembrete_confirmacao,
      buttons: [
        { label: "Oi {{1}}", action: "CONFIRM_BOOKING" },
        { label: "Sim\nvou", action: "CANCEL_BOOKING" },
      ],
    } as TemplateDef;
    const rules = validateTemplate(ruim).map((i) => i.rule);
    expect(rules).toContain("botao_com_variavel");
    expect(rules).toContain("botao_com_quebra");
  });
});
