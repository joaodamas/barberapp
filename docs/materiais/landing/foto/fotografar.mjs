// Fotos da landing em tamanhos reais, rolando a página (as seções revelam ao chegar
// e o "Como funciona" troca de tela no meio da rolagem).
// uso: node fotografar.mjs <url> <pasta-saida>
import puppeteer from "puppeteer-core";
const [, , url, saida] = process.argv;
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const erros = [];
for (const [nome, w, h, mobile] of [["390", 390, 844, true], ["768", 768, 1024, true], ["1440", 1440, 900, false]]) {
  const p = await b.newPage();
  p.on("pageerror", (e) => erros.push(`${nome}: ${e.message}`));
  p.on("console", (m) => m.type() === "error" && erros.push(`${nome}: ${m.text().slice(0, 160)}`));
  await p.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  await p.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  // A página pode rolar dentro de um contêiner (o layout do cliente usa um div com overflow).
  await p.evaluate(() => {
    const cands = [document.scrollingElement, ...document.querySelectorAll("body *")];
    window.__rolo = cands.find((el) => el && el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY !== "visible" || el === document.scrollingElement && el.scrollHeight > innerHeight + 50) || document.scrollingElement;
  });
  const total = await p.evaluate(() => window.__rolo.scrollHeight);
  const larg = await p.evaluate(() => Math.max(document.documentElement.scrollWidth, window.__rolo.scrollWidth));
  let i = 0;
  for (let y = 0; y < total; y += Math.round(h * 0.9)) {
    await p.evaluate((y) => window.__rolo.scrollTo(0, y), y);
    await new Promise((r) => setTimeout(r, 1900));
    await p.screenshot({ path: `${saida}/${nome}-${String(i++).padStart(2, "0")}.png` });
  }
  console.log(nome, "altura", total, "largura", larg, larg > w ? "ROLAGEM LATERAL!" : "ok", i, "fotos");
  await p.close();
}
console.log("erros:", erros.length ? erros : "nenhum");
await b.close();
