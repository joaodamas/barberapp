/**
 * Olhar para o logo antes de subir — as contas, sem navegador.
 *
 * Um logo horizontal com fundo sólido (símbolo pequeno + nome escrito) virava,
 * no quadrado do ícone, uma tarja preta fina e ilegível. Aqui moram as
 * ajudas que evitam isso, sem IA: achar a cor de fundo pelas bordas, a caixa
 * do que não é fundo, o bloco "símbolo", e a conta dos avisos.
 *
 * Tudo recebe `PixelsLike` (o mesmo formato do `ImageData`), então testa sem
 * canvas. A leitura dos pixels e o desenho moram em `db/enviar-logo.ts`.
 */

export type PixelsLike = { width: number; height: number; data: Uint8ClampedArray };
export type Cor = { r: number; g: number; b: number };
export type Caixa = { x: number; y: number; w: number; h: number };

/** Distância em RGB (0 a 441) até a qual um pixel ainda é "a cor do fundo". */
export const TOLERANCIA_DO_FUNDO = 40;
/** Alpha abaixo disto conta como vazio. */
const ALPHA_VAZIO = 32;

/** Proporção (largura ÷ altura) acima da qual o logo é "horizontal" demais para o ícone. */
export const PROPORCAO_HORIZONTAL = 1.8;
/** Lado menor do conteúdo, em px, abaixo do qual o ícone sai borrado. */
export const LADO_MINIMO_DO_CONTEUDO = 256;
/** Contraste WCAG abaixo do qual o conteúdo "some" no fundo. */
export const CONTRASTE_APAGADO = 1.6;

export type FundoDetectado = {
  /** Bordas já transparentes: não há o que remover. */
  transparente: boolean;
  cor: Cor;
  /** Fração dos pixels da borda que batem com `cor` (0 a 1). */
  solidez: number;
};

function distancia(data: Uint8ClampedArray, i: number, c: Cor) {
  const dr = data[i] - c.r;
  const dg = data[i + 1] - c.g;
  const db = data[i + 2] - c.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Índice (em `data`) dos pixels do perímetro. */
function indicesDaBorda({ width, height }: PixelsLike): number[] {
  const idx: number[] = [];
  for (let x = 0; x < width; x++) {
    idx.push(x * 4, ((height - 1) * width + x) * 4);
  }
  for (let y = 1; y < height - 1; y++) {
    idx.push(y * width * 4, (y * width + width - 1) * 4);
  }
  return idx;
}

/** A cor de fundo: a mais frequente nas bordas (agrupada em faixas de 16 níveis). */
export function detectarFundo(img: PixelsLike, tolerancia = TOLERANCIA_DO_FUNDO): FundoDetectado {
  const { data } = img;
  const borda = indicesDaBorda(img);
  const vazia = { r: 0, g: 0, b: 0 };
  if (borda.length === 0) return { transparente: true, cor: vazia, solidez: 0 };

  const opacos = borda.filter((i) => data[i + 3] >= ALPHA_VAZIO);
  if (opacos.length < borda.length / 2) {
    return { transparente: true, cor: vazia, solidez: 1 - opacos.length / borda.length };
  }
  const grupos = new Map<number, number[]>();
  for (const i of opacos) {
    const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const g = grupos.get(k);
    if (g) g.push(i);
    else grupos.set(k, [i]);
  }
  let melhor: number[] = [];
  for (const g of grupos.values()) if (g.length > melhor.length) melhor = g;
  const soma = melhor.reduce(
    (s, i) => ({ r: s.r + data[i], g: s.g + data[i + 1], b: s.b + data[i + 2] }),
    { r: 0, g: 0, b: 0 }
  );
  const n = melhor.length;
  const cor = { r: Math.round(soma.r / n), g: Math.round(soma.g / n), b: Math.round(soma.b / n) };
  const batem = borda.filter((i) => data[i + 3] >= ALPHA_VAZIO && distancia(data, i, cor) <= tolerancia).length;
  return { transparente: false, cor, solidez: batem / borda.length };
}

/** O pixel faz parte do logo (não é vazio nem a cor do fundo)? */
function ehConteudo(data: Uint8ClampedArray, i: number, fundo: FundoDetectado, tolerancia: number) {
  if (data[i + 3] < ALPHA_VAZIO) return false;
  return fundo.transparente || distancia(data, i, fundo.cor) > tolerancia;
}

/** Contagem de pixels de conteúdo por coluna e por linha, e o total. */
function perfil(img: PixelsLike, fundo: FundoDetectado, tolerancia: number) {
  const { width, height, data } = img;
  const colunas = new Array<number>(width).fill(0);
  const linhas = new Array<number>(height).fill(0);
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (ehConteudo(data, (y * width + x) * 4, fundo, tolerancia)) {
        colunas[x]++;
        linhas[y]++;
        total++;
      }
    }
  }
  return { colunas, linhas, total };
}

