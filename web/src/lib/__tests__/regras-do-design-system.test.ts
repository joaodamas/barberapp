import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As três regras que o dono declarou inegociáveis, verificadas em vez de
 * combinadas.
 *
 * `docs/UI-UX-GUIDELINES.md` lista light-only, `prefers-reduced-motion` e alvo
 * de toque de 44px como contrato de produto. As três têm a mesma fragilidade:
 * são cumpridas hoje por disciplina, e nenhuma delas quebra o build quando
 * alguém escreve a linha errada. A auditoria de UI/UX de 17/08 confirmou o
 * cumprimento contando ocorrências à mão — o que prova o ponto, porque contar à
 * mão só acontece enquanto alguém lembra de contar.
 *
 * O alvo de toque já tinha escorregado quando este teste foi escrito: nove
 * controles em 36px, todos ação de linha de lista, todos no caminho do dono
 * operando em pé no balcão. Ninguém decidiu abrir mão da regra; ela só não
 * estava sendo verificada.
 */

const UI = new URL("../../components/ui/", import.meta.url);
const CSS_BRUTO = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const arquivosDaUi = () =>
  readdirSync(UI)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => ({ nome: f, fonte: readFileSync(new URL(f, UI), "utf8") }));

/** Comentário que CITA uma classe não aplica a classe. */
function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("alvo de toque", () => {
  /**
   * 44px é a medida do dedo, não uma preferência de estilo. Abaixo dela o dono
   * erra o botão, e o botão que ele erra é "Concluir atendimento" — errar
   * significa marcar o corte do cliente errado.
   *
   * `alvo-toque` é a saída legítima e por isso entra na conta: ela mantém 36px
   * de DESENHO, para a linha de agendamento não virar cinco botões gordos, e
   * devolve os 44px de ÁREA por pseudo-elemento. Um `min-h-9` sozinho não tem
   * essa saída — é só um alvo pequeno.
   */
  for (const { nome, fonte } of arquivosDaUi()) {
    it(`${nome}: nenhum controle abaixo de 44px sem área estendida`, () => {
      const codigo = semComentarios(fonte);
      // Cada string de classe é avaliada inteira: é nela que `alvo-toque` teria
      // de estar acompanhando o `min-h-` pequeno.
      for (const [, classes] of codigo.matchAll(/"([^"]*min-h-[0-9][^"]*)"/g)) {
        for (const [, passo] of classes.matchAll(/min-h-([0-9]+)/g)) {
          if (Number(passo) >= 11) continue;
          expect(
            classes,
            `min-h-${passo} (${Number(passo) * 4}px) sem "alvo-toque" em ${nome}`
          ).toContain("alvo-toque");
        }
      }
    });
  }
});

describe("light-only", () => {
  /**
   * Não é "ainda não fizemos o modo escuro" — é decisão firme do dono, e está
   * na lista de anti-patterns. Um `dark:` solto numa tela nova não quebraria
   * nada visivelmente para quem revisa de dia, e passaria.
   */
  it("nenhuma variante de tema escuro no CSS", () => {
    expect(CSS_BRUTO).not.toMatch(/prefers-color-scheme/);
  });

  it("nenhuma classe `dark:` nos componentes base", () => {
    for (const { nome, fonte } of arquivosDaUi()) {
      expect(semComentarios(fonte), nome).not.toMatch(/\bdark:/);
    }
  });
});

describe("prefers-reduced-motion", () => {
  /**
   * "Respeitado — sem exceção" é uma frase fácil de escrever e fácil de furar:
   * quem acrescentar a próxima animação em `globals.css` precisa lembrar de
   * escrever também o bloco que a desliga, e não há nada que o lembre.
   *
   * A verificação cobre MOVIMENTO — animação, e transição que mexe em
   * `transform`. Transição de cor fica de fora de propósito: ela não desloca
   * nada na tela, e exigir o desligamento dela transformaria a regra em
   * burocracia, que é como as regras deixam de ser levadas a sério.
   */
  function corpoBalanceado(css: string, inicio: number): [string, number] {
    const abre = css.indexOf("{", inicio);
    let nivel = 0;
    for (let i = abre; i < css.length; i++) {
      if (css[i] === "{") nivel++;
      else if (css[i] === "}" && --nivel === 0) return [css.slice(abre + 1, i), i + 1];
    }
    throw new Error("bloco CSS sem fechamento");
  }

  /** Separa o CSS em "o que anima" e "o que a preferência desliga". */
  function separar(css: string) {
    let resto = "";
    let reducao = "";
    let i = 0;
    while (i < css.length) {
      const media = css.indexOf("@media (prefers-reduced-motion: reduce)", i);
      const keyframes = css.indexOf("@keyframes", i);
      // `@keyframes` tem chaves aninhadas e atrapalharia a leitura das regras
      // planas; e um keyframe não declara `animation`, então nada se perde.
      const proximo = [media, keyframes].filter((p) => p >= 0).sort((a, b) => a - b)[0];
      if (proximo === undefined) {
        resto += css.slice(i);
        break;
      }
      resto += css.slice(i, proximo);
      const [corpo, fim] = corpoBalanceado(css, proximo);
      if (proximo === media) reducao += corpo;
      i = fim;
    }
    return { resto, reducao };
  }

  it("toda regra que move alguma coisa tem como ser desligada", () => {
    const { resto, reducao } = separar(CSS_BRUTO.replace(/\/\*[\s\S]*?\*\//g, ""));

    const semDesligamento: string[] = [];
    for (const [, seletor, corpo] of resto.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const anima = /animation:\s*(?!none)/.test(corpo);
      const desloca = /transition:[^;]*transform/.test(corpo);
      if (!anima && !desloca) continue;
      if (!reducao.includes(seletor.trim())) semDesligamento.push(seletor.trim());
    }

    expect(semDesligamento).toEqual([]);
  });

  it("a verificação está olhando para alguma coisa", () => {
    // Uma regra que não encontra nada para checar passa para sempre, inclusive
    // no dia em que alguém reescrever o CSS e ela deixar de casar.
    const { reducao } = separar(CSS_BRUTO);
    expect(reducao.length).toBeGreaterThan(0);
  });
});
