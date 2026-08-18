import { describe, expect, it } from "vitest";
import {
  direcaoDoTipo,
  documentoDeCaixa,
  idDoLancamento,
  motivoDeCaixaValido,
  ORIGENS_COM_FATO_PROPRIO,
  saldoDeCaixa,
  TIPOS_DE_CAIXA,
  tipoValido,
  valorDeCaixaValido,
} from "../caixa";

/**
 * Rodada 3.1 · D25 — o livro caixa.
 *
 * As quatro invariantes que o item exige: origem obrigatória, valor congelado,
 * idempotência e **exclusividade** — um fato que já tem representação
 * financeira não pode gerar lançamento aqui.
 */

describe("D25 · EXCLUSIVIDADE — o que já tem fato não entra", () => {
  it("nenhum tipo de caixa colide com uma origem que já tem fato próprio", () => {
    /* A invariante mais importante do item. Se `venda` virasse um tipo de
     * caixa, o Fluxo somaria a mesma venda duas vezes: uma pelo `PaymentDoc`,
     * outra pelo lançamento — a duplicidade que a Rodada 3.1 acabou de tirar
     * da receita, reaparecendo do lado do caixa. */
    const colisoes = TIPOS_DE_CAIXA.filter((t) =>
      (ORIGENS_COM_FATO_PROPRIO as readonly string[]).includes(t)
    );
    expect(colisoes).toEqual([]);
  });

  it("os tipos são exatamente os cinco movimentos SEM fato por trás", () => {
    /* Escrito por extenso de propósito: acrescentar um tipo aqui obriga a
     * responder "esse movimento já não tem outro fato?" antes de o teste ficar
     * verde de novo. É a decisão passando pela porta, e não pela janela. */
    expect([...TIPOS_DE_CAIXA].sort()).toEqual([
      "ajuste",
      "aporte",
      "pagamento_comissao",
      "sangria",
      "troco_inicial",
    ]);
  });

  it("recusa qualquer coisa fora do enum", () => {
    expect(tipoValido("venda")).toBe(false);
    expect(tipoValido("despesa")).toBe(false);
    expect(tipoValido("mensalidade")).toBe(false);
    expect(tipoValido("compra")).toBe(false);
    expect(tipoValido("")).toBe(false);
    expect(tipoValido(undefined)).toBe(false);
    expect(tipoValido("sangria")).toBe(true);
  });
});

describe("D25 · a direção vem do TIPO, não da digitação", () => {
  it("sangria e pagamento de comissão SAEM", () => {
    expect(direcaoDoTipo("sangria")).toBe("saida");
    expect(direcaoDoTipo("pagamento_comissao")).toBe("saida");
  });

  it("troco inicial e aporte ENTRAM", () => {
    expect(direcaoDoTipo("troco_inicial")).toBe("entrada");
    expect(direcaoDoTipo("aporte")).toBe("entrada");
  });

  it("só o ajuste aceita as duas direções", () => {
    /* Recontagem pode achar sobra ou falta. Os outros quatro não: uma sangria
     * que ENTRA dinheiro é caixa inventado, e o Fluxo não teria como saber. */
    expect(direcaoDoTipo("ajuste")).toBeNull();
  });

  it("uma sangria NUNCA vira entrada, mesmo pedindo", () => {
    const d = documentoDeCaixa({
      kind: "sangria",
      valor: 200,
      direcao: "entrada",
      date: "2026-09-20",
      reason: "Retirada para o banco",
      paymentMethod: "cash",
    });
    expect(d.direction).toBe("saida");
    expect(d.amount).toBe(-200);
  });

  it("ajuste sem direção é recusado", () => {
    expect(() =>
      documentoDeCaixa({
        kind: "ajuste",
        valor: 10,
        date: "2026-09-20",
        reason: "Recontagem",
        paymentMethod: "cash",
      })
    ).toThrow(/entrou ou saiu/);
  });

  it("ajuste com direção grava o sinal correspondente", () => {
    const sobra = documentoDeCaixa({
      kind: "ajuste",
      valor: 10,
      direcao: "entrada",
      date: "2026-09-20",
      reason: "Sobra na contagem",
      paymentMethod: "cash",
    });
    const falta = documentoDeCaixa({
      kind: "ajuste",
      valor: 10,
      direcao: "saida",
      date: "2026-09-20",
      reason: "Falta na contagem",
      paymentMethod: "cash",
    });
    expect(sobra.amount).toBe(10);
    expect(falta.amount).toBe(-10);
  });
});

