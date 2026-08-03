/**
 * Submete os templates do catálogo para aprovação na Meta, via Graph API.
 *
 * Por que script e não o formulário do WhatsApp Manager: template mora DENTRO
 * de uma WABA, e cada barbearia vai ter a sua (é o que o Embedded Signup faz).
 * Preencher 34 formulários à mão é trabalho que se joga fora na segunda
 * barbearia. Aqui o mesmo comando roda em qualquer WABA, em segundos, e o texto
 * nunca diverge de `templates.ts` — que continua sendo a fonte da verdade.
 *
 * O token NÃO passa por linha de comando: fica em `functions/.meta-token`
 * (ignorado pelo git). Argumento de processo aparece em `ps`, no histórico do
 * shell e em log de terminal — token de acesso não pode viver nesses lugares.
 *
 * Uso, de dentro de functions/ e com `npm run build` feito:
 *
 *   node scripts/criar-templates-whatsapp.mjs --waba 1533210405269929 --dry-run
 *   node scripts/criar-templates-whatsapp.mjs --waba 1533210405269929 \
 *     --apenas nova_reserva,confirmacao_reserva,lembrete_confirmacao
 *
 * Sem `--apenas`, submete os 34. Comece pelos poucos: reprovação na Meta não
 * explica o motivo, e com 34 pendentes de uma vez não se sabe qual regra doeu.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TEMPLATES } from "../lib/whatsapp/templates.js";
import { validateTemplate } from "../lib/whatsapp/validate.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
const VERSAO_API = "v22.0";

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (nome) => args.includes(`--${nome}`);

const wabaId = valor("waba");
const ensaio = flag("dry-run");
const apenas = valor("apenas")?.split(",").map((s) => s.trim()).filter(Boolean);

if (!wabaId) {
  console.error("Falta --waba <id da conta do WhatsApp Business>.");
  process.exit(1);
}

function lerToken() {
  const caminho = resolve(AQUI, "..", ".meta-token");
  try {
    const token = readFileSync(caminho, "utf8").trim();
    if (!token) throw new Error("vazio");
    return token;
  } catch {
    console.error(
      `Não encontrei o token em ${caminho}.\n\n` +
        "Gere um em developers.facebook.com > seu app > WhatsApp > Configuração da API\n" +
        "(o token temporário vale 24h e serve para isso), e salve assim:\n\n" +
        "  printf '%s' 'SEU_TOKEN' > functions/.meta-token\n\n" +
        "O arquivo está no .gitignore e o script nunca imprime o conteúdo."
    );
    process.exit(1);
  }
}

/** Catálogo → payload da Graph API. */
function paraPayload(t) {
  const componentes = [
    {
      type: "BODY",
      text: t.body,
      // A Meta exige exemplo para cada variável — sem isso a submissão é
      // recusada na hora, antes mesmo da revisão humana.
      ...(t.params.length ? { example: { body_text: [t.example] } } : {}),
    },
  ];

  if (t.buttons?.length) {
    componentes.push({
      type: "BUTTONS",
      buttons: t.buttons.map((b) => ({ type: "QUICK_REPLY", text: b.label })),
    });
  }

  return {
    name: t.name,
    language: t.language,
    category: t.category,
    components: componentes,
  };
}

const escolhidos = Object.values(TEMPLATES).filter(
  (t) => !apenas || apenas.includes(t.name)
);

if (apenas) {
  const desconhecidos = apenas.filter(
    (nome) => !Object.values(TEMPLATES).some((t) => t.name === nome)
  );
  if (desconhecidos.length) {
    console.error(`Não existem no catálogo: ${desconhecidos.join(", ")}`);
    process.exit(1);
  }
}

/* Validação local antes de gastar submissão: aprovação leva horas e reprovação
 * não diz o motivo. As regras estão em validate.ts. */
const problemas = escolhidos.flatMap((t) => validateTemplate(t));
if (problemas.length) {
  console.error("Templates fora das regras da Meta — nada foi enviado:\n");
  for (const p of problemas) console.error(`  ${p.template} · ${p.rule}: ${p.detail}`);
  process.exit(1);
}
console.log(`${escolhidos.length} template(s) passaram na validação local.\n`);

if (ensaio) {
  for (const t of escolhidos) {
    console.log(`--- ${t.name} (${t.category}, para o ${t.audience}) ---`);
    console.log(JSON.stringify(paraPayload(t), null, 2));
    console.log();
  }
  console.log("Ensaio: nada foi enviado para a Meta.");
  process.exit(0);
}

const token = lerToken();
const resultados = { criados: [], jaExistiam: [], falharam: [] };

for (const t of escolhidos) {
  const r = await fetch(
    `https://graph.facebook.com/${VERSAO_API}/${wabaId}/message_templates`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(paraPayload(t)),
    }
  );
  const corpo = await r.json();

  if (r.ok) {
    console.log(`✓ ${t.name} — ${corpo.status ?? "enviado"}`);
    resultados.criados.push(t.name);
    continue;
  }

  const msg = corpo.error?.error_user_msg ?? corpo.error?.message ?? JSON.stringify(corpo);
  /* Nome duplicado não é falha: o script é idempotente de propósito, para poder
   * rodar de novo depois de corrigir um texto sem apagar o resto. */
  if (/already exists/i.test(msg)) {
    console.log(`= ${t.name} — já existia nesta WABA`);
    resultados.jaExistiam.push(t.name);
  } else {
    console.log(`✗ ${t.name} — ${msg}`);
    resultados.falharam.push({ nome: t.name, erro: msg });
  }
}

console.log(
  `\ncriados: ${resultados.criados.length} · já existiam: ${resultados.jaExistiam.length} · falharam: ${resultados.falharam.length}`
);
if (resultados.falharam.length) {
  console.log("\nRever:");
  for (const f of resultados.falharam) console.log(`  ${f.nome}: ${f.erro}`);
  process.exit(1);
}
console.log(
  "\nA aprovação costuma sair em minutos, mas pode levar até 24h.\n" +
    "Acompanhe em: WhatsApp Manager > Modelos de mensagem."
);
