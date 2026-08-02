import { describe, expect, it } from "vitest";
import { TEMPLATES, type TemplateDef } from "../templates";
import { validateAllTemplates, validateTemplate } from "../validate";

const all = Object.values(TEMPLATES) as TemplateDef[];

describe("catálogo de templates da Meta", () => {
  it("tem os 16 templates da régua do PRD", () => {
    expect(all).toHaveLength(16);
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
});
