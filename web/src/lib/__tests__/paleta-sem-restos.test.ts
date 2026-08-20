import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O que sobra quando uma paleta é trocada.
 *
 * ## Por que este arquivo existe
 *
 * A troca de valores da Etapa 2 mexeu em `globals.css`, e é lá que ela deveria
 * começar e terminar — o produto inteiro consome token, não hex. Mas três
 * lugares carregavam cor da paleta ESCRITA À MÃO, e nenhum deles é CSS:
 *
 * — `layout.tsx` declara `themeColor`, a faixa que o Android pinta acima da
 *   página no PWA. Era `#ffffff` e coincidia com a página por acaso;
 * — o QR desenha em `<canvas>`, que não lê variável CSS, então o módulo escuro
 *   é um hex literal;
 * — duas sidebars tinham sombra preta a 80%, herança do tempo em que o app era
 *   escuro.
 *
 * Nenhum deles quebra teste, typecheck ou lint quando envelhece. Eles só ficam
 * errados na tela, e só para quem abrir a tela certa no aparelho certo — a
 * emenda do `themeColor`, por exemplo, aparece no PWA e não no navegador.
 *
 * O teste não proíbe hex fora do CSS: as cores de MARCA que a barbearia escolhe
 * são hex de propósito, e a assinatura do logo também. Ele tranca duas coisas
 * verificáveis: o que precisa acompanhar a página acompanha, e nenhum valor da
 * paleta antiga sobrevive escondido.
 */

const RAIZ = resolve(__dirname, "..", "..");

/**
 * O código sem comentários.
 *
 * Um comentário que CITA um valor antigo — para explicar o que mudou e por quê
 * — é documentação, não resto. A primeira versão deste teste não fazia a
 * distinção e reprovou contra a própria explicação da troca de paleta em
 * `globals.css`, exigindo apagar justamente o registro que dá sentido à
 * mudança. O mesmo tropeço já tinha acontecido em `regressao-origem-do-fato`.
 */
function codigoDe(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const CSS = codigoDe(resolve(RAIZ, "app", "globals.css"));

function token(nome: string): string {
  const m = CSS.match(new RegExp(String.raw`--color-${nome}:\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--color-${nome} não existe em globals.css`);
  return m[1].toLowerCase();
}

function arquivosDeCodigo(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = resolve(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "__tests__" && e !== "node_modules") arquivosDeCodigo(p, acc);
    } else if (/\.(ts|tsx|css)$/.test(e)) acc.push(p);
  }
  return acc;
}

describe("a paleta não deixou resto", () => {
  it("`themeColor` do PWA é exatamente a cor da página", () => {
    /* Divergir cria uma emenda visível na borda de cima da tela, e só no
     * aplicativo instalado — o navegador não mostra o defeito. Ou seja: é um
     * bug que a inspeção visual no desktop nunca encontra. */
    const layout = readFileSync(resolve(RAIZ, "app", "layout.tsx"), "utf8");
    const m = layout.match(/themeColor:\s*"(#[0-9a-fA-F]{6})"/);
    expect(m, "themeColor não encontrado em layout.tsx").toBeTruthy();
    expect(m![1].toLowerCase()).toBe(token("canvas"));
  });

  it("o módulo escuro do QR é a tinta da paleta", () => {
    /* `<canvas>` não lê `var(--color-ink)`, então o valor é copiado. Cópia sem
     * trava é cópia que envelhece. */
    const qr = readFileSync(
      resolve(RAIZ, "components", "comecar", "passo-compartilhar.tsx"),
      "utf8"
    );
    const usados = [...qr.matchAll(/fillStyle\s*=\s*"(#[0-9a-fA-F]{6})"/g)].map((m) =>
      m[1].toLowerCase()
    );
    expect(usados).toContain(token("ink"));
  });

  it("nenhum valor da paleta creme antiga sobreviveu no código", () => {
    /* Os quatro tons quentes de superfície e as duas tintas de texto que o
     * produto usou até a Etapa 2. Se um deles reaparece fora de comentário,
     * alguém copiou de uma tela antiga, de um print ou de outro arquivo. */
    const antigos = ["#f8f5ee", "#efe9dc", "#e1d8c5", "#a1937a", "#17140f", "#6b6355"];
    const restos: string[] = [];
    for (const arquivo of arquivosDeCodigo(RAIZ)) {
      const fonte = codigoDe(arquivo).toLowerCase();
      for (const cor of antigos) {
        if (fonte.includes(cor)) restos.push(`${arquivo.slice(RAIZ.length + 1)}: ${cor}`);
      }
    }
    expect(restos, restos.join("\n")).toEqual([]);
  });

  it("sombra preta densa não volta — ela é herança do tema escuro", () => {
    /* Preto a 80% sobre fundo claro não afunda o elemento: suja o que está em
     * volta. As duas sidebars carregavam exatamente isso, a -24px de spread. */
    const densas: string[] = [];
    for (const arquivo of arquivosDeCodigo(RAIZ)) {
      for (const m of codigoDe(arquivo).matchAll(
        /rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*([0-9.]+)\s*\)/g
      )) {
        if (Number(m[1]) > 0.2) densas.push(`${arquivo.slice(RAIZ.length + 1)}: ${m[0]}`);
      }
    }
    expect(densas, densas.join("\n")).toEqual([]);
  });
});
