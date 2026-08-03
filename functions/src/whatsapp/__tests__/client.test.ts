import { describe, expect, it } from "vitest";
import { montarComponentes, normalizarNumero } from "../client";
import {
  dataPorExtenso,
  formaPagamento,
  listaDeServicos,
  moeda,
  primeiroNome,
} from "../format";
import { parseButtonPayload } from "../templates";

describe("número de destino", () => {
  it("põe o DDI que o dono não digita", () => {
    expect(normalizarNumero("(11) 96173-3047")).toBe("5511961733047");
    expect(normalizarNumero("11961733047")).toBe("5511961733047");
  });

  it("não duplica o 55 de quem já digitou completo", () => {
    expect(normalizarNumero("5511961733047")).toBe("5511961733047");
  });

  it("recusa o que não é telefone — a Cloud API responde 200 e não entrega", () => {
    expect(normalizarNumero("123")).toBeNull();
    expect(normalizarNumero("")).toBeNull();
  });
});

describe("componentes da mensagem", () => {
  it("põe os parâmetros na ordem do catálogo, não na ordem de quem chamou", () => {
    // O erro que isto impede: valor e hora trocados numa confirmação, que só
    // aparece quando o cliente chega no horário errado.
    const [body] = montarComponentes("nova_reserva", {
      valor: "R$ 90,00",
      hora: "16:30",
      nomeCliente: "João Damas",
      data: "segunda, 03 de agosto",
      servicos: "Corte e Barba",
      formaPagamento: "pagar no salão",
    }) as [{ parameters: { text: string }[] }];

    expect(body.parameters.map((p) => p.text)).toEqual([
      "João Damas",
      "Corte e Barba",
      "segunda, 03 de agosto",
      "16:30",
      "R$ 90,00",
      "pagar no salão",
    ]);
  });

  it("anexa o payload de cada botão, para o webhook saber qual reserva é", () => {
    const componentes = montarComponentes(
      "lembrete_confirmacao",
      { primeiroNome: "João", nomeBarbearia: "O Siqueira", hora: "16:30", servicos: "Corte" },
      "bk-123"
    ) as { type: string; parameters: { payload?: string }[] }[];

    const botoes = componentes.filter((c) => c.type === "button");
    expect(botoes).toHaveLength(2);
    expect(parseButtonPayload(botoes[0].parameters[0].payload!)).toEqual({
      action: "CONFIRM_BOOKING",
      refId: "bk-123",
    });
    expect(parseButtonPayload(botoes[1].parameters[0].payload!)).toEqual({
      action: "CANCEL_BOOKING",
      refId: "bk-123",
    });
  });

  it("sem refId não manda botão — payload vazio chegaria sem dizer qual reserva", () => {
    const componentes = montarComponentes("lembrete_confirmacao", {
      primeiroNome: "João", nomeBarbearia: "O Siqueira", hora: "16:30", servicos: "Corte",
    }) as { type: string }[];
    expect(componentes.filter((c) => c.type === "button")).toHaveLength(0);
  });
});

describe("formatação do que o cliente lê", () => {
  it("a data não escorrega um dia por causa do fuso", () => {
    // A função roda em UTC na Cloud Function: `new Date("2026-08-03")` lá é
    // 03/08 00:00Z, que no Brasil ainda é dia 2. Uma segunda vira "domingo".
    expect(dataPorExtenso("2026-08-03")).toBe("segunda-feira, 03 de agosto");
    expect(dataPorExtenso("2026-01-01")).toBe("quinta-feira, 01 de janeiro");
  });

  it("valor em real, com vírgula", () => {
    expect(moeda(90)).toMatch(/R\$\s?90,00/);
    expect(moeda(0)).toMatch(/R\$\s?0,00/);
  });

  it("trata pelo primeiro nome — nome completo soa a cobrança de banco", () => {
    expect(primeiroNome("João Pedro Damas")).toBe("João");
    expect(primeiroNome("   ")).toBe("tudo bem");
  });

  it("descreve o pagamento como o cliente entende", () => {
    expect(formaPagamento("local")).toBe("pagar no salão");
    expect(formaPagamento("pix")).toBe("pago via Pix");
    expect(formaPagamento("qualquer_outra")).toBe("pagar no salão");
  });

  it("lista serviços com 'e' antes do último", () => {
    expect(listaDeServicos(["Corte"])).toBe("Corte");
    expect(listaDeServicos(["Corte", "Barba"])).toBe("Corte e Barba");
    expect(listaDeServicos(["Corte", "Barba", "Sobrancelha"])).toBe(
      "Corte, Barba e Sobrancelha"
    );
    expect(listaDeServicos([])).toBe("Atendimento");
  });
});
