import { describe, expect, it } from "vitest";
import { filtroValido, montarGrade, reservasDoFiltro } from "@/lib/grade-por-barbeiro";

const SEGUNDA = "2026-10-12";
const loja = { weekdays: [1, 2, 3, 4, 5, 6], opensAt: "09:00", closesAt: "12:00", slotMinutes: 30, breaks: [] };

const ana = { id: "ana", name: "Ana" };
const beto = { id: "beto", name: "Beto" };

const res = (id: string, staffId: string, time: string, durationMin = 30) => ({
  id,
  staffId,
  time,
  durationMin,
});

const base = { dia: SEGUNDA, schedule: loja, filtro: null, modo: "colunas" as const };

describe("grade por barbeiro", () => {
  it("dois barbeiros às 10h ficam em colunas próprias, cada um na faixa 0", () => {
    const g = montarGrade({ ...base, equipe: [ana, beto], reservas: [res("a", "ana", "10:00"), res("b", "beto", "10:00")] });
    expect(g.colunas.map((c) => c.nome)).toEqual(["Ana", "Beto"]);
    expect(g.colunas.every((c) => c.nFaixas === 1 && c.faixas[0].faixa === 0)).toBe(true);
  });

  it("o livre é por barbeiro: quem está ocupado às 10h não tem livre, o outro tem", () => {
    const g = montarGrade({ ...base, equipe: [ana, beto], reservas: [res("a", "ana", "10:00")] });
    const [colAna, colBeto] = g.colunas;
    expect(colAna.livres).not.toContain(600);
    expect(colBeto.livres).toContain(600);
  });

  it("atendimento de 60 min tira duas linhas de livre", () => {
    const g = montarGrade({ ...base, equipe: [ana], reservas: [res("a", "ana", "10:00", 60)] });
    expect(g.colunas[0].livres).toEqual([540, 570, 630, 660]);
  });

  it("encaixe sobreposto na MESMA coluna abre a segunda faixa", () => {
    const g = montarGrade({
      ...base,
      equipe: [ana, beto],
      reservas: [res("a", "ana", "10:00", 60), res("e", "ana", "10:30")],
    });
    expect(g.colunas[0].nFaixas).toBe(2);
    expect(g.colunas[1].nFaixas).toBe(1);
  });

  it("barbeiro inativo não ganha coluna; com atendimento marcado, ganha", () => {
    const inativo = { id: "caio", name: "Caio", active: false };
    expect(montarGrade({ ...base, equipe: [ana, inativo], reservas: [] }).colunas.map((c) => c.id)).toEqual(["ana"]);
    const g = montarGrade({ ...base, equipe: [ana, inativo], reservas: [res("c", "caio", "09:00")] });
    expect(g.colunas.map((c) => c.id)).toEqual(["ana", "caio"]);
  });

  it("jornada própria: quem não trabalha na segunda não tem coluna", () => {
    const terca = { id: "duda", name: "Duda", schedule: { weekdays: [2, 3] } };
    expect(montarGrade({ ...base, equipe: [ana, terca], reservas: [] }).colunas.map((c) => c.id)).toEqual(["ana"]);
  });

  it("jornada própria mais curta limita o livre dele, e a grade acompanha o mais longo", () => {
    const tarde = { id: "edu", name: "Edu", schedule: { opensAt: "10:30" } };
    const g = montarGrade({ ...base, equipe: [ana, tarde], reservas: [] });
    expect(g.abre).toBe(540);
    expect(g.fecha).toBe(720);
    expect(g.colunas[1].livres).toEqual([630, 660]);
    expect(g.colunas[0].livres).toEqual([540, 570, 600, 630, 660]);
  });

  it("intervalo é por barbeiro", () => {
    const almoco = { id: "fabio", name: "Fabio", schedule: { breaks: [{ from: "10:00", to: "11:00" }] } };
    const g = montarGrade({ ...base, equipe: [ana, almoco], reservas: [] });
    expect(g.colunas[1].intervalos).toEqual([600, 630]);
    expect(g.colunas[1].livres).not.toContain(600);
    expect(g.colunas[0].intervalos).toEqual([]);
  });

  it("filtro deixa só o barbeiro escolhido, mesmo de folga", () => {
    const g = montarGrade({ ...base, filtro: "ana", equipe: [ana, beto], reservas: [res("b", "beto", "10:00")] });
    expect(g.colunas.map((c) => c.id)).toEqual(["ana"]);
    const folga = { id: "duda", name: "Duda", schedule: { weekdays: [2] } };
    const f = montarGrade({ ...base, filtro: "duda", equipe: [ana, folga], reservas: [] });
    expect(f.colunas).toHaveLength(1);
    expect(f.colunas[0].folga).toBe(true);
    expect(f.colunas[0].livres).toEqual([]);
  });

  it("modo única junta todos numa coluna, com faixas para as sobreposições", () => {
    const g = montarGrade({
      ...base,
      modo: "unica",
      equipe: [ana, beto],
      reservas: [res("a", "ana", "10:00"), res("b", "beto", "10:00")],
    });
    expect(g.colunas).toHaveLength(1);
    expect(g.colunas[0].id).toBeNull();
    expect(g.colunas[0].nFaixas).toBe(2);
  });

  it("barbearia sem equipe cadastrada: uma coluna da jornada da loja, como antes", () => {
    const g = montarGrade({ ...base, equipe: [], reservas: [res("a", "x", "10:00")] });
    expect(g.colunas).toHaveLength(1);
    expect(g.colunas[0].faixas).toHaveLength(1);
  });

  it("atendimento fora da jornada estica a grade", () => {
    const g = montarGrade({ ...base, equipe: [ana], reservas: [res("a", "ana", "13:00")] });
    expect(g.fecha).toBe(810);
    expect(g.linhas.at(-1)).toBe(780);
  });

  it("dia fechado e sem atendimento: nenhuma coluna", () => {
    const domingo = "2026-10-11";
    expect(montarGrade({ ...base, dia: domingo, equipe: [ana, beto], reservas: [] }).colunas).toEqual([]);
  });

  it("filtro guardado de quem saiu da equipe volta a Todos", () => {
    expect(filtroValido("ana", [ana])).toBe("ana");
    expect(filtroValido("zeca", [ana])).toBeNull();
    expect(filtroValido("caio", [{ id: "caio", active: false }])).toBeNull();
    expect(filtroValido(null, [ana])).toBeNull();
  });

  it("reservasDoFiltro", () => {
    const rs = [res("a", "ana", "09:00"), res("b", "beto", "09:00")];
    expect(reservasDoFiltro(rs, null)).toHaveLength(2);
    expect(reservasDoFiltro(rs, "beto").map((r) => r.id)).toEqual(["b"]);
  });
});
