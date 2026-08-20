import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * O contraste do design system, medido em vez de prometido.
 *
 * ## O defeito que este teste existe para impedir
 *
 * `globals.css` já carregava o contraste no comentário — *"#4f8542 dava 4.41:1
 * sobre o fundo — reprovava AA por pouco"*. Um número escrito à mão num
 * comentário envelhece: quem trocar `--color-surface` por um creme meio tom
 * mais escuro não tem como saber que derrubou o texto secundário abaixo de
 * 4,5:1, porque nada no projeto recalcula.
 *
 * E o número no comentário só cobre o caso fácil, que é uma cor sobre outra. Os
 * três defeitos que este teste encontrou no inventário de UX-04 estavam todos
 * fora dele:
 *
 * — a etiqueta pintava texto de um tom sobre uma TINTA do mesmo tom, e o fundo
 *   real (4,42:1) não existia em lugar nenhum do código: nascia de uma mistura
 *   que só acontece no navegador;
 * — o contorno de campo de formulário era medido contra a página branca, e
 *   campo de formulário quase nunca está sobre a página — está dentro de um
 *   cartão, onde ele dava 2,77:1;
 * — o anel de foco usava o dourado que a BARBEARIA sobrescreve em tempo de
 *   execução, então o indicador de teclado tinha um contraste diferente em cada
 *   cliente e nenhum build podia saber qual.
 *
 * Por isso o teste lê o CSS de verdade, resolve as regras que valem
 * (`:focus-visible`, o contorno de controle) em vez de confiar em nomes, e
 * mistura as camadas como o navegador mistura. Reprovar aqui é o comportamento
 * desejado: obriga a decisão a ser tomada por quem mexeu, e não descoberta por
 * um dono lendo cinza sobre creme no celular, em pé, no salão.
 *
 * Fórmula: WCAG 2.1 — luminância relativa + (L1+0.05)/(L2+0.05).
 */

const ARQUIVO = new URL("../../app/globals.css", import.meta.url);
const PILL = new URL("../../components/ui/pill.tsx", import.meta.url);

