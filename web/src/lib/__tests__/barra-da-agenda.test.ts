import { describe, expect, it } from "vitest";
import { filtroAposClique, medidasDasColunas, proximoChip, rotuloDosPedidos } from "@/lib/barra-da-agenda";

describe("contador de pedidos de encaixe", () => {
  it("concorda no singular e no plural", () => {
    expect(rotuloDosPedidos(1)).toBe("1 pedido de encaixe");
    expect(rotuloDosPedidos(2)).toBe("2 pedidos de encaixe");
  });

  it("zero não some: vira texto esmaecido", () => {
    expect(rotuloDosPedidos(0)).toBe("Sem pedidos");
  });
});

describe("largura das colunas da grade", () => {
  it("um barbeiro: coluna com teto confortável, quadro que abraça o conteúdo", () => {
    const m = medidasDasColunas(1);
    expect(m.trilha).toBe("minmax(0, 35rem)");
    expect(m.contida).toBe(true);
  });

  it("dois ou três: largura mínima e máxima", () => {
    for (const n of [2, 3]) {
      const m = medidasDasColunas(n);
      expect(m.trilha).toBe("minmax(10rem, 22rem)");
      expect(m.contida).toBe(true);
    }
  });

  it("quatro ou mais dividem o espaço", () => {
    const m = medidasDasColunas(6);
    expect(m.trilha).toBe("minmax(7rem, 1fr)");
    expect(m.contida).toBe(false);
  });
});

describe("teclado entre os chips", () => {
  it("← e → andam um chip e param nas pontas", () => {
    expect(proximoChip(4, 1, "ArrowRight")).toBe(2);
    expect(proximoChip(4, 1, "ArrowLeft")).toBe(0);
    expect(proximoChip(4, 0, "ArrowLeft")).toBe(0);
    expect(proximoChip(4, 3, "ArrowRight")).toBe(3);
  });

  it("Home e End vão às pontas; outra tecla não mexe", () => {
    expect(proximoChip(4, 2, "Home")).toBe(0);
    expect(proximoChip(4, 1, "End")).toBe(3);
    expect(proximoChip(4, 2, "a")).toBe(2);
  });
});

describe("clique no chip", () => {
  it("clicar no já selecionado não volta para Todos", () => {
    expect(filtroAposClique("ana", "ana")).toBe("ana");
    expect(filtroAposClique(null, null)).toBeNull();
  });

  it("só o chip Todos volta para Todos; outro chip troca", () => {
    expect(filtroAposClique("ana", null)).toBeNull();
    expect(filtroAposClique("ana", "beto")).toBe("beto");
    expect(filtroAposClique(null, "beto")).toBe("beto");
  });
});
