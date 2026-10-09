import { describe, expect, it } from "vitest";
import { lerRespostaDoHub, situacaoDoBoleto } from "../hub/cobrancas";

/**
 * A tela de Assinatura mostra o que o Hub diz sobre os boletos — e só isso.
 * O que decide sem rede: como a situação crua do Inter vira palavra do dono, e
 * o que fazer com resposta torta.
 */
describe("situação do boleto", () => {
  it("traduz o Inter para o que o dono entende", () => {
    expect(situacaoDoBoleto("RECEBIDO")).toBe("pago");
    expect(situacaoDoBoleto("MARCADO_RECEBIDO")).toBe("pago");
    expect(situacaoDoBoleto("A_RECEBER")).toBe("aberto");
    expect(situacaoDoBoleto("ATRASADO")).toBe("atrasado");
    expect(situacaoDoBoleto("PROTESTO")).toBe("atrasado");
    expect(situacaoDoBoleto("EM_PROCESSAMENTO")).toBe("processando");
    expect(situacaoDoBoleto("CANCELADO")).toBe("cancelado");
    expect(situacaoDoBoleto("EXPIRADO")).toBe("cancelado");
  });

  it("situação desconhecida nunca vira 'pago'", () => {
    expect(situacaoDoBoleto("ALGO_NOVO")).toBe("aberto");
    expect(situacaoDoBoleto(undefined)).toBe("aberto");
  });
});

describe("resposta do Hub", () => {
  it("lê assinatura e boletos, do mais novo para o mais velho", () => {
    const r = lerRespostaDoHub({
      assinatura: { plano: "Crescimento", valor: 197, ciclo: "mensal", status: "ativo", proximoVencimento: "2026-11-10" },
      cobrancas: [
        { id: "a", valor: 197, vencimento: "2026-09-10", situacao: "RECEBIDO", pagoEm: "2026-09-09" },
        { id: "b", valor: 197, vencimento: "2026-10-10", situacao: "A_RECEBER" },
      ],
    });
    expect(r.assinatura).toMatchObject({ plano: "Crescimento", valor: 197, status: "ativo" });
    expect(r.boletos.map((b) => b.id)).toEqual(["b", "a"]);
    expect(r.boletos[1]).toMatchObject({ situacao: "pago", pagoEm: "2026-09-09" });
  });

  it("assinatura anual traz ciclo e valorCiclo; Hub antigo sem eles vira nulo", () => {
    const anual = lerRespostaDoHub({
      assinatura: { plano: "Agenda", valor: 80.83, ciclo: "anual", valorCiclo: 970, status: "ativo", proximoVencimento: "2027-10-10" },
    });
    expect(anual.assinatura).toMatchObject({ ciclo: "anual", valorCiclo: 970, proximoVencimento: "2027-10-10" });
    const antigo = lerRespostaDoHub({ assinatura: { plano: "Agenda", valor: 97, ciclo: "mensal" } });
    expect(antigo.assinatura.valorCiclo).toBeNull();
  });

  it("boleto sem id, sem valor ou com data torta sai da lista em vez de aparecer quebrado", () => {
    const r = lerRespostaDoHub({
      cobrancas: [
        { valor: 10, vencimento: "2026-10-10" },
        { id: "x", valor: "197", vencimento: "2026-10-10" },
        { id: "y", valor: 197, vencimento: "10/10/2026" },
        { id: "ok", valor: 197, vencimento: "2026-10-10" },
      ],
    });
    expect(r.boletos.map((b) => b.id)).toEqual(["ok"]);
  });

  it("resposta vazia não quebra e não inventa nada", () => {
    const r = lerRespostaDoHub(null);
    expect(r.boletos).toEqual([]);
    expect(r.assinatura).toEqual({ plano: null, valor: null, ciclo: null, valorCiclo: null, formaPagamento: null, status: null, proximoVencimento: null });
  });

  it("no máximo 12 boletos", () => {
    const cobrancas = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      valor: 97,
      vencimento: `2025-${String((i % 12) + 1).padStart(2, "0")}-10`,
    }));
    expect(lerRespostaDoHub({ cobrancas }).boletos).toHaveLength(12);
  });
});
