import { describe, expect, it } from "vitest";
import {
  doMes,
  fimDoHorario,
  grupoDoStatus,
  mesDoParametro,
  mesVizinho,
  montarRelatorio,
  type Contexto,
} from "@/lib/relatorio-da-agenda";
import type { BookingDoc } from "@/lib/domain";

/**
 * O relatório mensal da agenda (pedido de 28/09).
 *
 * O que importa provar: o total do cabeçalho é a soma exata das linhas, o
 * dinheiro só conta o que aconteceu ou vai acontecer, e a ordem do papel é a
 * ordem do dia — que é como o dono lê.
 */

type Reserva = Parameters<typeof montarRelatorio>[0][number];

let seq = 0;
function reserva(parcial: Partial<Reserva> & Pick<BookingDoc, "date" | "time">): Reserva {
  seq += 1;
  return {
    id: `b${seq}`,
    clientId: `c${seq}`,
    staffId: "s1",
    clientName: `Cliente ${seq}`,
    clientWhatsapp: "5511999990000",
    serviceIds: ["corte"],
    status: "confirmed",
    value: 50,
    ...parcial,
  };
}

const ctx: Contexto = {
  nomeDoBarbeiro: (id) => ({ s1: "Siqueira", s2: "Rafa" })[id],
  nomeDoServico: (id) => ({ corte: "Corte", barba: "Barba" })[id],
  mensalistas: new Set(["mensal"]),
  gradeMin: 30,
};

describe("grupo de cada status", () => {
  it("usa os status reais do domínio", () => {
    expect(grupoDoStatus("completed")).toBe("concluido");
    expect(grupoDoStatus("pending_payment")).toBe("a_fazer");
    expect(grupoDoStatus("confirmed")).toBe("a_fazer");
    expect(grupoDoStatus("confirmed_by_client")).toBe("a_fazer");
    expect(grupoDoStatus("no_show")).toBe("falta");
    expect(grupoDoStatus("fit_in_requested")).toBe("encaixe_pendente");
    expect(grupoDoStatus("cancelled_by_client")).toBe("cancelado");
    expect(grupoDoStatus("cancelled_by_shop")).toBe("cancelado");
    expect(grupoDoStatus("expired")).toBe("cancelado");
  });

  it("status desconhecido não some nem vira outro grupo", () => {
    expect(grupoDoStatus("estranho")).toBe("outro");
    expect(grupoDoStatus(undefined)).toBe("outro");
  });
});

describe("mês", () => {
  const hoje = new Date(2026, 8, 29); // 29/09/2026

  it("aceita YYYY-MM válido", () => {
    expect(mesDoParametro("2026-10", hoje)).toBe("2026-10");
  });

  it("parâmetro inválido ou ausente volta para o mês atual", () => {
    for (const p of [undefined, "", "2026-13", "2026-1", "abc", ["2026-10"]]) {
      expect(mesDoParametro(p, hoje)).toBe("2026-09");
    }
  });

  it("anda para os lados atravessando o ano", () => {
    expect(mesVizinho("2026-12", 1)).toBe("2027-01");
    expect(mesVizinho("2026-01", -1)).toBe("2025-12");
    expect(mesVizinho("2026-03", -1)).toBe("2026-02");
  });

  it("recorta pelo prefixo da data", () => {
    expect(doMes("2026-10-01", "2026-10")).toBe(true);
    expect(doMes("2026-10-31", "2026-10")).toBe(true);
    expect(doMes("2026-11-01", "2026-10")).toBe(false);
    expect(doMes(undefined, "2026-10")).toBe(false);
  });
});

describe("fim do horário", () => {
  it("soma a duração", () => {
    expect(fimDoHorario("09:00", 45)).toBe("09:45");
    expect(fimDoHorario("09:30", 90)).toBe("11:00");
  });

  it("horário ilegível não vira NaN", () => {
    expect(fimDoHorario("", 30)).toBe("");
  });
});

