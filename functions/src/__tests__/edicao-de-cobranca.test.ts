import { describe, expect, it } from "vitest";
import {
  barbeiroMexeuNoDesconto,
  chaveDaEdicao,
  comTaxaCongelada,
  descontoDaEdicao,
  descontoEmReais,
  idDaEdicao,
  motivoDaFormaInvalida,
  motivoDaRecusaDaEdicao,
  servicosDaEdicao,
} from "../edicao-de-cobranca";
import { calcularEventoFinanceiro, decidirEfeito } from "../financial-events";
import type { ServicoDoCatalogo } from "../combos";

/**
 * Editar a cobrança de atendimento concluído (02/10) — as decisões puras.
 * A transação é provada contra o emulador em `edicao-transacao.test.ts`.
 */

const CATALOGO: ServicoDoCatalogo[] = [
  { id: "corte", name: "Corte", price: 50, durationMin: 30 },
  { id: "barba", name: "Barba", price: 35, durationMin: 30 },
  { id: "sobrancelha", name: "Sobrancelha", price: 15, durationMin: 20 },
  { id: "corte-barba", name: "Corte + barba", price: 75, durationMin: 60, composicao: ["corte", "barba"] },
];

const base = {
  temReserva: true,
  statusDaReserva: "completed",
  temPagamento: true,
  jaEstornado: false,
  papel: "owner" as const,
  ehDoBarbeiro: false,
  dataDoPagamento: "2026-10-02",
  hoje: "2026-10-02",
  mexeuNoDesconto: false,
  viraCortesia: false,
  mudouAlgo: true,
};

describe("servicosDaEdicao — preço e combo do catálogo", () => {
  it("tirar a barba somada por engano volta ao preço do corte", () => {
    const r = servicosDaEdicao(["corte"], CATALOGO);
    expect(r.value).toBe(50);
    expect(r.serviceNames).toEqual(["Corte"]);
    expect(r.durationMin).toBe(30);
  });
  it("corte + barba vira o combo", () => {
    const r = servicosDaEdicao(["corte", "barba"], CATALOGO);
    expect(r.value).toBe(75);
    expect(r.combos).toEqual(["Corte + barba"]);
  });
  it("trocar sobrancelha por barba recalcula com combo", () => {
    expect(servicosDaEdicao(["corte", "sobrancelha"], CATALOGO).value).toBe(65);
    expect(servicosDaEdicao(["corte", "barba"], CATALOGO).value).toBe(75);
  });
});

describe("descontoEmReais / descontoDaEdicao", () => {
  it("% acompanha o bruto novo; R$ fica o mesmo, limitado ao bruto", () => {
    expect(descontoEmReais(75, "pct", 10)).toBe(7.5);
    expect(descontoEmReais(50, "valor", 10)).toBe(10);
    expect(descontoEmReais(30, "valor", 40)).toBe(30);
    expect(descontoEmReais(50, "pct", 150)).toBe(50);
  });
  it("ausente mantém o desconto que havia, recalculado em %", () => {
    const d = descontoDaEdicao({
      bruto: 50,
      pedido: undefined,
      atual: { discountAmount: 7.5, discountInput: { tipo: "pct", valor: 10 }, discountReason: "amigo_familia", discountBy: "dono" },
      autor: "barbeiro",
    });
    expect(d).toEqual({ amount: 5, input: { tipo: "pct", valor: 10 }, reason: "amigo_familia", by: "dono" });
  });
  it("ausente sem desconto anterior = sem desconto", () => {
    expect(descontoDaEdicao({ bruto: 50, pedido: undefined, atual: {}, autor: "x" }).amount).toBe(0);
  });
  it("null tira o desconto", () => {
    expect(descontoDaEdicao({ bruto: 50, pedido: null, atual: { discountAmount: 10 }, autor: "x" }).amount).toBe(0);
  });
  it("desconto novo registra quem deu", () => {
    const d = descontoDaEdicao({ bruto: 50, pedido: { tipo: "valor", valor: 5, motivo: "fidelidade" }, atual: {}, autor: "dono" });
    expect(d).toEqual({ amount: 5, input: { tipo: "valor", valor: 5 }, reason: "fidelidade", by: "dono" });
  });
});

