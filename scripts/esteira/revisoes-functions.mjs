/**
 * Revisões do Cloud Run das functions, antes e depois de um deploy.
 *
 * A volta automática do deploy só desfaz o Hosting. Function não volta sozinha
 * — desfazer às cegas código que escreve no banco é pior do que o defeito —,
 * mas quem for desfazer na mão precisa saber PARA ONDE voltar. Este script
 * escreve isso no resumo do job.
 *
 *   node revisoes-functions.mjs foto   < services.json > antes.json
 *   node revisoes-functions.mjs resumo antes.json depois.json PROJETO
 *
 * `services.json` e `depois.json` são a saída de
 * `gcloud run services list --project P --format=json`. Só entram os serviços
 * que o Cloud Functions gerencia (`goog-managed-by: cloudfunctions`).
 */
import { readFileSync } from "node:fs";

const [modo, ...args] = process.argv.slice(2);

function lerStdin() {
  return readFileSync(0, "utf8");
}

/** nome@região → revisão que recebe 100% do tráfego agora (ou null). */
function foto(services) {
  const r = {};
  for (const s of services) {
    const labels = s.metadata?.labels ?? {};
    if (labels["goog-managed-by"] !== "cloudfunctions") continue;
    const regiao = labels["cloud.googleapis.com/location"];
    const servindo = (s.status?.traffic ?? []).filter((t) => t.percent > 0).map((t) => t.revisionName);
    r[`${s.metadata.name}@${regiao}`] = {
      nome: s.metadata.name,
      regiao,
      // Tráfego dividido não tem "a" revisão anterior: fica sem comando.
      servindo: servindo.length === 1 ? servindo[0] : null,
      pronta: s.status?.latestReadyRevisionName ?? null,
    };
  }
  return r;
}

if (modo === "foto") {
  const f = foto(JSON.parse(lerStdin()));
  process.stdout.write(JSON.stringify(f));
  console.error(`${Object.keys(f).length} serviços de function anotados`);
} else if (modo === "resumo") {
  const [arqAntes, arqDepois, projeto] = args;
  const antes = JSON.parse(readFileSync(arqAntes, "utf8"));
  const depois = foto(JSON.parse(readFileSync(arqDepois, "utf8")));
  const alteradas = [];
  for (const [chave, d] of Object.entries(depois)) {
    const a = antes[chave];
    if (!a || !a.servindo || !d.pronta || d.pronta === a.servindo) continue;
    alteradas.push({ ...a, nova: d.pronta });
  }
  let out = "### Functions alteradas neste deploy\n\n";
  if (!alteradas.length) {
    out += "Nenhuma revisão mudou.\n";
  } else {
    out += "| serviço | região | revisão anterior | revisão nova |\n|---|---|---|---|\n";
    for (const a of alteradas) out += `| ${a.nome} | ${a.regiao} | \`${a.servindo}\` | \`${a.nova}\` |\n`;
    out +=
      "\nPara devolver o tráfego de uma function à revisão anterior, na mão, com uma conta que tenha `run.services.update`:\n\n```sh\n";
    for (const a of alteradas) {
      out += `gcloud run services update-traffic ${a.nome} --region ${a.regiao} --project ${projeto} --to-revisions ${a.servindo}=100\n`;
    }
    out +=
      "```\n\nIsso só move o tráfego: a function continua registrada com o código novo, e regras/índices não voltam junto. " +
      "Depois de corrigir, devolva o tráfego à revisão mais recente com `--to-latest` no lugar de `--to-revisions`.\n";
  }
  process.stdout.write(out);
} else {
  console.error("uso: revisoes-functions.mjs foto < services.json | resumo antes.json depois.json PROJETO");
  process.exit(2);
}
