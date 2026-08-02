import { TEMPLATES, type TemplateDef } from "./templates";

/**
 * Validação das regras da Meta para templates do WhatsApp Business Cloud API.
 *
 * Existe porque 14 dos 16 templates violavam a regra escrita no cabeçalho do
 * próprio catálogo — e a aprovação na Meta leva dias, então descobrir isso na
 * submissão custa caro. Roda no CI antes de qualquer envio.
 */
export type TemplateIssue = { template: string; rule: string; detail: string };

const PLACEHOLDER = /\{\{(\d+)\}\}/g;

export function validateTemplate(template: TemplateDef): TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  const body = template.body.trim();
  const push = (rule: string, detail: string) =>
    issues.push({ template: template.name, rule, detail });

  if (/^\{\{\d+\}\}/.test(body)) {
    push("placeholder_no_inicio", "O corpo não pode começar com um placeholder.");
  }
  if (/\{\{\d+\}\}$/.test(body)) {
    push("placeholder_no_fim", "O corpo não pode terminar com um placeholder.");
  }
  if (/\}\}\s*\{\{/.test(body)) {
    push("placeholders_adjacentes", "Placeholders não podem ficar adjacentes.");
  }

  const numbers = [...body.matchAll(PLACEHOLDER)].map((m) => Number(m[1]));
  const unique = [...new Set(numbers)].sort((a, b) => a - b);

  if (unique.some((value, index) => value !== index + 1)) {
    push("numeracao", `Placeholders devem ser sequenciais a partir de 1: ${unique.join(", ")}`);
  }
  if (unique.length !== template.params.length) {
    push("params", `${unique.length} placeholder(s) para ${template.params.length} param(s).`);
  }
  if (template.example.length !== template.params.length) {
    push("example", `${template.example.length} exemplo(s) para ${template.params.length} param(s).`);
  }
  if (!body.replace(PLACEHOLDER, "").trim()) {
    push("corpo_sem_texto", "O corpo não pode ser composto apenas de variáveis.");
  }
  for (const button of template.buttons ?? []) {
    if (button.label.length > 25) {
      push("botao_longo", `"${button.label}" tem ${button.label.length} caracteres (máx. 25).`);
    }
  }
  return issues;
}

export function validateAllTemplates(): TemplateIssue[] {
  return Object.values(TEMPLATES).flatMap((t) => validateTemplate(t as TemplateDef));
}
