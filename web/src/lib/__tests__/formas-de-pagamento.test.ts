import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  formasAtivas,
  formasDoTenant,
  idDaForma,
  taxaDoPagamento,
  taxasEmBranco,
  type FormaDePagamento,
} from "@/lib/formas-de-pagamento";

/**
 * As formas de recebimento — e a taxa que cada uma cobra.
 *
 * > *"como também posso colocar mais taxa? Porque eu coloquei aqui a taxa de
 * > aproximação. Mas não coloquei a taxa de maquininha quando insere o cartão"*
 *
 * O que estes testes guardam é o que não se vê na tela: a barbearia que **não**
 * cadastrou formas precisa continuar exatamente como estava, e o pagamento que
 * não trouxe forma nenhuma não pode cair em taxa zero — porque zero, aqui, é o
 * DRE afirmando que a maquininha não cobrou.
 */

const FEES_LEGADO = { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 };

const DO_SIQUEIRA: FormaDePagamento[] = [
  { id: "pix", label: "Pix", base: "pix", feePct: 0, active: true },
  { id: "cash", label: "Dinheiro", base: "cash", feePct: 0, active: true },
  { id: "debit", label: "Débito", base: "debit", feePct: 1.99, active: true },
  { id: "credit", label: "Crédito aproximação", base: "credit", feePct: 3.49, active: true },
  { id: "credito-inserido", label: "Crédito inserido", base: "credit", feePct: 4.19, active: true },
];

describe("formasDoTenant · a barbearia que nunca abriu a tela", () => {
  it("deriva as quatro nativas das taxas antigas, com os mesmos percentuais", () => {
    const formas = formasDoTenant({ paymentFees: FEES_LEGADO });
    expect(formas.map((f) => f.id)).toEqual(["pix", "cash", "debit", "credit"]);
    expect(formas.find((f) => f.id === "credit")?.feePct).toBe(3.49);
    expect(formas.every((f) => f.active)).toBe(true);
  });

  it("sem política nenhuma, devolve as quatro a zero — não uma lista vazia", () => {
    /* Lista vazia significaria "esta barbearia não recebe de jeito nenhum", e o
     * modal de conclusão ficaria sem um único botão. */
    const formas = formasDoTenant({});
    expect(formas).toHaveLength(4);
    expect(formas.every((f) => f.feePct === 0)).toBe(true);
  });

  it("lista cadastrada vence as taxas antigas", () => {
    const formas = formasDoTenant({ paymentFees: FEES_LEGADO, paymentForms: DO_SIQUEIRA });
    expect(formas).toHaveLength(5);
    expect(formas.find((f) => f.id === "credit")?.label).toBe("Crédito aproximação");
  });

  it("descarta entrada corrompida sem derrubar a lista", () => {
    const formas = formasDoTenant({
      paymentFees: FEES_LEGADO,
      paymentForms: [
        { id: "", label: "Sem id", base: "credit", feePct: 3 },
        { id: "sem-base", label: "Sem natureza", feePct: 3 },
        { id: "credit", label: "Crédito", base: "credit", feePct: "3,49" },
        { id: "absurda", label: "Absurda", base: "credit", feePct: 900 },
      ],
    });
    expect(formas.map((f) => f.id)).toEqual(["credit", "absurda"]);
    /* Texto vira zero em vez de `NaN`: um `NaN` no percentual contamina
     * `feeAmount` e `netAmount`, e o pagamento nasce sem valor líquido. */
    expect(formas[0].feePct).toBe(0);
    /* Teto de 100: taxa maior que o bruto faria o líquido nascer negativo. */
    expect(formas[1].feePct).toBe(100);
  });

  it("lista cadastrada só com lixo cai nas nativas, não em nada", () => {
    const formas = formasDoTenant({
      paymentFees: FEES_LEGADO,
      paymentForms: [{ label: "só rótulo" }],
    });
    expect(formas).toHaveLength(4);
  });
});

describe("formasAtivas", () => {
  it("esconde do balcão o que o dono desativou, sem apagar", () => {
    const formas = formasAtivas({
      paymentForms: [...DO_SIQUEIRA.slice(0, 4), { ...DO_SIQUEIRA[4], active: false }],
    });
    expect(formas.map((f) => f.id)).not.toContain("credito-inserido");
    expect(formas).toHaveLength(4);
  });
});

