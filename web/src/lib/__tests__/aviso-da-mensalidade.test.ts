import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/format";
import {
  avisoDoCliente,
  contagemPorEstagio,
  faturaRelevante,
  hojeNoFuso,
  mensagemDeLembrete,
  precisaLembrarHoje,
  proximoVencimento,
  situacaoNaRegua,
} from "@/lib/aviso-da-mensalidade";

type F = {
  competencia: string;
  dueDate: string;
  status: "aberta" | "paga" | "cancelada";
  amount: number;
  planName: string;
};
const fat = (over: Partial<F> = {}): F => ({
  competencia: "2026-09",
  dueDate: "2026-09-10",
  status: "aberta",
  amount: 149,
  planName: "Ilimitado",
  ...over,
});
const ass = { nextCharge: "2026-10-10", billingDay: 10 };
/* O espaço do formatBRL é o não separável; o teste usa a própria função. */
const V = formatBRL(149);

/** Hoje deslocado em dias do vencimento 2026-09-10. */
const hojeA = (dias: number) => {
  const d = new Date(Date.UTC(2026, 8, 10 - dias));
  return d.toISOString().slice(0, 10);
};

describe("hojeNoFuso", () => {
  it("usa o dia da loja, não o do aparelho", () => {
    const instante = new Date("2026-10-10T02:30:00Z");
    expect(hojeNoFuso("America/Sao_Paulo", instante)).toBe("2026-10-09");
    expect(hojeNoFuso("UTC", instante)).toBe("2026-10-10");
  });
  it("fuso inválido não derruba", () => {
    expect(hojeNoFuso("Nao/Existe", new Date(2026, 9, 9, 12))).toBe("2026-10-09");
  });
});

describe("faturaRelevante", () => {
  it("a aberta de competência mais antiga ganha", () => {
    const ago = fat({ competencia: "2026-08", dueDate: "2026-08-10" });
    const set = fat();
    expect(faturaRelevante([set, ago], "2026-09-12")).toBe(ago);
  });
  it("sem aberta, a paga do mês", () => {
    const paga = fat({ status: "paga" });
    expect(faturaRelevante([paga, fat({ competencia: "2026-08", status: "paga" })], "2026-09-12")).toBe(paga);
  });
  it("nada a dizer: null", () => {
    expect(faturaRelevante([], "2026-09-12")).toBeNull();
    expect(faturaRelevante([fat({ status: "paga", competencia: "2026-08" })], "2026-09-12")).toBeNull();
    expect(faturaRelevante([fat({ status: "cancelada" })], "2026-09-12")).toBeNull();
  });
});

describe("avisoDoCliente · texto por estágio", () => {
  const aviso = (dias: number, f = fat()) => avisoDoCliente(f, ass, hojeA(dias));

  it("D-5 e D-3: neutro, com valor, dias e data", () => {
    const a = aviso(5);
    expect(a).toMatchObject({ tipo: "aviso", estagio: "D-5", tom: "neutro", comoPagar: false });
    expect((a as { texto: string }).texto).toBe(
      `Sua mensalidade de ${V} vence em 5 dias (10/09). Seus cortes do plano renovam nesse dia.`
    );
    expect(aviso(2)).toMatchObject({ estagio: "D-3" });
    expect((aviso(2) as { texto: string }).texto).toContain("vence em 2 dias");
  });
  it("D-1 e D0: atenção, como pagar e WhatsApp", () => {
    expect(aviso(1)).toMatchObject({ estagio: "D-1", tom: "atencao", comoPagar: true, chamarBarbearia: true });
    expect((aviso(1) as { texto: string }).texto).toContain("vence amanhã (10/09)");
    expect(aviso(0)).toMatchObject({ estagio: "D0", comoPagar: true });
    expect((aviso(0) as { texto: string }).texto).toContain("vence hoje");
  });
  it("D+1 e D+3: venceu há N dias", () => {
    expect((aviso(-1) as { texto: string }).texto).toContain("venceu há 1 dia ");
    expect(aviso(-3)).toMatchObject({ estagio: "D+3", tom: "atencao" });
    expect((aviso(-3) as { texto: string }).texto).toContain("venceu há 3 dias");
  });
  it("D+5 em diante: alerta e WhatsApp", () => {
    const a = aviso(-27);
    expect(a).toMatchObject({ estagio: "D+5", tom: "alerta", chamarBarbearia: true });
    expect((a as { texto: string }).texto).toBe(
      "Mensalidade atrasada há 27 dias. Fale com a barbearia para continuar usando o plano."
    );
  });
  it("aberta a mais de 5 dias: só a linha discreta, com o vencimento", () => {
    expect(aviso(9)).toEqual({ tipo: "em-dia", texto: "Plano em dia · renova em 10/09" });
  });
  it("paga do mês: linha discreta com o próximo vencimento", () => {
    expect(avisoDoCliente(fat({ status: "paga" }), ass, "2026-09-12")).toEqual({
      tipo: "em-dia",
      texto: "Plano em dia · renova em 10/10",
    });
  });
  it("sem fatura: não afirma nada", () => {
    expect(avisoDoCliente(null, ass, "2026-09-12")).toEqual({ tipo: "nenhum" });
  });
  it("nunca promete aviso automático", () => {
    for (const d of [5, 2, 1, 0, -1, -3, -9]) {
      const a = aviso(d);
      expect(JSON.stringify(a)).not.toMatch(/avisamos/i);
    }
  });
  it("valor usa formatBRL", () => {
    expect((aviso(1) as { texto: string }).texto).toContain(V);
  });
});

