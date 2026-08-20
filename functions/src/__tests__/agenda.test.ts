import { describe, expect, it } from "vitest";
import {
  horarioDisponivel,
  janelaDaReserva,
  janelaLivre,
  janelasOcupadas,
  paraHora,
  paraMinutos,
  podeRemarcar,
  remarcacoesRestantes,
  seSobrepoem,
  type Janela,
} from "../agenda";

/**
 * O defeito que este arquivo existe para impedir, na forma em que foi relatado:
 *
 *   João:  10:00–11:00
 *   Maria consegue marcar: 10:30
 *
 * Era possível pelo caminho normal do produto, com o catálogo que toda
 * barbearia recebe ao nascer — "Corte + barba" de 60 min numa grade de 30.
 */

const GRADE = 30;

/** Atalho legível: "10:00" + 60 min. */
const j = (time: string, durationMin: number): Janela =>
  janelaDaReserva({ time, durationMin }, GRADE)!;

describe("conversão de horário", () => {
  it("converte HH:mm para minutos e de volta", () => {
    expect(paraMinutos("00:00")).toBe(0);
    expect(paraMinutos("10:30")).toBe(630);
    expect(paraMinutos("23:59")).toBe(1439);
    expect(paraHora(630)).toBe("10:30");
    expect(paraHora(0)).toBe("00:00");
  });

  it("devolve NaN para horário ilegível, em vez de zero", () => {
    // Zero seria meia-noite — um horário válido, e o dado corrompido passaria
    // a ocupar o começo do dia de toda barbearia.
    expect(paraMinutos("")).toBeNaN();
    expect(paraMinutos("abc")).toBeNaN();
  });
});

describe("janela de uma reserva", () => {
  it("usa a duração da reserva", () => {
    expect(j("10:00", 60)).toEqual({ inicio: 600, fim: 660 });
    expect(j("14:15", 45)).toEqual({ inicio: 855, fim: 900 });
  });

  it("reserva antiga, sem durationMin, assume a grade", () => {
    // Assumir a grade erra para menos num combo antigo; errar para mais
    // bloquearia horário que a barbearia pode vender.
    expect(janelaDaReserva({ time: "10:00" }, 30)).toEqual({ inicio: 600, fim: 630 });
    expect(janelaDaReserva({ time: "10:00", durationMin: null }, 30)).toEqual({
      inicio: 600,
      fim: 630,
    });
    expect(janelaDaReserva({ time: "10:00", durationMin: 0 }, 30)).toEqual({
      inicio: 600,
      fim: 630,
    });
  });

  it("horário ilegível não vira janela", () => {
    expect(janelaDaReserva({ time: "", durationMin: 30 }, 30)).toBeNull();
  });
});

describe("sobreposição", () => {
  it("O CASO: 10:00–11:00 colide com 10:30", () => {
    expect(seSobrepoem(j("10:00", 60), j("10:30", 30))).toBe(true);
  });

  it("horários que apenas encostam NÃO colidem", () => {
    // 10:00–11:00 e 11:00–11:30 são a agenda cheia funcionando. Tratar como
    // conflito apagaria metade dos horários vendáveis.
    expect(seSobrepoem(j("10:00", 60), j("11:00", 30))).toBe(false);
    expect(seSobrepoem(j("11:00", 30), j("10:00", 60))).toBe(false);
  });

  it("colisão por trás: um atendimento longo que INVADE o horário marcado", () => {
    // 09:30 + 90 min = 11:00, que passa por cima das 10:00.
    expect(seSobrepoem(j("09:30", 90), j("10:00", 30))).toBe(true);
  });

  it("contenção total, nos dois sentidos", () => {
    expect(seSobrepoem(j("10:00", 90), j("10:30", 15))).toBe(true);
    expect(seSobrepoem(j("10:30", 15), j("10:00", 90))).toBe(true);
  });

  it("é simétrica", () => {
    const a = j("10:00", 60);
    const b = j("10:30", 30);
    expect(seSobrepoem(a, b)).toBe(seSobrepoem(b, a));
  });

  it("horários distantes não colidem", () => {
    expect(seSobrepoem(j("09:00", 30), j("15:00", 60))).toBe(false);
  });
});

describe("todas as durações do catálogo semente", () => {
  // Pezinho 15, Sobrancelha 20, Corte 30, Corte+barba 60 — e um combo de 90.
  const ocupadas = [j("10:00", 60)]; // 10:00–11:00

  it.each([
    ["10:00", 15, false], // 10:00–10:15 · começa em cima
    ["10:15", 15, false], // 10:15–10:30 · dentro
    ["10:30", 20, false], // 10:30–10:50 · dentro  ← O CASO relatado
    ["10:45", 30, false], // 10:45–11:15 · sai por cima do fim
    ["10:55", 30, false], // 10:55–11:25 · só os 5 primeiros minutos colidem
    ["11:00", 60, true], //  11:00–12:00 · encosta no fim, não colide
    ["09:00", 30, true], //  09:00–09:30 · antes, com folga
    ["09:30", 30, true], //  09:30–10:00 · encosta no início, não colide
    ["09:30", 45, false], // 09:30–10:15 · invade os primeiros 15 min
    ["08:00", 90, true], //  08:00–09:30 · longo, mas termina antes
  ])("%s por %i min → livre: %s", (time, durationMin, esperado) => {
    expect(horarioDisponivel({ time, durationMin, ocupadas })).toBe(esperado);
  });
});

