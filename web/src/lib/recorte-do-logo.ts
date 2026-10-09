/**
 * O recorte quadrado do logo — a conta, sem navegador.
 *
 * O dono escolhe um arquivo de qualquer proporção (logo horizontal, foto da
 * fachada, print do Instagram) e o que sobe é um QUADRADO: é o formato do
 * ícone do celular, do favicon e do selo no topo do app. O recorte é simples
 * de propósito — aproximar e arrastar — porque o dono faz isso uma vez.
 *
 * Com zoom 1 a imagem inteira cabe no quadrado (o que sobra fica
 * transparente): nenhum logo perde pedaço sem o dono pedir. Aproximar corta
 * as bordas, e aí arrastar escolhe o que fica.
 *
 * O deslocamento é guardado em FRAÇÃO do lado do quadrado, não em pixels: a
 * prévia na tela tem 240 px e o arquivo final 512, e o mesmo enquadramento
 * precisa dar o mesmo recorte nos dois.
 */

export type Enquadramento = {
  /** 1 = a imagem inteira cabe; até `ZOOM_MAXIMO`. */
  zoom: number;
  /** Deslocamento do centro da imagem, em fração do lado do quadrado. */
  x: number;
  y: number;
};

export const ZOOM_MAXIMO = 4;
export const ENQUADRAMENTO_INICIAL: Enquadramento = { zoom: 1, x: 0, y: 0 };

/** Onde desenhar a imagem num quadrado de `lado` px: `drawImage(img, dx, dy, dw, dh)`. */
export function retanguloNoQuadrado(
  largura: number,
  altura: number,
  lado: number,
  enquadramento: Enquadramento
): { dx: number; dy: number; dw: number; dh: number } {
  const e = limitarEnquadramento(largura, altura, enquadramento);
  if (!(largura > 0 && altura > 0 && lado > 0)) return { dx: 0, dy: 0, dw: 0, dh: 0 };
  const escala = (lado / Math.max(largura, altura)) * e.zoom;
  const dw = largura * escala;
  const dh = altura * escala;
  return {
    dx: (lado - dw) / 2 + e.x * lado,
    dy: (lado - dh) / 2 + e.y * lado,
    dw,
    dh,
  };
}

/**
 * Prende zoom e deslocamento no que faz sentido: a imagem nunca sai do
 * quadrado deixando um vão de um lado e cortando do outro. Num eixo em que a
 * imagem é menor que o quadrado, ela fica centrada.
 */
export function limitarEnquadramento(largura: number, altura: number, e: Enquadramento): Enquadramento {
  const zoom = Math.min(ZOOM_MAXIMO, Math.max(1, Number.isFinite(e.zoom) ? e.zoom : 1));
  const maior = Math.max(largura, altura);
  if (!(maior > 0)) return { zoom, x: 0, y: 0 };
  /* Quanto a imagem passa do quadrado em cada eixo, em fração do lado. */
  const sobraX = Math.max(0, ((largura / maior) * zoom - 1) / 2);
  const sobraY = Math.max(0, ((altura / maior) * zoom - 1) / 2);
  const prender = (v: number, limite: number) =>
    limite === 0 ? 0 : Math.min(limite, Math.max(-limite, Number.isFinite(v) ? v : 0));
  return { zoom, x: prender(e.x, sobraX), y: prender(e.y, sobraY) };
}

/**
 * Onde o logo (já quadrado) vai dentro de um ícone de `lado` px que ele ocupa
 * `escala` — centrado, em pixels inteiros para o PNG pequeno não borrar.
 */
export function logoNoIcone(lado: number, escala: number) {
  const tamanho = Math.round(lado * escala);
  const margem = Math.round((lado - tamanho) / 2);
  return { x: margem, y: margem, tamanho };
}
