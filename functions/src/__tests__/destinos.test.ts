import { describe, expect, it } from "vitest";
import { urlDaBarbearia } from "../destinos";

describe("endereço da barbearia para o redirecionamento do login", () => {
  it("usa o domínio próprio quando existe (o O Siqueira no domínio antigo)", () => {
    expect(urlDaBarbearia({ slug: "osiqueira", dominio: "osiqueira.jpproject.com.br" })).toBe(
      "https://osiqueira.jpproject.com.br"
    );
  });
  it("sem domínio próprio, nasce no topete.com.br", () => {
    expect(urlDaBarbearia({ slug: "barbeariadoze" })).toBe("https://barbeariadoze.topete.com.br");
  });
  it("slug estranho não vira endereço", () => {
    expect(urlDaBarbearia({ slug: "a/../b" })).toBeNull();
    expect(urlDaBarbearia({})).toBeNull();
  });
});
