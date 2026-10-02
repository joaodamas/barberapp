/**
 * Grava o app DE VERDADE, módulo a módulo, no celular e no computador — a
 * matéria-prima do tour de apresentação. Roda no GitHub
 * (.github/workflows/tour-demo.yml), contra o emulador com a Barbearia Navalha
 * de `semear-demo.mjs`. Nunca na máquina do dono.
 *
 * Um vídeo por módulo por aparelho (`saida/<aparelho>__<modulo>.webm`), uma
 * foto nítida do fim de cada um (`.png`) e `saida/roteiro.json` com, para
 * cada vídeo, o segundo em que a tela ficou pronta (`inicio` — o que vem antes
 * é carregamento e a edição corta) e a duração total.
 *
 * O relógio do navegador fica parado no REF do semeador (um dia de movimento
 * às 15h), para "Hoje" mostrar a agenda cheia qualquer que seja a hora em que
 * o job rode.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SAIDA = new URL("./saida/", import.meta.url).pathname;
mkdirSync(SAIDA, { recursive: true });
const { ref, nome, slug } = JSON.parse(readFileSync(SAIDA + "ref.json", "utf8"));
/* O slug vem do semeador (DEMO_SLUG), para o tour com o nome do prospect. */
const BASE = process.env.BASE ?? `http://${slug ?? "navalha"}.lvh.me:3000`;

const APARELHOS = {
  celular: {
    ...devices["iPhone 13"],
    deviceScaleFactor: 2,
    recordVideo: { dir: SAIDA + "bruto", size: { width: 780, height: 1688 } },
  },
  /* 1440×900 de tela com densidade 2: o vídeo sai em 2880×1800, nítido o
   * bastante para a edição dar zoom num detalhe sem pixelar. */
  computador: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: SAIDA + "bruto", size: { width: 2880, height: 1800 } },
  },
};

const espera = (page, ms) => page.waitForTimeout(ms);

/* ---- Linha do tempo de cada vídeo ----
 * Para a edição dar zoom no detalhe e pôr o efeito sonoro no quadro certo:
 * `t` em segundos desde o início do vídeo (a página nasce junto com ele) e a
 * caixa em px da viewport (CSS; no vídeo, multiplicar pela densidade). */
let linha = { t0: Date.now(), eventos: [] };
const agoraNoVideo = () => +((Date.now() - linha.t0) / 1000).toFixed(2);
const caixaDe = (b) => (b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null);
function registrar(tipo, alvo, caixa, extra = {}) {
  linha.eventos.push({ t: agoraNoVideo(), tipo, alvo, caixa, ...extra });
}
async function dialogosVisiveis(page) {
  return page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').count().catch(() => 0);
}
/** Toca no elemento registrando onde ele estava — e o que apareceu depois. */
async function clicar(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {});
  const caixa = caixaDe(await locator.boundingBox({ timeout: 8000 }).catch(() => null));
  const texto = ((await locator.innerText({ timeout: 2000 }).catch(() => "")) || (await locator.getAttribute("aria-label").catch(() => "")) || "")
    .trim().replace(/\s+/g, " ").slice(0, 60);
  const antes = await dialogosVisiveis(page);
  registrar("clique", texto, caixa);
  await locator.click();
  /* Modal ou folha que surge com o toque: a caixa dela é o zoom seguinte. */
  await espera(page, 450);
  if ((await dialogosVisiveis(page)) > antes) {
    const d = page.locator('[role="dialog"]:visible, [role="alertdialog"]:visible').last();
    const titulo = ((await d.getAttribute("aria-label").catch(() => "")) || (await d.locator("h1,h2,h3").first().innerText({ timeout: 1000 }).catch(() => "")) || "modal").trim().slice(0, 60);
    registrar("aparece", titulo, caixaDe(await d.boundingBox().catch(() => null)));
  }
}

async function pronta(page) {
  /* Mesma regra do passeio: texto na tela e nenhum esqueleto carregando. */
  await page
    .waitForFunction(
      () => document.body.innerText.trim().length > 30 && !document.querySelector('[aria-busy="true"], .animate-pulse'),
      null,
      { timeout: 25000 }
    )
    .catch(() => {});
  await espera(page, 500);
}

/** Rolagem suave (easing), no elemento que de fato rola. */
async function rolar(page, px = 700, ms = 2600) {
  registrar("rola", `${px}px em ${ms}ms`, { x: 0, y: 0, ...(() => { const v = page.viewportSize(); return { w: v.width, h: v.height }; })() }, { duracao: ms / 1000 });
  await page.evaluate(
    ({ px, ms }) =>
      new Promise((ok) => {
        const candidatos = [document.getElementById("conteudo"), document.querySelector("main"), document.scrollingElement];
        const alvo = candidatos.find((el) => el && el.scrollHeight > el.clientHeight + 20) ?? document.scrollingElement;
        const de = alvo.scrollTop;
        const ate = Math.max(0, Math.min(de + px, alvo.scrollHeight - alvo.clientHeight));
        const t0 = performance.now();
        const passo = (agora) => {
          const t = Math.min(1, (agora - t0) / ms);
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          alvo.scrollTop = de + (ate - de) * e;
          if (t < 1) requestAnimationFrame(passo);
          else ok();
        };
        requestAnimationFrame(passo);
      }),
    { px, ms }
  );
}