describe("motivoDaRecusaDaEdicao — quem pode e quando", () => {
  it("dono no mês corrente pode", () => {
    expect(motivoDaRecusaDaEdicao(base)).toBeNull();
  });
  it("dono fora do mês não pode", () => {
    expect(motivoDaRecusaDaEdicao({ ...base, dataDoPagamento: "2026-09-30" })).toBe("fora_da_janela");
  });
  it("barbeiro edita o próprio atendimento no mesmo dia", () => {
    expect(motivoDaRecusaDaEdicao({ ...base, papel: "staff", ehDoBarbeiro: true })).toBeNull();
  });
  it("barbeiro não edita atendimento de outro dia", () => {
    expect(
      motivoDaRecusaDaEdicao({ ...base, papel: "staff", ehDoBarbeiro: true, dataDoPagamento: "2026-10-01" })
    ).toBe("barbeiro_outro_dia");
  });
  it("barbeiro não edita atendimento de outro barbeiro", () => {
    expect(motivoDaRecusaDaEdicao({ ...base, papel: "staff", ehDoBarbeiro: false })).toBe("barbeiro_de_outro");
  });
  it("barbeiro não dá desconto novo", () => {
    expect(
      motivoDaRecusaDaEdicao({ ...base, papel: "staff", ehDoBarbeiro: true, mexeuNoDesconto: true })
    ).toBe("desconto_so_dono");
  });
  it("recusas do fato vêm antes de tudo", () => {
    expect(motivoDaRecusaDaEdicao({ ...base, temReserva: false })).toBe("reserva_ausente");
    expect(motivoDaRecusaDaEdicao({ ...base, statusDaReserva: "confirmed" })).toBe("nao_concluido");
    expect(motivoDaRecusaDaEdicao({ ...base, temPagamento: false })).toBe("sem_pagamento");
    expect(motivoDaRecusaDaEdicao({ ...base, jaEstornado: true })).toBe("ja_estornado");
  });
  it("não vira cortesia e não grava edição vazia", () => {
    expect(motivoDaRecusaDaEdicao({ ...base, viraCortesia: true })).toBe("vira_cortesia");
    expect(motivoDaRecusaDaEdicao({ ...base, mudouAlgo: false })).toBe("nada_mudou");
  });
});

describe("a conta é a do gatilho — sem terceira cópia", () => {
  it("40% sobre o cobrado com desconto, taxa da forma", () => {
    const { commission, payment } = calcularEventoFinanceiro({
      valor: 75,
      metodo: "credit",
      commissionPctDoBarbeiro: 40,
      padraoPct: 50,
      fees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
      desconto: 5,
    });
    expect(commission.commissionBase).toBe(70);
    expect(commission.commissionAmount).toBe(28);
    expect(payment.grossAmount).toBe(70);
    expect(payment.feeAmount).toBe(2.44);
  });
});

describe("ids e o invariante do qual a edição depende", () => {
  it("ids derivados da chave, prefixados para não colidir com o gatilho", () => {
    expect(idDaEdicao("b1", "k1")).toBe("edicao_b1_k1");
    expect(chaveDaEdicao("k1")).toBe("edicao-k1");
  });
  it("completed → completed não rematerializa por cima da edição", () => {
    expect(decidirEfeito("completed", "completed")).toBe("nada");
  });
});

describe("revisão #116 · forma de pagamento validada", () => {
  const formas = [
    { id: "pix", base: "pix", active: true },
    { id: "credito-aprox", base: "credit", active: true },
    { id: "credito-velho", base: "credit", active: false },
  ];
  it("recusa forma inexistente", () => {
    expect(motivoDaFormaInvalida({ formaId: "nao-existe", metodo: "pix", formas, formaAtual: null })).toBe("forma_inexistente");
  });
  it("recusa dinheiro com a forma (taxa e rótulo) do crédito", () => {
    expect(motivoDaFormaInvalida({ formaId: "credito-aprox", metodo: "cash", formas, formaAtual: null })).toBe("forma_de_outro_meio");
  });
  it("recusa forma inativa nova", () => {
    expect(motivoDaFormaInvalida({ formaId: "credito-velho", metodo: "credit", formas, formaAtual: "pix" })).toBe("forma_inativa");
  });
  it("aceita a forma inativa que JÁ está no pagamento", () => {
    expect(motivoDaFormaInvalida({ formaId: "credito-velho", metodo: "credit", formas, formaAtual: "credito-velho" })).toBeNull();
  });
  it("aceita forma ativa do mesmo meio, e ausência de forma", () => {
    expect(motivoDaFormaInvalida({ formaId: "credito-aprox", metodo: "credit", formas, formaAtual: null })).toBeNull();
    expect(motivoDaFormaInvalida({ formaId: null, metodo: "pix", formas, formaAtual: null })).toBeNull();
  });
});

describe("revisão #116 · combo inativo já no atendimento", () => {
  const comComboInativo: ServicoDoCatalogo[] = CATALOGO.map((s) => (s.id === "corte-barba" ? { ...s, active: false } : s));
  const reserva = { serviceIds: ["corte-barba"], serviceNames: ["Corte + barba"], value: 75, durationMin: 60 };

  it("lista igual: nada é re-precificado (edição só de forma ou desconto)", () => {
    const r = servicosDaEdicao(["corte-barba"], comComboInativo, reserva);
    expect(r).toMatchObject({ serviceIds: ["corte-barba"], serviceNames: ["Corte + barba"], value: 75, durationMin: 60, inalterados: true });
  });
  it("lista igual com preço do catálogo mudado: continua o congelado", () => {
    const caro = CATALOGO.map((s) => (s.id === "corte-barba" ? { ...s, price: 90 } : s));
    expect(servicosDaEdicao(["corte-barba"], caro, reserva).value).toBe(75);
  });
  it("lista mudou: o combo que já estava continua valendo como combo", () => {
    const r = servicosDaEdicao(["corte-barba", "sobrancelha"], comComboInativo, reserva);
    expect(r.value).toBe(90);
    expect(r.combos).toEqual(["Corte + barba"]);
  });
});

