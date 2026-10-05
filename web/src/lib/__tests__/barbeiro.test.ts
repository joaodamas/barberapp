import { describe, expect, it } from "vitest";
import { diaVizinho, extratoDaComissao, intervaloDoMes } from "@/lib/barbeiro";

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
  const linha = (id: string, date: string, amount: number, origin: "servico" | "produto" = "servico") => ({
    id, date, origin, commissionPct: 50, commissionBase: amount * 2, commissionAmount: amount,
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
