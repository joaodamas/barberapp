import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * As telas financeiras CONSOMEM a regra — não basta ela existir.
 *
 * ## Por que este teste é de código-fonte, e não de render
 *
 * A suíte roda em `environment: "node"` e o projeto não monta componentes. Mas
 * a lição da Rodada 3.2 (§19 do protocolo) é justamente que 1268 testes verdes
 * não impediram quatro defeitos de tela — e dois deles eram um número que o
 * motor calculava certo e a interface exibia errado.
 *
 * Há um precedente exato disto no repositório: `plural.ts` foi escrito, testado
 * e **ignorado por dois lugares escritos depois dele**. A função existia, os
 * testes passavam, e a tela continuava dizendo "1 dias com movimento". Um
 * módulo puro só vale pelo que o consome.
 *
 * Então o que se verifica aqui é o ELO: que cada tela do território pede as
 * fontes ilegíveis e que nenhum componente de erro fica sem o erro cru. É o que
 * um teste de unidade não alcança e um teste de render também não alcançaria
 * sem simular doze coleções.
 *
 * O que ele NÃO prova é a aparência do estado — isso é VERIFICADO (§19), exige
 * tela, e não foi feito por este agente.
 */

const TELA = (caminho: string) =>
  readFileSync(new URL(`../../app/painel/${caminho}`, import.meta.url), "utf8");

/** Comentário que CITA uma chamada não faz a chamada. */
function semComentarios(fonte: string) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/** As telas do território financeiro que descem de `useFinanceiro`. */
const DO_FINANCEIRO = [
  "(dashboard)/financeiro/page.tsx",
  "(dashboard)/financeiro/dre/page.tsx",
  "(dashboard)/financeiro/fluxo-caixa/page.tsx",
  "(dashboard)/financeiro/projecao/page.tsx",
  "(dashboard)/numeros/page.tsx",
];

describe("a regra chega às telas", () => {
  for (const caminho of DO_FINANCEIRO) {
    it(`${caminho}: pede as fontes ilegíveis e monta a apuração`, () => {
      const codigo = semComentarios(TELA(caminho));
      expect(codigo).toContain("fontesIlegiveis");
      expect(codigo).toContain("apuracaoDe(");
    });
  }

  it("despesas: os agregados são guardados pelo estado de erro", () => {
    /* Esta tela lê `expenses` direto, sem `useFinanceiro` — por isso a guarda
     * é um booleano local. Os cinco números que mentiam eram: contagem no
     * cabeçalho, os quatro KPIs e o total do rodapé. */
    const codigo = semComentarios(
      TELA("(dashboard)/financeiro/despesas/page.tsx")
    );
    expect(codigo).toContain("const naoApurado = status === \"erro\"");
    // Um por KPI + rodapé + cabeçalho. Abaixo disso, algum agregado ficou solto.
    expect(codigo.match(/naoApurado \?/g)?.length ?? 0).toBeGreaterThanOrEqual(6);
    expect(codigo).toContain("NAO_APURADO");
  });

  it("hoje: o caixa do dia e a previsão saem da tela quando a agenda não é lida", () => {
    const codigo = semComentarios(TELA("(dashboard)/page.tsx"));
    expect(codigo).toContain("const agendaIlegivel = status === \"erro\"");
    expect(codigo).toContain("{!agendaIlegivel && (");
  });

  it("hoje: a quarta coluna do caixa existe — D31", () => {
    /* `caixaDoDia` devolve `naoInformado` desde `843b84c` e nenhuma tela o
     * consumia: os três filhos não somavam o cabeçalho, e o atendimento sem
     * meio de pagamento entrava no total e em coluna nenhuma. */
    const codigo = semComentarios(TELA("(dashboard)/page.tsx"));
    expect(codigo).toContain("caixaHoje.naoInformado");
  });
});

describe("nenhum estado de erro perde a causa", () => {
  /**
   * `erro-de-leitura.ts` distingue permissão de conexão porque as duas pedem
   * ações diferentes: recarregar resolve uma e não resolve NUNCA a outra.
   * Sem o erro cru, o componente volta ao texto com "ou" — a admissão de que o
   * produto não sabe qual das duas foi, escrita na tela.
   *
   * O `erro` é opcional na assinatura de propósito (foi assim que o INFRA-02
   * ligou a distinção sem tocar nas telas que outra equipe reescrevia). Este
   * teste é o que impede o opcional de virar esquecimento.
   */
  const TELAS_COM_ERRO = [
    ...DO_FINANCEIRO,
    "(dashboard)/financeiro/despesas/page.tsx",
    "(dashboard)/page.tsx",
    "(dashboard)/clientes/page.tsx",
    "(dashboard)/loja/page.tsx",
  ];

  for (const caminho of TELAS_COM_ERRO) {
    it(`${caminho}: todo ErroAoCarregar/LinhaDeErro recebe o erro cru`, () => {
      const codigo = semComentarios(TELA(caminho));
      const usos = codigo.match(/<(?:ErroAoCarregar|LinhaDeErro)\b[^>]*\/>/g) ?? [];
      for (const uso of usos) {
        expect(uso, `${caminho}: ${uso}`).toMatch(/\berro=\{/);
      }
    });
  }
});
