import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  capacidadeDaData,
  excecaoDaData,
  horariosDaJornada,
  jornadaDoDia,
  montarExcecao,
  podarExcecoes,
  type EntradaDeJornada,
} from "@/lib/jornada";

/**
 * A jornada que varia por dia — o pedido do dono da barbearia piloto.
 *
 * > *"na terça feira desse ano eu tenho compromisso aí eu fecho as 17:30. (…)
 * > Mas se eu quiser travar um dia específico?"*
 *
 * O que estes testes protegem não é a aritmética de somar minutos: é a
 * PRECEDÊNCIA. Exceção vence dia da semana, que vence o padrão — e cada uma
 * dessas fronteiras, invertida, produz um sintoma que ninguém vê olhando a
 * tela: horário oferecido num dia fechado, ou hora a menos num dia normal.
 */

/** Ter–Sáb 09:00–19:30, almoço 12–14, grade de 30. A do Siqueira. */
const SIQUEIRA: EntradaDeJornada = {
  weekdays: [2, 3, 4, 5, 6],
  opensAt: "09:00",
  closesAt: "19:30",
  breaks: [{ from: "12:00", to: "14:00" }],
  slotMinutes: 30,
};

/* 2026-09-15 é uma terça; 2026-09-16, quarta; 2026-09-13, domingo. */
const TERCA = "2026-09-15";
const QUARTA = "2026-09-16";
const DOMINGO = "2026-09-13";

describe("jornadaDoDia · o padrão da semana", () => {
  it("dia aberto sem regra própria usa o horário geral", () => {
    const j = jornadaDoDia({ schedule: SIQUEIRA, weekday: 3, date: QUARTA });
    expect(j).toMatchObject({ aberto: true, origem: "geral", opensAt: "09:00", closesAt: "19:30" });
  });

  it("dia fora de `weekdays` fecha, e diz que foi a semana", () => {
    const j = jornadaDoDia({ schedule: SIQUEIRA, weekday: 0, date: DOMINGO });
    expect(j).toMatchObject({ aberto: false, origem: "semana" });
  });

  it("barbearia sem jornada nenhuma cai no padrão — nunca em dia sem horário", () => {
    const j = jornadaDoDia({ schedule: undefined, weekday: 3, date: QUARTA });
    expect(j).toMatchObject({ aberto: true, opensAt: "09:00", closesAt: "19:00" });
  });
});

describe("jornadaDoDia · o horário próprio do dia da semana", () => {
  const comTerca: EntradaDeJornada = {
    ...SIQUEIRA,
    perDay: { "2": { closesAt: "17:30" } },
  };

  it("a terça fecha às 17:30 e o resto da semana não muda", () => {
    expect(jornadaDoDia({ schedule: comTerca, weekday: 2, date: TERCA })).toMatchObject({
      aberto: true,
      origem: "dia",
      opensAt: "09:00",
      closesAt: "17:30",
    });
    expect(jornadaDoDia({ schedule: comTerca, weekday: 3, date: QUARTA })).toMatchObject({
      closesAt: "19:30",
    });
  });

  it("o que o dia não declara, herda do padrão", () => {
    const j = jornadaDoDia({ schedule: comTerca, weekday: 2, date: TERCA });
    /* Só `closesAt` foi declarado: o almoço tem de continuar de pé, senão
     * fechar mais cedo passaria a abrir o meio-dia sem ninguém pedir. */
    expect(j.aberto && j.breaks).toEqual([{ from: "12:00", to: "14:00" }]);
  });

  it("horário próprio num dia FECHADO não abre o dia", () => {
    /* A régua é ordenada de propósito: `perDay` diz QUE HORAS, `weekdays` diz
     * SE ABRE. Trocar a ordem faria um resto de configuração antiga reabrir o
     * domingo que o dono acabou de desmarcar. */
    const j = jornadaDoDia({
      schedule: { ...SIQUEIRA, perDay: { "0": { opensAt: "10:00", closesAt: "16:00" } } },
      weekday: 0,
      date: DOMINGO,
    });
    expect(j.aberto).toBe(false);
  });
});

