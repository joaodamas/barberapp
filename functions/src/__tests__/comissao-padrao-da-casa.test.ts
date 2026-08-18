import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calcularEventoFinanceiro,
  padraoDaCasa,
  percentualDaComissao,
  politicasIniciais,
  PADRAO_COMISSAO_BARBEIRO,
  SEM_TAXA,
} from "../financial-events";

/**
 * D1 · o padrão da casa é UM número, e é o mesmo dos dois lados.
 *
 * O defeito que estes testes fecham não era de cálculo: eram duas leituras da
 * mesma regra discordando. O web caía em 40% quando a barbearia não tinha
 * `policies` (`PLATFORM_DEFAULT_POLICIES`), o servidor caía em ZERO, e nenhuma
 * tela gravava o campo — então o caso "sem `policies`" era o de TODA barbearia
 * criada pelo produto.
 *
 * A verificação de 18/08 mediu o resultado: dois atendimentos de R$ 50,00
 * concluídos pela interface gravaram `commissionPct: 0` e `commissionAmount: 0`
 * enquanto a tela de Equipe, no mesmo minuto, prometia "o padrão da barbearia
 * (40%)".
 *
 * Nenhum teste apontava para lá — por isso o defeito sobreviveu a 390 testes
 * verdes.
 */

describe("D1 · o padrão da casa quando a barbearia não tem `policies`", () => {
  it("barbearia SEM `policies` usa o padrão da casa, não zero", () => {
    /* O defeito literal. Era `Number(policies.commissionSplit?.barberPct) || 0`
     * — e `undefined` virava 0 sem distinção nenhuma de um zero escolhido. */
    expect(padraoDaCasa(undefined)).toBe(40);
    expect(padraoDaCasa({})).toBe(40);
    expect(padraoDaCasa({ commissionSplit: {} })).toBe(40);
  });

  it("AUSENTE e ZERO deixam de ser a mesma coisa", () => {
    /* `business-rules.ts` já declarava a regra do outro lado — "`??` e não
     * `||`: 0% de comissão é escolha legítima, não campo vazio". O servidor não
     * a seguia, e era exatamente aí que o defeito morava. */
    expect(padraoDaCasa({ commissionSplit: { barberPct: 0 } })).toBe(0);
    expect(padraoDaCasa({ commissionSplit: {} })).toBe(40);
    expect(padraoDaCasa({ commissionSplit: { barberPct: 0 } })).not.toBe(
      padraoDaCasa({ commissionSplit: {} })
    );
  });

  it("a barbearia que combinou outro rateio manda sobre o padrão", () => {
    expect(padraoDaCasa({ commissionSplit: { barberPct: 50 } })).toBe(50);
    expect(padraoDaCasa({ commissionSplit: { barberPct: 100 } })).toBe(100);
  });

  it("valor impossível cai no padrão em vez de virar histórico congelado", () => {
    /* O fato nasce imutável: um `barberPct` de 150 gravado por engano pagaria
     * mais do que o atendimento custou e ficaria assim para sempre. */
    for (const ruim of [150, -10, Number.NaN, "abc", {}]) {
      expect(padraoDaCasa({ commissionSplit: { barberPct: ruim } }), String(ruim)).toBe(40);
    }
  });
});

describe("D1 · o percentual de quem atendeu", () => {
  it("o percentual individual vence o padrão da casa", () => {
    expect(percentualDaComissao({ doProfissional: 50, padrao: 40 })).toBe(50);
  });

  it("em branco usa o padrão da barbearia — que é o que a tela de Equipe promete", () => {
    expect(percentualDaComissao({ doProfissional: null, padrao: 40 })).toBe(40);
    expect(percentualDaComissao({ doProfissional: undefined, padrao: 40 })).toBe(40);
  });

  it("barbeiro com ZERO próprio continua em zero — é escolha, não campo vazio", () => {
    expect(percentualDaComissao({ doProfissional: 0, padrao: 40 })).toBe(0);
  });
});

