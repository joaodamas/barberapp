import { describe, expect, it } from "vitest";
import { atendimentoJaChegou, diaVizinho, extratoDaComissao, intervaloDoMes } from "@/lib/barbeiro";

describe("painel do barbeiro · datas", () => {
  it("intervalo do mês, inclusive fevereiro e meses de 31", () => {
    expect(intervaloDoMes("2026-10")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervaloDoMes("2026-02")).toEqual({ de: "2026-02-01", ate: "2026-02-28" });
    expect(intervaloDoMes("2028-02")).toEqual({ de: "2028-02-01", ate: "2028-02-29" });
  });
  it("dia vizinho atravessa mês e ano", () => {
    expect(diaVizinho("2026-10-31", 1)).toBe("2026-11-01");
    expect(diaVizinho("2027-01-01", -1)).toBe("2026-12-31");
  });
});

describe("painel do barbeiro · extrato da comissão", () => {
  const linha = (
    id: string,
    date: string,
    amount: number,
    origin: "servico" | "produto" = "servico",
    fato?: string
  ) => ({
    id, date, origin, commissionPct: 50, commissionBase: amount * 2, commissionAmount: amount,
    ...(fato ? (origin === "produto" ? { movementId: fato } : { bookingId: fato }) : {}),
  });

  /* 08/10: a edição de cobrança grava o estorno da comissão antiga e a nova
   * com o MESMO atendimento. Contar linhas positivas dava dois atendimentos. */
  it("atendimento com a cobrança editada conta uma vez", () => {
    const e = extratoDaComissao([
      linha("comissao_bk1", "2026-10-02", 25, "servico", "bk1"),
      linha("estorno_bk1_x", "2026-10-02", -25, "servico", "bk1"),
      linha("comissao_bk1_x", "2026-10-02", 30, "servico", "bk1"),
      linha("comissao_bk2", "2026-10-03", 20, "servico", "bk2"),
    ]);
    expect(e.atendimentos).toBe(2);
    expect(e.total).toBe(50);
  });

  it("atendimento estornado por inteiro sai da contagem; venda conta pelo movimento", () => {
    const e = extratoDaComissao([
      linha("c1", "2026-10-02", 25, "servico", "bk1"),
      linha("e1", "2026-10-04", -25, "servico", "bk1"),
      linha("v1", "2026-10-05", 4, "produto", "mv1"),
      linha("v2", "2026-10-05", 3, "produto", "mv2"),
    ]);
    expect(e.atendimentos).toBe(0);
    expect(e.vendas).toBe(2);
  });

  it("soma atendimentos e vendas, ao centavo", () => {
    const e = extratoDaComissao([linha("a", "2026-10-02", 25), linha("b", "2026-10-03", 17.5), linha("c", "2026-10-03", 4.15, "produto")]);
    expect(e.atendimentos).toBe(2);
    expect(e.vendas).toBe(1);
    expect(e.total).toBe(46.65);
  });

  it("estorno entra negativo e não conta como atendimento", () => {
    const e = extratoDaComissao([linha("a", "2026-10-02", 25), linha("estorno", "2026-10-04", -25)]);
    expect(e.atendimentos).toBe(1);
    expect(e.total).toBe(0);
  });

  it("linhas da mais nova para a mais antiga", () => {
    const e = extratoDaComissao([linha("a", "2026-10-01", 1), linha("b", "2026-10-09", 1)]);
    expect(e.linhas.map((l) => l.id)).toEqual(["b", "a"]);
  });

  it("mês vazio", () => {
    expect(extratoDaComissao([])).toMatchObject({ atendimentos: 0, vendas: 0, total: 0 });
  });
});

describe("painel do barbeiro · o atendimento já chegou (08/10)", () => {
  const hoje = "2026-10-08";
  const agora = new Date("2026-10-08T14:30:00");

  it("dia passado: sempre", () => {
    expect(atendimentoJaChegou({ date: "2026-10-07", time: "23:00" }, hoje, agora)).toBe(true);
    expect(atendimentoJaChegou({ date: "2026-10-07", time: "23:00" }, hoje, null)).toBe(true);
  });

  it("hoje: só a partir do horário", () => {
    expect(atendimentoJaChegou({ date: hoje, time: "14:30" }, hoje, agora)).toBe(true);
    expect(atendimentoJaChegou({ date: hoje, time: "09:00" }, hoje, agora)).toBe(true);
    expect(atendimentoJaChegou({ date: hoje, time: "15:00" }, hoje, agora)).toBe(false);
  });

  it("dia futuro: nunca — concluir é dizer que o corte aconteceu", () => {
    expect(atendimentoJaChegou({ date: "2026-10-15", time: "09:00" }, hoje, agora)).toBe(false);
    expect(atendimentoJaChegou({ date: "2026-10-09", time: "00:00" }, hoje, agora)).toBe(false);
  });

  it("sem relógio ainda (primeiro render), hoje não libera", () => {
    expect(atendimentoJaChegou({ date: hoje, time: "09:00" }, hoje, null)).toBe(false);
  });
});
