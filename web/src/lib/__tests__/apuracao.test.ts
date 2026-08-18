import { describe, expect, it } from "vitest";
import {
  apuracaoDe,
  FONTES_DA_GRANDEZA,
  NAO_APURADO,
  porQueNaoApurou,
  type FonteFinanceira,
  type Grandeza,
} from "@/lib/apuracao";

/**
 * A regra que o DRE violou: falha de leitura não vira zero — e não derruba o
 * que não depende dela.
 *
 * O defeito medido: com `expenses` ilegível a tela exibiu `RESULTADO DO MÊS
 * + R$ 30,39` onde a base legível dava −R$ 769,61, e `CUSTO FIXO TOTAL
 * R$ 0,00` sob a legenda "aluguel, contas e o que não varia com o movimento".
 * Diferença exata: R$ 800,00, o aluguel que não pôde ser lido.
 *
 * Os testes abaixo cobrem as DUAS metades da regra. A primeira é a óbvia — o
 * número some. A segunda é a que dá valor à primeira e é a mais fácil de
 * quebrar sem perceber: os números que NÃO dependem da coleção caída
 * continuam na tela. Suprimir tudo trocaria um número falso por nenhuma
 * informação, e a receita do mês continua sendo fato quando o que falhou foi
 * a despesa.
 */

const TODAS = Object.keys(FONTES_DA_GRANDEZA) as Grandeza[];

describe("ausência de falso zero", () => {
  it("sem falha nenhuma, todo número é apurado", () => {
    const a = apuracaoDe([]);
    for (const g of TODAS) {
      expect(a.ok(g), g).toBe(true);
      expect(a.faltando(g), g).toEqual([]);
    }
  });

  it("a fonte caída suprime o número em vez de devolver zero", () => {
    const a = apuracaoDe(["expenses"]);
    // É este o ponto: o valor formatado NÃO chega à tela.
    expect(a.valor("custoFixo", "R$ 0,00")).toBe(NAO_APURADO);
    expect(a.valor("resultado", "R$ 30,39")).toBe(NAO_APURADO);
    expect(a.valor("despesasFixas", "R$ 0,00")).toBe(NAO_APURADO);
  });

  it("nenhuma grandeza suprimida devolve algo que se leia como número", () => {
    // "—", "0", "R$ 0,00" e "" são todos legíveis como "não houve". O
    // marcador precisa ser uma AFIRMAÇÃO de que não se sabe.
    const a = apuracaoDe(["expenses", "payments", "bookings"]);
    for (const g of TODAS) {
      if (a.ok(g)) continue;
      const v = a.valor(g, "R$ 0,00");
      expect(v, g).toBe(NAO_APURADO);
      expect(v, g).not.toMatch(/^[\s—–-]*$/);
      expect(v, g).not.toMatch(/\d/);
    }
  });

  it("a legenda que nomeava o fato não lido é trocada pelo motivo", () => {
    // A legenda "aluguel, contas e o que não varia com o movimento" era a
    // parte mais convincente do R$ 0,00: ela nomeava exatamente o que não
    // tinha sido lido.
    const a = apuracaoDe(["expenses"]);
    const original = "aluguel, contas e o que não varia com o movimento";
    expect(a.legenda("custoFixo", original)).not.toBe(original);
    expect(a.legenda("custoFixo", original)).toBe("não foi possível ler as despesas");
  });

  it("o tom cai para neutro — verde afirmaria um sinal que ninguém calculou", () => {
    const a = apuracaoDe(["expenses"]);
    expect(a.tom("resultado", "success")).toBe("neutral");
    expect(a.tom("resultado", "danger")).toBe("neutral");
    // E permanece o tom real quando o número existe.
    expect(a.tom("receitaRealizada", "success")).toBe("success");
  });
});

