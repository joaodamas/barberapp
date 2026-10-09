import { describe, expect, it } from "vitest";
import {
  datasDoHorarioFixo,
  diaDaSemanaDe,
  faseDaQuinzena,
  foiRemarcada,
  horarioFixoMudou,
  semanaDe,
  somenteDatasFuturas,
  semanaJaResolvida,
  horarioFixoValido,
  idDaOcorrencia,
  liberadaPeloFixo,
  lojaRecebeReservaDoFixo,
  ocorrenciaLiberavel,
  versaoDoHorario,
} from "../horario-fixo";
import { liberavelNaTroca } from "../booking";

const base = { hora: "17:00", staffId: "barbeiro-1", serviceIds: ["corte"] };

describe("horário fixo do mensalista", () => {
  it("dia da semana calculado pelo calendário, sem depender do fuso da máquina", () => {
    expect(diaDaSemanaDe("2026-09-29")).toBe(2); // terça
    expect(diaDaSemanaDe("2026-10-02")).toBe(5); // sexta
    expect(diaDaSemanaDe("2026-10-03")).toBe(6); // sábado
  });

  it("semanal: as próximas 8 semanas, a partir de hoje", () => {
    const datas = datasDoHorarioFixo({
      horario: { ...base, diaDaSemana: 5, frequencia: "semanal", inicio: "2026-10-02" },
      hoje: "2026-09-29",
    });
    expect(datas[0]).toBe("2026-10-02");
    expect(datas[1]).toBe("2026-10-09");
    expect(datas).toHaveLength(8);
    expect(datas.every((d) => diaDaSemanaDe(d) === 5)).toBe(true);
  });

  it("quinzenal mantém a âncora mesmo rodando no meio do ciclo", () => {
    const datas = datasDoHorarioFixo({
      horario: { ...base, diaDaSemana: 6, frequencia: "quinzenal", inicio: "2026-10-03" },
      hoje: "2026-10-05",
    });
    expect(datas[0]).toBe("2026-10-17");
    expect(datas[1]).toBe("2026-10-31");
  });

  it("não volta ao passado quando a âncora já passou", () => {
    const datas = datasDoHorarioFixo({
      horario: { ...base, diaDaSemana: 2, frequencia: "semanal", inicio: "2026-09-01" },
      hoje: "2026-09-29",
    });
    expect(datas[0]).toBe("2026-09-29");
  });

  it("recusa horário malformado e âncora fora do dia escolhido", () => {
    expect(horarioFixoValido({ ...base, diaDaSemana: 5, frequencia: "semanal", inicio: "2026-10-02" })).toBe(true);
    expect(horarioFixoValido({ ...base, diaDaSemana: 4, frequencia: "semanal", inicio: "2026-10-02" })).toBe(false);
    expect(horarioFixoValido({ ...base, hora: "25:00", diaDaSemana: 5, frequencia: "semanal", inicio: "2026-10-02" })).toBe(false);
    expect(horarioFixoValido({ ...base, serviceIds: [], diaDaSemana: 5, frequencia: "semanal", inicio: "2026-10-02" })).toBe(false);
  });

  it("id da ocorrência é estável: cancelar uma semana não faz a rotina recriar", () => {
    expect(idDaOcorrencia("abc", "v1", "2026-10-02")).toBe("fixo_abc_v1_2026-10-02");
  });

  it("a versão muda quando o horário muda, e não muda com a ordem dos serviços", () => {
    const h = { ...base, diaDaSemana: 5, frequencia: "semanal" as const, inicio: "2026-10-02" };
    expect(versaoDoHorario(h)).toBe(versaoDoHorario({ ...h, inicio: "2026-10-09" }));
    expect(versaoDoHorario(h)).not.toBe(versaoDoHorario({ ...h, hora: "18:00" }));
    expect(versaoDoHorario({ ...h, serviceIds: ["a", "b"] })).toBe(versaoDoHorario({ ...h, serviceIds: ["b", "a"] }));
  });
});

