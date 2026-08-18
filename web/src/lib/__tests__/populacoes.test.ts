import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Dois números só entram na mesma régua se contarem a mesma população.
 *
 * ## O caso que originou este arquivo — F5/F6
 *
 * A tela Hoje tinha um cartão "Previsão × recebido" com barra de progresso:
 * `safePct(recebidoReal, previsaoHoje)`. A barra afirmava *"quanto do previsto
 * já entrou"*, e isso era verdade enquanto os dois números saíam de `bookings`.
 *
 * O D2 tirou o recebido de `bookings` e colocou em `payments` — porque o
 * atendimento coberto pelo plano é concluído sem dinheiro, e somar reservas
 * inventava caixa. Correto no fato, e fatal para a barra: a previsão continuou
 * sendo **agenda de serviço** e o recebido virou **caixa de todas as origens**.
 *
 * Medido na tela em 18/08, com dois cortes, uma venda e uma mensalidade:
 *
 * ```
 * Previsão do dia     R$ 100,00   dois cortes agendados
 * Recebido até agora  R$ 244,00   50 serviço + 45 venda + 149 mensalidade
 * ```
 *
 * A barra ficava cheia e sugeria um dia 244% realizado. Não era erro de
 * arredondamento nem de fórmula: **os R$ 149 da mensalidade e os R$ 45 da venda
 * não pertencem à população da previsão.** Venda não ocupa horário; mensalidade
 * não é atendimento.
 *
 * ## Por que a correção não foi "voltar o recebido para serviço"
 *
 * Seria escolher a régua em vez do fato. O D2 estabeleceu que recebido é caixa,
 * e desfazer isso para a barra funcionar recriaria o defeito que ele corrigiu —
 * com a vantagem cosmética de um percentual bonito.
 *
 * ## Por que um teste de FONTE, e não de render
 *
 * O precedente é o `plural.ts`: a regra existia, estava testada, e dois lugares
 * escritos depois dela a ignoraram. Uma regra que depende de alguém lembrar
 * volta. Aqui o que precisa ser impedido é a *expressão* — alguém reintroduzir
 * um percentual entre os dois — e isso se lê no código.
 *
 * A suíte roda em `environment: "node"` e o repo não tem testing-library;
 * varrer o fonte é o mesmo caminho de `densidade.test.ts`,
 * `sem-falso-zero.test.ts` e `concordancia.test.ts`.
 *
 * **O que este teste NÃO prova:** que os dois cartões estão visualmente
 * separados e legíveis. Isso é §19 — só quem abriu a tela pode dizer.
 */

const HOJE = readFileSync("src/app/painel/(dashboard)/page.tsx", "utf8");

describe("Hoje · previsão e recebido não dividem régua", () => {
  it("não existe percentual entre recebido e previsão", () => {
    /* Qualquer `safePct`/`safeDiv` que tenha os dois lados na mesma chamada. A
     * ordem dos argumentos não importa: inverter não conserta a comparação. */
    const juntos =
      /safe(?:Pct|Div)\s*\(\s*[^)]*recebido[^)]*previsao[^)]*\)/i.test(HOJE) ||
      /safe(?:Pct|Div)\s*\(\s*[^)]*previsao[^)]*recebido[^)]*\)/i.test(HOJE);

    expect(
      juntos,
      "previsão é agenda de serviço e recebido é caixa de todas as origens — " +
        "um percentual entre os dois afirma um atingimento que não existe"
    ).toBe(false);
  });

  it("nenhuma barra de progresso é largada por recebido sobre previsão", () => {
    /* A forma concreta que o defeito tinha: `style={{ width: ... }}` alimentado
     * pela razão entre os dois. */
    const larguraComparativa =
      /width:\s*`\$\{safe(?:Pct|Div)\([^)]*recebido[^)]*previsao[^)]*\)/i.test(HOJE);
    expect(larguraComparativa).toBe(false);
  });

  it("os dois números continuam na tela — separar não é esconder", () => {
    /* A régua saiu; os fatos ficam. Suprimir um deles seria trocar um defeito
     * de comparação por um de omissão. */
    expect(HOJE).toContain("previsaoHoje");
    expect(HOJE).toContain("recebidoReal");
  });

  it("cada cartão declara a população que conta", () => {
    /* É a legenda que impede a leitura errada depois que a barra sai: sem ela,
     * dois números grandes lado a lado voltam a parecer comparáveis. */
    expect(HOJE).toMatch(/serviços agendados/i);
    expect(HOJE).toMatch(/atendimento, venda e mensalidade/i);
  });

  it("cada cartão some pela SUA fonte, não pela do vizinho", () => {
    /* Consequência do D2: as fontes se separaram, então os gates também. Com a
     * agenda ilegível e os pagamentos legíveis, "quanto entrou" continua sendo
     * uma pergunta respondível — e o D3 manda preservar o que dá para apurar. */
    expect(HOJE).toContain("pagamentosIlegiveis");
    expect(HOJE).toMatch(/payments\.status\s*===\s*"erro"/);
  });
});
