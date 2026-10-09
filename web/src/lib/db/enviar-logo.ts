"use client";

import { getAppStorage } from "@/lib/firebase";
import { conferirEscrita } from "@/lib/db/trava-de-escrita";
import { corDominante } from "@/lib/cor-do-logo";
import {
  caminhoNaMarca,
  FUNDOS_DO_ICONE,
  ICONES_DO_LOGO,
  LADO_DO_LOGO,
  semToken,
  type ArquivoDaMarca,
  type FundoDoIcone,
} from "@/lib/logo-da-marca";
import {
  logoNoIcone,
  retanguloNoQuadrado,
  tamanhoDaFonte,
  type Enquadramento,
  type FonteDoLogo,
} from "@/lib/recorte-do-logo";
import {
  analisar,
  caixaDoSimbolo,
  comMargem,
  fracaoApagadaSobre,
  removerFundo,
  type AnaliseDoLogo,
  type Caixa,
  type PixelsLike,
} from "@/lib/analise-do-logo";
import { svgDoMonogramaEstilo, type EstiloDoMonograma } from "@/lib/monograma";

/**
 * Do arquivo escolhido aos PNG que vão para o Storage — a parte que só existe
 * no navegador (canvas, `Image`, `toBlob`). As contas moram em
 * `lib/recorte-do-logo.ts` e `lib/logo-da-marca.ts`, onde têm teste.
 *
 * TUDO sai PNG, inclusive de SVG: SVG hospedado é documento, pode carregar
 * script, e o Storage o serviria com o tipo que o navegador executa. Desenhar
 * no canvas e exportar PNG tira essa porta, e a regra do Storage só aceita
 * `image/png` na pasta da marca.
 */

/** Lado do canvas usado só para contar cores: 64×64 bastam e custam nada. */
const AMOSTRA = 64;

export function carregarImagem(arquivo: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      /* SVG sem `width`/`height` chega com 0×0 em alguns navegadores. */
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(img.src);
        reject(new Error("Imagem sem tamanho."));
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Imagem ilegível."));
    };
    img.src = URL.createObjectURL(arquivo);
  });
}

/** O logo recortado num quadrado de `lado` px, fundo transparente. */
export function desenharRecorte(imagem: FonteDoLogo, enquadramento: Enquadramento, lado = LADO_DO_LOGO) {
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.imageSmoothingQuality = "high";
  const { largura, altura } = tamanhoDaFonte(imagem);
  const { dx, dy, dw, dh } = retanguloNoQuadrado(largura, altura, lado, enquadramento);
  ctx.drawImage(imagem, dx, dy, dw, dh);
  return canvas;
}

/* ── Ajudas automáticas (contas em `lib/analise-do-logo.ts`) ───────────── */

/** Maior lado do canvas de trabalho: o arquivo final tem 512, e o Safari do iPhone tem pouca memória de canvas. */
const LADO_DE_TRABALHO = 1024;
/** Maior lado da cópia onde rodam as contas de análise (fundo, caixa, símbolo). */
const LADO_DE_ANALISE = 384;
/** Maior lado da cópia usada para medir contraste. */
const LADO_DO_CONTRASTE = 256;

function lerPixels(canvas: HTMLCanvasElement): PixelsLike | null {
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
  } catch {
    /* canvas "sujo" (alguns SVG): sem ler pixel, sem ajuda automática. */
    return null;
  }
}

function canvasDePixels(pixels: PixelsLike): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  return canvas;
}

