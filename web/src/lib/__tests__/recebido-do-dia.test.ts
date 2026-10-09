import { describe, expect, it } from "vitest";
import { recebidoDoDia } from "@/lib/recebido-do-dia";

describe("recebido do dia", () => {
  it("sem estorno, é o bruto", () => {
    expect(recebidoDoDia(250, [], "2026-10-09")).toEqual({ recebido: 250, estornado: 0 });
  });

  it("desconta os estornos lançados hoje, como o fechamento do Telegram", () => {
    const r = recebidoDoDia(250, [{ date: "2026-10-09", grossAmount: 50 }], "2026-10-09");
    expect(r).toEqual({ recebido: 200, estornado: 50 });
  });

  it("estorno de outro dia não entra, mesmo de um atendimento de hoje", () => {
    const r = recebidoDoDia(250, [{ date: "2026-10-08", grossAmount: 50 }], "2026-10-09");
    expect(r.recebido).toBe(250);
  });

  it("estorno de corte de ontem, feito hoje, reduz o caixa de hoje", () => {
    expect(recebidoDoDia(100, [{ date: "2026-10-09", grossAmount: 30 }], "2026-10-09").recebido).toBe(70);
  });

  it("arredonda em centavos e ignora valor ilegível", () => {
    const r = recebidoDoDia(
      100.1,
      [
        { date: "2026-10-09", grossAmount: 0.2 },
        { date: "2026-10-09", grossAmount: 0.1 },
        { date: "2026-10-09", grossAmount: "x" },
      ],
      "2026-10-09"
    );
    expect(r).toEqual({ recebido: 99.8, estornado: 0.3 });
  });
});
