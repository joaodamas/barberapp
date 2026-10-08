import { describe, expect, it } from "vitest";
import { aparelhoRecebe, destinoDoToque } from "../push/push";

/**
 * Quem recebe a notificação do app (08/10).
 *
 * Mandava para todos os aparelhos da loja: com barbeiro de login próprio, o
 * celular de cada um recebia nome e horário dos clientes dos colegas.
 */
describe("push · quem recebe", () => {
  it("o dono recebe tudo", () => {
    expect(aparelhoRecebe({ papel: "owner" }, "s-1")).toBe(true);
    expect(aparelhoRecebe({ papel: "owner" }, null)).toBe(true);
  });

  it("o barbeiro recebe só o que é da cadeira dele", () => {
    expect(aparelhoRecebe({ papel: "staff", staffId: "s-1" }, "s-1")).toBe(true);
    expect(aparelhoRecebe({ papel: "staff", staffId: "s-1" }, "s-2")).toBe(false);
    expect(aparelhoRecebe({ papel: "staff", staffId: "s-1" }, null)).toBe(false);
  });

  it("🔒 aparelho de barbeiro sem a cadeira gravada (registro antigo) não recebe — na dúvida, não vaza", () => {
    expect(aparelhoRecebe({ papel: "staff" }, "s-1")).toBe(false);
    expect(aparelhoRecebe({ papel: "staff", staffId: null }, "s-1")).toBe(false);
  });

  it("🔒 papel desconhecido não recebe", () => {
    expect(aparelhoRecebe({}, "s-1")).toBe(false);
    expect(aparelhoRecebe({ papel: "cliente", staffId: "s-1" }, "s-1")).toBe(false);
  });

  it("o toque leva cada um para a sua área", () => {
    expect(destinoDoToque("owner")).toBe("/painel/agenda");
    expect(destinoDoToque("staff")).toBe("/barbeiro");
  });
});
