import { describe, expect, it } from "vitest";
import {
  DESDE_SEMPRE,
  historicoAoMudarSalario,
  historicoDaMudanca,
  mesDoRegistro,
  semHistoricoDeSalario,
} from "@/lib/folha";

/** O histórico que a tela de Equipe grava em `staff_pay` (08/10). */
describe("histórico da folha", () => {
  it("primeira mudança semeia o salário anterior desde a criação do registro", () => {
    expect(
      historicoAoMudarSalario({ salary: 2000, createdAt: new Date(2026, 2, 15) }, 2500, "2026-11")
    ).toEqual([
      { valorCentavos: 200000, desde: "2026-03" },
      { valorCentavos: 250000, desde: "2026-11" },
    ]);
  });
  it("sem createdAt, o salário anterior vale desde sempre", () => {
    expect(historicoAoMudarSalario({ salary: 2000 }, 2500, "2026-11")[0].desde).toBe(DESDE_SEMPRE);
  });
  it("sem salário anterior, nasce só com o novo", () => {
    expect(historicoAoMudarSalario({}, 1800, "2026-11")).toEqual([{ valorCentavos: 180000, desde: "2026-11" }]);
  });
  it("duas mudanças no mesmo mês: fica a última", () => {
    const h1 = historicoAoMudarSalario({ salary: 2000 }, 2100, "2026-11");
    expect(historicoAoMudarSalario({ salary: 2100, historicoSalario: h1 }, 2200, "2026-11").at(-1)).toEqual({
      valorCentavos: 220000,
      desde: "2026-11",
    });
  });
  it("só salário e entrada/saída mexem na folha", () => {
    expect(historicoDaMudanca({ salary: 1 }, "name", "Otávio", "2026-11")).toBeNull();
    expect(historicoDaMudanca(undefined, "salary", 1, "2026-11")).toBeNull();
    expect(historicoDaMudanca({ active: true }, "active", false, "2026-11")).toEqual({
      historicoNaEquipe: [
        { ativo: true, desde: DESDE_SEMPRE },
        { ativo: false, desde: "2026-11" },
      ],
    });
  });
  it("lê o createdAt do Firestore (toDate / seconds)", () => {
    expect(mesDoRegistro({ toDate: () => new Date(2026, 6, 1) })).toBe("2026-07");
    expect(mesDoRegistro(null)).toBeNull();
    expect(mesDoRegistro("lixo")).toBeNull();
  });
  it("conta quem ainda sai do cadastro de hoje", () => {
    expect(
      semHistoricoDeSalario([{ salary: 1000 }, { salary: 0 }, { salary: 1000, historicoSalario: [{ valorCentavos: 1, desde: "2026-01" }] }])
    ).toBe(1);
  });
});
