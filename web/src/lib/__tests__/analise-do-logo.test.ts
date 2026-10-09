import { describe, expect, it } from "vitest";
import {
  analisar,
  avisosDoLogo,
  caixaDoConteudo,
  caixaDoSimbolo,
  comMargem,
  detectarFundo,
  fracaoApagadaSobre,
  removerFundo,
  type PixelsLike,
} from "@/lib/analise-do-logo";
import { svgDoMonogramaEstilo, ESTILOS_DO_MONOGRAMA } from "@/lib/monograma";

type Rgba = [number, number, number, number];

function imagem(largura: number, altura: number, fundo: Rgba): PixelsLike {
  const data = new Uint8ClampedArray(largura * altura * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fundo, i);
  return { width: largura, height: altura, data };
}

function retangulo(img: PixelsLike, x: number, y: number, w: number, h: number, cor: Rgba) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) img.data.set(cor, (j * img.width + i) * 4);
}

const PRETO: Rgba = [0, 0, 0, 255];
const BRANCO: Rgba = [255, 255, 255, 255];

/** Logo horizontal: símbolo quadrado à esquerda e "nome" em 8 letras à direita, fundo preto. */
function logoHorizontal() {
  const img = imagem(400, 120, PRETO);
  retangulo(img, 20, 40, 40, 40, BRANCO);
  for (let i = 0; i < 8; i++) retangulo(img, 140 + i * 30, 50, 18, 24, BRANCO);
  return img;
}

describe("detectarFundo", () => {
  it("acha a cor dominante das bordas", () => {
    const f = detectarFundo(logoHorizontal());
    expect(f.transparente).toBe(false);
    expect(f.cor).toEqual({ r: 0, g: 0, b: 0 });
    expect(f.solidez).toBe(1);
  });

  it("borda transparente é fundo transparente", () => {
    const img = imagem(50, 50, [0, 0, 0, 0]);
    retangulo(img, 10, 10, 20, 20, BRANCO);
    expect(detectarFundo(img).transparente).toBe(true);
  });

  it("tolera ruído de JPEG perto da cor", () => {
    const img = imagem(60, 60, [250, 250, 250, 255]);
    img.data.set([244, 252, 248, 255], 4 * 5);
    const f = detectarFundo(img);
    expect(f.solidez).toBe(1);
    expect(f.cor.r).toBeGreaterThan(240);
  });
});

describe("caixaDoConteudo", () => {
  it("devolve a caixa do que difere do fundo", () => {
    const img = logoHorizontal();
    expect(caixaDoConteudo(img, detectarFundo(img))).toEqual({ x: 20, y: 40, w: 348, h: 40 });
  });

  it("imagem só de fundo não tem caixa", () => {
    const img = imagem(30, 30, BRANCO);
    expect(caixaDoConteudo(img, detectarFundo(img))).toBeNull();
  });

  it("ignora pixel solto", () => {
    const img = imagem(100, 100, BRANCO);
    retangulo(img, 40, 40, 20, 20, PRETO);
    retangulo(img, 2, 2, 1, 1, PRETO);
    expect(caixaDoConteudo(img, detectarFundo(img))).toEqual({ x: 40, y: 40, w: 20, h: 20 });
  });
});

describe("comMargem", () => {
  it("alarga sem sair da imagem", () => {
    expect(comMargem({ x: 5, y: 5, w: 100, h: 50 }, 0.1, 120, 70)).toEqual({ x: 0, y: 0, w: 115, h: 65 });
  });
});

describe("analisar", () => {
  it("fundo sólido com logo pequeno: pode remover o fundo", () => {
    expect(analisar(logoHorizontal()).podeRemoverFundo).toBe(true);
  });

  it("foto (borda variada) não oferece remover fundo", () => {
    const img = imagem(64, 64, BRANCO);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) img.data.set([x * 4, y * 4, (x + y) * 2, 255], (y * 64 + x) * 4);
    expect(analisar(img).podeRemoverFundo).toBe(false);
  });

  it("logo que já é transparente não oferece remover fundo", () => {
    const img = imagem(50, 50, [0, 0, 0, 0]);
    retangulo(img, 10, 10, 20, 20, BRANCO);
    expect(analisar(img).podeRemoverFundo).toBe(false);
  });
});

describe("removerFundo", () => {
  it("torna o fundo transparente e mantém o conteúdo", () => {
    const img = logoHorizontal();
    const sem = removerFundo(img, detectarFundo(img));
    expect(sem.data[3]).toBe(0);
    const i = (50 * 400 + 30) * 4;
    expect(Array.from(sem.data.slice(i, i + 4))).toEqual([255, 255, 255, 255]);
    /* não mexe na imagem de entrada */
    expect(img.data[3]).toBe(255);
  });

  it("na borda suavizada tira a cor do fundo (sem halo escuro)", () => {
    const img = imagem(10, 10, PRETO);
    retangulo(img, 0, 0, 10, 1, BRANCO); // fica na borda, só para testar a conta
    img.data.set([40, 40, 40, 255], (5 * 10 + 5) * 4); // d≈69 → dentro da faixa 40..60? não: fora
    img.data.set([30, 30, 30, 255], (6 * 10 + 5) * 4); // d≈52 → faixa
    const sem = removerFundo(img, { transparente: false, cor: { r: 0, g: 0, b: 0 }, solidez: 1 });
    const i = (6 * 10 + 5) * 4;
    expect(sem.data[i + 3]).toBeGreaterThan(0);
    expect(sem.data[i + 3]).toBeLessThan(255);
    expect(sem.data[i]).toBeGreaterThan(30);
  });
});