describe("proximoVencimento", () => {
  it("usa nextCharge futuro", () => {
    expect(proximoVencimento({ nextCharge: "2026-10-10", billingDay: 10 }, "2026-09-12")).toBe("2026-10-10");
  });
  it("sem nextCharge, deriva do dia; 31 cai no último dia do mês curto", () => {
    expect(proximoVencimento({ billingDay: 5 }, "2026-09-12")).toBe("2026-10-05");
    expect(proximoVencimento({ billingDay: 31 }, "2026-09-12")).toBe("2026-09-30");
    expect(proximoVencimento({ billingDay: 5 }, "2026-12-12")).toBe("2027-01-05");
  });
  it("sem dado: null", () => {
    expect(proximoVencimento({}, "2026-09-12")).toBeNull();
  });
});

describe("painel · etiqueta, lembrar hoje, contagem", () => {
  it("etiquetas", () => {
    const e = (dias: number) => situacaoNaRegua(fat(), hojeA(dias))?.rotulo;
    expect(e(3)).toBe("Vence em 3 dias");
    expect(e(1)).toBe("Vence amanhã");
    expect(e(0)).toBe("Vence hoje");
    expect(e(-3)).toBe("Atrasado 3 dias");
    expect(e(-1)).toBe("Atrasado 1 dia");
    expect(e(20)).toBe("Em dia");
    expect(situacaoNaRegua(fat({ status: "paga" }), "2026-09-12")?.rotulo).toBe("Em dia");
    expect(situacaoNaRegua(null, "2026-09-12")).toBeNull();
  });

  it("precisa lembrar: marcos exatos e todo D+5+", () => {
    const sim = [5, 3, 1, 0, -1, -3, -5, -6, -30];
    const nao = [9, 6, 4, 2, -2, -4];
    for (const d of sim) expect(precisaLembrarHoje(fat(), hojeA(d)), `dias ${d}`).toBe(true);
    for (const d of nao) expect(precisaLembrarHoje(fat(), hojeA(d)), `dias ${d}`).toBe(false);
    expect(precisaLembrarHoje(fat({ status: "paga" }), hojeA(0))).toBe(false);
    expect(precisaLembrarHoje(null, hojeA(0))).toBe(false);
  });

  it("contagem por estágio ignora paga e sem fatura", () => {
    const c = contagemPorEstagio([fat(), fat({ status: "paga" }), null, fat({ dueDate: "2026-08-01" })], "2026-09-10");
    expect(c["D0"]).toBe(1);
    expect(c["D+5"]).toBe(1);
    expect(Object.values(c).reduce((s, n) => s + n, 0)).toBe(2);
  });

  it("mensagem do WhatsApp por estágio, com nome, plano, valor, data e loja", () => {
    const m = (dias: number) => mensagemDeLembrete(fat(), hojeA(dias), "João da Silva", "O Siqueira");
    expect(m(3)).toBe(
      `Oi, João! Sua mensalidade do plano Ilimitado (${V}) vence em 3 dias, dia 10/09. Qualquer dúvida de como pagar, é só responder por aqui. — O Siqueira`
    );
    expect(m(0)).toContain("Hoje é o vencimento");
    expect(m(1)).toContain("vence amanhã");
    expect(m(-3)).toContain("venceu dia 10/09 e ainda não consta como paga");
    expect(mensagemDeLembrete(fat(), hojeA(0), "", "Loja").startsWith("Oi! ")).toBe(true);
  });
});