/** Comentário citando uma regra não é a regra. Fora todos antes de procurar. */
const CSS = readFileSync(ARQUIVO, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Lê `--color-x: #rrggbb` — a definição em `:root`, não os apelidos do tema. */
function token(nome: string): string {
  const m = CSS.match(new RegExp(String.raw`--color-${nome}:\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --color-${nome} não encontrado em globals.css`);
  return m[1];
}

/** O corpo da primeira regra cujo seletor contém este trecho. */
function corpoDaRegra(trechoDoSeletor: string): string {
  const i = CSS.indexOf(trechoDoSeletor);
  if (i < 0) throw new Error(`regra não encontrada: ${trechoDoSeletor}`);
  const abre = CSS.indexOf("{", i);
  const fecha = CSS.indexOf("}", abre);
  return CSS.slice(abre + 1, fecha);
}

/**
 * De qual token uma regra depende, de fato.
 *
 * A primeira versão deste teste perguntava "qual é a cor do foco?" a um token
 * que ela mesma tinha inventado. A pergunta certa é "qual cor a regra
 * `:focus-visible` está usando?" — assim, apontar a regra para outro token muda
 * o que o teste mede, em vez de deixá-lo medindo algo que a tela não usa mais.
 */
function tokenUsadoEm(trechoDoSeletor: string, propriedade: string): string {
  const corpo = corpoDaRegra(trechoDoSeletor);
  const m = corpo.match(new RegExp(String.raw`${propriedade}:[^;]*var\(--color-([a-z-]+)\)`));
  if (!m) throw new Error(`${propriedade} não resolve para um token em ${trechoDoSeletor}`);
  return m[1];
}

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function luminancia(hex: string): number {
  const canais = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(frente: string, fundo: string): number {
  const a = luminancia(frente);
  const b = luminancia(fundo);
  const [claro, escuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * `bg-cor/15` do Tailwind não é uma cor nova: é a cor com alfa, composta sobre
 * o que estiver atrás. Sem compor, o teste mediria contra um fundo que não
 * existe na tela.
 */
function tinta(cor: string, alfa: number, fundo: string): string {
  const f = rgb(cor);
  const t = rgb(fundo);
  const c = f.map((v, i) => Math.round(v * alfa + t[i] * (1 - alfa)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Texto normal (< 18.66px em peso normal) — o caso de todo texto do painel. */
const AA_TEXTO = 4.5;
/** Contorno de controle, indicador de foco e ícone — WCAG 1.4.11. */
const AA_NAO_TEXTO = 3;

/**
 * As três superfícies do painel, porque elas empilham: `canvas` é a página,
 * `surface` é o cartão, `surface-raised` é o realce dentro do cartão. Um token
 * de texto precisa sobreviver às três — hoje o mesmo `text-ink-muted` é usado
 * nas três sem ninguém escolher.
 */
const superficies = (): Array<[string, string]> => [
  ["página", token("canvas")],
  ["cartão", token("surface")],
  ["realce", token("surface-raised")],
];

describe("contraste dos tokens — WCAG AA", () => {
  for (const [onde, fundo] of superficies()) {
    it(`texto principal sobre ${onde}`, () => {
      expect(contraste(token("ink"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    });

    it(`texto secundário sobre ${onde}`, () => {
      expect(contraste(token("ink-muted"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    });

    it(`valor positivo sobre ${onde}`, () => {
      expect(contraste(token("success"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    });

    it(`valor negativo sobre ${onde}`, () => {
      expect(contraste(token("danger"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    });

    it(`destaque dourado sobre ${onde}`, () => {
      expect(contraste(token("gold-strong"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    });
  }

  /**
   * Botão primário: `bg-gold text-ink`.
   *
   * `--color-gold` é o ÚNICO token que a barbearia sobrescreve em tempo de
   * execução (`lib/tenant.ts`). O teste trava o padrão da plataforma; o valor
   * escolhido pelo lojista é responsabilidade de quem valida a marca. É
   * exatamente por isso que nenhuma afordância de acessibilidade — foco,
   * contorno de controle, fundo de etiqueta — pode depender deste token.
   */
  it("botão primário: texto sobre o dourado", () => {
    expect(contraste(token("ink"), token("gold"))).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  it("botão primário em hover: o hover precisa CLAREAR, não escurecer", () => {
    expect(contraste(token("ink"), token("gold-hover"))).toBeGreaterThanOrEqual(AA_TEXTO);
    expect(luminancia(token("gold-hover"))).toBeGreaterThan(luminancia(token("gold")));
  });

  /**
   * Botão destrutivo: `bg-danger text-white hover:bg-danger/90`.
   *
   * O hover CLAREIA o vermelho (90% de tinta sobre o que está atrás), então é
   * ele que define o piso, e não o estado de repouso. Medir só o repouso deixa
   * passar um hover ilegível.
   */
  it("botão destrutivo: branco sobre o vermelho, em repouso e em hover", () => {
    const branco = "#ffffff";
    expect(contraste(branco, token("danger"))).toBeGreaterThanOrEqual(AA_TEXTO);
    for (const [, fundo] of superficies()) {
      expect(
        contraste(branco, tinta(token("danger"), 0.9, fundo))
      ).toBeGreaterThanOrEqual(AA_TEXTO);
    }
  });

  /**
   * `Pill` — o caso que a leitura token a token não pegava.
   *
   * Cada etiqueta pintava o texto do próprio tom sobre uma tinta de 15% do
   * MESMO tom: escurecer o fundo escurecia junto o que precisava se destacar
   * dele, e a razão ficava presa em ~4,4:1 (4,04:1 quando a etiqueta caía
   * dentro de um bloco elevado). Nenhuma opacidade resolvia.
   *
   * A correção é estrutural: fundo opaco `--color-surface-raised`, tom no texto
   * e na borda. Duas consequências que este teste tranca — o contraste passa a
   * ser propriedade da etiqueta e não do lugar onde ela foi colada, e deixa de
   * depender do dourado que cada barbearia escolhe.
   */
  const etiquetas: Array<[string, string]> = [
    ["dourada", "gold-strong"],
    ["positiva", "success"],
    ["negativa", "danger"],
    ["neutra", "ink-muted"],
  ];

  for (const [nome, cor] of etiquetas) {
    it(`etiqueta ${nome}: texto sobre a superfície da etiqueta`, () => {
      expect(contraste(token(cor), token("surface-raised"))).toBeGreaterThanOrEqual(AA_TEXTO);
    });
  }

  it("etiqueta não volta a usar tinta translúcida", () => {
    // Sem esta trava o teste acima continuaria verde com o defeito de volta:
    // ele mede tokens, e quem reprovava era a MISTURA. `bg-success/15` é a
    // forma exata do defeito — fundo que herda o que estiver atrás.
    const fonte = readFileSync(PILL, "utf8");
    const tones = fonte.slice(fonte.indexOf("const tones"), fonte.indexOf("export function"));
    expect(tones).not.toMatch(/bg-(gold|success|danger)\//);
  });

  /**
   * `ErroAoCarregar` pinta um cartão de `bg-danger/5`. É pouca tinta, mas o
   * texto ali é o mais importante da tela: é o que separa "não há despesa" de
   * "não consegui ler as despesas".
   */
  it("cartão de erro: as duas linhas sobre a tinta vermelha", () => {
    const fundo = tinta(token("danger"), 0.05, token("surface"));
    expect(contraste(token("ink"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    expect(contraste(token("ink-muted"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    expect(contraste(token("danger"), fundo)).toBeGreaterThanOrEqual(AA_NAO_TEXTO);
  });

  /**
   * Barra de modo leitura: fica sobre a PÁGINA, não sobre o cartão, e é onde o
   * dono descobre que a conta está suspensa. Se ela some no fundo, ele descobre
   * ao tentar salvar — que é a pior hora de descobrir qualquer coisa.
   */
  it("aviso de modo leitura: texto e link sobre a tinta dourada", () => {
    const fundo = tinta(token("gold"), 0.1, token("canvas"));
    expect(contraste(token("ink"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
    expect(contraste(token("gold-strong"), fundo)).toBeGreaterThanOrEqual(AA_TEXTO);
  });

  /**
   * Contorno de campo de formulário.
   *
   * Medido contra as três superfícies, e não só contra a página: input mora
   * dentro de `Card` e de diálogo muito mais do que solto na página. Era
   * exatamente aí que `--color-border-strong` reprovava (2,77:1 no cartão,
   * 2,49:1 no realce) enquanto passava raspando na página (3,01:1).
   *
   * `--color-border`, decorativo (1,30:1), continua fora de propósito: contorno
   * de CARTÃO não é alvo de 1.4.11; contorno de CONTROLE é.
   */
  it("contorno de controle: 3:1 sobre as três superfícies", () => {
    const cor = token(tokenUsadoEm('input:not([type="checkbox"])', "border-color"));
    for (const [, fundo] of superficies()) {
      expect(contraste(cor, fundo)).toBeGreaterThanOrEqual(AA_NAO_TEXTO);
    }
  });

  /**
   * Anel de foco.
   *
   * É a única indicação de onde o teclado está. Precisa de 3:1 contra QUALQUER
   * superfície que possa ficar atrás dele.
   */
  it("anel de foco: 3:1 sobre as três superfícies", () => {
    const cor = token(tokenUsadoEm(":focus-visible", "outline"));
    for (const [, fundo] of superficies()) {
      expect(contraste(cor, fundo)).toBeGreaterThanOrEqual(AA_NAO_TEXTO);
    }
  });

  it("anel de foco não depende do dourado que a barbearia escolhe", () => {
    // Com `--color-gold`, o anel media 3,23:1 na página, 2,96:1 no cartão e
    // 2,67:1 no realce — e mediria outra coisa em cada barbearia, porque este é
    // o token que `lib/tenant.ts` sobrescreve. Navegação por teclado não pode
    // ficar refém de uma escolha de marca que nenhum build enxerga.
    expect(tokenUsadoEm(":focus-visible", "outline")).not.toBe("gold");
  });
});
