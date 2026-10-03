import { describe, expect, it } from "vitest";
import {
  ARQUIVOS_DA_MARCA,
  caminhoNaMarca,
  ehLogoDaBarbearia,
  formatoDoLogo,
  iconesDoLogo,
  ICONES_DO_LOGO,
  logoSemOtimizar,
  mensagemDeFalhaNaMarca,
  objetoDoStorage,
  problemaNoArquivo,
  semToken,
  TAMANHO_MAXIMO_DO_LOGO,
} from "@/lib/logo-da-marca";
import { EscritaBloqueada } from "@/lib/db/trava-de-escrita";
import { toTenant } from "@/lib/tenant-shape";
import { iconesDaMarca, MARCA_GERADA } from "@/lib/monograma";

const BUCKET = "axon-barber.firebasestorage.app";
const url = (caminho: string, host = "https://firebasestorage.googleapis.com") =>
  `${host}/v0/b/${BUCKET}/o/${encodeURIComponent(caminho)}?alt=media`;

const LOGO_DA_NAVALHA = url("barbershops/navalha/brand/1727000000000/logo.png");

describe("arquivo escolhido", () => {
  it("aceita PNG, JPG, WEBP e SVG até 2 MB", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(problemaNoArquivo({ type, size: 1000 }), type).toBeNull();
    }
  });

  it("recusa outros formatos com uma frase que o dono entende", () => {
    expect(problemaNoArquivo({ type: "image/heic", size: 1000 })).toMatch(/PNG, JPG, WEBP ou SVG/);
    expect(problemaNoArquivo({ type: "application/pdf", size: 1000 })).not.toBeNull();
  });

  it("recusa acima de 2 MB", () => {
    expect(problemaNoArquivo({ type: "image/png", size: TAMANHO_MAXIMO_DO_LOGO })).toBeNull();
    expect(problemaNoArquivo({ type: "image/png", size: TAMANHO_MAXIMO_DO_LOGO + 1 })).toMatch(/2 MB/);
  });

  it("recusa arquivo vazio", () => {
    expect(problemaNoArquivo({ type: "image/png", size: 0 })).not.toBeNull();
  });
});

describe("caminho no Storage", () => {
  it("cada envio numa pasta com carimbo, dentro da marca da barbearia", () => {
    expect(caminhoNaMarca("navalha", 1727000000000, "logo.png")).toBe(
      "barbershops/navalha/brand/1727000000000/logo.png"
    );
    expect(caminhoNaMarca("navalha", 1727000000000.7, "favicon-32.png")).toBe(
      "barbershops/navalha/brand/1727000000000/favicon-32.png"
    );
  });

  it("os quatro tamanhos pedidos existem: 512, 192, 180 (Apple) e 32 (favicon)", () => {
    const lados = ICONES_DO_LOGO.map((i) => i.lado);
    for (const lado of [512, 192, 180, 32]) expect(lados).toContain(lado);
    expect(ARQUIVOS_DA_MARCA).toContain("logo.png");
  });

  it("o ícone maskable cabe no círculo seguro de 80% do Android", () => {
    for (const i of ICONES_DO_LOGO.filter((i) => i.arquivo.startsWith("maskable"))) {
      expect(i.escala * Math.SQRT2).toBeLessThanOrEqual(0.8);
    }
  });

  it("o ícone da Apple tem fundo — o iOS pinta transparência de preto", () => {
    expect(ICONES_DO_LOGO.find((i) => i.arquivo === "apple-touch-icon.png")?.comFundo).toBe(true);
  });
});