describe("jornadaDoDia · a exceção da data", () => {
  it("fecha o dia e devolve o motivo que o dono escreveu", () => {
    const j = jornadaDoDia({
      schedule: { ...SIQUEIRA, exceptions: [{ date: TERCA, closed: true, note: "feriado" }] },
      weekday: 2,
      date: TERCA,
    });
    expect(j).toMatchObject({ aberto: false, origem: "excecao", nota: "feriado" });
  });

  it("vence o horário próprio do dia da semana", () => {
    const j = jornadaDoDia({
      schedule: {
        ...SIQUEIRA,
        perDay: { "2": { closesAt: "17:30" } },
        exceptions: [{ date: TERCA, closesAt: "15:00" }],
      },
      weekday: 2,
      date: TERCA,
    });
    expect(j).toMatchObject({ aberto: true, origem: "excecao", closesAt: "15:00" });
  });

  it("ABRE um dia normalmente fechado — o domingo de véspera de Natal", () => {
    const j = jornadaDoDia({
      schedule: { ...SIQUEIRA, exceptions: [{ date: DOMINGO, opensAt: "10:00", closesAt: "16:00" }] },
      weekday: 0,
      date: DOMINGO,
    });
    expect(j).toMatchObject({ aberto: true, origem: "excecao", opensAt: "10:00" });
  });

  it("só vale na data dela — o dia seguinte segue normal", () => {
    const schedule = { ...SIQUEIRA, exceptions: [{ date: TERCA, closed: true }] };
    expect(jornadaDoDia({ schedule, weekday: 3, date: QUARTA }).aberto).toBe(true);
  });

  it("duas regras para a mesma data: a última cadastrada vence", () => {
    const excecoes = [
      { date: TERCA, closed: true },
      { date: TERCA, closesAt: "16:00" },
    ];
    expect(excecaoDaData(excecoes, TERCA)).toMatchObject({ closesAt: "16:00" });
  });
});

describe("horariosDaJornada", () => {
  it("respeita abertura, fechamento e almoço", () => {
    const grade = horariosDaJornada({
      jornada: { opensAt: "09:00", closesAt: "19:30", breaks: [{ from: "12:00", to: "14:00" }] },
      slotMinutes: 30,
    });
    expect(grade[0]).toBe("09:00");
    expect(grade).not.toContain("12:30");
    expect(grade).toContain("14:00");
    expect(grade.at(-1)).toBe("19:00");
  });

  it("o atendimento inteiro precisa caber — não só o minuto em que começa", () => {
    /* O combo de 60 min não pode começar às 18:30 numa casa que fecha às 19:00,
     * nem às 11:30 com almoço ao meio-dia. Era a diferença entre a capacidade
     * exibida e os horários realmente oferecidos. */
    const grade = horariosDaJornada({
      jornada: { opensAt: "09:00", closesAt: "19:00", breaks: [{ from: "12:00", to: "14:00" }] },
      slotMinutes: 30,
      duracao: 60,
    });
    expect(grade).not.toContain("18:30");
    expect(grade).not.toContain("11:30");
    expect(grade).toContain("18:00");
  });

  it("jornada impossível não devolve horário nenhum", () => {
    expect(
      horariosDaJornada({ jornada: { opensAt: "19:00", closesAt: "09:00", breaks: [] }, slotMinutes: 30 })
    ).toEqual([]);
    expect(
      horariosDaJornada({ jornada: { opensAt: "ontem", closesAt: "19:00", breaks: [] }, slotMinutes: 30 })
    ).toEqual([]);
  });
});

describe("capacidadeDaData", () => {
  it("a terça mais curta tem menos horários que a quarta", () => {
    const schedule = { ...SIQUEIRA, perDay: { "2": { closesAt: "17:30" } } };
    const terca = capacidadeDaData({ schedule, weekday: 2, date: TERCA });
    const quarta = capacidadeDaData({ schedule, weekday: 3, date: QUARTA });
    expect(quarta - terca).toBe(4);
  });

  it("dia fechado tem capacidade ZERO — e não a do dia comum", () => {
    /* É o que impede a ocupação de ser calculada contra horários que não
     * existiram: num feriado, 3 atendimentos sobre a capacidade da quarta
     * apareceriam como 16% de ocupação num dia que a barbearia nem abriu. */
    const schedule = { ...SIQUEIRA, exceptions: [{ date: TERCA, closed: true }] };
    expect(capacidadeDaData({ schedule, weekday: 2, date: TERCA })).toBe(0);
  });
});