describe("taxaDoPagamento · a régua que decide quanto a maquininha cobrou", () => {
  it("a forma escolhida manda", () => {
    const r = taxaDoPagamento({ formaId: "credito-inserido", meio: "credit", formas: DO_SIQUEIRA });
    expect(r.feePct).toBe(4.19);
    expect(r.forma?.label).toBe("Crédito inserido");
  });

  it("sem forma informada, cai na primeira ativa daquele meio — nunca em zero", () => {
    /* O caminho de todo pagamento anterior às formas, e de toda tela antiga em
     * cache. Zerar aqui faria o lucro do mês aparecer maior do que é, que é
     * exatamente o defeito que as taxas existem para fechar. */
    const r = taxaDoPagamento({ meio: "credit", formas: DO_SIQUEIRA });
    expect(r.feePct).toBe(3.49);
    expect(r.forma?.id).toBe("credit");
  });

  it("forma apagada depois do pagamento não zera a taxa", () => {
    const r = taxaDoPagamento({ formaId: "forma-que-nao-existe-mais", meio: "credit", formas: DO_SIQUEIRA });
    expect(r.feePct).toBe(3.49);
  });

  it("sem método, não há taxa — e não há forma a inventar", () => {
    /* O atendimento coberto pelo plano: não entrou dinheiro no balcão. */
    const r = taxaDoPagamento({ meio: null, formas: DO_SIQUEIRA });
    expect(r).toEqual({ feePct: 0, forma: null });
  });

  it("meio sem forma cadastrada nenhuma dá zero, e zero é a verdade", () => {
    const r = taxaDoPagamento({ meio: "debit", formas: [DO_SIQUEIRA[0]] });
    expect(r.feePct).toBe(0);
  });

  it("forma desativada ainda explica o passado", () => {
    /* Desativar tira do balcão, não do histórico: o pagamento de julho
     * continua tendo sido feito naquela forma, com aquela taxa. */
    const formas = [{ ...DO_SIQUEIRA[4], active: false }];
    const r = taxaDoPagamento({ formaId: "credito-inserido", meio: "credit", formas });
    expect(r.feePct).toBe(4.19);
  });
});

describe("taxasEmBranco · quando o painel deve cobrar o cadastro", () => {
  it("acusa quando o CARTÃO está zerado", () => {
    expect(taxasEmBranco(formasDoTenant({}))).toBe(true);
  });

  it("cala a boca quando qualquer cartão tem taxa", () => {
    expect(taxasEmBranco(DO_SIQUEIRA)).toBe(false);
  });

  it("Pix e dinheiro a zero NÃO são cadastro faltando", () => {
    /* É a verdade da maioria das barbearias, e cobrar configuração por isso
     * seria pedir que ela informe um custo que não tem. */
    const formas = formasDoTenant({ paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 } });
    expect(taxasEmBranco(formas)).toBe(false);
  });

  it("uma das duas formas de crédito preenchida já basta", () => {
    /* O caso do dono: aproximação cadastrada, inserido em branco. O aviso some
     * porque ele JÁ está no meio do cadastro — insistir viraria ruído, e o
     * lugar de conferir o que falta é a própria tela de Ajustes. */
    const formas: FormaDePagamento[] = [
      { id: "credit", label: "Crédito aproximação", base: "credit", feePct: 3.49, active: true },
      { id: "credito-inserido", label: "Crédito inserido", base: "credit", feePct: 0, active: true },
    ];
    expect(taxasEmBranco(formas)).toBe(false);
  });

  it("lista ausente não acusa ninguém", () => {
    expect(taxasEmBranco(undefined)).toBe(false);
  });
});

describe("idDaForma", () => {
  it("tira acento e espaço, e é estável", () => {
    expect(idDaForma("Crédito à vista", [])).toBe("credito-a-vista");
  });

  it("não repete id — o congelado de um pagamento aponta para uma forma só", () => {
    expect(idDaForma("Crédito", ["credito"])).toBe("credito-2");
  });

  it("rótulo sem nenhuma letra ainda vira id", () => {
    expect(idDaForma("💳", [])).toBe("forma");
  });
});

describe("o par obrigatório com as functions", () => {
  /**
   * A tela mostra a taxa que o dono vai ver; o servidor congela a que ele vai
   * pagar. Divergir não quebra build nenhum — produz a tela prometendo 3,49% e
   * o DRE debitando 4,19%, com a diferença aparecendo só no fim do mês.
   */
  const CRLF = String.fromCharCode(13, 10);
  const LF = String.fromCharCode(10);

  const corpo = (caminho: string) => {
    const fonte = readFileSync(new URL(caminho, import.meta.url), "utf8").split(CRLF).join(LF);
    const corte = fonte.indexOf("/** A natureza do dinheiro.");
    expect(corte).toBeGreaterThan(0);
    return fonte.slice(corte);
  };

  it("web/src/lib e functions/src não divergiram", () => {
    expect(corpo("../formas-de-pagamento.ts")).toBe(
      corpo("../../../../functions/src/formas-de-pagamento.ts")
    );
  });
});
