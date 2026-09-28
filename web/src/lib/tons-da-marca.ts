/**
 * Os tons que DERIVAM da cor da barbearia.
 *
 * Só `--color-gold` era sobrescrito por barbearia. `--color-gold-strong` (texto
 * de destaque), `--color-gold-hover` e `--shadow-gold` ficavam no marrom do
 * piloto — uma barbearia azul teria botão azul com texto e hover marrons
 * (auditoria white-label, 28/09).
 *
 * Os tons do padrão da plataforma foram ajustados à mão e medidos em
 * `contraste-de-tokens.test.ts`; para a cor padrão nada é sobrescrito. Para
 * qualquer outra, os tons saem por conta, com o mesmo piso de contraste:
 *
 * - `gold`: é fundo de botão com texto `ink`. Cor escura demais para isso é
 *   clareada até 4,5:1 — legibilidade vence o tom exato.
 * - `gold-strong`: texto sobre fundo claro e sobre a tinta da própria cor.
 *   Escurecida até 4,5:1 nos dois.
 * - `gold-hover`: clareia (ver o comentário em `globals.css`).
 */

type Rgb = [number, number, number];

export const COR_PADRAO = "#b8863a";
const INK: Rgb = [0x0f, 0x17, 0x2a];
const FUNDO_MAIS_ESCURO: Rgb = [0xf1, 0xf5, 0xf9]; // --color-surface-raised
const BRANCO: Rgb = [255, 255, 255];
const PRETO: Rgb = [0, 0, 0];
const MINIMO = 4.5;

export function hexParaRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const paraHex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

const misturar = (a: Rgb, b: Rgb, pesoDeB: number): Rgb =>
  a.map((v, i) => v + (b[i] - v) * pesoDeB) as Rgb;

function luminancia([r, g, b]: Rgb) {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: Rgb, b: Rgb) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Anda em direção a `alvo` até `ok` passar (ou chegar lá). */
function ajustar(cor: Rgb, alvo: Rgb, ok: (c: Rgb) => boolean): Rgb {
  for (let passo = 0; passo <= 20; passo++) {
    const c = misturar(cor, alvo, passo * 0.05);
    if (ok(c)) return c;
  }
  return alvo;
}

export function tonsDaMarca(accentColor: string | undefined): Record<string, string> {
  const base = accentColor ? hexParaRgb(accentColor) : null;
  if (!base || paraHex(base) === COR_PADRAO) return {};

  const gold = ajustar(base, BRANCO, (c) => contraste(c, INK) >= MINIMO);
  const tinta = misturar(BRANCO, gold, 0.15); // bg-gold/15, a etiqueta mais forte
  const strong = ajustar(
    gold,
    PRETO,
    (c) => contraste(c, FUNDO_MAIS_ESCURO) >= MINIMO && contraste(c, tinta) >= MINIMO
  );
  const hover = misturar(gold, BRANCO, 0.2);
  const [r, g, b] = gold.map(Math.round);

  return {
    "--color-gold": paraHex(gold),
    "--color-gold-strong": paraHex(strong),
    "--color-gold-hover": paraHex(hover),
    "--shadow-gold": `0 8px 24px -10px rgba(${r}, ${g}, ${b}, 0.28)`,
  };
}