describe("semanaJaResolvida — a rotina não recria a semana que o cliente já resolveu (30/09)", () => {
  it("quarta remarcada para terça não volta como fixo", () => {
    const reservas = [{ date: "2026-09-30", status: "completed", rescheduledFrom: { date: "2026-10-01" } }];
    expect(semanaJaResolvida("2026-10-01", reservas)).toBe(true);
  });

  it("horário marcado à mão no mesmo dia continua contando", () => {
    expect(semanaJaResolvida("2026-10-02", [{ date: "2026-10-02", status: "confirmed" }])).toBe(true);
  });

  it("semana cancelada não é recriada pela rotina", () => {
    expect(semanaJaResolvida("2026-10-02", [{ date: "2026-10-02", status: "cancelled_by_client" }])).toBe(true);
  });

  it("outra data, ou falta registrada, não bloqueia a semana", () => {
    expect(semanaJaResolvida("2026-10-09", [{ date: "2026-10-02", status: "confirmed" }])).toBe(false);
    expect(semanaJaResolvida("2026-10-09", [{ date: "2026-10-09", status: "no_show" }])).toBe(false);
    expect(semanaJaResolvida("2026-10-09", [])).toBe(false);
  });
});

describe("semana apagada (removido) não volta", () => {
  it("a data com a ocorrência apagada conta como resolvida", () => {
    expect(semanaJaResolvida("2026-10-03", [{ date: "2026-10-03", status: "removido" }])).toBe(true);
  });
});

describe("liberação do fixo não é semana desmarcada (07/10)", () => {
  it("mudar o fixo: as semanas liberadas não bloqueiam o horário novo", () => {
    const liberada = { date: "2026-10-09", status: "cancelled_by_shop", liberadaPeloFixo: true };
    expect(semanaJaResolvida("2026-10-09", [liberada])).toBe(false);
  });

  it("dados antigos, sem o marcador, são reconhecidos pelo motivo gravado", () => {
    for (const cancelReason of ["Horário fixo alterado", "Horário fixo removido", "Plano de mensalista encerrado"]) {
      expect(semanaJaResolvida("2026-10-09", [{ date: "2026-10-09", status: "cancelled_by_shop", cancelReason }])).toBe(
        false
      );
    }
  });

  it("cancelamento do cliente, ou da barbearia por outro motivo, continua contando", () => {
    expect(
      semanaJaResolvida("2026-10-09", [
        { date: "2026-10-09", status: "cancelled_by_client", cancelReason: "Viagem" },
      ])
    ).toBe(true);
    expect(
      semanaJaResolvida("2026-10-09", [{ date: "2026-10-09", status: "cancelled_by_shop", cancelReason: "Feriado" }])
    ).toBe(true);
  });

  it("liberada ao lado de uma reserva de verdade no mesmo dia: vale a de verdade", () => {
    expect(
      semanaJaResolvida("2026-10-09", [
        { date: "2026-10-09", status: "cancelled_by_shop", liberadaPeloFixo: true },
        { date: "2026-10-09", status: "confirmed" },
      ])
    ).toBe(true);
  });

  it("o marcador só vale para documento cancelado", () => {
    expect(liberadaPeloFixo({ status: "confirmed", liberadaPeloFixo: true })).toBe(false);
    expect(liberadaPeloFixo({ status: "confirmed", cancelReason: "Horário fixo alterado" })).toBe(false);
    expect(liberadaPeloFixo({ status: "cancelled_by_shop", liberadaPeloFixo: true })).toBe(true);
  });
});

describe("ocorrenciaLiberavel — só libera o que ainda não começou (07/10)", () => {
  const SP = "America/Sao_Paulo";
  /* 08/10/2026 às 18:00 em São Paulo (UTC-3) = 21:00 UTC. */
  const agora = new Date("2026-10-08T21:00:00Z");

  it("o corte de hoje às 10h, ainda não fechado, fica", () => {
    expect(ocorrenciaLiberavel({ date: "2026-10-08", time: "10:00", status: "confirmed" }, SP, agora)).toBe(false);
  });

  it("o de hoje mais tarde e o de amanhã são liberados", () => {
    expect(ocorrenciaLiberavel({ date: "2026-10-08", time: "19:30", status: "confirmed" }, SP, agora)).toBe(true);
    expect(ocorrenciaLiberavel({ date: "2026-10-09", time: "08:00", status: "confirmed_by_client" }, SP, agora)).toBe(
      true
    );
  });

  it("o que começa agora já começou", () => {
    expect(ocorrenciaLiberavel({ date: "2026-10-08", time: "18:00", status: "confirmed" }, SP, agora)).toBe(false);
  });

  it("decide pelo fuso da barbearia, não pelo do servidor", () => {
    /* 19h em Lisboa (UTC+1 em outubro) = 18:00 UTC, já passou às 21:00 UTC. */
    expect(
      ocorrenciaLiberavel({ date: "2026-10-08", time: "19:00", status: "confirmed" }, "Europe/Lisbon", agora)
    ).toBe(false);
    /* 19h em São Paulo = 22:00 UTC, ainda não chegou. */
    expect(ocorrenciaLiberavel({ date: "2026-10-08", time: "19:00", status: "confirmed" }, SP, agora)).toBe(true);
  });

  it("concluída, cancelada ou sem hora não é liberada", () => {
    expect(ocorrenciaLiberavel({ date: "2026-10-20", time: "10:00", status: "completed" }, SP, agora)).toBe(false);
    expect(ocorrenciaLiberavel({ date: "2026-10-20", time: "10:00", status: "cancelled_by_client" }, SP, agora)).toBe(
      false
    );
    expect(ocorrenciaLiberavel({ date: "2026-10-20", status: "confirmed" }, SP, agora)).toBe(false);
  });
});

