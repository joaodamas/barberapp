/**
 * A cor que o logo já tem — sugerida como cor de destaque da barbearia.
 *
 * Quem sobe o logo quase sempre quer os botões "da cor da marca", e pedir que
 * o dono descubra o hexadecimal de um arquivo é pedir o que ele não sabe fazer.
 * A conta sai daqui como SUGESTÃO: a tela mostra, o dono aceita ou não.
 *
 * Pura de propósito — entra a lista de pixels de um canvas (`ImageData.data`,
 * RGBA), sai texto. O canvas fica na tela; aqui só a conta, para os testes
 * exercitarem com pixels sintéticos em vez de imagem de verdade.
 *
 * O que NÃO serve de sugestão, e por quê:
 * - pixel transparente: é o fundo do PNG, não a marca;
 * - quase branco e quase preto: são fundo e contorno em quase todo logo, e
 *   ganhariam a contagem de lavada — botão branco some na página creme, e o
 *   preto vira um cinza lavado depois do ajuste de contraste;
 * - cinza: sem saturação, não é "cor de marca" — é texto.
 *
 * A cor devolvida é a CRUA. Quem garante que o texto do botão continua legível
 * é `tonsDaMarca`, que clareia o que for escuro demais — esta função não
 * duplica nem enfraquece aquela regra.
 */

type Opcoes = {
  /** Alfa mínimo (0–255) para o pixel contar. */
  alfaMinimo?: number;
  /** Fração mínima dos pixels VISÍVEIS que a cor vencedora precisa ter. */
  presencaMinima?: number;
};

/* Os cortes são deliberadamente folgados: um rosa bem clarinho (#f3c6cf) é
 * cor de marca de verdade, e precisa sobreviver ao filtro de "quase
 * branco". O que cai é o que o olho lê como branco, preto ou cinza. */
const CLARO_DEMAIS = 0.92; // luminosidade HSL
const ESCURO_DEMAIS = 0.1;
const SATURACAO_MINIMA = 0.18;

/** 5 bits por canal: tons vizinhos do mesmo laranja caem no mesmo balde. */
const DESLOCAMENTO = 3;

function luminosidadeESaturacao(r: number, g: number, b: number) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { l, s };
}

/** O pixel conta como cor de marca? */
export function pixelUtil(r: number, g: number, b: number): boolean {
  const { l, s } = luminosidadeESaturacao(r, g, b);
  return l < CLARO_DEMAIS && l > ESCURO_DEMAIS && s >= SATURACAO_MINIMA;
}

const paraHex = (v: number[]) =>
  "#" + v.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

/**
 * A cor dominante do logo, em `#rrggbb`, ou `null` quando não há cor que
 * sirva (logo todo preto e branco, ou transparente).
 *
 * Devolve a MÉDIA dos pixels do balde vencedor (com os vizinhos que votaram
 * com ele), e não o centro do balde: o
 * centro é uma cor que talvez nem exista no arquivo, e o dono reconheceria a
 * diferença entre "o rosa do meu logo" e "um rosa parecido".
 */
export function corDominante(
  pixels: ArrayLike<number>,
  { alfaMinimo = 128, presencaMinima = 0.02 }: Opcoes = {}
): string | null {
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>();
  let visiveis = 0;

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (pixels[i + 3] < alfaMinimo) continue;
    visiveis++;
    if (!pixelUtil(r, g, b)) continue;
    const chave =
      ((r >> DESLOCAMENTO) << 10) | ((g >> DESLOCAMENTO) << 5) | (b >> DESLOCAMENTO);
    const balde = baldes.get(chave);
    if (balde) {
      balde.n++;
      balde.r += r;
      balde.g += g;
      balde.b += b;
    } else {
      baldes.set(chave, { n: 1, r, g, b });
    }
  }

  /* Cada balde vota junto com os vizinhos (±1 em cada canal). Sem isso, o
   * mesmo rosa com 1 ponto de variação por antisserrilhado cai dos dois lados
   * de uma fronteira de balde, divide os votos e perde para uma cor que
   * ocupa menos do logo. */
  type Soma = { n: number; r: number; g: number; b: number };
  const vizinhanca = (chave: number): Soma => {
    const [r5, g5, b5] = [chave >> 10, (chave >> 5) & 31, chave & 31];
    const soma: Soma = { n: 0, r: 0, g: 0, b: 0 };
    for (let dr = -1; dr <= 1; dr++)
      for (let dg = -1; dg <= 1; dg++)
        for (let db = -1; db <= 1; db++) {
          const [x, y, z] = [r5 + dr, g5 + dg, b5 + db];
          if (x < 0 || y < 0 || z < 0 || x > 31 || y > 31 || z > 31) continue;
          const vizinho = baldes.get((x << 10) | (y << 5) | z);
          if (!vizinho) continue;
          soma.n += vizinho.n;
          soma.r += vizinho.r;
          soma.g += vizinho.g;
          soma.b += vizinho.b;
        }
    return soma;
  };

  let vencedor: Soma | null = null;
  for (const chave of baldes.keys()) {
    const soma = vizinhanca(chave);
    if (!vencedor || soma.n > vencedor.n) vencedor = soma;
  }
  /* Um punhado de pixels coloridos na borda antisserrilhada de um logo preto
   * não é a cor da marca — é ruído do contorno. Por isso a presença é medida
   * contra tudo o que é VISÍVEL, e não só contra os pixels coloridos: contra
   * estes, o ruído seria 100% de si mesmo. */
  if (!vencedor || vencedor.n < visiveis * presencaMinima || vencedor.n < 4) return null;

  return paraHex([vencedor.r / vencedor.n, vencedor.g / vencedor.n, vencedor.b / vencedor.n]);
}
