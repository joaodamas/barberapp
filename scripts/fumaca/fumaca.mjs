/**
 * Teste de fumaça contra o site PUBLICADO — o que faltou no incidente de 28/09.
 *
 * O CI e o passeio passaram em tudo naquele dia: rodam contra o emulador, num
 * navegador limpo. O app no ar travou porque o service worker que já estava
 * nos celulares — o da versão ANTERIOR — bloqueava o App Check. Este teste olha
 * o site real em três situações:
 *
 * 1. **Volta de quem já usava a versão anterior** (só quando houve a fase
 *    `antes`): o mesmo perfil de navegador que abriu o site ANTES do deploy,
 *    com o service worker antigo instalado, reabre o site novo. Tem de chegar
 *    ao worker da versão nova e a tela tem de responder — é o cenário de 28/09.
 * 2. **Primeira visita**, num navegador limpo.
 * 3. **Volta ao app**, na mesma sessão, já com o worker novo no controle.
 *
 * Em cada uma: o agendar carrega, nenhum erro de carga aparece (chunk que não
 * existe, Firestore sem resposta) e `availableSlots` responde 200 depois de
 * escolher um serviço. Por fim, `/login` precisa HIDRATAR: o botão de enviar só
 * habilita pelo estado do React, então ele habilitar prova que o JavaScript
 * assumiu a tela — a "página que aparece inteira e nenhum botão responde".
 *
 * Variáveis:
 *   SITE            obrigatória (ex.: https://cortehub-dev.web.app)
 *   FASE            `antes` (abre o site no ar e instala o worker dele no
 *                   PERFIL) ou `depois` (padrão: a fumaça propriamente dita)
 *   PERFIL          pasta do perfil persistente do navegador, a mesma nas duas
 *                   fases. Sem ela, a fase `depois` pula o cenário 1.
 *   BUILD_ESPERADO  identidade do build recém-publicado (12 primeiros
 *                   caracteres do commit, a mesma de `next.config.ts`). Quando
 *                   presente, o cenário 1 exige o worker `?v=<build>`.
 *   FUMACA_EMAIL / FUMACA_SENHA  OPCIONAIS. A conta de teste de uma barbearia
 *                   isolada: com as duas, entra pelo /login e confere que o
 *                   /painel abre a tela Hoje sem erro de leitura. Sem elas, pula.
 *   DETALHE         `completo` (padrão: diário e print na falha) ou `resumo`
 *                   (produção: o repositório é público, e o diário leva console
 *                   e endereços do site dos clientes — sai só o veredito).
 *
 * Uso: SITE=https://cortehub-dev.web.app node fumaca.mjs
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, devices } from "playwright";

const SITE = process.env.SITE;
if (!SITE) {
  console.error("SITE é obrigatório (ex.: https://cortehub-dev.web.app)");
  process.exit(2);
}
const FASE = process.env.FASE || "depois";
const PERFIL = process.env.PERFIL || "";
const BUILD_ESPERADO = process.env.BUILD_ESPERADO || "";
const RESUMO = process.env.DETALHE === "resumo";
const MARCA_ANTES = PERFIL ? path.join(PERFIL, "fumaca-antes.json") : "";

// `defaultBrowserType` é do descritor, não do contexto: o persistente recusa.
const { defaultBrowserType: _ignorado, ...IPHONE } = devices["iPhone 13"];

const FATAIS = [
  /Backend didn't respond/i,
  /ChunkLoadError/i,
  /Loading chunk .* failed/i,
  /Failed to fetch dynamically imported module/i,
  /falha ao buscar horários/i,
];

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

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
    await esperar(10_000);
  }
  throw new Error(`${SITE}/agendar não respondeu 200 em 3 minutos`);
}

/** Abre uma aba que anota tudo e separa o que é fatal. */
async function abrirAba(context) {
  const page = await context.newPage();
  const erros = [];
  // Diário da visita: sai no log só se a visita falhar, e só fora de produção.
  const diario = [];
  const t0 = Date.now();
  const anotar = (linha) => diario.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s ${linha}`);
  page.on("console", (m) => anotar(`console.${m.type()}: ${m.text().slice(0, 200)}`));
  page.on("requestfailed", (r) => anotar(`FALHOU ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`));
  page.on("response", (r) => {
    if (!r.url().startsWith(SITE) || r.status() >= 400) anotar(`${r.status()} ${r.url().slice(0, 120)}`);
  });
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error" && FATAIS.some((re) => re.test(m.text()))) erros.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.url().includes("/_next/static/") && r.status() >= 400) erros.push(`${r.status()} em ${new URL(r.url()).pathname}`);
  });
  return { page, erros, diario };
}

/** O que a tela mostrava quando travou — sem isto a falha é um timeout mudo. */
async function registrarTravamento(page, diario, nome) {
  if (RESUMO) return "";
  await mkdir("saida", { recursive: true });
  await page.screenshot({ path: `saida/${nome.replace(/\s+/g, "-")}.png`, fullPage: true }).catch(() => {});
  console.error(`--- diário da ${nome} ---\n${diario.join("\n")}\n---`);
  const texto = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
  return ` — tela: "${texto}"`;
}

/** O worker de uma aba: o que controla, e qualquer um da registration. */
async function workers(page) {
  return page
    .evaluate(async () => {
      const reg = await navigator.serviceWorker?.getRegistration();
      return {
        controla: navigator.serviceWorker?.controller?.scriptURL ?? null,
        ativo: reg?.active?.scriptURL ?? null,
      };
    })
    // A aba pode estar recarregando bem nesta hora (troca de versão).
    .catch(() => ({ controla: null, ativo: null }));
}

const versaoDe = (url) => (url ? new URL(url).searchParams.get("v") : null);

/**
 * Espera o worker da versão `build` assumir a aba. Sem toque na tela o app
 * pede a troca sozinho e recarrega (`service-worker-register.tsx`); é isso que
 * precisa acontecer com quem estava na versão anterior.
 */
async function esperarWorkerDaVersao(page, build, limiteMs) {
  const fim = Date.now() + limiteMs;
  let ultimo = null;
  while (Date.now() < fim) {
    const w = await workers(page);
    ultimo = versaoDe(w.controla);
    if (ultimo === build) return ultimo;
    await esperar(1_000);
  }
  throw new Error(`o worker da versão nova (${build}) não assumiu em ${limiteMs / 1000}s — controla: ${ultimo ?? "nenhum"}`);
}

/** O agendar de ponta a ponta até `availableSlots`. */
async function visita(context, nome, { exigirBuild = "" } = {}) {
  const { page, erros, diario } = await abrirAba(context);

  await page.goto(`${SITE}/agendar`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  try {
    if (exigirBuild) {
      await esperarWorkerDaVersao(page, exigirBuild, 60_000);
      // A troca recarrega a aba: a tela que vale é a de depois.
      await page.waitForLoadState("domcontentloaded");
    }
    await page.locator("button[aria-pressed]").first().waitFor({ timeout: 45_000 });
  } catch (e) {
    const tela = await registrarTravamento(page, diario, nome);
    const motivo = e.message.includes("worker da versão nova") ? e.message : "serviços não apareceram";
    throw new Error(`${nome}: ${motivo} em ${new URL(page.url()).pathname}${tela}`);
  }
  await page.locator("button[aria-pressed]").first().click();

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

  const w = await workers(page);
  const v = versaoDe(w.controla ?? w.ativo);
  console.log(`  ${nome}: availableSlots ${resposta.status()} · service worker ${v ? `ativo (v=${v})` : "ainda não"}`);
  await page.close();
  return erros;
}

/**
 * `/login` hidratado. Preenche o formulário que estiver na tela (e-mail e
 * senha, ou celular) e espera o botão de enviar habilitar — `disabled` vem do
 * estado do React. Nada é enviado.
 */
async function loginHidrata(context) {
  const nome = "tela de login";
  const { page, erros, diario } = await abrirAba(context);
  await page.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const email = page.locator("#login-email");
  const celular = page.locator("#login-phone");
  try {
    await email.or(celular).first().waitFor({ timeout: 45_000 });
    // Texto digitado antes da hidratação pode ser descartado pelo React: se o
    // botão não habilitar, preenche de novo.
    let pronto = false;
    for (let i = 0; i < 15 && !pronto; i++) {
      let enviar;
      if (await email.isVisible()) {
        await email.fill("fumaca@exemplo.com");
        await page.locator("#login-password").fill("fumaca-123");
        enviar = page.locator("form:has(#login-email) button[type=submit]");
      } else {
        await celular.fill("11999999999");
        enviar = page.locator("form:has(#login-phone) button[type=submit]");
      }
      // `isEnabled` não espera: confere por até 3 s antes de preencher de novo.
      for (let j = 0; j < 6 && !pronto; j++) {
        pronto = await enviar.first().isEnabled().catch(() => false);
        if (!pronto) await esperar(500);
      }
    }
    if (!pronto) throw new Error("o botão de entrar não habilitou com o formulário preenchido");
  } catch (e) {
    const tela = await registrarTravamento(page, diario, nome);
    throw new Error(`${nome}: não hidratou (${e.message.split("\n")[0]})${tela}`);
  }
  console.log(`  ${nome}: hidratada (botão de entrar respondeu ao formulário)`);
  await page.close();
  return erros;
}

/**
 * OPCIONAL — o painel logado. Só roda com `FUMACA_EMAIL` e `FUMACA_SENHA` (a
 * conta de teste de uma barbearia isolada, ver docs/MONITORAMENTO.md): entra
 * pelo `/login`, espera o `/painel` abrir a tela Hoje e exige que NENHUM
 * `ErroAoCarregar` apareça. É o "listener que o Firestore recusou" — regra
 * publicada errada, índice faltando — que o agendar anônimo não enxerga.
 * Sem os segredos, avisa e segue: nunca falha por falta de conta.
 */
async function painelSemErroDeLeitura(context) {
  const nome = "painel logado";
  const { page, erros, diario } = await abrirAba(context);
  try {
    await page.goto(`${SITE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const email = page.locator("#login-email");
    await email.waitFor({ timeout: 45_000 });
    // Texto digitado antes da hidratação pode ser descartado: repete até o botão habilitar.
    const entrar = page.locator("form:has(#login-email) button[type=submit]");
    let pronto = false;
    for (let i = 0; i < 15 && !pronto; i++) {
      await email.fill(process.env.FUMACA_EMAIL);
      await page.locator("#login-password").fill(process.env.FUMACA_SENHA);
      for (let j = 0; j < 6 && !pronto; j++) {
        pronto = await entrar.first().isEnabled().catch(() => false);
        if (!pronto) await esperar(500);
      }
    }
    if (!pronto) throw new Error("o botão de entrar não habilitou");
    await entrar.first().click();
    await page.waitForURL((u) => u.pathname.startsWith("/painel"), { timeout: 45_000 });
    // A tela Hoje: o texto aparece quando a agenda do dia hidratou.
    await page.getByText("Hoje", { exact: true }).first().waitFor({ timeout: 45_000 });
    // Dá tempo de os listeners do Firestore responderem (ou serem recusados).
    await esperar(8_000);
    const alerta = page.locator('[role="alert"]', { hasText: /Não foi possível carregar/ });
    if (await alerta.count()) {
      const texto = ((await alerta.first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 120);
      erros.push(`a tela Hoje mostrou erro de leitura: "${texto}"`);
    }
  } catch (e) {
    const tela = await registrarTravamento(page, diario, nome);
    erros.push(`${nome}: ${e.message.split("\n")[0]}${tela}`);
  }
  if (!erros.length) console.log(`  ${nome}: /painel abriu a tela Hoje sem erro de leitura`);
  await page.close();
  return erros;
}

// ── Fase "antes": instala o worker da versão que está no ar ───────────────
if (FASE === "antes") {
  if (!PERFIL) {
    console.error("FASE=antes exige PERFIL");
    process.exit(2);
  }
  await mkdir(PERFIL, { recursive: true });
  const context = await chromium.launchPersistentContext(PERFIL, IPHONE);
  try {
    const { page } = await abrirAba(context);
    await page.goto(`${SITE}/agendar`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator("button[aria-pressed]").first().waitFor({ timeout: 45_000 });
    // O registro acontece depois da hidratação; dá tempo de o worker ativar.
    let v = null;
    for (let i = 0; i < 30 && !v; i++) {
      v = versaoDe((await workers(page)).ativo);
      if (!v) await esperar(1_000);
    }
    if (!v) throw new Error("o service worker da versão no ar não ativou em 30s");
    await writeFile(MARCA_ANTES, JSON.stringify({ versao: v, em: new Date().toISOString() }));
    console.log(`versão no ar antes do deploy: service worker v=${v} instalado no perfil`);
  } catch (e) {
    console.error(`não deu para instalar o worker da versão no ar: ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
  process.exit();
}

// ── Fase "depois": a fumaça ───────────────────────────────────────────────
await esperarNoAr();
let falhas = [];
const anotarFalhas = (rotulo, lista) => {
  falhas = falhas.concat(lista.map((e) => `[${rotulo}] ${e}`));
};

if (MARCA_ANTES && existsSync(MARCA_ANTES)) {
  const { versao } = JSON.parse(await readFile(MARCA_ANTES, "utf8"));
  console.log(`  perfil com o worker da versão anterior (v=${versao})`);
  const persistente = await chromium.launchPersistentContext(PERFIL, IPHONE);
  try {
    // Mesmo build que já estava no ar (escopo sem Hosting, ou deploy que não
    // mudou nada): não há troca para esperar, só a tela que precisa responder.
    const exigir = BUILD_ESPERADO && BUILD_ESPERADO !== versao ? BUILD_ESPERADO : "";
    anotarFalhas("versão anterior", await visita(persistente, "volta de quem estava na versão anterior", { exigirBuild: exigir }));
  } catch (e) {
    falhas.push(`[versão anterior] o passo travou: ${e.message.split("\n")[0]}`);
  } finally {
    await persistente.close();
  }
} else if (PERFIL) {
  console.log("  sem perfil da versão anterior (a fase 'antes' não rodou ou falhou): cenário pulado");
}

const browser = await chromium.launch();
const context = await browser.newContext(IPHONE);
try {
  anotarFalhas("primeira", await visita(context, "primeira visita"));
  // A volta: mesma sessão, service worker já instalado.
  anotarFalhas("volta", await visita(context, "volta ao app"));
  anotarFalhas("login", await loginHidrata(context));
  if (process.env.FUMACA_EMAIL && process.env.FUMACA_SENHA) {
    // Contexto próprio: a sessão do login de teste não vaza para outras visitas.
    const logado = await browser.newContext(IPHONE);
    try {
      anotarFalhas("painel", await painelSemErroDeLeitura(logado));
    } finally {
      await logado.close();
    }
  } else {
    console.log("  AVISO: sem FUMACA_EMAIL/FUMACA_SENHA — o passo do painel logado foi pulado");
  }
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