describe("D1 · serviço e produto leem a MESMA fonte", () => {
  it("a mesma entrada produz o mesmo percentual nos dois caminhos", () => {
    /* A regra estava escrita duas vezes — aqui e em `inventory.ts` — e as duas
     * cópias carregavam o mesmo defeito. `inventory.ts` passou a chamar estas
     * mesmas funções; o que este teste fixa é o contrato que as une. */
    const politicas = { commissionSplit: {} };
    const padrao = padraoDaCasa(politicas);

    const servico = calcularEventoFinanceiro({
      valor: 50,
      metodo: "pix",
      commissionPctDoBarbeiro: null,
      padraoPct: padrao,
      fees: SEM_TAXA,
    }).commission.commissionPct;

    const produto = percentualDaComissao({ doProfissional: null, padrao });

    expect(servico).toBe(produto);
    expect(servico).toBe(40);
  });
});

describe("D1 · o atendimento de 18/08, refeito", () => {
  it("corte de R$ 50,00 em barbearia sem `policies` paga R$ 20,00, e não R$ 0,00", () => {
    /* O documento gravado naquele dia foi
     * `{commissionPct: "0", commissionBase: "50", commissionAmount: "0"}`. */
    const r = calcularEventoFinanceiro({
      valor: 50,
      metodo: "cash",
      commissionPctDoBarbeiro: null,
      padraoPct: padraoDaCasa({}),
      fees: SEM_TAXA,
    });

    expect(r.commission).toEqual({
      commissionPct: 40,
      commissionBase: 50,
      commissionAmount: 20,
    });
    expect(r.commission.commissionAmount).not.toBe(0);
  });
});

describe("D1 · a barbearia nova nasce com o campo gravado", () => {
  it("`politicasIniciais` grava o padrão explicitamente", () => {
    /* Deixar o campo faltar é o que criou o defeito: "quando o campo falta, o
     * leitor do servidor precisa adivinhar" já estava escrito no `features`, no
     * mesmo `tx.set`, três linhas acima do `policies` que não existia. */
    expect(politicasIniciais().commissionSplit.barberPct).toBe(PADRAO_COMISSAO_BARBEIRO);
  });

  it("o rateio gravado fecha em 100%", () => {
    const { barberPct, shopPct } = politicasIniciais().commissionSplit;
    expect(barberPct + shopPct).toBe(100);
  });

  it("uma barbearia provisionada hoje não depende mais do fallback", () => {
    /* A prova de que o provisionamento resolve o caso na origem: com o campo
     * gravado, o leitor não precisa do padrão para acertar. */
    expect(padraoDaCasa(politicasIniciais())).toBe(PADRAO_COMISSAO_BARBEIRO);
  });
});

/* ================================================================== */
/* A prova estrutural: TODO caminho de criação grava `policies`        */
/* ================================================================== */

/**
 * Mesma forma da varredura de `origin` em `financial-events.test.ts`, e pela
 * mesma razão: o defeito não foi um caminho errado, foi um caminho ESQUECIDO.
 * `features` foi corrigido e `policies` ficou — no mesmo `tx.set`, três linhas
 * abaixo. Um teste que olha só para os dois arquivos de hoje não impede o
 * terceiro caminho de criação de nascer com o mesmo buraco.
 */
const SRC = resolve(__dirname, "..");

function arquivosQueCriamBarbearia() {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => /db\.collection\("barbershops"\)\.doc\(\)/.test(readFileSync(resolve(SRC, f), "utf8")));
}

describe("D1 · nenhum caminho de criação pode esquecer `policies`", () => {
  it("encontra os arquivos que criam barbearia", () => {
    /* Sem isto, o teste abaixo passaria sobre conjunto vazio — que é como um
     * teste de varredura mente. */
    const arquivos = arquivosQueCriamBarbearia();
    expect(arquivos).toContain("signup.ts");
    expect(arquivos).toContain("provisioning.ts");
  });

  it("cada um grava `policies` explicitamente, como já gravava `features`", () => {
    for (const arquivo of arquivosQueCriamBarbearia()) {
      const texto = readFileSync(resolve(SRC, arquivo), "utf8");
      expect(
        /policies:\s*politicasIniciais\(\)/.test(texto),
        `${arquivo} cria barbearia sem gravar policies — o gatilho financeiro vai adivinhar`
      ).toBe(true);
    }
  });
});
