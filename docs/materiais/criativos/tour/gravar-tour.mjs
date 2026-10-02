// Grava um HTML animado 1920×1080 com render(t) ASSÍNCRONO (espera o 'seeked' dos <video>) em MP4.
// uso:
//   node gravar-tour.mjs <arquivo.html> <saida.mp4> [--audio <mp4-com-a-trilha>] [--fps 30]
//   node gravar-tour.mjs <arquivo.html> <pasta-fotos> --fotos t1 t2 ...     (prévia: PNGs em tempos escolhidos)
// Os quadros vão para <saida>.quadros/ e são apagados no fim. Um vídeo por vez: é pesado.
import puppeteer from "puppeteer-core";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const [html, saida] = args;
const opc = (nome, padrao) => { const i = args.indexOf(nome); return i >= 0 ? args[i + 1] : padrao; };
const fotos = args.includes("--fotos") ? args.slice(args.indexOf("--fotos") + 1).map(Number) : null;
const fps = Number(opc("--fps", 30));
const audio = opc("--audio", null);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--allow-file-access-from-files", "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
const erros = [];
page.on("pageerror", (e) => erros.push(e.message));
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto("file://" + path.resolve(html), { waitUntil: "load", timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => window.PRONTO);
const D = await page.evaluate(() => window.DURACAO);

if (fotos) {
  mkdirSync(saida, { recursive: true });
  for (const t of fotos) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: path.join(saida, `t${t.toFixed(2)}.png`) });
  }
  await browser.close();
  console.log(`fotos: ${fotos.length} em ${saida}; erros: ${erros.length ? erros : "nenhum"}`);
  process.exit(0);
}

const pasta = saida + ".quadros";
rmSync(pasta, { recursive: true, force: true });
mkdirSync(pasta, { recursive: true });
const total = Math.round(D * fps);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.render(t), i / fps);
  await page.screenshot({ path: path.join(pasta, `q${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
  if (i % 150 === 0) console.log(`quadro ${i}/${total}`);
}
await browser.close();
const ent = ["-framerate", String(fps), "-i", path.join(pasta, "q%05d.jpg")];
const comAudio = audio ? ["-i", audio, "-map", "0:v", "-map", "1:a", "-c:a", "copy", "-shortest"] : [];
execFileSync("ffmpeg", ["-nostdin", "-v", "error", "-y", ...ent, ...comAudio,
  "-vf", "scale=in_range=full:out_range=tv,format=yuv420p", "-c:v", "libx264", "-profile:v", "high", "-crf", "18", "-preset", "medium",
  "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", saida]);
rmSync(pasta, { recursive: true, force: true });
console.log(`ok: ${total} quadros → ${saida}; erros: ${erros.length ? erros : "nenhum"}`);