/** Traz o elemento para o meio da tela, devagar, antes de tocar nele. */
async function mostrar(page, locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 8000 });
  await espera(page, 700);
}

/* ---- O que se faz em cada módulo ---- */
const CLIENTE = [
  ["vitrine", "/", async (p) => { await espera(p, 1500); await rolar(p, 600); await espera(p, 1200); }],
  ["agendar", "/agendar", async (p) => {
    await espera(p, 1200);
    /* Nome acessível: "Corte 30 min R$ 50,00" — sem confundir com "Corte infantil". */
    await clicar(p, p.getByRole("button", { name: /^Corte\s+30\s*min/ }).first());
    await espera(p, 900);
    await clicar(p, p.getByRole("button", { name: /^Barba\s+30\s*min/ }).first());
    await espera(p, 1800);
    await clicar(p, p.getByRole("button", { name: "Continuar" }));
    await espera(p, 1500);
    /* Dia: o terceiro da faixa — sempre futuro no relógio real. */
    const dias = p.locator("button[aria-pressed]").filter({ hasText: /\d/ });
    await clicar(p, dias.nth(2)).catch(() => {});
    await espera(p, 1200);
    await clicar(p, p.getByRole("button", { name: "Diego" })).catch(() => {});
    await espera(p, 2200);
    const horario = p.getByRole("button", { name: /^\d\d:\d\d$/ }).first();
    await mostrar(p, horario);
    await clicar(p, horario);
    await espera(p, 1500);
    const continuar = p.getByRole("button", { name: "Continuar" });
    if (await continuar.isVisible().catch(() => false)) await clicar(p, continuar);
    await espera(p, 2000);
    const confirmar = p.getByRole("button", { name: "Confirmar reserva" });
    await mostrar(p, confirmar);
    await clicar(p, confirmar);
    await espera(p, 3500);
  }],
  ["reservas", "/reservas", async (p) => { await espera(p, 1500); await rolar(p, 500); await espera(p, 1200); }],
  ["planos", "/planos", async (p) => { await espera(p, 1500); await rolar(p, 500); await espera(p, 1200); }],
];

/* Começo de mês não tem o que mostrar no mês corrente: DRE e Números vão
 * para o mês anterior, que o semeador encheu. */
const COMECO_DE_MES = Number(String(ref).slice(8, 10)) <= 15;
const mesCheio = (px) => async (p) => {
  await espera(p, 1200);
  if (COMECO_DE_MES) {
    const anterior = p.getByRole("button", { name: "Mês anterior" }).first();
    if (await anterior.isVisible().catch(() => false)) {
      await clicar(p, anterior);
      await pronta(p);
    }
  }
  await rolar(p, px, 3200);
  await espera(p, 1500);
};

const passear = (px = 900) => async (p) => {
  await espera(p, 1500);
  await rolar(p, px, 3200);
  await espera(p, 1500);
};

const DONO = [
  ["hoje", "/painel", passear(1100)],
  ["encaixe", "/painel", async (p) => {
    await espera(p, 1000);
    const aprovar = p.getByRole("button", { name: "Aprovar encaixe" }).first();
    await mostrar(p, aprovar);
    await espera(p, 1200);
    await clicar(p, aprovar);
    await espera(p, 3000);
  }],
  ["agenda", "/painel/agenda", async (p) => {
    await espera(p, 1500);
    await rolar(p, 500, 2400);
    await espera(p, 1000);
    await clicar(p, p.getByRole("tab", { name: "Lista" }));
    await espera(p, 1500);
    await rolar(p, 600, 2600);
    await espera(p, 1200);
  }],
  ["marcar-atendimento", "/painel", async (p) => {
    await espera(p, 1000);
    await clicar(p, p.getByRole("button", { name: "Marcar atendimento" }).first());
    await espera(p, 1300);
    const dialogo = p.getByRole("dialog");
    await clicar(p, dialogo.getByRole("button", { name: /^Corte\s+R\$/ }).first());
    await espera(p, 900);
    await clicar(p, dialogo.getByRole("button", { name: "Caio", exact: true }));
    await espera(p, 1000);
    /* "Hoje" do tour é passado para o servidor (relógio real): sábado à frente. */
    await clicar(p, dialogo.getByRole("button", { name: /^s[aá]b\./ }).first());
    await espera(p, 2500);
    const horario = dialogo.getByRole("button", { name: /^\d\d:\d\d$/ }).first();
    await mostrar(p, horario);
    await clicar(p, horario);
    await espera(p, 2500);
  }],
  ["concluir-atendimento", "/painel", async (p) => {
    await espera(p, 1000);
    const concluir = p.getByRole("button", { name: "Concluir", exact: true }).first();
    await mostrar(p, concluir);
    await clicar(p, concluir);
    await espera(p, 1300);
    const dialogo = p.getByRole("dialog");
    await clicar(p, dialogo.getByRole("button", { name: "Adicionar serviço" }));
    await espera(p, 1200);
    await clicar(p, dialogo.getByRole("button", { name: /^Sobrancelha ·/ }));
    await espera(p, 1800);
    await clicar(p, dialogo.getByRole("button", { name: "Somar ao atendimento" }));
    await espera(p, 2500);
    await clicar(p, dialogo.getByRole("button", { name: /Pix/ }).first());
    await espera(p, 2500);
  }],
  ["mensalistas", "/painel/mensal", passear()],
  ["clientes", "/painel/clientes", passear()],
  ["servicos", "/painel/servicos", passear()],
  ["equipe", "/painel/equipe", passear(600)],
  ["horarios", "/painel/horarios", passear(600)],
  ["loja", "/painel/loja", passear()],
  ["financeiro", "/painel/financeiro", passear(1200)],
  ["dre", "/painel/financeiro/dre", mesCheio(1200)],
  ["fluxo-de-caixa", "/painel/financeiro/fluxo-caixa", passear()],
  ["projecao", "/painel/financeiro/projecao", passear()],
  ["despesas", "/painel/financeiro/despesas", passear(600)],
  ["numeros", "/painel/numeros", mesCheio(1200)],
  ["avisos", "/painel/avisos", passear(600)],
  ["meu-link", "/painel/meu-link", passear(600)],
];