describe("independência entre métricas", () => {
  /**
   * O caso medido, invertido: `expenses` cai e o DRE precisa continuar
   * afirmando tudo que não vem de `expenses`.
   */
  it("expenses ilegível não derruba receita, CMV, comissão nem taxa", () => {
    const a = apuracaoDe(["expenses"]);

    expect(a.ok("receitaRealizada")).toBe(true);
    expect(a.ok("cmv")).toBe(true);
    expect(a.ok("comissoes")).toBe(true);
    expect(a.ok("taxasDeGateway")).toBe(true);
    expect(a.ok("custoVariavel")).toBe(true);
    expect(a.ok("margemDeContribuicao")).toBe(true);
    expect(a.ok("receitaContratada")).toBe(true);

    // E derruba exatamente os que dependem dela.
    expect(a.ok("custoFixo")).toBe(false);
    expect(a.ok("despesasFixas")).toBe(false);
    expect(a.ok("resultado")).toBe(false);
    expect(a.ok("projecao")).toBe(false);
  });

  it("movements ilegível não derruba a despesa fixa", () => {
    // O sentido contrário do mesmo contrato: quem cai é o estoque, e o
    // aluguel continua sendo fato conhecido.
    const a = apuracaoDe(["movements"]);
    expect(a.ok("despesasFixas")).toBe(true);
    expect(a.ok("cmv")).toBe(false);
  });

  it("cada grandeza só é derrubada por fonte que ela declara", () => {
    // A prova geral, para as 25+ grandezas de uma vez: derrubar UMA coleção
    // não pode apagar nenhum número que não a liste.
    const fontes = [
      ...new Set(Object.values(FONTES_DA_GRANDEZA).flat()),
    ] as FonteFinanceira[];

    for (const f of fontes) {
      const a = apuracaoDe([f]);
      for (const g of TODAS) {
        const dependeDela = (FONTES_DA_GRANDEZA[g] as readonly FonteFinanceira[]).includes(f);
        expect(a.ok(g), `${g} × ${f}`).toBe(!dependeDela);
      }
    }
  });

  it("duas fontes caídas somam supressões, sem derrubar as demais", () => {
    const a = apuracaoDe(["expenses", "movements"]);
    expect(a.ok("cmv")).toBe(false);
    expect(a.ok("custoFixo")).toBe(false);
    // `taxaDeFalta` sai só de `bookings` e sobrevive às duas.
    expect(a.ok("taxaDeFalta")).toBe(true);
  });
});

describe("o motivo, em linguagem de dono", () => {
  it("nomeia a coleção, e não 'um erro'", () => {
    // "não foi possível ler as despesas" diz ao dono que o aluguel dele ficou
    // de fora. "Erro ao calcular" não diz.
    expect(porQueNaoApurou(["expenses"])).toBe("não foi possível ler as despesas");
  });

  it("liga a última com 'e', nunca com vírgula", () => {
    expect(porQueNaoApurou(["expenses", "payments"])).toBe(
      "não foi possível ler as despesas e os pagamentos"
    );
    expect(porQueNaoApurou(["expenses", "payments", "bookings"])).toBe(
      "não foi possível ler as despesas, os pagamentos e os atendimentos"
    );
  });

  it("sem falha, não há frase", () => {
    expect(porQueNaoApurou([])).toBe("");
  });
});

describe("o mapa de fontes", () => {
  it("toda grandeza declara pelo menos uma fonte", () => {
    // Uma lista vazia significaria "nunca some", que é o defeito original
    // escrito como declaração.
    for (const g of TODAS) {
      expect(FONTES_DA_GRANDEZA[g].length, g).toBeGreaterThan(0);
    }
  });

  it("resultado depende de tudo que o compõe", () => {
    // O resultado é a soma de todas as pernas; se ele deixasse de declarar
    // uma, voltaria a ser afirmado sobre uma coleção não lida.
    const r = FONTES_DA_GRANDEZA.resultado as readonly FonteFinanceira[];
    for (const f of [
      ...FONTES_DA_GRANDEZA.receitaRealizada,
      ...FONTES_DA_GRANDEZA.custoVariavel,
      ...FONTES_DA_GRANDEZA.custoFixo,
    ] as FonteFinanceira[]) {
      expect(r, f).toContain(f);
    }
  });
});
