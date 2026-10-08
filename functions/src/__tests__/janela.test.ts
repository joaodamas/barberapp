import { describe, expect, it } from "vitest";
import { limiteDoCliente } from "../janela";

const hoje = "2026-09-28";

describe("janela de agenda do cliente", () => {
  it("avulso marca até a data liberada pelo barbeiro", () => {
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2026-10-13" }, ehMensalista: false })).toBe("2026-10-13");
  });

  it("mensalista enxerga mais à frente — os dias que o barbeiro definiu", () => {
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2026-10-13", diasMensalista: 60 }, ehMensalista: true })).toBe("2026-11-27");
  });

  it("mensalista nunca enxerga menos que o avulso: vale o maior entre o plano e a data liberada", () => {
    /* Barbeiro liberou até 15/11 (48 dias) e o plano dá 30: o mensalista vê até 15/11. */
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2026-11-15", diasMensalista: 30 }, ehMensalista: true })).toBe("2026-11-15");
    /* Sem dias definidos, o padrão (60) ainda ganha de uma data mais curta... */
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2026-10-13" }, ehMensalista: true })).toBe("2026-11-27");
    /* ...e perde para uma mais longa. */
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2027-01-10" }, ehMensalista: true })).toBe("2027-01-10");
  });

  it("a data liberada também respeita o teto para o mensalista", () => {
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2030-01-01", diasMensalista: 30 }, ehMensalista: true })).toBe("2027-09-28");
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "amanhã", diasMensalista: 30 }, ehMensalista: true })).toBe("2026-10-28");
  });

  it("sem liberação configurada, vale o horizonte de sempre (60 dias)", () => {
    expect(limiteDoCliente({ hoje, janela: null, ehMensalista: false })).toBe("2026-11-27");
    expect(limiteDoCliente({ hoje, janela: {}, ehMensalista: true })).toBe("2026-11-27");
  });

  it("data liberada no passado fecha a agenda do avulso até o barbeiro liberar de novo", () => {
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2026-09-20" }, ehMensalista: false })).toBe("2026-09-20");
  });

  it("valores absurdos não abrem a agenda para anos à frente", () => {
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "2030-01-01" }, ehMensalista: false })).toBe("2027-09-28");
    expect(limiteDoCliente({ hoje, janela: { diasMensalista: 5000 }, ehMensalista: true })).toBe("2027-09-28");
    expect(limiteDoCliente({ hoje, janela: { abertaAte: "amanhã" }, ehMensalista: false })).toBe("2026-11-27");
  });
});
