import { describe, expect, it } from "vitest";
import { porBarbeiro, recebidoPorForma, resumoDeAmanha, resumoDoDia, textoDeAtraso, textoDeContagem, textoDeLivres } from "@/lib/resumo-do-dia";
import { caixaDoDia } from "@/lib/analytics";

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
    expect(x.faltas).toBe(1);
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
  it("agenda cheia só com o dia lotado; sem livre pela frente é outra frase", () => {
    expect(textoDeLivres(0, 100)).toBe("Agenda cheia");
    expect(textoDeLivres(0, 88)).toBe("Sem horário livre pela frente");
    expect(textoDeLivres(1, 64)).toBe("1 horário livre");
    expect(textoDeLivres(6, 64)).toBe("6 horários livres");
  });
});

describe("cockpit (02/10)", () => {
  const dia = [
    r("1", "09:00", "completed"),
    r("2", "09:30", "no_show"),
    r("3", "14:00", "confirmed", "Samuel"),
    r("4", "14:30", "confirmed", "Breno", 60),
    r("5", "16:00", "confirmed", "Vítor"),
    r("6", "17:00", "confirmed", "Caio"),
  ];

  it("na cadeira traz há quantos minutos começou e a duração do serviço", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("14:10"), toleranciaMin: 15, nomeDoServico });
    expect(x.naCadeira[0]).toMatchObject({ cliente: "Samuel", minutos: 10, duracaoMin: 30 });
  });

  it("os próximos do dia (até 3), em ordem, com a contagem de cada um", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("14:10"), toleranciaMin: 15, nomeDoServico });
    expect(x.proximos.map((p) => [p.hora, p.minutos])).toEqual([["14:30", 20], ["16:00", 110], ["17:00", 170]]);
  });

  it("segmentos da régua: feito, falta e pela frente, na ordem do dia", () => {
    const x = resumoDoDia({ reservas: dia, agora: as("08:00"), toleranciaMin: 10, nomeDoServico });
    expect(x.segmentos.map((s) => s.estado)).toEqual(["feito", "falta", "pela-frente", "pela-frente", "pela-frente", "pela-frente"]);
  });
});

describe("recebido por forma bate com o Recebido hoje", () => {
  const pg = (id: string, paymentMethod: string | null, grossAmount: number, origin = "servico") =>
    ({ id, date: D, paymentMethod, grossAmount, origin }) as never;

  it("atendimento, venda e mensalidade entram na forma em que foram pagos; cartão = débito + crédito", () => {
    const caixa = caixaDoDia([
      pg("a", "pix", 60), pg("b", "credit", 90), pg("c", "debit", 50),
      pg("d", "cash", 35), pg("e", "pix", 45, "venda"), pg("f", "credit", 149, "mensalidade"),
    ]);
    const f = recebidoPorForma(caixa);
    expect(f).toEqual([
      { forma: "Pix", valor: 105 },
      { forma: "Cartão", valor: 289 },
      { forma: "Dinheiro", valor: 35 },
    ]);
    expect(f.reduce((s, x) => s + x.valor, 0)).toBe(caixa.total);
  });

  it("pagamento sem forma aparece como 'Não informado' — a soma continua batendo", () => {
    const caixa = caixaDoDia([pg("a", "pix", 60), pg("b", null, 40)]);
    const f = recebidoPorForma(caixa);
    expect(f.at(-1)).toEqual({ forma: "Não informado", valor: 40 });
    expect(f.reduce((s, x) => s + x.valor, 0)).toBe(caixa.total);
  });
});

describe("por barbeiro (cartão Agora)", () => {
  const comBarbeiro = (id: string, time: string, status: string, staffId: string) =>
    ({ ...(r(id, time, status) as object), staffId }) as never;

  it("feitos e pela frente de cada um; falta e cancelado não entram nas colunas", () => {
    const linhas = porBarbeiro([
      comBarbeiro("1", "09:00", "completed", "b1"),
      comBarbeiro("2", "09:00", "completed", "b2"),
      comBarbeiro("3", "10:00", "confirmed", "b2"),
      comBarbeiro("4", "11:00", "no_show", "b2"),
      comBarbeiro("5", "12:00", "cancelled_by_client", "b1"),
    ]);
    expect(linhas).toEqual([
      { staffId: "b2", feitos: 1, pelaFrente: 1 },
      { staffId: "b1", feitos: 1, pelaFrente: 0 },
    ]);
  });

  it("empate fica na ordem da agenda", () => {
    const linhas = porBarbeiro([comBarbeiro("1", "10:00", "completed", "b1"), comBarbeiro("2", "09:00", "confirmed", "b2")]);
    expect(linhas.map((l) => l.staffId)).toEqual(["b2", "b1"]);
  });
});

describe("resumo de amanhã", () => {
  it("conta só quem ainda vai acontecer e lista os três primeiros em ordem", () => {
    const x = resumoDeAmanha({
      reservas: [
        r("1", "15:00", "confirmed", "Otávio"),
        r("2", "09:00", "pending_payment", "Ícaro"),
        r("3", "08:00", "cancelled_by_client", "Nelson"),
        r("4", "10:00", "confirmed_by_client", "Tiago"),
        r("5", "11:00", "confirmed", "Wesley"),
      ],
      nomeDoServico,
    });
    expect(x.total).toBe(4);
    expect(x.primeiros.map((p) => `${p.hora} ${p.cliente}`)).toEqual(["09:00 Ícaro", "10:00 Tiago", "11:00 Wesley"]);
  });

  it("nada marcado", () => {
    expect(resumoDeAmanha({ reservas: [], nomeDoServico })).toEqual({ total: 0, primeiros: [] });
  });
});
