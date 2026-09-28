/**
 * Teste de fumaça contra o site PUBLICADO — o que faltou no incidente de 28/09.
 *
 * O CI e o passeio passaram em tudo naquele dia: rodam contra o emulador, num
 * navegador limpo. O app no ar travou porque o service worker que já estava
 * nos celulares bloqueava o App Check. Este teste olha o site real, e duas
 * vezes: na primeira visita e na volta, já com o service worker no controle.
 *
 * Passa quando, nas duas visitas: o agendar carrega, nenhum erro de carga
 * aparece (chunk que não existe, Firestore sem resposta) e `availableSlots`
 * responde 200 depois de escolher um serviço.
 *
 * Uso: SITE=https://cortehub-dev.web.app node fumaca.mjs
 */
import { mkdir } from "node:fs/promises";
import { chromium, devices } from "playwright";

const SITE = process.env.SITE;
if (!SITE) {
  console.error("SITE é obrigatório (ex.: https://cortehub-dev.web.app)");
  process.exit(2);
}

const FATAIS = [
  /Backend didn't respond/i,
  /ChunkLoadError/i,
  /Loading chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /falha ao buscar horários/i,
];

async function esperarNoAr() {
  // O deploy acabou, mas a borda pode levar um minuto: tenta por até 3.
  for (let i = 0; i < 18; i++) {
    try {
      const r = await fetch(`${SITE}/agendar`, { redirect: "follow" });
      // Redirecionado para outra tela (ex.: /landing) não é "no ar": é a
      // barbearia que não foi encontrada — pego no DEV em 28/09.
      if (r.ok && !new URL(r.url).pathname.startsWith("/agendar")) {
        throw new Error(`${SITE}/agendar redirecionou para ${new URL(r.url).pathname}`);
      }
      if (r.ok) return;
      console.log(`  agendar respondeu ${r.status}, tentando de novo…`);
    } catch (e) {
      if (String(e.message).includes("redirecionou")) throw e;
      console.log(`  agendar sem resposta (${e.message}), tentando de novo…`);
    }
    await new Promise((ok) => setTimeout(ok, 10_000));
  }
  throw new Error(`${SITE}/agendar não respondeu 200 em 3 minutos`);
}

async function visita(context, nome) {
  const page = await context.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && FATAIS.some((re) => re.test(m.text()))) erros.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/_next/static/") && r.status() >= 400) erros.push(`${r.status()} em ${r.url()}`);
  });

  await page.goto(`${SITE}/agendar`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const servico = page.locator("button[aria-pressed]").first();
  try {
    await servico.waitFor({ timeout: 45_000 });
  } catch (e) {
    // O que a tela mostrava quando travou — sem isto a falha é um timeout mudo.
    await mkdir("saida", { recursive: true });
    await page.screenshot({ path: `saida/${nome.replace(/\s+/g, "-")}.png`, fullPage: true }).catch(() => {});
    const texto = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`serviços não apareceram em ${page.url()} — tela: "${texto}"`);
  }
  await servico.click();

  const slots = page.waitForResponse((r) => r.url().includes("availableSlots"), { timeout: 45_000 });
  await page.getByRole("button", { name: "Continuar" }).click();
  // Com mais de um barbeiro, o cliente escolhe antes de ver horário.
  const escolha = page.getByText("Com quem você quer cortar", { exact: true });
  // `isVisible` não espera: o passo 2 aparece um instante depois do clique.
  if (await escolha.waitFor({ timeout: 5_000 }).then(() => true, () => false)) {
    await escolha.locator("xpath=..").locator("button").first().click();
  }
  const resposta = await slots;
  if (resposta.status() !== 200) erros.push(`availableSlots respondeu ${resposta.status()}`);
  await page.waitForTimeout(2_000);

  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker?.getRegistration();
    return reg?.active?.scriptURL ?? null;
  });
  console.log(`  ${nome}: availableSlots ${resposta.status()} · service worker ${sw ? "ativo" : "ainda não"}`);
  await page.close();
  return erros;
}

await esperarNoAr();
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["iPhone 13"] });
let falhas = [];
try {
  falhas = falhas.concat((await visita(context, "primeira visita")).map((e) => `[primeira] ${e}`));
  // A volta: mesma sessão, service worker já instalado — o caso de 28/09.
  falhas = falhas.concat((await visita(context, "volta ao app")).map((e) => `[volta] ${e}`));
} catch (e) {
  falhas.push(`o passo travou: ${e.message.split("\n")[0]}`);
} finally {
  await browser.close();
}

if (falhas.length) {
  console.error(`FUMAÇA FALHOU em ${SITE}:`);
  for (const f of falhas) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`FUMAÇA OK em ${SITE}`);