function caixaDoPerfil(colunas: number[], linhas: number[]): Caixa | null {
  /* Exige 2 pixels por coluna/linha: uma poeira de JPEG não estica a caixa. */
  const x0 = colunas.findIndex((c) => c >= 2);
  const y0 = linhas.findIndex((c) => c >= 2);
  if (x0 < 0 || y0 < 0) return null;
  let x1 = colunas.length - 1;
  while (colunas[x1] < 2) x1--;
  let y1 = linhas.length - 1;
  while (linhas[y1] < 2) y1--;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** A caixa do que difere do fundo, ou `null` se a imagem é só fundo. */
export function caixaDoConteudo(img: PixelsLike, fundo: FundoDetectado, tolerancia = TOLERANCIA_DO_FUNDO) {
  const { colunas, linhas } = perfil(img, fundo, tolerancia);
  return caixaDoPerfil(colunas, linhas);
}

/**
 * Há sobra que valha aparar? Só quando alguma borda de fundo passa de
 * `minimo` (10%) do lado correspondente — senão aparar só mexe, sem ganho, no
 * enquadramento de quem já subiu um logo justo.
 */
export function temSobraRelevante(caixa: Caixa, largura: number, altura: number, minimo = 0.1) {
  return (
    caixa.x / largura > minimo ||
    (largura - caixa.x - caixa.w) / largura > minimo ||
    caixa.y / altura > minimo ||
    (altura - caixa.y - caixa.h) / altura > minimo
  );
}

/** Alarga a caixa em `fracao` do maior lado, sem sair da imagem. */
export function comMargem(caixa: Caixa, fracao: number, largura: number, altura: number): Caixa {
  const m = Math.round(Math.max(caixa.w, caixa.h) * fracao);
  const x = Math.max(0, caixa.x - m);
  const y = Math.max(0, caixa.y - m);
  return {
    x,
    y,
    w: Math.min(largura, caixa.x + caixa.w + m) - x,
    h: Math.min(altura, caixa.y + caixa.h + m) - y,
  };
}

/**
 * Torna o fundo transparente. Perto da cor (até a tolerância) some; na faixa
 * até 1,5× a tolerância o alpha sobe aos poucos e a cor do fundo é tirada do
 * pixel — sem isso a borda suavizada de um logo branco sobre preto fica com
 * um halo escuro.
 */
export function removerFundo(img: PixelsLike, fundo: FundoDetectado, tolerancia = TOLERANCIA_DO_FUNDO): PixelsLike {
  const data = new Uint8ClampedArray(img.data);
  if (fundo.transparente) return { width: img.width, height: img.height, data };
  const faixa = tolerancia * 0.5;
  for (let i = 0; i < data.length; i += 4) {
    const d = distancia(data, i, fundo.cor);
    if (d <= tolerancia) {
      data[i + 3] = 0;
    } else if (d < tolerancia + faixa) {
      const t = (d - tolerancia) / faixa;
      data[i] = (data[i] - (1 - t) * fundo.cor.r) / t;
      data[i + 1] = (data[i + 1] - (1 - t) * fundo.cor.g) / t;
      data[i + 2] = (data[i + 2] - (1 - t) * fundo.cor.b) / t;
      data[i + 3] = Math.round(data[i + 3] * t);
    }
  }
  return { width: img.width, height: img.height, data };
}

type Trecho = { de: number; ate: number };

/** Trechos contíguos de colunas com conteúdo; vãos de até `folga` colunas não separam. */
function trechos(colunas: number[], de: number, ate: number, folga: number): Trecho[] {
  const out: Trecho[] = [];
  let atual: Trecho | null = null;
  for (let x = de; x <= ate; x++) {
    if (colunas[x] === 0) continue;
    if (atual && x - atual.ate - 1 <= folga) atual.ate = x;
    else {
      atual = { de: x, ate: x };
      out.push(atual);
    }
  }
  return out;
}

function mediana(v: number[]) {
  if (v.length === 0) return 0;
  const o = [...v].sort((a, b) => a - b);
  return o[Math.floor(o.length / 2)];
}

/**
 * O bloco "símbolo" de um logo horizontal: o trecho isolado numa ponta, mais
 * ou menos quadrado, separado do resto por um vão bem maior que os vãos entre
 * as letras. Só devolve quando tem certeza razoável (`confiavel: true`).
 *
 * Quando não tem — logo só de texto, símbolo colado no nome — devolve um
 * quadrado centrado do tamanho da altura do conteúdo, que ao menos preenche a
 * altura, e `confiavel: false` para a tela dizer isso.
 */
export function caixaDoSimbolo(
  img: PixelsLike,
  fundo: FundoDetectado,
  caixa: Caixa,
  tolerancia = TOLERANCIA_DO_FUNDO
): { caixa: Caixa; confiavel: boolean } {
  const { width, data } = img;
  const colunas = new Array<number>(width).fill(0);
  for (let y = caixa.y; y < caixa.y + caixa.h; y++) {
    for (let x = caixa.x; x < caixa.x + caixa.w; x++) {
      if (ehConteudo(data, (y * width + x) * 4, fundo, tolerancia)) colunas[x]++;
    }
  }
  const folga = Math.max(1, Math.round(caixa.h * 0.03));
  const ts = trechos(colunas, caixa.x, caixa.x + caixa.w - 1, folga);

  if (ts.length >= 2) {
    const vaos = ts.slice(1).map((t, i) => t.de - ts[i].ate - 1);
    for (const ponta of ["esquerda", "direita"] as const) {
      const bloco = ponta === "esquerda" ? ts[0] : ts[ts.length - 1];
      const resto = ponta === "esquerda" ? ts.slice(1) : ts.slice(0, -1);
      const vao = ponta === "esquerda" ? vaos[0] : vaos[vaos.length - 1];
      const outrosVaos = ponta === "esquerda" ? vaos.slice(1) : vaos.slice(0, -1);
      /* Altura do bloco: linhas com conteúdo dentro das colunas dele. */
      let y0 = -1;
      let y1 = -1;
      for (let y = caixa.y; y < caixa.y + caixa.h; y++) {
        for (let x = bloco.de; x <= bloco.ate; x++) {
          if (ehConteudo(data, (y * width + x) * 4, fundo, tolerancia)) {
            if (y0 < 0) y0 = y;
            y1 = y;
            break;
          }
        }
      }
      if (y0 < 0) continue;
      const w = bloco.ate - bloco.de + 1;
      const h = y1 - y0 + 1;
      const proporcao = w / h;
      const larguraDoResto = resto[resto.length - 1].ate - resto[0].de + 1;
      const confiavel =
        proporcao >= 0.6 &&
        proporcao <= 1.6 &&
        vao >= h * 0.15 &&
        vao >= mediana(outrosVaos) * 1.5 &&
        larguraDoResto >= w * 1.2;
      if (confiavel) return { caixa: { x: bloco.de, y: y0, w, h }, confiavel: true };
    }
  }

  const lado = Math.min(caixa.h, caixa.w);
  return {
    caixa: { x: caixa.x + Math.round((caixa.w - lado) / 2), y: caixa.y, w: lado, h: lado },
    confiavel: false,
  };
}

export type AnaliseDoLogo = {
  fundo: FundoDetectado;
  /** Caixa do conteúdo, ou `null` se só há fundo. */
  caixa: Caixa | null;
  /** Fração da imagem que é conteúdo (0 a 1). */
  ocupacao: number;
  /** Fundo sólido e logo que contrasta com ele: dá para oferecer "Remover fundo". */
  podeRemoverFundo: boolean;
};

export function analisar(img: PixelsLike, tolerancia = TOLERANCIA_DO_FUNDO): AnaliseDoLogo {
  const fundo = detectarFundo(img, tolerancia);
  const { colunas, linhas, total } = perfil(img, fundo, tolerancia);
  const caixa = caixaDoPerfil(colunas, linhas);
  const ocupacao = total / Math.max(1, img.width * img.height);
  return {
    fundo,
    caixa,
    ocupacao,
    /* Fundo de uma cor só (borda ≥ 90% igual) e conteúdo que não é quase a
     * imagem toda: uma foto, ou um fundo degradê, não passa. */
    podeRemoverFundo: !fundo.transparente && fundo.solidez >= 0.9 && caixa !== null && ocupacao > 0 && ocupacao <= 0.6,
  };
}

/** Luminância relativa do WCAG. */
export function luminancia(r: number, g: number, b: number) {
  const canal = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contrasteEntre(l1: number, l2: number) {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

function rgbDoHex(hex: string): Cor {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

/**
 * Que fração do conteúdo opaco "some" sobre o fundo `hex` (contraste abaixo de
 * `CONTRASTE_APAGADO`)? Só vale para logo com transparência — um logo que é
 * um bloco opaco leva o próprio fundo e não depende do fundo do app: devolve 0.
 */
export function fracaoApagadaSobre(img: PixelsLike, hex: string): number {
  const { data } = img;
  const f = rgbDoHex(hex);
  const lf = luminancia(f.r, f.g, f.b);
  let opacos = 0;
  let apagados = 0;
  const pixels = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opacos++;
    if (contrasteEntre(luminancia(data[i], data[i + 1], data[i + 2]), lf) < CONTRASTE_APAGADO) apagados++;
  }
  if (opacos === 0 || (pixels - opacos) / pixels < 0.2) return 0;
  return apagados / opacos;
}

export type AvisoDoLogo = {
  id: "horizontal" | "baixa" | "contraste";
  texto: string;
  /** Botão que a tela oferece junto do aviso. */
  acao?: "simbolo" | "monograma";
};

/**
 * Os avisos antes de salvar. Não bloqueiam: orientam. `largura`/`altura` são
 * as do conteúdo (já sem as sobras); as frações vêm de `fracaoApagadaSobre`.
 */
export function avisosDoLogo(e: {
  largura: number;
  altura: number;
  apagadoNoClaro: number;
  apagadoNoEscuro: number;
  /** SVG não tem resolução: nunca "borrado". */
  vetorial?: boolean;
}): AvisoDoLogo[] {
  const avisos: AvisoDoLogo[] = [];
  if (e.altura > 0 && e.largura / e.altura > PROPORCAO_HORIZONTAL) {
    avisos.push({
      id: "horizontal",
      texto:
        "Seu logo é horizontal. No ícone ele fica pequeno e o nome não se lê. Aproxime no símbolo, ou use o monograma.",
      acao: "simbolo",
    });
  }
  if (!e.vetorial && Math.min(e.largura, e.altura) < LADO_MINIMO_DO_CONTEUDO) {
    avisos.push({
      id: "baixa",
      texto: `A imagem é pequena (menos de ${LADO_MINIMO_DO_CONTEUDO} px no lado menor). Ao ampliar para o ícone ela vai ficar borrada. Se puder, envie uma versão maior.`,
    });
  }
  const claro = e.apagadoNoClaro > 0.6;
  const escuro = e.apagadoNoEscuro > 0.6;
  if (claro || escuro) {
    avisos.push({
      id: "contraste",
      texto:
        claro && escuro
          ? "O logo tem pouco contraste: quase some tanto no fundo claro quanto no escuro."
          : claro
            ? "O logo é claro e quase some no fundo claro do app. Ele só aparece bem no tema escuro."
            : "O logo é escuro e quase some no fundo escuro. Ele só aparece bem no tema claro.",
    });
  }
  return avisos;
}