/** Auditoria de 09/10: editar não reprecifica pela tabela de hoje. */
describe("servicosDaEdicao — preço congelado ao tirar ou trocar", () => {
  /* A tabela dobrou desde a marcação (proporção 8:5 igual à paga: 40 + 25). */
  const hoje: ServicoDoCatalogo[] = [
    { id: "corte", name: "Corte", price: 80, durationMin: 30 },
    { id: "barba", name: "Barba", price: 50, durationMin: 30 },
    { id: "sobrancelha", name: "Sobrancelha", price: 20, durationMin: 20 },
  ];
  const reserva = {
    serviceIds: ["corte", "barba"],
    serviceNames: ["Corte", "Barba"],
    value: 65,
    durationMin: 60,
  };

  it("tirar a barba deixa o corte pelo que foi cobrado, não pelo catálogo de hoje", () => {
    const r = servicosDaEdicao(["corte"], hoje, reserva);
    expect(r.value).toBe(40);
    expect(r.serviceIds).toEqual(["corte"]);
    expect(r.durationMin).toBe(30);
  });
  it("trocar a barba pela sobrancelha: corte congelado + sobrancelha de hoje", () => {
    const r = servicosDaEdicao(["corte", "sobrancelha"], hoje, reserva);
    expect(r.value).toBe(60);
    expect(r.serviceNames).toEqual(["Corte", "Sobrancelha"]);
  });
  it("serviço apagado do catálogo continua valendo o que foi cobrado e mantém o nome", () => {
    const semBarba: ServicoDoCatalogo[] = [
      { id: "corte", name: "Corte", price: 40, durationMin: 30 },
      { id: "sobrancelha", name: "Sobrancelha", price: 20, durationMin: 20 },
    ];
    const r = servicosDaEdicao(["barba"], semBarba, reserva);
    expect(r.serviceNames).toEqual(["Barba"]);
    expect(r.value).toBe(25);
  });
});

/** Revisão financeira de 08/10. */
describe("barbeiroMexeuNoDesconto — o desconto é do dono", () => {
  it("ausente mantém: pode", () => {
    expect(barbeiroMexeuNoDesconto(undefined, 10)).toBe(false);
  });
  it("null com desconto do dono: TIRA — recusado", () => {
    expect(barbeiroMexeuNoDesconto(null, 10)).toBe(true);
  });
  it("null sem desconto nenhum não muda nada: pode", () => {
    expect(barbeiroMexeuNoDesconto(null, 0)).toBe(false);
  });
  it("objeto é desconto novo, mesmo repetindo o valor", () => {
    expect(barbeiroMexeuNoDesconto({ tipo: "valor", valor: 10 }, 10)).toBe(true);
  });
});

describe("comTaxaCongelada — a taxa é a do dia em que o cliente pagou", () => {
  /* Pago a 3,49% em setembro; a tabela de hoje diz 4,99%. */
  const deHoje = {
    paymentMethod: "credit" as const,
    paymentFormId: "credito",
    paymentFormLabel: "Crédito",
    grossAmount: 50,
    feePct: 4.99,
    feeAmount: 2.5,
    netAmount: 47.5,
  };
  const atual = { paymentMethod: "credit" as const, paymentFormId: "credito", paymentFormLabel: "Crédito", feePct: 3.49 };

  it("forma igual: reaproveita o feePct congelado sobre o bruto novo", () => {
    const p = comTaxaCongelada(deHoje, atual, { metodo: "credit", formaId: "credito" });
    expect(p.feePct).toBe(3.49);
    expect(p.feeAmount).toBe(1.75);
    expect(p.netAmount).toBe(48.25);
  });
  it("forma não informada e mesmo meio: continua a forma e a taxa do pagamento", () => {
    const p = comTaxaCongelada(deHoje, atual, { metodo: "credit", formaId: null });
    expect(p.feePct).toBe(3.49);
    expect(p.paymentFormId).toBe("credito");
  });
  it("forma trocada: vale a taxa de hoje da forma nova", () => {
    expect(comTaxaCongelada(deHoje, atual, { metodo: "pix", formaId: "pix" })).toBe(deHoje);
    expect(comTaxaCongelada(deHoje, atual, { metodo: "credit", formaId: "credito-2" })).toBe(deHoje);
  });
  it("pagamento antigo sem feePct: usa a de hoje (não inventa zero)", () => {
    expect(comTaxaCongelada(deHoje, { ...atual, feePct: undefined }, { metodo: "credit", formaId: null })).toBe(deHoje);
  });
});