describe("caixaDoSimbolo", () => {
  it("acha o símbolo isolado à esquerda do nome", () => {
    const img = logoHorizontal();
    const fundo = detectarFundo(img);
    const caixa = caixaDoConteudo(img, fundo)!;
    expect(caixaDoSimbolo(img, fundo, caixa)).toEqual({ caixa: { x: 20, y: 40, w: 40, h: 40 }, confiavel: true });
  });

  it("acha o símbolo na ponta direita também", () => {
    const img = imagem(400, 120, PRETO);
    for (let i = 0; i < 8; i++) retangulo(img, 20 + i * 30, 50, 18, 24, BRANCO);
    retangulo(img, 330, 40, 40, 40, BRANCO);
    const fundo = detectarFundo(img);
    const r = caixaDoSimbolo(img, fundo, caixaDoConteudo(img, fundo)!);
    expect(r.confiavel).toBe(true);
    expect(r.caixa).toEqual({ x: 330, y: 40, w: 40, h: 40 });
  });

  it("logo só de texto não é confiável e cai num quadrado da altura", () => {
    const img = imagem(400, 120, PRETO);
    for (let i = 0; i < 8; i++) retangulo(img, 20 + i * 30, 40, 10, 40, BRANCO);
    const fundo = detectarFundo(img);
    const caixa = caixaDoConteudo(img, fundo)!;
    const r = caixaDoSimbolo(img, fundo, caixa);
    expect(r.confiavel).toBe(false);
    expect(r.caixa.w).toBe(caixa.h);
    expect(r.caixa.h).toBe(caixa.h);
  });
});

describe("fracaoApagadaSobre", () => {
  it("logo branco transparente some no fundo claro, não no escuro", () => {
    const img = imagem(40, 40, [0, 0, 0, 0]);
    retangulo(img, 10, 10, 20, 20, BRANCO);
    expect(fracaoApagadaSobre(img, "#ffffff")).toBe(1);
    expect(fracaoApagadaSobre(img, "#0f172a")).toBe(0);
  });

  it("bloco opaco leva o próprio fundo: não avisa", () => {
    expect(fracaoApagadaSobre(logoHorizontal(), "#0f172a")).toBe(0);
  });
});

describe("avisosDoLogo", () => {
  const ok = { largura: 600, altura: 600, apagadoNoClaro: 0, apagadoNoEscuro: 0 };

  it("logo bom não tem aviso", () => {
    expect(avisosDoLogo(ok)).toEqual([]);
  });

  it("horizontal demais oferece aproximar no símbolo", () => {
    const [a] = avisosDoLogo({ ...ok, largura: 1100, altura: 600 });
    expect(a.id).toBe("horizontal");
    expect(a.acao).toBe("simbolo");
    expect(avisosDoLogo({ ...ok, largura: 1080, altura: 600 })).toEqual([]);
  });

  it("lado menor abaixo de 256 px avisa de borrado", () => {
    expect(avisosDoLogo({ ...ok, largura: 300, altura: 255 }).map((a) => a.id)).toEqual(["baixa"]);
    expect(avisosDoLogo({ ...ok, largura: 300, altura: 256 })).toEqual([]);
  });

  it("pouco contraste avisa em qual tema", () => {
    expect(avisosDoLogo({ ...ok, apagadoNoClaro: 0.9 })[0].texto).toContain("claro");
    expect(avisosDoLogo({ ...ok, apagadoNoEscuro: 0.9 })[0].texto).toContain("escuro");
    expect(avisosDoLogo({ ...ok, apagadoNoClaro: 0.9, apagadoNoEscuro: 0.9 })[0].texto).toContain("tanto");
  });
});

describe("monograma em estilos", () => {
  it("os três estilos usam as iniciais e a cor da marca", () => {
    for (const { id } of ESTILOS_DO_MONOGRAMA) {
      const svg = svgDoMonogramaEstilo("Navalha E2E", "#112233", id);
      expect(svg).toContain(">NE</text>");
      expect(svg).toContain("#112233");
    }
  });

  it("só letra não tem fundo", () => {
    const svg = svgDoMonogramaEstilo("Zé", "#112233", "letra");
    expect(svg).not.toContain("<rect");
    expect(svg).not.toContain("<circle");
  });

  it("quadrado arredondado desenha um rect", () => {
    expect(svgDoMonogramaEstilo("Zé", "#112233", "quadrado")).toContain("<rect");
  });
});
