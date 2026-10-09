import { describe, expect, it } from "vitest";
import { ICONES_DO_LOGO } from "@/lib/logo-da-marca";
import {
  ENQUADRAMENTO_INICIAL,
  ZOOM_MINIMO,
  enquadramentoInicial,
  zoomParaCirculo,
  limitarEnquadramento,
  logoNoIcone,
  retanguloNoQuadrado,
  ZOOM_MAXIMO,
} from "@/lib/recorte-do-logo";

describe("recorte quadrado", () => {
  it("com zoom 1 o logo horizontal cabe inteiro, centrado, com vão em cima e embaixo", () => {
    expect(retanguloNoQuadrado(1000, 500, 512, ENQUADRAMENTO_INICIAL)).toEqual({
      dx: 0,
      dy: 128,
      dw: 512,
      dh: 256,
    });
  });

  it("o mesmo enquadramento dá o mesmo recorte na prévia de 240 e no arquivo de 512", () => {
    const e = { zoom: 2, x: 0.2, y: 0 };
    const pequeno = retanguloNoQuadrado(800, 400, 240, e);
    const grande = retanguloNoQuadrado(800, 400, 512, e);
    const k = 512 / 240;
    expect(grande.dx).toBeCloseTo(pequeno.dx * k);
    expect(grande.dw).toBeCloseTo(pequeno.dw * k);
  });

  it("aproximar o logo horizontal deixa arrastar só até a borda — nunca vão de um lado e corte do outro", () => {
    // 2:1 com zoom 2 → 2 lados de largura: sobra meio lado de cada lado.
    expect(limitarEnquadramento(1000, 500, { zoom: 2, x: 5, y: 5 })).toEqual({ zoom: 2, x: 0.5, y: 0 });
    expect(limitarEnquadramento(1000, 500, { zoom: 2, x: -5, y: 0 }).x).toBe(-0.5);
    const r = retanguloNoQuadrado(1000, 500, 100, { zoom: 2, x: 0.5, y: 0 });
    expect(r.dx).toBe(0); // borda esquerda da imagem encostada na do quadrado
  });

  it("no eixo em que a imagem é menor que o quadrado, ela fica centrada", () => {
    expect(limitarEnquadramento(1000, 500, { zoom: 1.5, x: 0, y: 0.3 }).y).toBe(0);
  });

  it("zoom fica entre o mínimo e o máximo; lixo vira o padrão", () => {
    expect(limitarEnquadramento(10, 10, { zoom: 0.2, x: 0, y: 0 }).zoom).toBe(ZOOM_MINIMO);
    expect(limitarEnquadramento(10, 10, { zoom: 99, x: 0, y: 0 }).zoom).toBe(ZOOM_MAXIMO);
    expect(limitarEnquadramento(10, 10, { zoom: NaN, x: NaN, y: 0 })).toEqual({ zoom: 1, x: 0, y: 0 });
  });

  it("imagem sem tamanho não vira NaN", () => {
    expect(retanguloNoQuadrado(0, 0, 512, ENQUADRAMENTO_INICIAL)).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0 });
  });
});

describe("recorte em círculo", () => {
  it("quadrado inteiro só cabe no círculo a 1/√2 do tamanho", () => {
    expect(zoomParaCirculo(100, 100)).toBeCloseTo(Math.SQRT1_2);
  });

  it("depois do zoom a diagonal da caixa cabe no diâmetro", () => {
    for (const [l, a] of [[100, 100], [300, 200], [200, 300], [500, 100]]) {
      const z = zoomParaCirculo(l, a);
      const escala = z / Math.max(l, a); // fração do lado por pixel
      expect(Math.hypot(l * escala, a * escala)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("nunca amplia nem passa do zoom mínimo; imagem sem tamanho não vira NaN", () => {
    expect(zoomParaCirculo(1000, 1)).toBeLessThanOrEqual(1);
    expect(zoomParaCirculo(1000, 1)).toBeGreaterThanOrEqual(ZOOM_MINIMO);
    expect(zoomParaCirculo(0, 0)).toBe(1);
  });

  it("logo redondo (nada fora do círculo) abre sem encolher; cantos cheios encolhem e centram", () => {
    expect(enquadramentoInicial(300, 300, 0)).toEqual(ENQUADRAMENTO_INICIAL);
    expect(enquadramentoInicial(300, 300, 0.01)).toEqual(ENQUADRAMENTO_INICIAL);
    const e = enquadramentoInicial(300, 300, 0.3);
    expect(e.zoom).toBeCloseTo(Math.SQRT1_2);
    expect(e).toMatchObject({ x: 0, y: 0 });
  });

  it("encolhido, o recorte fica centrado no quadrado", () => {
    expect(retanguloNoQuadrado(100, 100, 512, { zoom: 0.5, x: 0.3, y: 0.3 })).toEqual({
      dx: 128,
      dy: 128,
      dw: 256,
      dh: 256,
    });
  });
});

describe("ícone maskable", () => {
  it("o logo quadrado cabe inteiro no círculo central de 80% (zona segura)", () => {
    const maskables = ICONES_DO_LOGO.filter((i) => i.arquivo.startsWith("maskable"));
    expect(maskables.length).toBe(2);
    for (const i of maskables) {
      const { tamanho } = logoNoIcone(i.lado, i.escala);
      const meiaDiagonal = (tamanho * Math.SQRT2) / 2;
      expect(meiaDiagonal).toBeLessThanOrEqual((i.lado * 0.8) / 2 + 1);
    }
  });
});

describe("logo dentro do ícone", () => {
  it("centrado e em pixel inteiro", () => {
    expect(logoNoIcone(180, 0.76)).toEqual({ x: 22, y: 22, tamanho: 137 });
    expect(logoNoIcone(32, 1)).toEqual({ x: 0, y: 0, tamanho: 32 });
  });
});
