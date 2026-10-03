import { describe, expect, it } from "vitest";
import { corDominante, pixelUtil } from "@/lib/cor-do-logo";
import { contraste, hexParaRgb, tonsDaMarca } from "@/lib/tons-da-marca";

/**
 * A cor sugerida a partir do logo — com pixels sintéticos, no formato de
 * `ImageData.data` (RGBA em sequência), sem canvas nem imagem de verdade.
 */

type Pixel = [number, number, number, number?];

/** `n` cópias de cada pixel, achatadas em RGBA. */
function imagem(...partes: [Pixel, number][]): Uint8ClampedArray {
  const dados: number[] = [];
  for (const [[r, g, b, a = 255], n] of partes) {
    for (let i = 0; i < n; i++) dados.push(r, g, b, a);
  }
  return new Uint8ClampedArray(dados);
}

const BRANCO: Pixel = [255, 255, 255];
const PRETO: Pixel = [0, 0, 0];
const ROSA: Pixel = [196, 134, 127]; // #c4867f
const AZUL: Pixel = [29, 78, 216]; // #1d4ed8

describe("o que conta como cor de marca", () => {
  it("branco, quase branco, preto, quase preto e cinza não contam", () => {
    expect(pixelUtil(255, 255, 255)).toBe(false);
    expect(pixelUtil(250, 246, 244)).toBe(false); // o creme da página
    expect(pixelUtil(0, 0, 0)).toBe(false);
    expect(pixelUtil(20, 16, 18)).toBe(false);
    expect(pixelUtil(128, 128, 128)).toBe(false);
  });

  it("um rosa bem clarinho ainda conta — também é cor de marca", () => {
    expect(pixelUtil(243, 198, 207)).toBe(true); // #f3c6cf
  });
});

describe("corDominante", () => {
  it("um logo rosa sobre fundo branco sugere o rosa, não o branco", () => {
    expect(corDominante(imagem([BRANCO, 900], [ROSA, 100]))).toBe("#c4867f");
  });

  it("ignora o contorno preto, mesmo quando ele é a maior parte do desenho", () => {
    expect(corDominante(imagem([PRETO, 700], [AZUL, 300]))).toBe("#1d4ed8");
  });

  it("ignora o fundo transparente, qualquer que seja a cor gravada nele", () => {
    // PNG transparente costuma guardar RGB arbitrário sob alfa 0.
    expect(corDominante(imagem([[0, 255, 0, 0], 5000], [ROSA, 50]))).toBe("#c4867f");
  });

  it("entre duas cores, vence a mais presente", () => {
    expect(corDominante(imagem([ROSA, 300], [AZUL, 200]))).toBe("#c4867f");
    expect(corDominante(imagem([ROSA, 200], [AZUL, 300]))).toBe("#1d4ed8");
  });

  it("tons vizinhos do mesmo rosa somam juntos e a resposta é a média deles", () => {
    // Antisserrilhado real: o mesmo rosa com variação de 1–2 por canal.
    const cor = corDominante(imagem([[196, 134, 127], 50], [[198, 136, 129], 50], [AZUL, 60]));
    expect(cor).toBe("#c58780");
  });

  it("logo só preto e branco não inventa cor — devolve null", () => {
    expect(corDominante(imagem([BRANCO, 500], [PRETO, 500]))).toBeNull();
  });

  it("imagem vazia ou toda transparente devolve null", () => {
    expect(corDominante(new Uint8ClampedArray())).toBeNull();
    expect(corDominante(imagem([[200, 50, 50, 0], 100]))).toBeNull();
  });

  it("meia dúzia de pixels coloridos na borda de um logo preto é ruído, não marca", () => {
    expect(corDominante(imagem([PRETO, 2000], [AZUL, 6]))).toBeNull();
  });

  it("aceita um array comum, não só Uint8ClampedArray", () => {
    expect(corDominante([...imagem([ROSA, 10])])).toBe("#c4867f");
  });
});

describe("a sugestão passa pela mesma régua de contraste", () => {
  const INK = hexParaRgb("#0f172a")!;

  /* A sugestão é a cor CRUA do logo; quem a torna legível é `tonsDaMarca`.
   * Um logo azul-marinho tem que virar botão legível sem que esta função
   * precise saber de contraste. */
  it.each([
    ["azul-marinho", [20, 40, 110] as Pixel],
    ["vinho", [110, 20, 40] as Pixel],
    ["verde-escuro", [15, 80, 45] as Pixel],
  ])("logo %s: o botão derivado passa em 4,5:1 com o texto", (_, pixel) => {
    const sugerida = corDominante(imagem([BRANCO, 500], [pixel, 500]));
    expect(sugerida).not.toBeNull();
    const botao = tonsDaMarca(sugerida!)["--color-gold"];
    expect(contraste(hexParaRgb(botao)!, INK)).toBeGreaterThanOrEqual(4.5);
  });
});
