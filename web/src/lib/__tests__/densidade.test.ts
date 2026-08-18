import { readFileSync } from "node:fs";
import { caixaDoDia } from "@/lib/analytics";
import type { Doc } from "@/lib/db/repository";
import type { PaymentDoc } from "@/lib/domain";
import { describe, expect, it } from "vitest";

/**
 * Densidade — o mesmo número não se imprime duas vezes na mesma tela.
 *
 * `UI-UX-GUIDELINES.md` §8 diz *"uma informação mora em um lugar"*, e a §13
 * lista **nominalmente** o caso *"Previsto hoje" e "Previsão do dia" — o mesmo
 * número, dois nomes* como exemplo proibido.
 *
 * Ele estava no produto no dia em que esta auditoria começou. Isso é o
 * argumento inteiro deste arquivo: a regra estava escrita, era específica, e
 * mesmo assim a tela a violava — porque nada checava. Uma regra que depende de
 * alguém lembrar dela na revisão é uma regra que volta.
 *
 * O teste é de FONTE, no mesmo espírito de `regras-do-design-system.test.ts` e
 * `navegacao.test.ts`: não renderiza a tela, conta quantas vezes cada valor
 * aparece impresso. É grosseiro de propósito — ele não sabe o que é bonito,
 * sabe o que é repetido.
 *
 * ⚠️ Este arquivo trava **duplicação literal**. As consolidações que exigem
 * saber o que o dono valoriza estão em `docs/AUDITORIA-DENSIDADE.md` como
 * proposta, e deliberadamente **não** têm teste: travar um julgamento que o
 * dono ainda não fez seria transformar a minha opinião em contrato.
 */

const TELA = (caminho: string) =>
  readFileSync(new URL(`../../app/painel/(dashboard)/${caminho}`, import.meta.url), "utf8");

/**
 * Comentário que CITA um valor não imprime o valor.
 *
 * Sem isto o teste se autossabota: as três correções foram documentadas com um
 * comentário que explica qual expressão saiu — e o comentário contém a
 * expressão. Ele reprovaria exatamente as telas que acabou de aprovar.
 */
function semComentarios(fonte: string) {
  return fonte.replace(/\{?\s*\/\*[\s\S]*?\*\/\s*\}?/g, "").replace(/\/\/.*$/gm, "");
}

/** Quantas vezes uma expressão é interpolada no JSX. */
function vezesImpresso(fonte: string, expressao: string) {
  const escapada = expressao.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return semComentarios(fonte).match(new RegExp(escapada, "g"))?.length ?? 0;
}

describe("Hoje — a previsão do dia é um número só", () => {
  const fonte = TELA("page.tsx");

  /**
   * O caso do §13, verbatim. `previsaoHoje` era impresso num `KpiTile`
   * rotulado "previsto hoje" e, 48 linhas depois, numa linha rotulada
   * "Previsão do dia (agenda confirmada)".
   *
   * O defeito não é cosmético: dois nomes ensinam ao dono que são duas
   * grandezas. Quando ele fecha o dia e os dois batem, ele conclui que
   * conferiu — e não conferiu nada, porque é a mesma variável.
   */
  it("`previsaoHoje` é impresso uma vez", () => {
    expect(vezesImpresso(fonte, "formatBRL(previsaoHoje)")).toBe(1);
  });

  /**
   * A guarda pelo rótulo, e não só pela variável: alguém pode reintroduzir o
   * KPI lendo `previsaoDoDia(bookings)` de novo em vez da variável.
   */
  it('nenhum rótulo "previsto hoje" convive com "Previsão do dia"', () => {
    const texto = semComentarios(fonte).toLowerCase();
    const temKpi = texto.includes("previsto hoje");
    const temLinha = texto.includes("previsão do dia");
    expect(
      temKpi && temLinha,
      'os dois nomes do mesmo número voltaram — ver UI-UX-GUIDELINES §13'
    ).toBe(false);
  });
});

describe("Financeiro — os KPIs não se repetem em prosa", () => {
  const fonte = TELA("financeiro/page.tsx");

  /**
   * O cartão de ponto de equilíbrio fechava com uma frase que reenunciava os
   * quatro `KpiTile` acima dele, na mesma ordem. Quatro números, cada um duas
   * vezes, sem nenhum quinto.
   *
   * Cada um é checado à parte porque a reintrodução realista é parcial — "só
   * uma frase curta dizendo quanto sobrou".
   */
  const uma_vez = [
    ["r.grossRevenue", "formatBRL(r.grossRevenue)"],
    ["totalExpenses", "formatBRL(totalExpenses)"],
    /* Era `{marginPct}%` — a impressão crua, com ponto decimal (A10). A
     * margem passou a sair por `formatPctPtBR`; o que este teste guarda é a
     * repetição em prosa, não a forma de imprimir, então o alvo acompanha a
     * chamada nova. */
    ["marginPct", "formatPctPtBR(marginPct)"],
  ] as const;

  for (const [nome, expressao] of uma_vez) {
    it(`${nome} é impresso uma vez`, () => {
      expect(vezesImpresso(fonte, expressao)).toBe(1);
    });
  }

  /**
   * `operatingResult` tem um limite de DOIS, e não de um, porque a segunda
   * impressão é o cartão de atalho "Quanto sobrou" — que é navegação, não
   * repetição de leitura, e cuja remoção está em `AUDITORIA-DENSIDADE.md` como
   * proposta P-3 esperando decisão do dono.
   *
   * O teto existe para impedir a TERCEIRA, que era a frase.
   */
  it("`operatingResult` não passa de duas impressões", () => {
    expect(vezesImpresso(fonte, "formatBRL(operatingResult)")).toBeLessThanOrEqual(2);
  });
});

