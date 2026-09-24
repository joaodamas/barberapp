/**
 * Passeio tela a tela — celular e PC — contra o emulador.
 *
 * Tira uma foto de cada tela em cada aparelho e mede o que uma foto sozinha
 * esconde: página mais larga que a tela, elemento que sai pela direita, botão
 * pequeno demais para o dedo, texto miúdo, erro no console e quanto a tela
 * levou para ficar pronta. Roda no GitHub: na máquina do dono, emulador +
 * servidor + navegador travaram o computador (24/09).
 *
 * Saída em `saida/`: PNGs e `relatorio.json` / `relatorio.md`.
 */
import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://osiqueira.lvh.me:3000";
const SAIDA = new URL("./saida/", import.meta.url).pathname;
mkdirSync(SAIDA, { recursive: true });

const APARELHOS = [
  ["iphone-se", devices["iPhone SE"]],
  ["iphone-13", devices["iPhone 13"]],
  ["android", devices["Pixel 7"]],
  ["pc-1366", { viewport: { width: 1366, height: 768 } }],
];

const PAINEL = [
  "/painel",
  "/painel/financeiro",
  "/painel/financeiro/dre",
  "/painel/financeiro/fluxo-caixa",
  "/painel/financeiro/projecao",
  "/painel/financeiro/despesas",
  "/painel/clientes",
  "/painel/loja",
  "/painel/mensal",
  "/painel/numeros",
  "/painel/configuracoes",
  "/painel/horarios",
  "/painel/meu-link",
  "/painel/servicos",
  "/painel/equipe",
];
const PUBLICO = ["/", "/agendar", "/planos", "/login"];

