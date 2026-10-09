/**
 * O logo que o dono sobe — as regras que não dependem de navegador.
 *
 * ## Onde os arquivos moram
 *
 * Cada envio vira uma pasta com carimbo de tempo no Storage:
 *
 *     barbershops/{id}/brand/{carimbo}/logo.png        ← o logo, recortado e transparente
 *                                      icon-512.png …  ← os ícones do PWA, gerados no navegador
 *
 * e o endereço do `logo.png` vai para `brand.logo` na ficha. Os ícones NÃO
 * ganham campo próprio: saem do endereço do logo trocando o nome do arquivo
 * (`iconesDoLogo`). Um campo só para o dono gravar é um campo só para a regra
 * do Firestore conferir — e logo e ícones nunca ficam de envios diferentes.
 *
 * O carimbo muda a cada troca, então o endereço muda junto e nenhum cache
 * (navegador, ícone instalado, CDN do Storage) mostra o logo antigo.
 *
 * ## Por que validar o endereço
 *
 * A ficha é escrita pelo dono direto do navegador, então `brand.logo` é, no
 * fim das contas, **texto que o dono controla** — e ele vai para o `<link
 * rel="icon">`, o manifest e o topo do app do cliente. A pergunta "este
 * endereço é o logo DESTA barbearia no nosso Storage?" mora aqui, uma vez: a
 * leitura da ficha (`tenant-shape.ts`) a faz, e a regra do Firestore faz a
 * mesma com expressão regular.
 *
 * Puro de propósito: entra texto e número, sai texto e número.
 */

import { EscritaBloqueada } from "@/lib/db/trava-de-escrita";

/** Os formatos que a tela aceita. HEIC e GIF ficam de fora: o primeiro nem
 *  todo navegador abre num canvas, o segundo é animação, não marca. O SVG
 *  entra, mas não sobe como SVG — vira PNG no recorte (ver `enviar-logo.ts`). */
export const FORMATOS_DE_LOGO = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"] as const;

/** O arquivo que o dono ESCOLHE. Logo não é foto: 2 MB sobram. */
export const TAMANHO_MAXIMO_DO_LOGO = 2 * 1024 * 1024;

/** Lado do `logo.png` que sobe. O maior uso é o ícone de 512 px; o topo do app
 *  mostra o logo a 32–56 px, então 512 já cobre tela de alta densidade. */
export const LADO_DO_LOGO = 512;

/**
 * Os ícones gerados a partir do logo — nome do arquivo, lado e quanto do
 * quadrado o logo ocupa.
 *
 * - `icon-*`: ícone comum, fundo cheio e logo a 72%.
 * - `maskable-*`: o Android recorta o ícone em círculo, gota ou quadrado; só
 *   o círculo central de 80% sobrevive a todos. Um logo quadrado cabe inteiro
 *   nele a 56% (0,8 ÷ √2).
 * - `apple-touch-icon`: o iOS pinta transparência de PRETO, então tem fundo.
 * - `favicon-32`: a aba do navegador, sem fundo e com o logo inteiro.
 *
 * Os nomes são os mesmos da pasta de ícones próprios (`brand.icones`) que
 * `iconesDaMarca` já conhecia.
 */
export const ICONES_DO_LOGO = [
  { arquivo: "icon-512.png", lado: 512, escala: 0.72, comFundo: true },
  { arquivo: "icon-192.png", lado: 192, escala: 0.72, comFundo: true },
  { arquivo: "maskable-512.png", lado: 512, escala: 0.56, comFundo: true },
  { arquivo: "maskable-192.png", lado: 192, escala: 0.56, comFundo: true },
  { arquivo: "apple-touch-icon.png", lado: 180, escala: 0.76, comFundo: true },
  { arquivo: "favicon-32.png", lado: 32, escala: 1, comFundo: false },
] as const;

export type ArquivoDaMarca = "logo.png" | (typeof ICONES_DO_LOGO)[number]["arquivo"];