/** Uma cópia de `origem` com o maior lado em no máximo `lado` px (ou `null` sem canvas). */
function copiaReduzida(origem: HTMLCanvasElement, lado: number): HTMLCanvasElement | null {
  const k = Math.min(1, lado / Math.max(origem.width, origem.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(origem.width * k));
  c.height = Math.max(1, Math.round(origem.height * k));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(origem, 0, 0, c.width, c.height);
  return c;
}

/** Devolve a memória de um canvas que ninguém mais vai usar (Safari não a solta sozinho). */
export function liberarCanvas(c: HTMLCanvasElement) {
  c.width = 0;
  c.height = 0;
}

/** Leva uma caixa medida na cópia reduzida de volta ao canvas de trabalho, sem cortar a borda. */
function ampliarCaixa(c: Caixa, k: number, largura: number, altura: number): Caixa {
  const x = Math.max(0, Math.floor(c.x * k));
  const y = Math.max(0, Math.floor(c.y * k));
  return {
    x,
    y,
    w: Math.min(largura, Math.ceil((c.x + c.w) * k)) - x,
    h: Math.min(altura, Math.ceil((c.y + c.h) * k)) - y,
  };
}

/** A imagem escolhida num canvas de até 1024 px, e o que dá para saber dela. */
export type BaseDoLogo = {
  canvas: HTMLCanvasElement;
  /** Pixels do canvas de trabalho por pixel do arquivo original. */
  escala: number;
  /** SVG: não tem resolução, então o aviso de imagem pequena não vale. */
  vetorial: boolean;
  analise: AnaliseDoLogo | null;
  /** O símbolo isolado (ou o quadrado de reserva) dentro da caixa do conteúdo. */
  simbolo: { caixa: Caixa; confiavel: boolean } | null;
};

/**
 * Desenha a imagem no canvas de trabalho. SVG é rasterizado AUMENTANDO até
 * 1024 px: no tamanho intrínseco (às vezes 120 px) o PNG de 512 sairia borrado.
 * As contas rodam numa cópia de 384 px; as caixas voltam ampliadas.
 */
export function prepararBase(imagem: HTMLImageElement, vetorial: boolean): BaseDoLogo {
  const maior = Math.max(imagem.naturalWidth, imagem.naturalHeight);
  const escala = vetorial ? LADO_DE_TRABALHO / maior : Math.min(1, LADO_DE_TRABALHO / maior);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
  canvas.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);

  const amostra = copiaReduzida(canvas, LADO_DE_ANALISE);
  const pixels = amostra ? lerPixels(amostra) : null;
  let analise: AnaliseDoLogo | null = null;
  let simbolo: BaseDoLogo["simbolo"] = null;
  if (pixels && amostra) {
    const k = canvas.width / amostra.width;
    const a = analisar(pixels);
    analise = { ...a, caixa: a.caixa ? ampliarCaixa(a.caixa, k, canvas.width, canvas.height) : null };
    if (a.caixa) {
      const s = caixaDoSimbolo(pixels, a.fundo, a.caixa);
      simbolo = { ...s, caixa: ampliarCaixa(s.caixa, k, canvas.width, canvas.height) };
    }
  }
  if (amostra) liberarCanvas(amostra);
  return { canvas, escala, vetorial, analise, simbolo };
}

/**
 * A fonte do recorte: a base, com o fundo removido se pedido e aparada na
 * `caixa` (com uma margem pequena para o logo não encostar na borda).
 */
