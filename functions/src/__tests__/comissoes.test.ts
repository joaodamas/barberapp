import { describe, expect, it } from "vitest";
import { comissaoDaVenda, idDaComissao, lucroDaVenda } from "../comissoes";

/**
 * Rodada 3.1 · a comissão de produto vira fato.
 *
 * Era derivada a cada leitura (`analytics.ts:511`), do agregado do mês, com a
 * política de HOJE. Dois defeitos numa linha: relia a política — mudar o split
 * reescrevia o acerto de meses fechados (P1-7) — e era um agregado, não um
 * fato: não existia "a comissão daquela venda".
 */

describe("3.1 · o lucro da linha", () => {
  it("é (preço − custo) × quantidade", () => {
    /* PRD §10: pomada com custo R$ 18 e venda R$ 45 → lucro bruto R$ 27. */
    expect(lucroDaVenda({ unitPrice: 45, unitCost: 18, quantidade: 1 })).toBe(27);
    expect(lucroDaVenda({ unitPrice: 45, unitCost: 18, quantidade: 3 })).toBe(81);
  });

  it("produto vendido ABAIXO do custo não gera lucro negativo", () => {
    /* Promoção ou queima de estoque é decisão comercial do dono. Descontar o
     * prejuízo do barbeiro transformaria a decisão dele em desconto no acerto
     * de outra pessoa. */
    expect(lucroDaVenda({ unitPrice: 10, unitCost: 18, quantidade: 2 })).toBe(0);
  });

  it("arredonda ao centavo", () => {
    expect(lucroDaVenda({ unitPrice: 19.9, unitCost: 12.35, quantidade: 3 })).toBe(22.65);
  });
});

describe("3.1 · a comissão da venda", () => {
  const c = comissaoDaVenda({
    movementId: "mv1",
    staffId: "rafael",
    uid: "uid-rafael",
    staffName: "Rafael",
    unitPrice: 45,
    unitCost: 18,
    quantidade: 1,
    commissionPct: 40,
    date: "2026-09-14",
  })!;

  it("incide sobre o LUCRO, não sobre o faturamento", () => {
    /* Com o CMV zerado por D19, `lucroLoja` era o faturamento inteiro e o dono
     * pagava comissão sobre o custo da mercadoria: 40% de 45 = 18, em vez de
     * 40% de 27 = 10,80. */
    expect(c.commissionBase).toBe(27);
    expect(c.commissionAmount).toBe(10.8);
    expect(c.commissionAmount).not.toBe(18);
  });

  it("guarda a BASE e o PERCENTUAL, não só o resultado", () => {
    /* Com `commissionAmount` sozinho dá para saber quanto foi pago e não como
     * se chegou lá. É a mesma decisão da comissão de serviço. */
    expect(c.commissionPct).toBe(40);
    expect(c.commissionBase).toBe(27);
    expect(c.commissionBase * (c.commissionPct / 100)).toBeCloseTo(c.commissionAmount, 2);
  });

  it("aponta o movimento, e não uma reserva", () => {
    expect(c.movementId).toBe("mv1");
    expect(c.bookingId).toBeUndefined();
    expect(c.origin).toBe("produto");
  });

  it("carrega o uid do barbeiro — ele lê só a própria comissão", () => {
    expect(c.uid).toBe("uid-rafael");
  });

  it("barbeiro sem conta fica com uid nulo, e só o dono vê", () => {
    const semConta = comissaoDaVenda({
      movementId: "mv2",
      staffId: "leo",
      uid: null,
      staffName: "Leo",
      unitPrice: 55,
      unitCost: 22,
      quantidade: 1,
      commissionPct: 50,
      date: "2026-09-14",
    })!;
    expect(semConta.uid).toBeNull();
    expect(semConta.commissionAmount).toBe(16.5);
  });

  it("SEM VENDEDOR não nasce comissão", () => {
    /* Gravar um documento sem dono deixaria um valor a pagar que nenhum acerto
     * alcança, e inventar um barbeiro seria pior. A barbearia fica com o lucro
     * inteiro, e isso é resultado legítimo. */
    const nenhuma = comissaoDaVenda({
      movementId: "mv3",
      staffId: null,
      uid: null,
      staffName: null,
      unitPrice: 45,
      unitCost: 18,
      quantidade: 1,
      commissionPct: 40,
      date: "2026-09-14",
    });
    expect(nenhuma).toBeNull();
  });

  it("percentual zero produz comissão zero, e não o padrão da casa", () => {
    /* Uma barbearia pode combinar 0% de produto com um barbeiro. Um `|| 40` no
     * lugar do valor lido transformaria essa escolha no padrão. */
    const zero = comissaoDaVenda({
      movementId: "mv4",
      staffId: "rafael",
      uid: null,
      staffName: "Rafael",
      unitPrice: 45,
      unitCost: 18,
      quantidade: 1,
      commissionPct: 0,
      date: "2026-09-14",
    })!;
    expect(zero.commissionAmount).toBe(0);
    expect(zero.commissionBase).toBe(27);
  });

  it("venda abaixo do custo não paga comissão", () => {
    const prejuizo = comissaoDaVenda({
      movementId: "mv5",
      staffId: "rafael",
      uid: null,
      staffName: "Rafael",
      unitPrice: 10,
      unitCost: 18,
      quantidade: 1,
      commissionPct: 40,
      date: "2026-09-14",
    })!;
    expect(prejuizo.commissionAmount).toBe(0);
  });
});

describe("3.1 · o id da comissão", () => {
  it("serviço mantém a convenção do Gate A", () => {
    /* `materializeFinancialsOnCompletion` grava assim desde sempre; mudar
     * agora reescreveria a idempotência de todo o histórico. */
    expect(idDaComissao({ origem: "servico", refId: "bk1" })).toBe("comissao_bk1");
  });

  it("produto estende a mesma convenção", () => {
    expect(idDaComissao({ origem: "produto", refId: "mv1" })).toBe("comissao_venda_mv1");
  });

  it("as duas origens não colidem para o mesmo sufixo", () => {
    /* Uma colisão faria a comissão de uma venda sobrescrever a de um
     * atendimento — dinheiro a pagar apagado em silêncio. */
    expect(idDaComissao({ origem: "servico", refId: "x" })).not.toBe(
      idDaComissao({ origem: "produto", refId: "x" })
    );
  });
});