/** Os arquivos que a regra do Storage aceita dentro de uma pasta de envio. */
export const ARQUIVOS_DA_MARCA: readonly ArquivoDaMarca[] = [
  "logo.png",
  ...ICONES_DO_LOGO.map((i) => i.arquivo),
];

/** Fundo dos ícones: o logo transparente precisa de algo atrás na tela inicial. */
export const FUNDOS_DO_ICONE = {
  claro: "#ffffff",
  escuro: "#0f172a",
} as const;
export type FundoDoIcone = keyof typeof FUNDOS_DO_ICONE;

/**
 * O arquivo escolhido serve? Devolve a frase que o dono lê, ou `null`.
 *
 * A checagem de verdade é a regra do Storage (que só aceita o PNG já
 * recortado); esta existe para o dono saber ANTES, e em palavras dele.
 */
export function problemaNoArquivo(arquivo: { type: string; size: number }): string | null {
  if (!(FORMATOS_DE_LOGO as readonly string[]).includes(arquivo.type)) {
    return "Esse formato não funciona aqui. Use uma imagem PNG, JPG, WEBP ou SVG.";
  }
  if (arquivo.size === 0) {
    return "Esse arquivo parece vazio. Tente escolher o logo de novo.";
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_LOGO) {
    return "Essa imagem passa de 2 MB. Tente uma versão menor do logo.";
  }
  return null;
}

/** A pasta da marca no Storage — a mesma que o `storage.rules` libera. */
export function pastaDaMarca(barbershopId: string) {
  return `barbershops/${barbershopId}/brand/`;
}

/** Caminho de um arquivo de um envio: `barbershops/{id}/brand/{carimbo}/{arquivo}`. */
export function caminhoNaMarca(barbershopId: string, carimbo: number, arquivo: ArquivoDaMarca) {
  return `${pastaDaMarca(barbershopId)}${Math.trunc(carimbo)}/${arquivo}`;
}

type Objeto = { bucket: string; caminho: string };

/**
 * URL de download do Firebase Storage → bucket e caminho do objeto.
 *
 * Formato: `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<caminho
 * codificado>?alt=media`. No emulador o host é `127.0.0.1:9199` (ou
 * `localhost:9199`) em http — aceito só quando `emulador` é verdadeiro, que
 * em produção nunca é.
 */
