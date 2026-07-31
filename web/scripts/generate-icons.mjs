import sharp from "sharp";
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const logoSvg = readFileSync(path.join(root, "o-siqueira-logo.svg"));
const outDir = path.join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = "#0F0E0B";

async function makeIcon(size, file) {
  await sharp(logoSvg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(path.join(outDir, file));
}

async function makeMaskable(size, file) {
  const inner = Math.round(size * 0.72);
  const logoBuf = await sharp(logoSvg, { density: 384 })
    .resize(inner, inner)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: logoBuf, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, file));
}

async function main() {
  await makeIcon(192, "icon-192.png");
  await makeIcon(512, "icon-512.png");
  await makeIcon(180, "apple-touch-icon.png");
  await makeMaskable(192, "maskable-192.png");
  await makeMaskable(512, "maskable-512.png");
  await makeIcon(32, "favicon-32.png");
  console.log("Ícones gerados em", outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