describe("o endereço é o logo DESTA barbearia?", () => {
  it("lê bucket e caminho da URL de download", () => {
    expect(objetoDoStorage(LOGO_DA_NAVALHA)).toEqual({
      bucket: BUCKET,
      caminho: "barbershops/navalha/brand/1727000000000/logo.png",
    });
  });

  it("aceita o logo de um envio da própria barbearia", () => {
    expect(ehLogoDaBarbearia(LOGO_DA_NAVALHA, "navalha")).toBe(true);
    expect(ehLogoDaBarbearia(`${LOGO_DA_NAVALHA}&token=abc`, "navalha")).toBe(true);
  });

  it("🔒 recusa o logo de outra barbearia", () => {
    expect(ehLogoDaBarbearia(LOGO_DA_NAVALHA, "outra")).toBe(false);
    // Prefixo não basta: "naval" não é dono da pasta "navalha".
    expect(ehLogoDaBarbearia(LOGO_DA_NAVALHA, "naval")).toBe(false);
  });

  it("🔒 recusa o que não tem o formato exato de um envio", () => {
    for (const caminho of [
      "barbershops/navalha/brand/logo.png",
      "barbershops/navalha/brand/1727000000000/icon-512.png",
      "barbershops/navalha/brand/abc/logo.png",
      "barbershops/navalha/brand/../outra/brand/1727000000000/logo.png",
      "barbershops/navalha/brand/1727000000000/../logo.png",
      "barbershops/navalha/photos/1727000000000/logo.png",
    ]) {
      expect(ehLogoDaBarbearia(url(caminho), "navalha"), caminho).toBe(false);
    }
  });

  it("🔒 recusa qualquer outro host", () => {
    const caminho = encodeURIComponent("barbershops/navalha/brand/1727000000000/logo.png");
    for (const u of [
      `https://evil.example/v0/b/${BUCKET}/o/${caminho}`,
      `https://firebasestorage.googleapis.com.evil.example/v0/b/${BUCKET}/o/${caminho}`,
      `http://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${caminho}`,
      `http://169.254.169.254/v0/b/${BUCKET}/o/${caminho}`,
      "data:image/png;base64,AAAA",
      "javascript:alert(1)",
      "",
    ]) {
      expect(ehLogoDaBarbearia(u, "navalha"), u).toBe(false);
    }
    expect(ehLogoDaBarbearia(undefined, "navalha")).toBe(false);
    expect(ehLogoDaBarbearia(LOGO_DA_NAVALHA, "")).toBe(false);
  });

  it("o emulador só vale quando o app está no emulador", () => {
    const local = url("barbershops/navalha/brand/1727000000000/logo.png", "http://127.0.0.1:9199");
    expect(ehLogoDaBarbearia(local, "navalha", false)).toBe(false);
    expect(ehLogoDaBarbearia(local, "navalha", true)).toBe(true);
    expect(ehLogoDaBarbearia(local.replace(":9199", ":8080"), "navalha", true)).toBe(false);
  });

  it("URL malformada não derruba ninguém", () => {
    expect(objetoDoStorage("https://firebasestorage.googleapis.com/v0/b/x/o/%E0%A4%A")).toBeNull();
    expect(objetoDoStorage("não é url")).toBeNull();
  });

  it("tira o token do getDownloadURL e mantém o resto", () => {
    expect(semToken(`${LOGO_DA_NAVALHA}&token=abc-123`)).toBe(LOGO_DA_NAVALHA);
  });
});

