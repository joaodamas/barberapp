import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * N7 · a data por extenso não é escrita em Title Case.
 *
 * ## O que apareceu na tela
 *
 * `/agendar`, passo 3, verificação de 18/08:
 *
 * ```
 * Quarta-Feira, 19 De Agosto Às 14:00 · 30 Min
 * ```
 *
 * A frase que sai de `toLocaleDateString("pt-BR", …)` é toda minúscula —
 * *"quarta-feira, 19 de agosto"* — e a classe `capitalize` do Tailwind sobe a
 * primeira letra de **cada palavra**. Em inglês isso é uma convenção de
 * título; em português é erro de escrita: mês não é próprio, preposição não
 * sobe, e "min" é abreviação de unidade, que as `UI-UX-GUIDELINES` §9 tratam
 * como **invariável**.
 *
 * A correção é `first-letter:uppercase`, que sobe só a primeira letra do
 * bloco — exatamente a regra do português.
 *
 * ## Por que um teste de fonte
 *
 * A suíte roda em `environment: "node"` e o repo não tem testing-library: não
 * há como renderizar a página nem medir CSS. O que dá para provar sem
 * renderizar é que nenhuma linha de data do cliente carrega `capitalize` de
 * volta — que é a forma que produz a frase errada, do mesmo jeito que
 * `concordancia.test.ts` trava o `(s)`.
 */

const TELAS_DO_CLIENTE = [
  "app/(cliente)/agendar/page.tsx",
  "app/(cliente)/page.tsx",
  "app/(cliente)/reservas/page.tsx",
];

function fonte(caminho: string) {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");
}

/**
 * Comentário que cita o anti-padrão não é o anti-padrão — ver densidade.test.ts.
 *
 * As quebras de linha do comentário são preservadas: sem isso o número de
 * linha do relatório aponta para outro trecho do arquivo, e quem for corrigir
 * abre a linha errada.
 */
function semComentarios(texto: string) {
  return texto
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/\/\/.*$/gm, "");
}

describe("a data por extenso sobe só a primeira letra", () => {
  /**
   * O alvo é estreito de propósito: `capitalize` sobre uma data **por
   * extenso** — a que traz mês e preposição junto.
   *
   * `capitalize` sobre UMA palavra continua permitido e é usado de propósito
   * no seletor de dias (`weekday: "short"` → "qua" vira "Qua") e no rótulo de
   * aba. Ali não há preposição para subir errado, e trocar por
   * `first-letter` daria no mesmo. Um teste que reprovasse esses casos seria
   * desligado na primeira semana.
   */
  const DATA_POR_EXTENSO = /formatDatePtBR|weekday:\s*"long"/;

  it("nenhuma data por extenso do cliente usa capitalize", () => {
    const achados: string[] = [];

    for (const caminho of TELAS_DO_CLIENTE) {
      const linhas = semComentarios(fonte(caminho)).split("\n");
      linhas.forEach((linha, i) => {
        if (!linha.includes("capitalize")) return;
        /* A linha da classe e a do valor são vizinhas no JSX; olhar só a
         * própria linha perderia todos os casos reais. */
        const janela = linhas.slice(i, i + 5).join("\n");
        if (DATA_POR_EXTENSO.test(janela)) {
          achados.push(`${caminho}:${i + 1}: ${linha.trim()}`);
        }
      });
    }

    expect(
      achados,
      `"capitalize" numa data produz "Quarta-Feira, 19 De Agosto Às 14:00" — ` +
        `use "first-letter:uppercase":\n${achados.join("\n")}`
    ).toEqual([]);
  });

  it("as três telas do cliente sobem a primeira letra da data", () => {
    for (const caminho of TELAS_DO_CLIENTE) {
      expect(semComentarios(fonte(caminho)), caminho).toContain("first-letter:uppercase");
    }
  });
});

/**
 * N7 · o passo 4 confirma O QUE foi marcado.
 *
 * A tela dizia *"Seu horário está garantido"* sem dizer qual: era o único
 * passo da jornada sem data, sem hora e sem o profissional que o cliente
 * acabara de escolher — e é a última coisa que ele lê antes de fechar o app.
 */
describe("a confirmação diz qual horário foi garantido", () => {
  const pagina = semComentarios(fonte("app/(cliente)/agendar/page.tsx"));

  it("o passo 4 repete dia e hora escolhidos", () => {
    const passo4 = pagina.slice(pagina.indexOf("Reserva confirmada!"));
    expect(passo4).toContain("selectedDay?.date.toLocaleDateString");
    expect(passo4).toContain("selectedSlot?.time");
  });

  it("o passo 4 nomeia o profissional quando houve escolha", () => {
    const passo4 = pagina.slice(pagina.indexOf("Reserva confirmada!"));
    expect(passo4).toContain("barbeiroEscolhido.name");
  });
});