describe("agenda com várias reservas", () => {
  const reservas = [
    { time: "09:00", durationMin: 30 }, // 09:00–09:30
    { time: "10:00", durationMin: 60 }, // 10:00–11:00
    { time: "14:00", durationMin: 90 }, // 14:00–15:30
  ];
  const ocupadas = janelasOcupadas(reservas, GRADE);

  it("monta uma janela por reserva", () => {
    expect(ocupadas).toHaveLength(3);
    expect(ocupadas[1]).toEqual({ inicio: 600, fim: 660 });
  });

  it("descarta reserva com horário corrompido em vez de bloquear o dia", () => {
    const comLixo = janelasOcupadas([...reservas, { time: "??" }], GRADE);
    expect(comLixo).toHaveLength(3);
  });

  it("recusa o que colide com QUALQUER uma", () => {
    expect(janelaLivre(j("10:30", 30), ocupadas)).toBe(false);
    expect(janelaLivre(j("15:00", 30), ocupadas)).toBe(false); // dentro de 14:00–15:30
    expect(janelaLivre(j("09:15", 15), ocupadas)).toBe(false);
  });

  it("aceita as brechas reais entre elas", () => {
    expect(janelaLivre(j("09:30", 30), ocupadas)).toBe(true); // 09:30–10:00
    expect(janelaLivre(j("11:00", 60), ocupadas)).toBe(true); // 11:00–12:00
    expect(janelaLivre(j("15:30", 30), ocupadas)).toBe(true); // logo após o combo
  });

  it("agenda vazia aceita tudo", () => {
    expect(janelaLivre(j("10:30", 60), [])).toBe(true);
  });
});

describe("o horário candidato também é medido pela própria duração", () => {
  // O defeito espelhado: não basta o INÍCIO estar livre, o atendimento inteiro
  // precisa caber. Marcar 30 min antes de um horário ocupado só funciona se o
  // serviço durar 30.
  const ocupadas = [j("11:00", 30)]; // 11:00–11:30

  it("cabe quando o serviço termina antes", () => {
    expect(horarioDisponivel({ time: "10:30", durationMin: 30, ocupadas })).toBe(true);
  });

  it("não cabe quando o serviço avança por cima", () => {
    expect(horarioDisponivel({ time: "10:30", durationMin: 60, ocupadas })).toBe(false);
  });
});

/* ================================================================== */
/* P1-13 · o teto de remarcações passa a existir de verdade           */
/* ================================================================== */

describe("P1-13 · teto de remarcações", () => {
  /* A tela do cliente anunciava "limite de 2 reagendamentos por reserva" a
   * partir de um `useState(0)` que zerava com F5. O `rescheduleBooking` nunca
   * ouviu falar do limite: validava só a janela de horas.
   *
   * O efeito não era teórico — bastava recarregar a página para remarcar de
   * novo, indefinidamente. A tela anunciava uma regra que não existia. */

  it("reserva nova tem o limite inteiro disponível", () => {
    expect(remarcacoesRestantes(undefined, 2)).toBe(2);
    expect(remarcacoesRestantes(0, 2)).toBe(2);
  });

  it("cada remarcação consome uma", () => {
    expect(remarcacoesRestantes(1, 2)).toBe(1);
    expect(remarcacoesRestantes(2, 2)).toBe(0);
  });

  it("no limite, recusa — o que o F5 contornava", () => {
    expect(podeRemarcar({ contagem: 2, limite: 2, ehDono: false })).toBe(false);
    expect(podeRemarcar({ contagem: 1, limite: 2, ehDono: false })).toBe(true);
  });

  it("contagem ausente vale zero, não 'já estourou'", () => {
    /* Reserva anterior a este campo nunca remarcou pelo caminho que conta.
     * Tratar `undefined` como estouro travaria remarcação legítima de quem não
     * fez nada — a correção não pode punir o histórico. */
    expect(podeRemarcar({ contagem: undefined, limite: 2, ehDono: false })).toBe(true);
    expect(podeRemarcar({ contagem: null, limite: 2, ehDono: false })).toBe(true);
    expect(podeRemarcar({ contagem: "lixo", limite: 2, ehDono: false })).toBe(true);
  });

  it("valor corrompido não vira crédito", () => {
    /* O simétrico: um número negativo no documento não pode devolver mais
     * remarcações do que a política concede. */
    expect(remarcacoesRestantes(-5, 2)).toBe(2);
    expect(remarcacoesRestantes(99, 2)).toBe(0);
  });

  it("o DONO não tem teto — é a agenda dele", () => {
    /* Mesma isenção que ele já tem na janela de horas. Um barbeiro que faltou
     * obriga a mover várias reservas, e limitar isso seria recusar a operação
     * real da loja. */
    expect(podeRemarcar({ contagem: 99, limite: 2, ehDono: true })).toBe(true);
  });

  it("limite zero proíbe remarcar, e não libera", () => {
    /* Uma barbearia pode configurar `maxPerBooking: 0`. Um `|| 2` no lugar do
     * `?? 2` transformaria essa escolha no padrão da casa. */
    expect(podeRemarcar({ contagem: 0, limite: 0, ehDono: false })).toBe(false);
  });
});