describe("D25 · o valor", () => {
  it("é assinado, e a soma dá o saldo sem consultar o tipo", () => {
    /* Uma leitura que precisa de `switch (kind)` para saber o sinal erra no dia
     * em que alguém acrescenta um tipo. O sinal mora no fato. */
    const entradas = [
      documentoDeCaixa({ kind: "troco_inicial", valor: 100, date: "d", reason: "Abertura", paymentMethod: "cash" }),
      documentoDeCaixa({ kind: "sangria", valor: 250, date: "d", reason: "Banco", paymentMethod: "cash" }),
      documentoDeCaixa({ kind: "aporte", valor: 500, date: "d", reason: "Do dono", paymentMethod: "pix" }),
      documentoDeCaixa({ kind: "pagamento_comissao", valor: 180, date: "d", reason: "Acerto do Léo", paymentMethod: "pix", staffId: "leo" }),
    ];
    expect(saldoDeCaixa(entradas)).toBe(170);
  });

  it("o dono nunca digita sinal — negativo pedido vira o sinal do tipo", () => {
    const d = documentoDeCaixa({
      kind: "aporte",
      valor: -500,
      date: "d",
      reason: "Do dono",
      paymentMethod: "pix",
    });
    expect(d.amount).toBe(500);
  });

  it("arredonda ao centavo", () => {
    const d = documentoDeCaixa({
      kind: "sangria",
      valor: 33.333,
      date: "d",
      reason: "Retirada",
      paymentMethod: "cash",
    });
    expect(d.amount).toBe(-33.33);
  });

  it("recusa zero, negativo e string coagível", () => {
    /* `Number("3e4")` é 30000, e aqui SAI dinheiro do caixa. */
    expect(valorDeCaixaValido(0)).toBe(false);
    expect(valorDeCaixaValido(-1)).toBe(false);
    expect(valorDeCaixaValido("3e4")).toBe(false);
    expect(valorDeCaixaValido("200")).toBe(false);
    expect(valorDeCaixaValido(NaN)).toBe(false);
    expect(valorDeCaixaValido(Infinity)).toBe(false);
    expect(valorDeCaixaValido(200)).toBe(true);
  });

  it("saldo de caixa vazio é zero, não NaN", () => {
    expect(saldoDeCaixa([])).toBe(0);
  });
});

describe("D25 · ORIGEM obrigatória", () => {
  it("exige um motivo de verdade", () => {
    /* Um lançamento sem motivo diz quanto e não o quê. Três meses depois, a
     * pergunta do dono sobre uma sangria de R$ 800 não é o valor. */
    expect(motivoDeCaixaValido("Retirada para depósito")).toBe(true);
    expect(motivoDeCaixaValido("")).toBe(false);
    expect(motivoDeCaixaValido("   ")).toBe(false);
    expect(motivoDeCaixaValido("ab")).toBe(false);
    expect(motivoDeCaixaValido(undefined)).toBe(false);
  });

  it("guarda o motivo sem espaço sobrando", () => {
    const d = documentoDeCaixa({
      kind: "sangria",
      valor: 100,
      date: "d",
      reason: "  Depósito no banco  ",
      paymentMethod: "cash",
    });
    expect(d.reason).toBe("Depósito no banco");
  });

  it("preserva o meio pelo qual o dinheiro se moveu (N12)", () => {
    /* Sangria é espécie; aporte pode ser Pix. Sem o meio, o caixa por
     * instrumento não fecha — que é o D4 do lado das entradas. */
    const d = documentoDeCaixa({
      kind: "aporte",
      valor: 1000,
      date: "d",
      reason: "Capital de giro",
      paymentMethod: "pix",
    });
    expect(d.paymentMethod).toBe("pix");
  });
});

describe("D25 · o beneficiário", () => {
  it("pagamento de comissão guarda de quem é", () => {
    const d = documentoDeCaixa({
      kind: "pagamento_comissao",
      valor: 180,
      date: "d",
      reason: "Acerto de setembro",
      paymentMethod: "pix",
      staffId: "leo",
    });
    expect(d.staffId).toBe("leo");
    expect(d.direction).toBe("saida");
  });

  it("os outros tipos NÃO carregam beneficiário, mesmo se mandarem", () => {
    /* `staffId` numa sangria sugeriria que aquele dinheiro é do barbeiro. */
    const d = documentoDeCaixa({
      kind: "sangria",
      valor: 200,
      date: "d",
      reason: "Banco",
      paymentMethod: "cash",
      staffId: "leo",
    });
    expect(d.staffId).toBeNull();
  });
});

describe("D25 · IDEMPOTÊNCIA", () => {
  it("o id deriva da chave", () => {
    expect(idDoLancamento("k1")).toBe("caixa_k1");
  });

  it("chaves diferentes são lançamentos diferentes", () => {
    /* Duas sangrias de R$ 200 no mesmo dia acontecem, e precisam de dois
     * documentos. Derivar do valor ou da data fundiria as duas. */
    expect(idDoLancamento("k1")).not.toBe(idDoLancamento("k2"));
  });

  it("a mesma chave produz sempre o mesmo id", () => {
    expect(idDoLancamento("abc")).toBe(idDoLancamento("abc"));
  });
});
