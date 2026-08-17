import { describe, expect, it } from "vitest";
import {
  billingDayValido,
  competenciaDe,
  estagioDaFatura,
  estagioDaRegua,
  faturaDaCompetencia,
  valeNaCompetencia,
  vencimentoDaCompetencia,
} from "../mensalistas";

/**
 * G2 — as decisões puras do mensalista.
 *
 * A regra que organiza tudo, e que estes testes protegem:
 *
 * > Uma assinatura não é receita realizada. Uma fatura não é receita
 * > realizada. O pagamento da fatura é o fato financeiro.
 *
 * É a lição dos R$ 248: a receita de mensalista era derivada de uma caixinha
 * marcada como `ativo`, sem lastro de recebimento nenhum.
 */

describe("G2 · dia de cobrança", () => {
  it("aceita de 1 a 31", () => {
    expect(billingDayValido(1)).toBe(true);
    expect(billingDayValido(15)).toBe(true);
    expect(billingDayValido(31)).toBe(true);
  });

  it("recusa fora do calendário", () => {
    /* Um `billingDay` inválido geraria vencimento fora do mês, e a régua leria
     * a fatura como atrasada desde o nascimento. */
    expect(billingDayValido(0)).toBe(false);
    expect(billingDayValido(32)).toBe(false);
    expect(billingDayValido(-1)).toBe(false);
    expect(billingDayValido(1.5)).toBe(false);
    expect(billingDayValido("5")).toBe(false);
    expect(billingDayValido(undefined)).toBe(false);
  });
});

describe("G2 · vencimento da competência", () => {
  it("o dia normal cai no dia", () => {
    expect(vencimentoDaCompetencia("2026-09", 5)).toBe("2026-09-05");
    expect(vencimentoDaCompetencia("2026-09", 15)).toBe("2026-09-15");
  });

  it("dia 31 em setembro cobra no dia 30", () => {
    expect(vencimentoDaCompetencia("2026-09", 31)).toBe("2026-09-30");
  });

  it("dia 31 em FEVEREIRO cobra no último dia", () => {
    /* A alternativa — rolar para 1º de março — mudaria a COMPETÊNCIA: a
     * mensalidade de fevereiro venceria em março e apareceria no mês errado do
     * histórico, que é justamente o que `competencia` existe para evitar. */
    expect(vencimentoDaCompetencia("2026-02", 31)).toBe("2026-02-28");
  });

  it("acerta ano bissexto sem caso especial", () => {
    expect(vencimentoDaCompetencia("2028-02", 30)).toBe("2028-02-29");
  });

  it("zero-padding no dia", () => {
    expect(vencimentoDaCompetencia("2026-09", 5)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("G2 · a régua D-5 → D+5, derivada", () => {
  /* `dueStage` era campo gravado que ninguém nunca escreveu: a tela contava
   * assinantes por estágio e os sete baldes mostravam zero para sempre.
   * Derivado, responde certo em qualquer data — um campo gravado ficaria velho
   * no dia seguinte. */
  const vence = "2026-09-10";

  it("longe do vencimento, nada a fazer", () => {
    expect(estagioDaRegua(vence, "2026-09-01")).toBeNull();
    expect(estagioDaRegua(vence, "2026-09-04")).toBeNull();
  });

  it("cinco dias antes entra na régua", () => {
    expect(estagioDaRegua(vence, "2026-09-05")).toBe("D-5");
    expect(estagioDaRegua(vence, "2026-09-06")).toBe("D-5");
  });

  it("cada fatura cai no marco JÁ alcançado", () => {
    /* Faltando 4 dias, o aviso de D-5 já saiu e o de D-3 ainda não. É o que a
     * operação pergunta: o que já foi avisado e o que vem agora. */
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
    /* Quem está três meses atrasado não pode desaparecer da cobrança por ter
     * passado do último marco. */
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

describe("G2 · a fatura congela o que precisa ser congelado", () => {
  const fatura = faturaDaCompetencia({
    subscriptionId: "assin-1",
    assinatura: { clientId: "cli-1", planName: "Ilimitado", price: 149, billingDay: 5 },
    competencia: "2026-09",
  });

  it("guarda valor, competência e vencimento", () => {
    expect(fatura.amount).toBe(149);
    expect(fatura.competencia).toBe("2026-09");
    expect(fatura.dueDate).toBe("2026-09-05");
  });

  it("nasce ABERTA, sem pagamento", () => {
    /* Emitir não é receber. A fatura emitida é cobrança, e o fato financeiro só
     * existe quando alguém confirma o pagamento. */
    expect(fatura.status).toBe("aberta");
    expect(fatura.paidAt).toBeNull();
    expect(fatura.paymentMethod).toBeNull();
  });

  it("congela o nome do plano junto do valor", () => {
    /* Sem isso, renomear "Ilimitado" para "Premium" reescreveria o histórico:
     * faturas de meses fechados passariam a citar um plano que não existia. */
    expect(fatura.planName).toBe("Ilimitado");
  });

  it("REAJUSTE não altera fatura já emitida", () => {
    /* Mesma razão de `unitCost` em G1. A fatura carrega o preço que valia na
     * emissão; a assinatura carrega o de hoje. */
    const depoisDoReajuste = faturaDaCompetencia({
      subscriptionId: "assin-1",
      assinatura: { clientId: "cli-1", planName: "Ilimitado", price: 179, billingDay: 5 },
      competencia: "2026-10",
    });
    expect(fatura.amount).toBe(149);
    expect(depoisDoReajuste.amount).toBe(179);
  });
});

describe("G2 · a assinatura vale nesta competência?", () => {
  const ativa = { startedAt: "2026-09-03", canceledAt: null };

  it("não gera fatura antes de começar", () => {
    expect(valeNaCompetencia(ativa, "2026-08")).toBe(false);
  });

  it("gera no mês em que começou, mesmo começando no meio", () => {
    expect(valeNaCompetencia(ativa, "2026-09")).toBe(true);
  });

  it("continua gerando nos meses seguintes", () => {
    expect(valeNaCompetencia(ativa, "2026-10")).toBe(true);
    expect(valeNaCompetencia(ativa, "2027-03")).toBe(true);
  });

  it("cancelada no meio do mês AINDA gera a fatura do mês", () => {
    /* O ciclo já vale até o fim, e é o que `plano_cancelado` promete ao
     * cliente: "continua valendo até {{3}}". Não gerar seria dar um mês grátis
     * a quem cancelou no dia 28. */
    const cancelada = { startedAt: "2026-01-05", canceledAt: "2026-09-28" };
    expect(valeNaCompetencia(cancelada, "2026-09")).toBe(true);
  });

  it("cancelada não gera nos meses seguintes", () => {
    const cancelada = { startedAt: "2026-01-05", canceledAt: "2026-09-28" };
    expect(valeNaCompetencia(cancelada, "2026-10")).toBe(false);
  });
});

describe("G2 · competência", () => {
  it("extrai o mês da data", () => {
    expect(competenciaDe("2026-09-14")).toBe("2026-09");
  });
});
