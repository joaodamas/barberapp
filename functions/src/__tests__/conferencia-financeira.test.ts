import { describe, expect, it } from "vitest";
import { chatDaPlataforma, diasAntes, situacaoDaConclusao } from "../conferencia-financeira";
import { contarCobertosNaCompetencia, jaReverteuNesteEvento } from "../financial-events";

describe("05/10 · conferência noturna do financeiro", () => {
  it("concluído com comissão está em dia", () => {
    expect(situacaoDaConclusao({ reconclusao: false, temComissao: true })).toBe("ok");
    expect(situacaoDaConclusao({ reconclusao: true, temComissao: true })).toBe("ok");
  });
  it("primeira conclusão sem comissão é refeita pelo mesmo caminho do gatilho", () => {
    expect(situacaoDaConclusao({ reconclusao: false, temComissao: false })).toBe("refazer");
  });
  it("reconclusão sem a comissão do ciclo só alerta: o ciclo depende do evento original", () => {
    expect(situacaoDaConclusao({ reconclusao: true, temComissao: false })).toBe("alertar");
  });
  it("janela de dias atravessa o mês", () => {
    expect(diasAntes("2026-10-05", 7)).toBe("2026-09-28");
    expect(diasAntes("2026-03-02", 7)).toBe("2026-02-23");
  });
});

describe("08/10 · revisão do #135 — reprocessamento", () => {
  const plano = (subscriptionId: string, competencia: string) => ({
    tipo: "plano" as const,
    subscriptionId,
    planId: "p",
    planName: "Plano",
    competencia,
    valorCoberto: 50,
    usoNaCompetencia: 1,
    cota: 4,
  });

  it("a cota conta só a assinatura e a competência certas", () => {
    const n = contarCobertosNaCompetencia(
      [
        { id: "a", cobertura: plano("s1", "2026-10") },
        { id: "b", cobertura: plano("s1", "2026-09") },
        { id: "c", cobertura: plano("s2", "2026-10") },
        { id: "d", cobertura: { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 } },
        { id: "e" },
      ],
      { bookingId: "x", subscriptionId: "s1", competencia: "2026-10" }
    );
    expect(n).toBe(1);
  });

  it("reprocessar não conta a própria reserva", () => {
    const reservas = [
      { id: "a", cobertura: plano("s1", "2026-10") },
      { id: "x", cobertura: plano("s1", "2026-10") },
    ];
    expect(
      contarCobertosNaCompetencia(reservas, { bookingId: "x", subscriptionId: "s1", competencia: "2026-10" })
    ).toBe(1);
  });

  it("reentrega da MESMA reversão não congela de novo; outra reversão sim", () => {
    expect(jaReverteuNesteEvento({ revertidoEm: "ev1" }, "ev1")).toBe(true);
    expect(jaReverteuNesteEvento({ revertidoEm: "ev1" }, "ev2")).toBe(false);
    expect(jaReverteuNesteEvento({ comissaoVigenteId: "c" }, "ev1")).toBe(false);
    expect(jaReverteuNesteEvento(undefined, "ev1")).toBe(false);
  });
});

describe("08/10 · chat do Telegram da plataforma", () => {
  it("só um id numérico liga o aviso; o padrão 'desligado' não", () => {
    expect(chatDaPlataforma("desligado")).toBeNull();
    expect(chatDaPlataforma("")).toBeNull();
    expect(chatDaPlataforma(" 123456789 ")).toBe("123456789");
    expect(chatDaPlataforma("-1001234567890")).toBe("-1001234567890");
  });
});
