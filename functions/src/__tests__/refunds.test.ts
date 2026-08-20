import { describe, expect, it } from "vitest";
import {
  documentoDeEstorno,
  idDoEstorno,
  motivoValido,
  quantidadeEstornavel,
  valorEstornavel,
} from "../refunds";
import { estornoDaComissao, comissaoDaVenda, idDoEstornoDaComissao } from "../comissoes";

/**
 * Rodada 3.1 · D22 / D23 — o estorno vira fato.
 *
 * A régua: corrigir histórico é SOMAR fatos, nunca apagar. O pagamento
 * original fica, o movimento de venda fica, a fatura paga continua paga.
 */

describe("3.1 · o id do estorno", () => {
  it("deriva do fato e da chave", () => {
    expect(idDoEstorno({ origem: "servico", bookingId: "bk1" }, "k1")).toBe("estorno_bk1_k1");
    expect(idDoEstorno({ origem: "produto", movementId: "mv1" }, "k1")).toBe(
      "estorno_venda_mv1_k1"
    );
    expect(idDoEstorno({ origem: "mensalidade", invoiceId: "f1" }, "k1")).toBe(
      "estorno_fatura_f1_k1"
    );
  });

  it("depende da CHAVE, porque um fato aceita mais de um estorno parcial", () => {
    /* Se o id derivasse só do fato, o segundo estorno de uma unidade
     * sobrescreveria o primeiro — e o dono teria devolvido duas unidades com
     * uma linha só no histórico. */
    const a = idDoEstorno({ origem: "produto", movementId: "mv1" }, "k1");
    const b = idDoEstorno({ origem: "produto", movementId: "mv1" }, "k2");
    expect(a).not.toBe(b);
  });

  it("as três origens não colidem para o mesmo sufixo", () => {
    const ids = new Set([
      idDoEstorno({ origem: "servico", bookingId: "x" }, "k"),
      idDoEstorno({ origem: "produto", movementId: "x" }, "k"),
      idDoEstorno({ origem: "mensalidade", invoiceId: "x" }, "k"),
    ]);
    expect(ids.size).toBe(3);
  });
});