describe("podarExcecoes", () => {
  it("guarda o passado recente e descarta o antigo", () => {
    const lista = podarExcecoes(
      [{ date: "2026-01-05", closed: true }, { date: "2026-09-01", closed: true }],
      "2026-09-15"
    );
    expect(lista.map((e) => e.date)).toEqual(["2026-09-01"]);
  });

  it("uma data, uma regra — a última vence", () => {
    const lista = podarExcecoes(
      [
        { date: TERCA, closed: true },
        { date: TERCA, closesAt: "16:00" },
      ],
      TERCA
    );
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ closesAt: "16:00" });
  });

  it("devolve em ordem de data", () => {
    const lista = podarExcecoes(
      [{ date: "2026-12-25", closed: true }, { date: "2026-10-12", closed: true }],
      "2026-09-15"
    );
    expect(lista.map((e) => e.date)).toEqual(["2026-10-12", "2026-12-25"]);
  });
});

describe("montarExcecao · nenhum campo `undefined` chega ao Firestore", () => {
  /**
   * O defeito que este bloco impede não é de lógica: é de gravação.
   *
   * `stripUndefined` (`db/repository.ts`) limpa o nível de cima e **não entra em
   * array**. Um `note: undefined` dentro de `schedule.exceptions` chega inteiro
   * ao SDK, que recusa com *"Unsupported field value: undefined"* — e o caminho
   * quebrado seria o mais comum de todos: fechar um dia sem digitar motivo.
   */
  const semUndefined = (o: object) =>
    Object.values(o).every((v) => v !== undefined);

  it("dia fechado sem motivo não carrega `note`", () => {
    const e = montarExcecao({ date: TERCA, fechado: true, nota: "" });
    expect(e).toEqual({ date: TERCA, closed: true });
    expect(semUndefined(e)).toBe(true);
    expect("note" in e).toBe(false);
  });

  it("motivo em branco não vira nota vazia", () => {
    /* String vazia gravaria e a lista exibiria " · " sem nada depois. */
    const e = montarExcecao({ date: TERCA, fechado: true, nota: "   " });
    expect("note" in e).toBe(false);
  });

  it("horário especial guarda abertura e fechamento, e nunca `closed`", () => {
    const e = montarExcecao({
      date: TERCA,
      fechado: false,
      opensAt: "09:00",
      closesAt: "15:00",
      nota: "meio expediente",
    });
    expect(e).toEqual({
      date: TERCA,
      opensAt: "09:00",
      closesAt: "15:00",
      note: "meio expediente",
    });
    expect("closed" in e).toBe(false);
  });

  it("o que ela monta é aceito pela régua que a lê", () => {
    /* A ponta a ponta que importa: o objeto gravado precisa produzir o dia
     * fechado que o dono pediu. */
    const e = montarExcecao({ date: TERCA, fechado: true, nota: "feriado" });
    const j = jornadaDoDia({ schedule: { ...SIQUEIRA, exceptions: [e] }, weekday: 2, date: TERCA });
    expect(j).toMatchObject({ aberto: false, origem: "excecao", nota: "feriado" });
  });
});

describe("o par obrigatório com as functions", () => {
  /**
   * O guarda do comentário que os dois arquivos carregam.
   *
   * A régua roda em dois pacotes que não compartilham código: aqui para pintar
   * a tela, lá para decidir o que o cliente pode reservar. Divergir não quebra
   * build nenhum — produz uma tela que oferece o horário que o servidor
   * recusa, e um cliente lendo "não foi possível" sem motivo visível.
   *
   * Só o docblock de abertura pode diferir: ele explica de que lado o arquivo
   * está. Do primeiro `export` em diante, os dois são o mesmo texto.
   */
  const CRLF = String.fromCharCode(13, 10);
  const LF = String.fromCharCode(10);

  const corpo = (caminho: string) => {
    /* Fim de linha normalizado: o par é sobre o TEXTO, e um checkout com CRLF
     * do Windows não é divergência de régua. */
    const bruto = readFileSync(new URL(caminho, import.meta.url), "utf8");
    const fonte = bruto.split(CRLF).join(LF);
    const corte = fonte.indexOf("/** Uma pausa no meio do dia");
    expect(corte).toBeGreaterThan(0);
    return fonte.slice(corte);
  };

  it("web/src/lib/jornada.ts e functions/src/jornada.ts não divergiram", () => {
    expect(corpo("../jornada.ts")).toBe(corpo("../../../../functions/src/jornada.ts"));
  });
});