export function objetoDoStorage(url: unknown, emulador = false): Objeto | null {
  if (typeof url !== "string") return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const oficial = u.protocol === "https:" && u.host === "firebasestorage.googleapis.com";
  const local =
    emulador && u.protocol === "http:" && (u.host === "127.0.0.1:9199" || u.host === "localhost:9199");
  if (!oficial && !local) return null;

  const m = /^\/v0\/b\/([^/]+)\/o\/([^/]+)$/.exec(u.pathname);
  if (!m) return null;
  try {
    return { bucket: decodeURIComponent(m[1]), caminho: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/** `{carimbo}/logo.png` — o único nome de logo que esta tela grava. */
const LOGO_DE_UM_ENVIO = /^\d{10,16}\/logo\.png$/;

/**
 * O endereço é o `logo.png` de um envio DESTA barbearia no Storage?
 *
 * Exige o formato exato que a tela grava — pasta com carimbo numérico e o
 * nome `logo.png`. Qualquer outra coisa (outra barbearia, `..`, outro nome)
 * não é logo enviado por esta tela, e é lida como "sem logo".
 */
export function ehLogoDaBarbearia(url: unknown, barbershopId: string, emulador = false): boolean {
  const objeto = objetoDoStorage(url, emulador);
  if (!objeto || !barbershopId) return false;
  const pasta = pastaDaMarca(barbershopId);
  if (!objeto.caminho.startsWith(pasta)) return false;
  return LOGO_DE_UM_ENVIO.test(objeto.caminho.slice(pasta.length));
}

/**
 * URL pública, sem o `token` que o `getDownloadURL` acrescenta. A pasta de
 * marca é de leitura pública pela regra, então o token não protege nada — e
 * sem ele a URL gravada é previsível, que é o que a regra do Firestore confere.
 */
export function semToken(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("token");
  return u.toString();
}

/**
 * Os ícones de um logo enviado, pelo endereço dele. `null` se o endereço não
 * for de um envio desta tela (aí os ícones são os de sempre).
 *
 * Não confere A QUAL barbearia o logo pertence: quem chama recebe `brand` já
 * passado por `toTenant`, que descartou logo de outra.
 */
export function iconesDoLogo(logo: string) {
  const objeto = objetoDoStorage(logo, true);
  if (!objeto) return null;
  const pasta = objeto.caminho.replace(/[^/]*\/[^/]*$/, "");
  if (!LOGO_DE_UM_ENVIO.test(objeto.caminho.slice(pasta.length))) return null;
  const origem = new URL(logo).origin;
  const irmao = (arquivo: ArquivoDaMarca) =>
    `${origem}/v0/b/${encodeURIComponent(objeto.bucket)}/o/${encodeURIComponent(
      objeto.caminho.replace(/logo\.png$/, arquivo)
    )}?alt=media`;
  return {
    favicon: irmao("favicon-32.png"),
    apple: irmao("apple-touch-icon.png"),
    i192: irmao("icon-192.png"),
    i512: irmao("icon-512.png"),
    m192: irmao("maskable-192.png"),
    m512: irmao("maskable-512.png"),
  };
}

/** O app está falando com o emulador? Inlined no build, igual nos dois lados. */
export const USANDO_EMULADOR = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

/**
 * O formato do logo, pelo nome do arquivo — para o `<link rel="icon">` não
 * dizer `image/svg+xml` sobre um PNG. `null` quando não dá para saber.
 */
export function formatoDoLogo(src: string): "image/svg+xml" | "image/png" | "image/jpeg" | "image/webp" | null {
  const objeto = objetoDoStorage(src, true);
  const caminho = (objeto ? objeto.caminho : src.split(/[?#]/)[0]).toLowerCase();
  if (caminho.endsWith(".svg")) return "image/svg+xml";
  if (caminho.endsWith(".png")) return "image/png";
  if (caminho.endsWith(".jpg") || caminho.endsWith(".jpeg")) return "image/jpeg";
  if (caminho.endsWith(".webp")) return "image/webp";
  return null;
}

/**
 * O `next/image` deve servir este logo como está, sem o otimizador?
 *
 * Logo do Storage vai direto. Na mesma base de código (Ciliare, 29/09), o
 * otimizador do Next atrás do adaptador do Firebase devolveu 400 "url
 * parameter is not allowed" para um logo do Storage com o `remotePatterns`
 * certo. O arquivo já sobe com 512 px, o CSP libera o Storage, e servir
 * direto poupa uma invocação da função de SSR por imagem. SVG também vai
 * direto: o otimizador recusa SVG.
 */
export function logoSemOtimizar(src: string): boolean {
  if (formatoDoLogo(src) === "image/svg+xml") return true;
  return objetoDoStorage(src, true) !== null;
}

/**
 * A frase que o dono lê quando salvar a marca não deu certo — nunca o código
 * do SDK. O Storage fala em `storage/unauthorized` e
 * `storage/retry-limit-exceeded`; o Firestore, em `permission-denied` e
 * `unavailable`. E sempre diz que nada mudou, porque é verdade: a ficha só é
 * gravada depois que os arquivos subiram.
 */
export function mensagemDeFalhaNaMarca(e: unknown): string {
  if (e instanceof EscritaBloqueada) return e.message;
  const codigo = (e as { code?: unknown } | null)?.code;
  const bruta = `${typeof codigo === "string" ? codigo : ""} ${e instanceof Error ? e.message : ""}`;
  if (/unauthorized|permission|unauthenticated/i.test(bruta)) {
    return "Não consegui salvar: sua conta não tem permissão para mudar a marca desta barbearia.";
  }
  if (/network|offline|unavailable|retry-limit|deadline/i.test(bruta)) {
    return "Parece que a conexão caiu. Nada foi alterado — tente de novo em instantes.";
  }
  return "Não consegui salvar agora. Nada foi alterado — tente de novo em instantes.";
}