describe("3.1 · quanto ainda pode voltar", () => {
  it("sem pedido, devolve o que restar", () => {
    expect(valorEstornavel({ pago: 45, jaEstornado: 0, pedido: null })).toEqual({
      ok: true,
      valor: 45,
      restaDepois: 0,
      parcial: false,
    });
  });

  it("estorno total DEPOIS de um parcial devolve só o saldo", () => {
    /* O caminho "devolver tudo" não pode ser escrito como `pedido = pago`: com
     * R$ 15 já devolvidos, isso devolveria R$ 45 de novo e a barbearia pagaria
     * R$ 60 por uma venda de R$ 45. */
    const r = valorEstornavel({ pago: 45, jaEstornado: 15, pedido: null });
    expect(r).toEqual({ ok: true, valor: 30, restaDepois: 0, parcial: true });
  });

  it("NÃO deixa devolver mais do que entrou", () => {
    expect(valorEstornavel({ pago: 45, jaEstornado: 0, pedido: 46 })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });

  it("NÃO deixa devolver mais do que o saldo remanescente", () => {
    expect(valorEstornavel({ pago: 45, jaEstornado: 30, pedido: 20 })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });

  it("recusa quando já foi tudo devolvido", () => {
    expect(valorEstornavel({ pago: 45, jaEstornado: 45, pedido: null })).toEqual({
      ok: false,
      motivo: "sem_saldo",
    });
  });

  it("recusa zero e negativo", () => {
    expect(valorEstornavel({ pago: 45, jaEstornado: 0, pedido: 0 }).ok).toBe(false);
    expect(valorEstornavel({ pago: 45, jaEstornado: 0, pedido: -10 }).ok).toBe(false);
  });

  it("recusa string coagível — aqui sai dinheiro", () => {
    /* Mesmo cuidado de `quantidadeValida`: `Number("4e2")` é 400, e um campo
     * com lixo viraria um estorno de R$ 400 sobre uma venda de R$ 45. */
    const r = valorEstornavel({
      pago: 45,
      jaEstornado: 0,
      pedido: "4e2" as unknown as number,
    });
    expect(r).toEqual({ ok: false, motivo: "invalido" });
  });

  it("um pagamento de zero não é estornável", () => {
    expect(valorEstornavel({ pago: 0, jaEstornado: 0, pedido: null })).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });

  it("marca como parcial quando sobra saldo", () => {
    const r = valorEstornavel({ pago: 45, jaEstornado: 0, pedido: 15 });
    expect(r).toEqual({ ok: true, valor: 15, restaDepois: 30, parcial: true });
  });

  it("arredonda ao centavo, não ao real", () => {
    const r = valorEstornavel({ pago: 43.43, jaEstornado: 0, pedido: 21.715 });
    expect(r.ok && r.valor).toBe(21.72);
  });
});

describe("3.1 · quantas unidades podem voltar", () => {
  it("sem pedido, devolve todas as que restam", () => {
    expect(quantidadeEstornavel({ vendida: 3, jaDevolvida: 1, pedida: null })).toEqual({
      ok: true,
      quantidade: 2,
      restaDepois: 0,
    });
  });

  it("NÃO deixa devolver mais unidades do que foram vendidas", () => {
    expect(quantidadeEstornavel({ vendida: 2, jaDevolvida: 0, pedida: 3 })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });

  it("NÃO deixa a soma dos parciais passar do vendido", () => {
    /* Duas devoluções de 2 numa venda de 3 criariam estoque do nada. */
    expect(quantidadeEstornavel({ vendida: 3, jaDevolvida: 2, pedida: 2 })).toEqual({
      ok: false,
      motivo: "excede",
    });
  });

  it("recusa fração — estoque é contado em unidades", () => {
    expect(quantidadeEstornavel({ vendida: 3, jaDevolvida: 0, pedida: 1.5 })).toEqual({
      ok: false,
      motivo: "invalido",
    });
  });

  it("recusa quando tudo já voltou", () => {
    expect(quantidadeEstornavel({ vendida: 2, jaDevolvida: 2, pedida: null })).toEqual({
      ok: false,
      motivo: "sem_saldo",
    });
  });
});

describe("3.1 · o documento do estorno", () => {
  const doc = documentoDeEstorno({
    ref: { origem: "produto", movementId: "mv1" },
    paymentId: "pagamento_venda_mv1",
    clientId: "c1",
    date: "2026-09-20",
    originalDate: "2026-09-14",
    reason: "Cliente devolveu o produto lacrado",
    metodo: "credit",
    valor: 45,
    parcial: false,
    quantidade: 1,
  });

  it("aponta o PAGAMENTO original, não só o fato", () => {
    /* Quem lê o estorno precisa achar o pagamento sem reimplementar
     * `idDoPagamento` — e a Rodada 3.2 precisa disso para não contar como
     * receita o que já foi devolvido. */
    expect(doc.paymentId).toBe("pagamento_venda_mv1");
    expect(doc.movementId).toBe("mv1");
    expect(doc.origin).toBe("produto");
  });

  it("guarda as DUAS datas — a do estorno e a do fato original", () => {
    /* Competência usa uma, caixa usa a outra. Guardar só uma obrigaria a
     * Rodada 3.2 a adivinhar a que falta. */
    expect(doc.date).toBe("2026-09-20");
    expect(doc.originalDate).toBe("2026-09-14");
  });

  it("NÃO recobra a taxa — e a perda aparece sozinha na soma", () => {
    /* Pagamento no crédito: bruto 45, taxa 1,57, líquido 43,43 entrou.
     * Estorno devolve o bruto. O saldo do par é −1,57, que é exatamente a taxa
     * que a maquininha reteve e não devolveu. Nenhuma fórmula precisa saber
     * que houve estorno para chegar nesse número. */
    expect(doc.feeAmount).toBe(0);
    expect(doc.netAmount).toBe(45);

    const entrou = 43.43;
    const saiu = doc.netAmount;
    expect(Math.round((entrou - saiu) * 100) / 100).toBe(-1.57);
  });

  it("preserva o meio de pagamento da entrada (N12)", () => {
    expect(doc.paymentMethod).toBe("credit");
  });

  it("carrega o motivo", () => {
    expect(doc.reason).toBe("Cliente devolveu o produto lacrado");
  });

  it("só tem `quantity` quando é produto", () => {
    const servico = documentoDeEstorno({
      ref: { origem: "servico", bookingId: "bk1" },
      paymentId: "pagamento_bk1",
      clientId: null,
      date: "2026-09-20",
      originalDate: "2026-09-20",
      reason: "Cliente reclamou do corte",
      metodo: "pix",
      valor: 50,
      parcial: false,
    });
    expect(servico.quantity).toBeUndefined();
    expect("quantity" in servico).toBe(false);
  });
});

describe("3.1 · o motivo é obrigatório", () => {
  it("aceita um motivo real", () => {
    expect(motivoValido("Produto com defeito")).toBe(true);
  });

  it("recusa vazio, espaço e quase-vazio", () => {
    /* Um estorno sem motivo registra que o dinheiro voltou e não por quê — que
     * é a pergunta que o dono faz três meses depois. */
    expect(motivoValido("")).toBe(false);
    expect(motivoValido("   ")).toBe(false);
    expect(motivoValido("ab")).toBe(false);
    expect(motivoValido(undefined)).toBe(false);
    expect(motivoValido(42)).toBe(false);
  });
});

describe("3.1 · a comissão devolvida", () => {
  const venda = comissaoDaVenda({
    movementId: "mv1",
    staffId: "leo",
    uid: null,
    staffName: "Léo",
    unitPrice: 55,
    unitCost: 22,
    quantidade: 3,
    commissionPct: 50,
    date: "2026-09-14",
  })!;

  it("estorno TOTAL zera o acerto somando, não apagando", () => {
    const volta = estornoDaComissao({
      movementId: "mv1",
      chave: "k1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 55,
      unitCost: 22,
      quantidade: 3,
      commissionPct: venda.commissionPct,
      date: "2026-09-20",
    });

    expect(volta.commissionAmount).toBe(-venda.commissionAmount);
    expect(venda.commissionAmount + volta.commissionAmount).toBe(0);
    /* As duas linhas coexistem: o histórico continua respondendo por que o Léo
     * recebeu menos do que a lista de vendas dele mostra. */
    expect(idDoEstornoDaComissao("mv1", "k1")).not.toBe("comissao_venda_mv1");
  });

  it("estorno PARCIAL reverte só a parte devolvida", () => {
    /* Negar `commissionAmount` devolveria a comissão inteira por uma unidade de
     * três — o barbeiro pagaria por um estorno que não aconteceu. */
    const volta = estornoDaComissao({
      movementId: "mv1",
      chave: "k1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 55,
      unitCost: 22,
      quantidade: 1,
      commissionPct: 50,
      date: "2026-09-20",
    });

    expect(volta.commissionBase).toBe(-33);
    expect(volta.commissionAmount).toBe(-16.5);
    expect(venda.commissionAmount + volta.commissionAmount).toBe(33);
  });

  it("usa o percentual CONGELADO, não o cadastro de hoje", () => {
    /* Se o Léo passou de 50% para 30% entre a venda e o estorno, reverter a 30%
     * deixaria saldo a pagar de uma venda que não existe. É o P1-7 tentando
     * entrar pela porta de saída. */
    const aTrinta = estornoDaComissao({
      movementId: "mv1",
      chave: "k1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 55,
      unitCost: 22,
      quantidade: 3,
      commissionPct: 30,
      date: "2026-09-20",
    });
    expect(venda.commissionAmount + aTrinta.commissionAmount).not.toBe(0);
    expect(venda.commissionAmount + aTrinta.commissionAmount).toBe(19.8);
  });

  it("aponta a venda original, e o id não colide com a comissão dela", () => {
    const volta = estornoDaComissao({
      movementId: "mv1",
      chave: "k1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 55,
      unitCost: 22,
      quantidade: 1,
      commissionPct: 50,
      date: "2026-09-20",
    });
    expect(volta.movementId).toBe("mv1");
    expect(volta.origin).toBe("produto");
    expect(idDoEstornoDaComissao("mv1", "k1")).toBe("comissao_estorno_venda_mv1_k1");
  });

  it("dois estornos parciais não colidem entre si", () => {
    expect(idDoEstornoDaComissao("mv1", "k1")).not.toBe(idDoEstornoDaComissao("mv1", "k2"));
  });
});
