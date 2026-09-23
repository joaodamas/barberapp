import { describe, expect, it } from "vitest";
import { iconesDaMarca, iniciaisDe, svgDoMonograma, tintaSobre } from "@/lib/monograma";
import { toTenant } from "@/lib/tenant-shape";

describe("monograma — a marca de quem ainda não subiu logo", () => {
  it("usa as iniciais que identificam, não 'Barbearia' nem 'O'", () => {
    expect(iniciaisDe("Navalha E2E")).toBe("NE");
    expect(iniciaisDe("O Siqueira Barbearia")).toBe("S");
    expect(iniciaisDe("Barbearia do Zé")).toBe("Z");
    expect(iniciaisDe("barbearia")).toBe("B");
    expect(iniciaisDe("")).toBe("B");
  });

  it("escolhe a tinta que se lê sobre a cor do dono", () => {
    expect(tintaSobre("#ffffff")).toBe("#0f172a");
    expect(tintaSobre("#1e293b")).toBe("#ffffff");
    expect(tintaSobre("não é cor")).toBe(tintaSobre("#b8863a"));
  });

  it("não deixa o nome escapar do SVG", () => {
    const svg = svgDoMonograma('Zé <script>"', "#123456");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain('fill="#123456"');
  });
});

describe("marca normalizada — nenhuma barbearia com a marca de outra", () => {
  /* O cadastro gravava "/logo.svg", o selo d'O Siqueira, em toda barbearia
   * nova (rodada E2E de 23/09). */
  it("o logo herdado do piloto vira o monograma da própria barbearia", () => {
    const t = toTenant("x", { brand: { name: "Navalha", logo: "/logo.svg", logoHorizontal: "/logo-horizontal.svg" } });
    expect(t.brand.logo).toBe("/marca.svg");
    expect(t.brand.logoHorizontal).toBe("/marca.svg");
  });

  it("sem logo gravado, também", () => {
    expect(toTenant("x", { brand: { name: "Navalha" } }).brand.logo).toBe("/marca.svg");
  });

  it("logo próprio é respeitado", () => {
    const t = toTenant("x", { brand: { name: "O Siqueira", logo: "/tenants/osiqueira/logo.svg" } });
    expect(t.brand.logo).toBe("/tenants/osiqueira/logo.svg");
  });

  it("ícones do PWA: próprios quando existem, gerados quando não", () => {
    expect(iconesDaMarca({}).i192).toBe("/icone/192");
    expect(iconesDaMarca({ icones: "/tenants/osiqueira/icons" }).i192).toBe("/tenants/osiqueira/icons/icon-192.png");
  });
});
