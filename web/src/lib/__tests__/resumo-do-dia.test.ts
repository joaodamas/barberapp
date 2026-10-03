import { describe, expect, it } from "vitest";
import { resumoDoDia, textoDeAtraso, textoDeContagem, textoDeLivres } from "@/lib/resumo-do-dia";

const D = "2026-10-02";
const r = (id: string, time: string, status: string, clientName = "Cliente " + id, durationMin = 30) =>
  ({ id, date: D, time, status, clientName, serviceIds: ["c"], durationMin }) as never;
const nomeDoServico = () => "Corte";
const as = (hhmm: string) => new Date(`${D}T${hhmm}:00`);

describe("resumo do dia (topo da tela Hoje)", () => {
  const dia = [
    r("1", "09:00", "completed"),
    r("2", "09:30", "no_show"),
    r("3", "14:00", "confirmed", "Samuel"),
    r("4", "14:30", "confirmed", "Breno", 60),
    r("5", "16:00", "cancelled_by_client"),
  ];

  it("conta como a ocupação conta: feitos, falta e em aberto; cancelado fica fora", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("08:00"), toleranciaMin: 10, nomeDoServico });
    expect(x.total).toBe(4);
    expect(x.feitos).toBe(1);
    expect(x.pelaFrente).toBe(2);
    expect(x.progressoPct).toBe(25);
  });

  it("quem está na cadeira agora e o próximo, com minutos até começar", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("14:10"), toleranciaMin: 15, nomeDoServico });
    expect(x.naCadeira.map((a) => a.cliente)).toEqual(["Samuel"]);
    expect(x.proximo).toMatchObject({ cliente: "Breno", hora: "14:30", minutos: 20, servico: "Corte" });
    expect(x.atrasado).toBeNull();
  });

  it("passou da tolerância e não concluiu: atrasado, e sai de 'na cadeira'", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("14:22"), toleranciaMin: 10, nomeDoServico });
    expect(x.atrasado).toMatchObject({ cliente: "Samuel", minutos: 22 });
    expect(x.naCadeira).toEqual([]);
    expect(x.proximo?.cliente).toBe("Breno");
  });

  it("fim do dia: sem próximo; sem relógio (servidor): nada de foco", () => {
    expect(resumoDoDia({ reservas: dia, agora: as("19:00"), toleranciaMin: 10, nomeDoServico }).proximo).toBeNull();
    const semRelogio = resumoDoDia({ reservas: dia, agora: null, toleranciaMin: 10, nomeDoServico });
    expect(semRelogio.proximo).toBeNull();
    expect(semRelogio.naCadeira).toEqual([]);
  });

  it("dia sem atendimentos não inventa progresso", () => {
    expect(resumoDoDia({ reservas: [], agora: as("10:00"), toleranciaMin: 10, nomeDoServico }).progressoPct).toBeNull();
  });
});

describe("frases", () => {
  it("contagem regressiva", () => {
    expect(textoDeContagem(0)).toBe("agora");
    expect(textoDeContagem(12)).toBe("em 12 min");
    expect(textoDeContagem(65)).toBe("em 1h05");
    expect(textoDeContagem(120)).toBe("em 2h");
  });
  it("atraso", () => {
    expect(textoDeAtraso(7)).toBe("Atrasado 7 min");
    expect(textoDeAtraso(70)).toBe("Atrasado 1h10");
  });
  it("zero horário livre é agenda cheia", () => {
    expect(textoDeLivres(0)).toBe("Agenda cheia");
    expect(textoDeLivres(1)).toBe("1 horário livre");
    expect(textoDeLivres(6)).toBe("6 horários livres");
  });
});