describe("lojaRecebeReservaDoFixo — rotina não reserva em loja parada (07/10)", () => {
  it("ativa e em teste válido recebem", () => {
    expect(lojaRecebeReservaDoFixo({ status: "ativo" })).toBe(true);
    expect(lojaRecebeReservaDoFixo({ status: "trial", trial: { endsAt: new Date(Date.now() + 86_400_000) } })).toBe(
      true
    );
  });

  it("encerrada, suspensa e teste vencido não recebem", () => {
    expect(lojaRecebeReservaDoFixo({ status: "encerrada" })).toBe(false);
    expect(lojaRecebeReservaDoFixo({ status: "suspenso" })).toBe(false);
    expect(lojaRecebeReservaDoFixo({ status: "trial", trial: { endsAt: new Date(Date.now() - 86_400_000) } })).toBe(
      false
    );
  });

  it("isenta segue recebendo mesmo marcada como suspensa, mas encerrada não", () => {
    expect(lojaRecebeReservaDoFixo({ status: "suspenso", isento: { motivo: "Barbearia fundadora" } })).toBe(true);
    expect(lojaRecebeReservaDoFixo({ status: "encerrada", isento: true })).toBe(false);
  });
});

describe("remarcação do cliente não é liberada nem recriada (09/10)", () => {
  const SP = "America/Sao_Paulo";
  const agora = new Date("2026-10-08T21:00:00Z");

  it("sexta remarcada para segunda: mudar ou tirar o fixo a preserva; plano encerrado não", () => {
    const remarcada = {
      date: "2026-10-19",
      time: "10:00",
      status: "confirmed",
      rescheduledFrom: { date: "2026-10-16", time: "10:00" },
    };
    expect(foiRemarcada(remarcada)).toBe(true);
    expect(foiRemarcada({ origemDoFixo: { date: "2026-10-16" } })).toBe(true);
    expect(foiRemarcada({ ...remarcada, rescheduledFrom: undefined })).toBe(false);
    /* A regra de "liberável" em si não olha remarcação: quem preserva é o chamador. */
    expect(ocorrenciaLiberavel(remarcada, SP, agora)).toBe(true);
  });

  it("liberavelNaTroca exige aberta, não remarcada e no futuro", () => {
    const ok = { date: "2026-10-16", time: "10:00", status: "confirmed" };
    expect(liberavelNaTroca(ok, SP, agora)).toBe(true);
    expect(liberavelNaTroca({ ...ok, rescheduledFrom: { date: "2026-10-09" } }, SP, agora)).toBe(false);
    expect(liberavelNaTroca({ ...ok, date: "2026-10-08" }, SP, agora)).toBe(false);
    expect(liberavelNaTroca({ ...ok, status: "completed" }, SP, agora)).toBe(false);
  });

  it("semanaDe: segunda a domingo é a mesma semana", () => {
    expect(semanaDe("2026-10-12")).toBe(semanaDe("2026-10-18"));
    expect(semanaDe("2026-10-18")).not.toBe(semanaDe("2026-10-19"));
    expect(semanaDe("2026-10-13")).toBe(semanaDe("2026-10-16"));
  });

  it("a data de origem segue resolvida mesmo se o documento foi liberado", () => {
    const liberadaRemarcada = {
      date: "2026-10-19",
      status: "cancelled_by_shop",
      liberadaPeloFixo: true,
      rescheduledFrom: { date: "2026-10-16" },
    };
    expect(semanaJaResolvida("2026-10-16", [liberadaRemarcada])).toBe(true);
  });

  it("duas remarcações: a origem da primeira (origemDoFixo) continua valendo", () => {
    const duasVezes = {
      date: "2026-10-20",
      status: "confirmed",
      rescheduledFrom: { date: "2026-10-19" },
      origemDoFixo: { date: "2026-10-16" },
    };
    expect(semanaJaResolvida("2026-10-16", [duasVezes])).toBe(true);
    expect(semanaJaResolvida("2026-10-16", [{ ...duasVezes, origemDoFixo: undefined }])).toBe(false);
  });
});

