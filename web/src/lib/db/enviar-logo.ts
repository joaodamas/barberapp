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
import { logoNoIcone, retanguloNoQuadrado, type Enquadramento } from "@/lib/recorte-do-logo";

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
export function desenharRecorte(imagem: HTMLImageElement, enquadramento: Enquadramento, lado = LADO_DO_LOGO) {
  const canvas = document.createElement("canvas");
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");
  ctx.imageSmoothingQuality = "high";
  const { dx, dy, dw, dh } = retanguloNoQuadrado(imagem.naturalWidth, imagem.naturalHeight, lado, enquadramento);
  ctx.drawImage(imagem, dx, dy, dw, dh);
  return canvas;
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
