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

  /* Pontuação ao redor NÃO salva a variável.
   *
   * A Meta recusou `agenda_alterada`, que terminava em "...pelo link {{5}}." —
   * o ponto final não conta como conteúdo para ela. Como a regra publicada só
   * diz "não pode começar nem terminar com variável", isso só aparece na
   * submissão, dias depois de escrever o texto. Precisa de palavra de verdade
   * depois da última variável. */
  if (/^[\s\p{P}]*\{\{\d+\}\}/u.test(body)) {
    push("placeholder_no_inicio", "O corpo não pode começar com um placeholder.");
  }
  if (/\{\{\d+\}\}[\s\p{P}]*$/u.test(body)) {
    push(
      "placeholder_no_fim",
      "O corpo não pode terminar com um placeholder — pontuação depois não conta."
    );
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
    /* A Meta recusa emoji em BOTÃO — no corpo passa. Custou uma submissão
     * rejeitada para descobrir, e a mensagem de erro dela junta quatro regras
     * numa frase só, sem dizer qual foi violada. */
    if (/\p{Extended_Pictographic}/u.test(button.label)) {
      push("botao_com_emoji", `"${button.label}" tem emoji. Botão não aceita — só o corpo.`);
    }
    if (/\n/.test(button.label)) {
      push("botao_com_quebra", `"${button.label}" tem quebra de linha.`);
    }
    if (PLACEHOLDER.test(button.label)) {
      push("botao_com_variavel", `"${button.label}" tem variável. Botão de resposta rápida é texto fixo.`);
    }
    // `PLACEHOLDER` é global: sem zerar, o próximo `test()` continua de onde parou.
    PLACEHOLDER.lastIndex = 0;
  }
  return issues;
}

export function validateAllTemplates(): TemplateIssue[] {
  return Object.values(TEMPLATES).flatMap((t) => validateTemplate(t as TemplateDef));
}