async function entrar(ctx, email, senha, destino) {
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 60000 });
  /* Preencher antes da hidratação não chega ao React: repete até o "Entrar" habilitar. */
  const botao = page.getByRole("button", { name: "Entrar", exact: true });
  for (let i = 0; i < 20 && !(await botao.isEnabled().catch(() => false)); i++) {
    await page.getByRole("textbox", { name: "E-mail" }).fill(email);
    await page.getByRole("textbox", { name: "Senha" }).fill(senha);
    await espera(page, 500);
  }
  await botao.click({ timeout: 30000 });
  await page.waitForURL(destino, { timeout: 60000 });
  await pronta(page);
  const video = page.video();
  await page.close();
  await video?.delete().catch(() => {});
}

const roteiro = [];
const browser = await chromium.launch();

for (const [aparelho, cfg] of Object.entries(APARELHOS)) {
  for (const [quem, email, senha, destino, modulos] of [
    ["cliente", "cliente@navalha.teste", "cliente12345", (u) => !u.pathname.startsWith("/login"), CLIENTE],
    ["dono", "dono@navalha.teste", "navalha12345", /\/painel/, DONO],
  ]) {
    /* `bypassCSP`: a CSP de produção pede HTTPS, e aqui não há. */
    const ctx = await browser.newContext({ ...cfg, locale: "pt-BR", timezoneId: "America/Sao_Paulo", bypassCSP: true });
    await ctx.clock.setFixedTime(new Date(ref));
    await entrar(ctx, email, senha, destino);

    for (const [modulo, rota, acao] of modulos) {
      const page = await ctx.newPage();
      const erros = [];
      page.on("pageerror", (e) => erros.push(e.message.slice(0, 160)));
      linha = { t0: Date.now(), eventos: [] };
      const t0 = linha.t0;
      let falha = null;
      try {
        await page.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60000 });
        await pronta(page);
        registrar("aparece", "tela pronta", { x: 0, y: 0, w: cfg.viewport.width, h: cfg.viewport.height });
      } catch (e) {
        falha = "carregar: " + e.message.slice(0, 160);
      }
      const inicio = (Date.now() - t0) / 1000;
      if (!falha) {
        try {
          await acao(page);
        } catch (e) {
          falha = e.message.split("\n")[0].slice(0, 200);
        }
      }
      await espera(page, 600);
      const nome = `${aparelho}__${modulo}`;
      await page.screenshot({ path: `${SAIDA}${nome}.png` }).catch(() => {});
      const duracao = (Date.now() - t0) / 1000;
      const video = page.video();
      await page.close();
      await video.saveAs(`${SAIDA}${nome}.webm`);
      await video.delete().catch(() => {});
      roteiro.push({ modulo, quem, aparelho, densidade: cfg.deviceScaleFactor, viewport: cfg.viewport, eventos: linha.eventos, rota, arquivo: `${nome}.webm`, foto: `${nome}.png`, inicio: +inicio.toFixed(2), duracao: +duracao.toFixed(2), falha, erros });
      console.log(`${falha ? "FALHOU" : "ok"} ${nome} · pronta em ${inicio.toFixed(1)}s · ${duracao.toFixed(1)}s${falha ? " · " + falha : ""}`);
    }
    await ctx.close();
  }
}
await browser.close();

writeFileSync(SAIDA + "roteiro.json", JSON.stringify({ ref, nome, base: BASE, videos: roteiro }, null, 2));
const falhas = roteiro.filter((r) => r.falha);
console.log(`TOUR GRAVADO: ${roteiro.length} vídeos, ${falhas.length} com falha`);
