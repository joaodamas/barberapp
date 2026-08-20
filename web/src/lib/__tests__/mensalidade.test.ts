import { describe, expect, it } from "vitest";
import { estagioDaFatura, estagioDaRegua, resumoDasFaturas } from "@/lib/mensalidade";

/**
 * G2 · a régua de cobrança no web.
 *
 * **A TABELA DE CASOS ABAIXO É IDÊNTICA à de
 * `functions/src/__tests__/mensalistas.test.ts`, de propósito.**
 *
 * A mesma regra existe nos dois lados porque não há módulo compartilhado entre
 * `web` e `functions`, e é o padrão que esta auditoria mais encontrou: duas
 * fontes para a mesma pergunta, com a correção aplicada só numa delas. O que
 * impede a divergência aqui é esta duplicação deliberada — mudar um corte de um
 * lado quebra o teste do outro no mesmo commit.
 */

const vence = "2026-09-10";

describe("G2 · régua D-5 → D+5 (mesma tabela do servidor)", () => {
  it("longe do vencimento, nada a fazer", () => {
    expect(estagioDaRegua(vence, "2026-09-01")).toBeNull();
    expect(estagioDaRegua(vence, "2026-09-04")).toBeNull();
  });

  it("cinco dias antes entra na régua", () => {
    expect(estagioDaRegua(vence, "2026-09-05")).toBe("D-5");
    expect(estagioDaRegua(vence, "2026-09-06")).toBe("D-5");
  });

  it("cada fatura cai no marco JÁ alcançado", () => {
    expect(estagioDaRegua(vence, "2026-09-07")).toBe("D-3");
    expect(estagioDaRegua(vence, "2026-09-08")).toBe("D-3");
    expect(estagioDaRegua(vence, "2026-09-09")).toBe("D-1");
  });

  it("no dia é D0", () => {
    expect(estagioDaRegua(vence, "2026-09-10")).toBe("D0");
  });

  it("depois do vencimento sobe a régua", () => {
    expect(estagioDaRegua(vence, "2026-09-11")).toBe("D+1");
    expect(estagioDaRegua(vence, "2026-09-12")).toBe("D+1");
    expect(estagioDaRegua(vence, "2026-09-13")).toBe("D+3");
    expect(estagioDaRegua(vence, "2026-09-14")).toBe("D+3");
    expect(estagioDaRegua(vence, "2026-09-15")).toBe("D+5");
  });

  it("atraso longo continua em D+5, e não some da régua", () => {
    expect(estagioDaRegua(vence, "2026-12-01")).toBe("D+5");
  });

  it("atravessa a virada do mês e do ano", () => {
    expect(estagioDaRegua("2027-01-02", "2026-12-31")).toBe("D-3");
    expect(estagioDaRegua("2026-12-31", "2027-01-02")).toBe("D+1");
  });

  it("fatura PAGA sai da régua — ela é de cobrança", () => {
    expect(estagioDaFatura({ dueDate: vence, status: "paga" }, "2026-09-15")).toBeNull();
    expect(estagioDaFatura({ dueDate: vence, status: "cancelada" }, "2026-09-15")).toBeNull();
    expect(estagioDaFatura({ dueDate: vence, status: "aberta" }, "2026-09-15")).toBe("D+5");
  });
});

describe("G2 · resumo da competência separa contratado de recebido", () => {
  const faturas = [
    { competencia: "2026-09", status: "paga" as const, amount: 149, dueDate: "2026-09-05" },
    { competencia: "2026-09", status: "aberta" as const, amount: 149, dueDate: "2026-09-10" },
    { competencia: "2026-09", status: "aberta" as const, amount: 99, dueDate: "2026-09-20" },
    { competencia: "2026-09", status: "cancelada" as const, amount: 99, dueDate: "2026-09-25" },
    { competencia: "2026-08", status: "paga" as const, amount: 149, dueDate: "2026-08-05" },
  ];

  const r = resumoDasFaturas(faturas, "2026-09", "2026-09-12");

  it("faturado é o EMITIDO — contrato, não receita", () => {
    /* 149 + 149 + 99. A cancelada fica fora: ela deixou de ser cobrança. */
    expect(r.faturado).toBe(397);
  });

  it("recebido é só o que foi confirmado como pago", () => {
    /* É o único número com lastro. Somá-lo com o faturado foi exatamente o erro
     * dos R$ 248 — afirmar recebimento cuja evidência era um status. */
    expect(r.recebido).toBe(149);
    expect(r.recebido).not.toBe(r.faturado);
  });

  it("em aberto é o que falta receber", () => {
    expect(r.emAberto).toBe(248);
    expect(r.recebido + r.emAberto).toBe(r.faturado);
  });

  it("não mistura competências", () => {
    /* A fatura de agosto não entra em setembro. É o que `competencia` existe
     * para garantir, e o que o estado-de-hoje do `SubscriberDoc` nunca soube. */
    expect(r.quantidade).toBe(3);
  });

  it("a régua conta só as abertas", () => {
    /* Em 12/09: a de 10/09 está em D+1, a de 20/09 ainda fora da régua. */
    expect(r.porEstagio["D+1"]).toBe(1);
    expect(r.porEstagio["D-5"]).toBe(0);
    expect(Object.values(r.porEstagio).reduce((s, n) => s + n, 0)).toBe(1);
  });

  it("competência sem fatura devolve zeros, não NaN", () => {
    const vazio = resumoDasFaturas(faturas, "2026-12", "2026-12-01");
    expect(vazio.faturado).toBe(0);
    expect(vazio.recebido).toBe(0);
    expect(vazio.quantidade).toBe(0);
  });
});