describe("montarRelatorio", () => {
  const reservas: Reserva[] = [
    reserva({ date: "2026-10-02", time: "15:00", status: "completed", value: 60 }),
    reserva({ date: "2026-10-02", time: "09:00", status: "confirmed", value: 40 }),
    reserva({ date: "2026-10-01", time: "18:00", status: "pending_payment", value: 30 }),
    reserva({ date: "2026-10-01", time: "10:00", status: "no_show", value: 50 }),
    reserva({ date: "2026-10-03", time: "11:00", status: "fit_in_requested", value: 35 }),
    reserva({ date: "2026-10-03", time: "12:00", status: "cancelled_by_client", value: 70 }),
    reserva({ date: "2026-10-01", time: "08:00", status: "expired", value: 20 }),
    reserva({ date: "2026-10-04", time: "08:00", status: "estranho" as BookingDoc["status"], value: 99 }),
    // Fora do mês: não entra em nada.
    reserva({ date: "2026-09-30", time: "10:00", status: "completed", value: 1000 }),
    reserva({ date: "2026-11-01", time: "10:00", status: "confirmed", value: 1000 }),
  ];
  const r = montarRelatorio(reservas, "2026-10", ctx);

  it("o total é a soma exata das contagens", () => {
    const { total, concluidos, aFazer, faltas, encaixesPendentes, cancelados, outros } = r.resumo;
    expect(total).toBe(8);
    expect(concluidos + aFazer + faltas + encaixesPendentes + cancelados + outros).toBe(total);
    expect({ concluidos, aFazer, faltas, encaixesPendentes, cancelados, outros }).toEqual({
      concluidos: 1,
      aFazer: 2,
      faltas: 1,
      encaixesPendentes: 1,
      cancelados: 2,
      outros: 1,
    });
  });

  it("previsto = a fazer + concluídos; realizado = só concluídos", () => {
    expect(r.resumo.valorPrevisto).toBe(60 + 40 + 30);
    expect(r.resumo.valorRealizado).toBe(60);
  });

  it("falta, pedido de encaixe, cancelado e desconhecido não viram dinheiro", () => {
    // Só eles no mês: nada previsto, nada realizado — mas todos contados.
    const semDinheiro = montarRelatorio(
      reservas.filter((b) => !["completed", "confirmed", "pending_payment"].includes(b.status)),
      "2026-10",
      ctx
    );
    expect(semDinheiro.resumo.total).toBe(5);
    expect(semDinheiro.resumo.valorPrevisto).toBe(0);
    expect(semDinheiro.resumo.valorRealizado).toBe(0);
  });

  it("dias em ordem, horários em ordem dentro do dia", () => {
    expect(r.dias.map((d) => d.data)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(r.dias[0].linhas.map((l) => l.inicio)).toEqual(["10:00", "18:00"]);
    expect(r.dias[1].linhas.map((l) => l.inicio)).toEqual(["09:00", "15:00"]);
  });

  it("cancelados e expirados vão para a seção própria, em ordem", () => {
    expect(r.cancelados.map((l) => `${l.data} ${l.inicio}`)).toEqual([
      "2026-10-01 08:00",
      "2026-10-03 12:00",
    ]);
    const nasAgendas = r.dias.flatMap((d) => d.linhas).map((l) => l.grupo);
    expect(nasAgendas).not.toContain("cancelado");
  });

  it("toda reserva do mês aparece exatamente uma vez", () => {
    const linhas = r.dias.flatMap((d) => d.linhas).length + r.cancelados.length;
    expect(linhas).toBe(r.resumo.total);
  });

  it("status legível em português, inclusive o desconhecido", () => {
    const linhas = [...r.dias.flatMap((d) => d.linhas), ...r.cancelados];
    const por = (inicio: string, data: string) => linhas.find((l) => l.inicio === inicio && l.data === data)!;
    expect(por("10:00", "2026-10-01").status).toBe("Não compareceu");
    expect(por("12:00", "2026-10-03").status).toBe("Cancelado pelo cliente");
    expect(por("08:00", "2026-10-04").status).toContain("Situação não reconhecida");
  });

  it("mês sem reservas dá zero, não NaN", () => {
    const vazio = montarRelatorio(reservas, "2027-01", ctx);
    expect(vazio.resumo.total).toBe(0);
    expect(vazio.resumo.valorPrevisto).toBe(0);
    expect(vazio.dias).toEqual([]);
    expect(vazio.cancelados).toEqual([]);
  });
});

describe("linha", () => {
  const um = (parcial: Partial<Reserva>) =>
    montarRelatorio([reserva({ date: "2026-10-05", time: "14:00", ...parcial })], "2026-10", ctx)
      .dias[0].linhas[0];

  it("fim pela duração, ou pela grade quando a reserva não tem duração", () => {
    expect(um({ durationMin: 50 }).fim).toBe("14:50");
    expect(um({}).fim).toBe("14:30");
  });

  it("serviços gravados na reserva vencem; sem eles, o nome sai do cardápio", () => {
    expect(um({ serviceNames: ["Corte degradê", "Barba"] }).servicos).toBe("Corte degradê + Barba");
    expect(um({ serviceIds: ["corte", "barba"] }).servicos).toBe("Corte + Barba");
    expect(um({ serviceIds: ["apagado"] }).servicos).toBe("Serviço");
  });

  it("barbeiro pelo nome, e travessão quando não existe mais", () => {
    expect(um({ staffId: "s2" }).barbeiro).toBe("Rafa");
    expect(um({ staffId: "sumiu" }).barbeiro).toBe("—");
  });

  it("mensalista pela assinatura ativa ou pela cobertura gravada", () => {
    expect(um({ clientId: "mensal" }).mensalista).toBe(true);
    expect(um({ clientId: "avulso" }).mensalista).toBe(false);
    expect(
      um({
        clientId: "ex-mensal",
        status: "completed",
        cobertura: {
          tipo: "plano",
          subscriptionId: "x",
          planId: "p",
          planName: "Ilimitado",
          competencia: "2026-10",
          valorCoberto: 50,
          usoNaCompetencia: 1,
          cota: null,
        },
      }).mensalista
    ).toBe(true);
  });

  it("encaixe aprovado e pedido de encaixe são marcados", () => {
    expect(um({ isFitIn: true }).encaixe).toBe(true);
    expect(um({ status: "fit_in_requested" }).encaixe).toBe(true);
    expect(um({}).encaixe).toBe(false);
  });

  it("valor inválido vira zero", () => {
    expect(um({ value: Number.NaN }).valor).toBe(0);
  });
});

describe("parte coberta pelo plano", () => {
  it("é somada à parte, sem mexer no realizado", () => {
    const r = montarRelatorio(
      [
        reserva({
          date: "2026-10-05",
          time: "10:00",
          status: "completed",
          value: 50,
          cobertura: {
            tipo: "plano",
            subscriptionId: "x",
            planId: "p",
            planName: "Ilimitado",
            competencia: "2026-10",
            valorCoberto: 50,
            usoNaCompetencia: 1,
            cota: null,
          },
        }),
        reserva({ date: "2026-10-05", time: "11:00", status: "completed", value: 40 }),
      ],
      "2026-10",
      ctx
    );
    expect(r.resumo.valorRealizado).toBe(90);
    expect(r.resumo.valorCobertoPeloPlano).toBe(50);
  });
});
