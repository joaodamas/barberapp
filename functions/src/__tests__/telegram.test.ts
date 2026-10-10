import { describe, expect, it } from "vitest";
import { recebe, type Contato } from "../telegram/contatos";
import { avisoDaCriacao, remarcadaPeloCliente } from "../telegram/gatilhos";
import {
  dadoDoBotao,
  diaCurto,
  esc,
  lerDadoDoBotao,
  textoDaAgendaDoDia,
  textoDoEncaixe,
  textoDoFechamento,
} from "../telegram/mensagens";

/**
 * Avisos no Telegram (01/10). O que decide sem rede: quem recebe o quê,
 * quando a reserva vira aviso, e o que o botão carrega.
 */

const dono: Contato = { chatId: "1", alvo: "dono", staffId: null, nome: "Rômulo", ativo: true };
const barbeiro: Contato = { chatId: "2", alvo: "barbeiro", staffId: "st1", nome: "Lucas", ativo: true };

describe("quem recebe", () => {
  it("o dono recebe tudo, de qualquer cadeira", () => {
    for (const t of ["encaixe", "cancelamento", "novo", "agenda", "fechamento"] as const) {
      expect(recebe(dono, t, "qualquer")).toBe(true);
    }
  });

  it("o barbeiro só recebe o da cadeira dele, e nunca o fechamento do caixa", () => {
    expect(recebe(barbeiro, "encaixe", "st1")).toBe(true);
    expect(recebe(barbeiro, "encaixe", "st2")).toBe(false);
    expect(recebe(barbeiro, "encaixe", null)).toBe(false);
    expect(recebe(barbeiro, "fechamento", "st1")).toBe(false);
  });

  it("aviso desligado ou conversa inativa não recebe", () => {
    expect(recebe({ ...dono, avisos: { novo: false } }, "novo", null)).toBe(false);
    expect(recebe({ ...dono, ativo: false }, "encaixe", null)).toBe(false);
  });
});

describe("quando a reserva nova vira aviso", () => {
  it("pedido de encaixe sempre avisa", () => {
    expect(avisoDaCriacao({ status: "fit_in_requested", origin: "app" })).toBe("encaixe");
  });
  it("cliente marcando pelo link avisa como novo", () => {
    expect(avisoDaCriacao({ status: "confirmed", origin: "app" })).toBe("novo");
  });
  it("balcão e horário fixo não avisam (o dono já sabe; o fixo viraria 8 avisos)", () => {
    expect(avisoDaCriacao({ status: "confirmed", origin: "balcao" })).toBeNull();
    expect(avisoDaCriacao({ status: "confirmed", origin: "app", horarioFixoId: "sub1" })).toBeNull();
  });
});

describe("quando a remarcação do cliente avisa a barbearia (09/10)", () => {
  const antes = { date: "2026-10-16", time: "10:00" };
  const depois = { date: "2026-10-19", time: "10:00", status: "confirmed", clientId: "c1", rescheduledBy: "c1" };
  it("o cliente mudou data ou hora do próprio horário", () => {
    expect(remarcadaPeloCliente(antes, depois)).toBe(true);
    expect(remarcadaPeloCliente(antes, { ...depois, date: "2026-10-16", time: "11:00" })).toBe(true);
  });
  it("remarcação do painel, sem mudança de horário ou de reserva fechada não avisa", () => {
    expect(remarcadaPeloCliente(antes, { ...depois, rescheduledBy: "dono" })).toBe(false);
    expect(remarcadaPeloCliente(antes, { ...depois, date: "2026-10-16" })).toBe(false);
    expect(remarcadaPeloCliente(antes, { ...depois, status: "cancelled_by_client" })).toBe(false);
    expect(remarcadaPeloCliente(antes, { ...depois, rescheduledBy: undefined })).toBe(false);
  });
});