describe("Números — o mapa de calor não é lido duas vezes", () => {
  const fonte = TELA("numeros/page.tsx");

  /**
   * `peak.pct` é, por construção, a maior célula da grade que está desenhada
   * logo acima. Imprimi-lo num cartão separado é mostrar o mesmo número duas
   * vezes; imprimi-lo no rodapé da própria grade é explicá-la.
   *
   * A diferença entre as duas coisas é onde o número mora, e é por isso que o
   * teste conta ocorrências em vez de proibir a frase.
   */
  it("pico e brecha aparecem uma vez cada", () => {
    expect(vezesImpresso(fonte, "{peak.pct}%")).toBe(1);
    expect(vezesImpresso(fonte, "idle.pct")).toBe(2); // a condição e o texto
  });

  /**
   * O `Delta` do KPI de no-show já diz a direção contra o período anterior. Se
   * um segundo bloco voltar a dizer "caiu/subiu de X% para Y%", são duas
   * leituras da mesma comparação — ver proposta P-7.
   *
   * Aqui o teste NÃO reprova: a frase existente carrega `noShowCount`,
   * `lateCancelCount` e `totalBookings`, que não estão em nenhum outro lugar do
   * produto. Ela é a razão pela qual P-7 é julgamento e não obviedade.
   */
  it("as contagens de falta continuam na tela — elas não existem em outro lugar", () => {
    const texto = semComentarios(fonte);
    expect(texto).toContain("noShowCount");
    expect(texto).toContain("lateCancelCount");
    expect(texto).toContain("totalBookings");
  });
});

/* ================================================================== */
/* A soma que não fechava — achado da auditoria de densidade          */
/* ================================================================== */

describe("caixaDoDia · os filhos somam o cabeçalho", () => {
  /* A fonte passou de reserva para PAGAMENTO no D2 — o helper acompanhou. O
   * que este bloco guarda continua sendo o mesmo: a soma das parcelas fecha o
   * cabeçalho, e o desconhecido não vira dinheiro. */
  const bk = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id, origin: "servico", clientId: "c1", date: "2026-09-14",
      paymentOrigin: "in_person", paymentMethod: "pix",
      grossAmount: 50, feePct: 0, feeAmount: 0, netAmount: 50,
      ...(over.value !== undefined ? { grossAmount: over.value } : {}),
      ...over,
    }) as unknown as Doc<PaymentDoc>;

  it("atendimento SEM meio informado tem coluna própria", () => {
    /* O defeito: `total` contava todas as recebidas e as três parcelas
     * filtravam por `paymentMethod`. Um atendimento concluído sem informar como
     * o cliente pagou — estado que o servidor grava de propósito — entrava no
     * cabeçalho e em parcela nenhuma. O dono somava as colunas na mão e não
     * chegava no total.
     *
     * Mesma forma do defeito do CMV, e a função irmã `caixaDiario` já tinha
     * sido corrigida na 3.2. */
    const c = caixaDoDia([
      bk("1", { paymentMethod: "pix", value: 100 }),
      bk("2", { paymentMethod: null, value: 60 }),
    ]);

    expect(c.pix).toBe(100);
    expect(c.naoInformado).toBe(60);
    expect(c.pix + c.cartao + c.dinheiro + c.naoInformado).toBe(c.total);
  });

  it("o desconhecido NÃO vira dinheiro", () => {
    /* A coluna dinheiro é a que o dono confere contra a gaveta. Somar ali o que
     * não se sabe ser espécie é a primeira metade da régua sendo violada. */
    const c = caixaDoDia([bk("1", { paymentMethod: null, value: 60 })]);
    expect(c.dinheiro).toBe(0);
    expect(c.naoInformado).toBe(60);
  });

  it("com todos os meios informados, a coluna extra é zero", () => {
    const c = caixaDoDia([
      bk("1", { paymentMethod: "pix", value: 50 }),
      bk("2", { paymentMethod: "credit", value: 30 }),
      bk("3", { paymentMethod: "cash", value: 20 }),
    ]);
    expect(c.naoInformado).toBe(0);
    expect(c.pix + c.cartao + c.dinheiro).toBe(c.total);
  });

  it("dia sem atendimento é zero, não NaN", () => {
    const c = caixaDoDia([]);
    for (const v of Object.values(c)) expect(Number.isNaN(v)).toBe(false);
    expect(c.total).toBe(0);
  });
});