describe("ícones a partir do logo", () => {
  it("trocam só o nome do arquivo, na mesma pasta do envio", () => {
    const icones = iconesDoLogo(LOGO_DA_NAVALHA)!;
    expect(icones.i512).toBe(url("barbershops/navalha/brand/1727000000000/icon-512.png"));
    expect(icones.i192).toBe(url("barbershops/navalha/brand/1727000000000/icon-192.png"));
    expect(icones.m512).toBe(url("barbershops/navalha/brand/1727000000000/maskable-512.png"));
    expect(icones.apple).toBe(url("barbershops/navalha/brand/1727000000000/apple-touch-icon.png"));
    expect(icones.favicon).toBe(url("barbershops/navalha/brand/1727000000000/favicon-32.png"));
  });

  it("nada a derivar de logo local ou do monograma", () => {
    expect(iconesDoLogo("/tenants/osiqueira/logo.svg")).toBeNull();
    expect(iconesDoLogo(MARCA_GERADA)).toBeNull();
  });

  it("o logo enviado vence a pasta de ícones da plataforma; sem logo, valem os de antes", () => {
    expect(iconesDaMarca({ logo: LOGO_DA_NAVALHA, icones: "/tenants/navalha/icons" }).apple).toBe(
      url("barbershops/navalha/brand/1727000000000/apple-touch-icon.png")
    );
    expect(iconesDaMarca({ logo: "/tenants/osiqueira/logo.svg", icones: "/tenants/osiqueira/icons" }).apple).toBe(
      "/tenants/osiqueira/icons/apple-touch-icon.png"
    );
    expect(iconesDaMarca({ logo: MARCA_GERADA }).apple).toBe("/icone/180");
  });
});

describe("formato e otimização", () => {
  it("o formato sai do nome do arquivo, mesmo com a query do Storage", () => {
    expect(formatoDoLogo(LOGO_DA_NAVALHA)).toBe("image/png");
    expect(formatoDoLogo(MARCA_GERADA)).toBe("image/svg+xml");
    expect(formatoDoLogo("/tenants/osiqueira/logo.svg")).toBe("image/svg+xml");
    expect(formatoDoLogo("/sem-extensao")).toBeNull();
  });

  it("logo do Storage vai direto, sem o otimizador do Next", () => {
    expect(logoSemOtimizar(LOGO_DA_NAVALHA)).toBe(true);
    expect(logoSemOtimizar(url("barbershops/b/brand/1/logo.png", "http://127.0.0.1:9199"))).toBe(true);
  });

  it("logo local PNG continua passando pelo otimizador", () => {
    expect(logoSemOtimizar("/tenants/osiqueira/logo.png")).toBe(false);
  });
});

describe("a leitura da ficha descarta logo que não é desta barbearia", () => {
  const marca = (logo: unknown) => toTenant("navalha", { brand: { name: "Barbearia Navalha", logo } }).brand;

  it("logo do próprio envio é mantido, e o horizontal o acompanha", () => {
    const b = marca(LOGO_DA_NAVALHA);
    expect(b.logo).toBe(LOGO_DA_NAVALHA);
    expect(b.logoHorizontal).toBe(LOGO_DA_NAVALHA);
  });

  it("caminho local do piloto continua valendo", () => {
    expect(marca("/tenants/osiqueira/logo.svg").logo).toBe("/tenants/osiqueira/logo.svg");
  });

  it.each([
    ["site de fora", "https://evil.example/logo.png"],
    ["logo de outra barbearia", url("barbershops/outra/brand/1727000000000/logo.png")],
    ["endereço que o navegador lê como outro site", "//evil.example/logo.png"],
    ["barra invertida", "/\\evil.example/logo.png"],
    ["data URL", "data:image/svg+xml,<svg/>"],
    ["número", 42],
  ])("%s vira o monograma", (_, logo) => {
    expect(marca(logo).logo).toBe(MARCA_GERADA);
  });
});

describe("mensagem de falha", () => {
  it("permissão, conexão e o resto — sempre dizendo que nada mudou", () => {
    expect(mensagemDeFalhaNaMarca({ code: "storage/unauthorized" })).toMatch(/permissão/);
    expect(mensagemDeFalhaNaMarca({ code: "permission-denied" })).toMatch(/permissão/);
    expect(mensagemDeFalhaNaMarca({ code: "storage/retry-limit-exceeded" })).toMatch(/Nada foi alterado/);
    expect(mensagemDeFalhaNaMarca(new Error("boom"))).toMatch(/Nada foi alterado/);
  });

  it("modo leitura usa a frase da própria trava", () => {
    const e = new EscritaBloqueada("suspensa");
    expect(mensagemDeFalhaNaMarca(e)).toBe(e.message);
  });
});