describe("botão do encaixe", () => {
  it("ida e volta, e cabe nos 64 bytes do Telegram mesmo com id longo", () => {
    const id = "fixo_cmJa1ehndeHw0woNJk8T_5d3b21fa_2026-10-01";
    const dado = dadoDoBotao("a", id);
    expect(Buffer.byteLength(dado)).toBeLessThanOrEqual(64);
    expect(lerDadoDoBotao(dado)).toEqual({ aprovar: true, bookingId: id });
    expect(lerDadoDoBotao(dadoDoBotao("r", "abc"))).toEqual({ aprovar: false, bookingId: "abc" });
  });
  it("dado torto ou com caminho não passa", () => {
    expect(lerDadoDoBotao("enc:a:../outra/loja")).toBeNull();
    expect(lerDadoDoBotao("qualquer")).toBeNull();
    expect(lerDadoDoBotao(undefined)).toBeNull();
  });
});

describe("textos", () => {
  it("data curta com o dia da semana certo", () => {
    expect(diaCurto("2026-10-03")).toBe("sáb 03/10");
    expect(diaCurto("2026-10-01")).toBe("qui 01/10");
  });
  it("nome do cliente não injeta HTML", () => {
    expect(esc("<b>João</b> & cia")).toBe("&lt;b&gt;João&lt;/b&gt; &amp; cia");
    expect(textoDoEncaixe({ clientName: "<i>x</i>", date: "2026-10-03", time: "17:30" }, "Loja")).not.toContain("<i>x</i>");
  });
  it("agenda do barbeiro diz de quem é; vazia diz que está vazia", () => {
    const t = textoDaAgendaDoDia({
      loja: "O Siqueira",
      data: "2026-10-01",
      deQuem: "Lucas",
      reservas: [{ clientName: "Cleiton", date: "2026-10-01", time: "10:00", serviceNames: ["Corte adulto"], mensalista: true }],
    });
    expect(t).toContain("Lucas");
    expect(t).toContain("mensalista");
    expect(textoDaAgendaDoDia({ loja: "L", data: "2026-10-01", reservas: [] })).toContain("Nenhum horário");
  });
  it("fechamento lembra o que ficou em aberto", () => {
    const t = textoDoFechamento({ loja: "L", data: "2026-10-01", concluidos: 10, faltas: 1, emAberto: 2, recebido: 780 });
    expect(t).toContain("10 atendimentos concluídos");
    expect(t).toContain("R$");
    expect(t).toContain("2 horários ainda estão em aberto");
    expect(t).not.toContain("Caixinha");
  });
  it("fechamento mostra a caixinha do dia, já inclusa no total", () => {
    const t = textoDoFechamento({ loja: "L", data: "2026-10-01", concluidos: 1, faltas: 0, emAberto: 0, recebido: 60, caixinha: 10 });
    expect(t).toContain("Caixinha: R$");
    expect(t).toContain("10,00");
    expect(t).toContain("já inclusa");
  });
  it("o total do fechamento soma a caixinha ao recebido e a destaca", async () => {
    const { totalDoFechamento } = await import("../telegram/gatilhos");
    expect(
      totalDoFechamento(
        [{ grossAmount: 50, origin: "servico" }, { grossAmount: 10, origin: "caixinha" }],
        []
      )
    ).toEqual({ recebido: 60, estornado: 0, caixinha: 10 });
    expect(totalDoFechamento([{ grossAmount: 50 }], [{ grossAmount: 5 }])).toEqual({
      recebido: 45,
      estornado: 5,
      caixinha: 0,
    });
  });
});

describe("notificação do app (push)", async () => {
  const { textoDaNotificacao } = await import("../push/gatilhos");
  it("encaixe chama para responder; cancelamento diz que ficou livre", () => {
    const r = { clientName: "Cleiton", serviceNames: ["Corte adulto"], date: "2026-10-03", time: "17:30", staffName: "Rômulo" };
    expect(textoDaNotificacao("encaixe", r)).toEqual({
      titulo: "🔔 Pedido de encaixe",
      corpo: "Cleiton · Corte adulto\nsáb 03/10 às 17:30 · Rômulo — toque para responder",
    });
    expect(textoDaNotificacao("cancelamento", r).corpo).toContain("ficou livre");
  });
});
