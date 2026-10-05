import { describe, expect, it } from "vitest";
import { diasAntes, situacaoDaConclusao } from "../conferencia-financeira";

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