describe("cancelamento só resolve a semana se for do próprio fixo (09/10)", () => {
  const fixo = { subscriptionId: "sub1", hora: "10:00" };

  it("avulso cancelado em outro horário, ou encaixe recusado, não resolve", () => {
    const avulso = { date: "2026-10-16", time: "16:00", status: "cancelled_by_client" };
    expect(semanaJaResolvida("2026-10-16", [avulso], fixo)).toBe(false);
    const encaixe = { date: "2026-10-16", time: "15:00", status: "cancelled_by_shop", cancelReason: "Recusado" };
    expect(semanaJaResolvida("2026-10-16", [encaixe], fixo)).toBe(false);
  });

  it("cancelamento de ocorrência do mesmo fixo, ou no mesmo horário, resolve", () => {
    const doFixo = { date: "2026-10-16", time: "09:00", status: "cancelled_by_client", horarioFixoId: "sub1" };
    expect(semanaJaResolvida("2026-10-16", [doFixo], fixo)).toBe(true);
    const mesmaHora = { date: "2026-10-16", time: "10:00", status: "cancelled_by_client" };
    expect(semanaJaResolvida("2026-10-16", [mesmaHora], fixo)).toBe(true);
  });

  it("horário marcado à mão em outra hora continua resolvendo", () => {
    expect(semanaJaResolvida("2026-10-16", [{ date: "2026-10-16", time: "16:00", status: "confirmed" }], fixo)).toBe(
      true
    );
  });
});

describe("quinzenal: a fase faz parte do horário (09/10)", () => {
  const q = { ...base, diaDaSemana: 5, frequencia: "quinzenal" as const };

  it("mesma quinzena não muda; a outra fase muda", () => {
    const a = { ...q, inicio: "2026-10-09" };
    expect(faseDaQuinzena(a)).toBe(faseDaQuinzena({ ...q, inicio: "2026-10-23" }));
    expect(faseDaQuinzena(a)).not.toBe(faseDaQuinzena({ ...q, inicio: "2026-10-16" }));
    expect(horarioFixoMudou(a, { ...q, inicio: "2026-10-23" })).toBe(false);
    expect(horarioFixoMudou(a, { ...q, inicio: "2026-10-16" })).toBe(true);
  });

  it("semanal não tem fase; a versão segue ignorando a âncora", () => {
    const s = { ...base, diaDaSemana: 5, frequencia: "semanal" as const, inicio: "2026-10-09" };
    expect(horarioFixoMudou(s, { ...s, inicio: "2026-10-16" })).toBe(false);
    expect(horarioFixoMudou(s, { ...s, hora: "11:00" })).toBe(true);
    expect(horarioFixoMudou(undefined, s)).toBe(false);
    expect(horarioFixoMudou(s, null)).toBe(false);
  });
});

describe("somenteDatasFuturas — o fixo de hoje que já passou não nasce (09/10)", () => {
  const SP = "America/Sao_Paulo";
  /* 09/10/2026 às 14:00 em São Paulo = 17:00 UTC. */
  const agora = new Date("2026-10-09T17:00:00Z");

  it("hoje às 10h sai; hoje às 16h e as próximas ficam", () => {
    expect(somenteDatasFuturas(["2026-10-09", "2026-10-16"], "10:00", SP, agora)).toEqual(["2026-10-16"]);
    expect(somenteDatasFuturas(["2026-10-09", "2026-10-16"], "16:00", SP, agora)).toEqual(["2026-10-09", "2026-10-16"]);
  });
});