const nomeDe = (rota) => (rota === "/" ? "vitrine" : rota.replace(/^\//, "").replace(/\//g, "_"));

/** O que a foto não diz. Tudo medido no DOM da tela já pronta. */
async function medir(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visivel = (el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
    };
    /* Dentro de um contêiner que ROLA de lado, sair da área é de propósito. */
    const dentroDeRolagem = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === "auto" || ox === "scroll") && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const texto = (el) => (el.innerText || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);

    const saemPelaDireita = [...document.querySelectorAll("main *, header *, nav *")]
      .filter((el) => visivel(el) && el.children.length === 0)
      .filter((el) => el.getBoundingClientRect().right > vw + 1 && !dentroDeRolagem(el))
      .map(texto)
      .filter(Boolean);

    const botoesPequenos = [...document.querySelectorAll("button, a[href], [role=button], input, select")]
      .filter((el) => visivel(el) && !el.closest("[aria-hidden=true]"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 32 || r.width < 32;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${texto(el) || el.tagName} (${Math.round(r.width)}×${Math.round(r.height)})`;
      });

    const textoMiudo = [...document.querySelectorAll("main *")]
      .filter((el) => visivel(el) && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11)
      .map((el) => `${texto(el)} (${getComputedStyle(el).fontSize})`);

    return {
      larguraDaPagina: document.documentElement.scrollWidth,
      larguraDaTela: vw,
      vazaDeLado: document.documentElement.scrollWidth > vw + 1,
      alturaDaPagina: document.documentElement.scrollHeight,
      saemPelaDireita: [...new Set(saemPelaDireita)].slice(0, 15),
      botoesPequenos: [...new Set(botoesPequenos)].slice(0, 20),
      textoMiudo: [...new Set(textoMiudo)].slice(0, 15),
    };
  });
}

async function pronta(page) {
  /* "Pronta" = sem esqueleto de carregamento na tela. */
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"], .animate-pulse'), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(600);
}

const relatorio = [];
const browser = await chromium.launch();

for (const [aparelho, cfg] of APARELHOS) {
  const celular = aparelho !== "pc-1366";
  const ctx = await browser.newContext({ ...cfg, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  let erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => erros.push("PAGEERROR " + e.message.slice(0, 200)));

  async function visitar(rota, nome, antes) {
    erros = [];
    const t0 = Date.now();
    await page.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pronta(page);
    if (antes) await antes();
    const ms = Date.now() - t0;
    const arquivo = `${aparelho}__${nome}.png`;
    await page.screenshot({ path: SAIDA + arquivo, fullPage: true });
    const m = await medir(page);
    relatorio.push({ aparelho, tela: nome, rota, ms, erros: [...new Set(erros)], ...m, arquivo });
    console.log(aparelho, nome, ms + "ms", m.vazaDeLado ? "VAZA" : "", m.saemPelaDireita.length ? "SAI:" + m.saemPelaDireita.length : "");
  }

  /* Visitante, antes de entrar. */
  for (const rota of PUBLICO) await visitar(rota, "publico_" + nomeDe(rota));

  /* Dono. */
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  /* Preencher antes da hidratação não chega ao estado do React e o "Entrar"
     fica desabilitado: preenche de novo até ele habilitar. */
  const entrar = page.getByRole("button", { name: "Entrar", exact: true });
  for (let i = 0; i < 20 && !(await entrar.isEnabled()); i++) {
    await page.getByRole("textbox", { name: "E-mail" }).fill("dono@osiqueira.teste");
    await page.getByRole("textbox", { name: "Senha" }).fill("dono12345");
    await page.waitForTimeout(500);
  }
  await entrar.click({ timeout: 30000 });
  await page.waitForURL(/\/painel/, { timeout: 60000 });

  for (const rota of PAINEL) await visitar(rota, nomeDe(rota));

  /* A agenda andando: amanhã e ontem. */
  await visitar("/painel", "painel_amanha", async () => {
    await page.getByRole("button", { name: "Próximo dia" }).click();
    await page.waitForTimeout(500);
  });
  await visitar("/painel", "painel_ontem", async () => {
    await page.getByRole("button", { name: "Dia anterior" }).click();
    await page.waitForTimeout(500);
  });

  if (celular) {
    /* O menu "Mais" e o "+" da barra. Foto só da tela (não da página
       inteira): é o que o dono vê com a folha aberta. */
    await page.goto(BASE + "/painel", { waitUntil: "domcontentloaded" });
    await pronta(page);
    await page.getByRole("button", { name: "Mais opções" }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SAIDA}${aparelho}__menu_mais.png` });
    const menu = await page.evaluate(() => {
      const links = [...document.querySelectorAll("nav section a")];
      return {
        itens: links.length,
        foraDaTela: links.filter((a) => a.getBoundingClientRect().bottom > innerHeight).map((a) => a.innerText),
      };
    });
    relatorio.push({ aparelho, tela: "menu_mais", ...menu, arquivo: `${aparelho}__menu_mais.png` });
    await page.getByRole("button", { name: "Fechar mais opções" }).click();

    await page.getByRole("button", { name: "Marcar atendimento" }).first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SAIDA}${aparelho}__marcar_vazio.png` });
    /* Escolhe serviço e o primeiro horário, para a foto mostrar o botão com o resumo. */
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: /^Corte\b/ }).first().click();
    await dialogo.getByRole("button", { name: "Rafael" }).click().catch(() => {});
    await page.waitForTimeout(2500);
    await dialogo.getByRole("button", { name: /^\d\d:\d\d$/ }).first().click().catch(() => {});
    await page.screenshot({ path: `${SAIDA}${aparelho}__marcar_escolhido.png` });
    const marcar = await medir(page);
    relatorio.push({ aparelho, tela: "marcar_atendimento", ...marcar, arquivo: `${aparelho}__marcar_escolhido.png` });
  }

  await ctx.close();
}
await browser.close();

writeFileSync(SAIDA + "relatorio.json", JSON.stringify(relatorio, null, 2));
const linhas = relatorio.map(
  (r) =>
    `| ${r.aparelho} | ${r.tela} | ${r.ms ?? ""} | ${r.vazaDeLado ? "**sim**" : ""} | ${(r.saemPelaDireita ?? r.foraDaTela ?? []).join(", ")} | ${(r.botoesPequenos ?? []).length} | ${(r.textoMiudo ?? []).length} | ${(r.erros ?? []).length} |`
);
writeFileSync(
  SAIDA + "relatorio.md",
  ["| aparelho | tela | ms | vaza | sai da tela | botões <32px | texto <11px | erros |", "|---|---|---|---|---|---|---|---|", ...linhas].join("\n")
);
console.log("PASSEIO CONCLUÍDO:", relatorio.length, "medições");
