/**
 * A marca de quem ainda não subiu logo: as iniciais da barbearia sobre a cor
 * de destaque que o dono escolheu no onboarding.
 *
 * Existe porque toda barbearia criada pelo cadastro nascia com
 * `brand.logo: "/logo.svg"` — o selo d'O Siqueira, o piloto — e com os ícones
 * de PWA dele: o cliente da "Navalha" via a marca de outra barbearia no topo do
 * app e na tela inicial do celular (rodada E2E de 23/09). A marca da
 * plataforma também não serve: o app é da barbearia, não do CorteHub.
 *
 * Puro de propósito — entra texto, sai texto — para a rota do SVG, a do PNG e
 * os testes usarem exatamente a mesma conta.
 */

/** Palavras que não identificam ninguém: todo mundo é "barbearia", e "O" não é inicial. */
const IGNORADAS = new Set([
  "o", "a", "os", "as", "de", "da", "do", "das", "dos", "e", "&",
  "barbearia", "barber", "barbershop", "shop", "salão", "salao", "studio", "estúdio",
]);

/**
 * Até duas iniciais: "Navalha E2E" → "NE", "O Siqueira Barbearia" → "S",
 * "Barbearia do Zé" → "Z". Se tudo for palavra ignorada, usa a primeira letra
 * do nome — nunca devolve vazio.
 */
export function iniciaisDe(nome: string): string {
  const palavras = String(nome ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const uteis = palavras.filter((p) => !IGNORADAS.has(p.toLocaleLowerCase("pt-BR")));
  const base = uteis.length > 0 ? uteis : palavras;
  const letras = base
    .slice(0, 2)
    .map((p) => Array.from(p.replace(/[^\p{L}\p{N}]/gu, ""))[0] ?? "")
    .join("");
  return (letras || "B").toLocaleUpperCase("pt-BR");
}

/** Cor hexadecimal válida, ou o dourado padrão. */
export function corValida(cor: unknown): string {
  return typeof cor === "string" && /^#[0-9a-fA-F]{6}$/.test(cor) ? cor : "#b8863a";
}

/**
 * Tinta que se lê sobre o fundo: escura em cor clara, branca em cor escura.
 * Luminância relativa do WCAG — "Areia" e "Dourado" pedem tinta escura.
 */
export function tintaSobre(fundo: string): string {
  const hex = corValida(fundo).slice(1);
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
  return lum > 0.4 ? "#0f172a" : "#ffffff";
}

function escaparXml(texto: string) {
  return texto.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** O SVG do monograma: círculo na cor de destaque, iniciais no centro. */
export function svgDoMonograma(nome: string, cor: unknown): string {
  const fundo = corValida(cor);
  const iniciais = escaparXml(iniciaisDe(nome));
  const tamanho = iniciais.length > 1 ? 196 : 232;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="${escaparXml(String(nome ?? ""))}">`,
    `<circle cx="256" cy="256" r="256" fill="${fundo}"/>`,
    `<text x="256" y="256" dy="0.35em" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="700" font-size="${tamanho}" fill="${tintaSobre(fundo)}">${iniciais}</text>`,
    `</svg>`,
  ].join("");
}

/** Caminho do monograma servido por `app/marca.svg/route.ts`. */
export const MARCA_GERADA = "/marca.svg";

/** Os ícones do PWA: próprios da barbearia quando existem, senão gerados. */
export function iconesDaMarca(brand: { icones?: string }) {
  if (brand.icones) {
    const b = brand.icones.replace(/\/$/, "");
    return {
      favicon: `${b}/favicon-32.png`,
      apple: `${b}/apple-touch-icon.png`,
      i192: `${b}/icon-192.png`,
      i512: `${b}/icon-512.png`,
      m192: `${b}/maskable-192.png`,
      m512: `${b}/maskable-512.png`,
    };
  }
  return {
    favicon: "/icone/32",
    apple: "/icone/180",
    i192: "/icone/192",
    i512: "/icone/512",
    m192: "/icone/192?m=1",
    m512: "/icone/512?m=1",
  };
}
