import { describe, expect, it } from "vitest";
import { camposDoAlerta, MARCADOR_ALERTA } from "../alerta-da-plataforma";

describe("alerta da plataforma no log", () => {
  it("leva o marcador estável que a política de alerta filtra", () => {
    expect(MARCADOR_ALERTA).toBe("alertaDaPlataforma");
    const campos = camposDoAlerta("conferencia_financeira", { falhas: ["x"] });
    expect(campos.alertaDaPlataforma).toBe(true);
    expect(campos.tipo).toBe("conferencia_financeira");
    expect(campos.falhas).toEqual(["x"]);
  });
});
