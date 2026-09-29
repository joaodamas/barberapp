import { describe, expect, it } from "vitest";
import { datasDoHorarioFixo, diaDaSemanaDe, horarioFixoValido, idDaOcorrencia, versaoDoHorario } from "../horario-fixo";

const base = { hora: "17:00", staffId: "romulo", serviceIds: ["corte"] };

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