export function montarFonte(
  base: BaseDoLogo,
  opcoes: { caixa: Caixa | null; semFundo: boolean }
): HTMLCanvasElement {
  let origem = base.canvas;
  if (opcoes.semFundo && base.analise?.podeRemoverFundo) {
    const pixels = lerPixels(base.canvas);
    if (pixels) origem = canvasDePixels(removerFundo(pixels, base.analise.fundo));
  }
  if (!opcoes.caixa) return origem;
  const c = comMargem(opcoes.caixa, 0.06, origem.width, origem.height);
  const saida = document.createElement("canvas");
  saida.width = c.w;
  saida.height = c.h;
  const ctx = saida.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.drawImage(origem, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
  if (origem !== base.canvas) liberarCanvas(origem);
  return saida;
}

/** Quanto do conteúdo some sobre o fundo claro e o escuro do app (0 a 1), medido numa cópia de 256 px. */
export function apagamentoDoLogo(fonte: HTMLCanvasElement) {
  const amostra = copiaReduzida(fonte, LADO_DO_CONTRASTE);
  const pixels = amostra ? lerPixels(amostra) : null;
  if (amostra) liberarCanvas(amostra);
  if (!pixels) return { claro: 0, escuro: 0 };
  return {
    claro: fracaoApagadaSobre(pixels, FUNDOS_DO_ICONE.claro),
    escuro: fracaoApagadaSobre(pixels, FUNDOS_DO_ICONE.escuro),
  };
}

/** O monograma desenhado em 512×512 — entra no mesmo caminho do logo enviado. */
export function desenharMonograma(nome: string, cor: string, estilo: EstiloDoMonograma): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = LADO_DO_LOGO;
      canvas.height = LADO_DO_LOGO;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas indisponível."));
      ctx.drawImage(img, 0, 0, LADO_DO_LOGO, LADO_DO_LOGO);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error("Não consegui desenhar o monograma."));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoMonogramaEstilo(nome, cor, estilo))}`;
  });
}

/**
 * Cor sugerida a partir do recorte. Falhar aqui não impede nada: a sugestão
 * é cortesia, e alguns navegadores recusam ler pixels de SVG no canvas.
 */
export function corDoRecorte(recorte: HTMLCanvasElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = AMOSTRA;
    canvas.height = AMOSTRA;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(recorte, 0, 0, AMOSTRA, AMOSTRA);
    return corDominante(ctx.getImageData(0, 0, AMOSTRA, AMOSTRA).data);
  } catch {
    return null;
  }
}

/** Um ícone: fundo (quando tem) e o recorte centrado na escala da tabela. */
function desenharIcone(recorte: HTMLCanvasElement, icone: (typeof ICONES_DO_LOGO)[number], fundo: string) {
  const canvas = document.createElement("canvas");
  canvas.width = icone.lado;
  canvas.height = icone.lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  if (icone.comFundo) {
    ctx.fillStyle = fundo;
    ctx.fillRect(0, 0, icone.lado, icone.lado);
  }
  ctx.imageSmoothingQuality = "high";
  const { x, y, tamanho } = logoNoIcone(icone.lado, icone.escala);
  ctx.drawImage(recorte, x, y, tamanho, tamanho);
  return canvas;
}

function paraPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui gerar a imagem."))), "image/png")
  );
}

/** Os sete PNG de um envio: o logo e os seis ícones. */
export async function gerarArquivosDaMarca(
  recorte: HTMLCanvasElement,
  fundo: FundoDoIcone
): Promise<Array<{ arquivo: ArquivoDaMarca; png: Blob }>> {
  const cor = FUNDOS_DO_ICONE[fundo];
  const arquivos: Array<{ arquivo: ArquivoDaMarca; png: Blob }> = [
    { arquivo: "logo.png", png: await paraPng(recorte) },
  ];
  for (const icone of ICONES_DO_LOGO) {
    arquivos.push({ arquivo: icone.arquivo, png: await paraPng(desenharIcone(recorte, icone, cor)) });
  }
  return arquivos;
}

/**
 * Sobe o envio para `barbershops/{id}/brand/{carimbo}/` e devolve a URL
 * pública do `logo.png`.
 *
 * O logo sobe POR ÚLTIMO: a ficha só aponta para ele depois, e os ícones saem
 * do endereço dele. Se a conexão cair no meio, sobra uma pasta incompleta que
 * ninguém referencia — nunca uma ficha apontando para ícone que não existe.
 *
 * Passa pela trava do modo leitura como toda escrita do painel: enviar um
 * logo que depois não pode ser salvo é gastar o tempo do dono para nada.
 */
export async function enviarMarca(
  barbershopId: string,
  arquivos: Array<{ arquivo: ArquivoDaMarca; png: Blob }>
): Promise<string> {
  conferirEscrita();
  const storage = await getAppStorage();
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  const carimbo = Date.now();
  const metadados = {
    contentType: "image/png",
    /* O carimbo muda a cada envio, então o arquivo nunca é reescrito: pode
     * ficar em cache para sempre. */
    cacheControl: "public, max-age=31536000, immutable",
  };
  const icones = arquivos.filter((a) => a.arquivo !== "logo.png");
  const logo = arquivos.find((a) => a.arquivo === "logo.png");
  if (!logo) throw new Error("Envio sem logo.");

  await Promise.all(
    icones.map((a) => uploadBytes(ref(storage, caminhoNaMarca(barbershopId, carimbo, a.arquivo)), a.png, metadados))
  );
  const destino = ref(storage, caminhoNaMarca(barbershopId, carimbo, "logo.png"));
  await uploadBytes(destino, logo.png, metadados);
  return semToken(await getDownloadURL(destino));
}
