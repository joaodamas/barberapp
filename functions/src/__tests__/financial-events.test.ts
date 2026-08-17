import { describe, expect, it } from "vitest";
import {
  calcularEventoFinanceiro,
  centavos,
  SEM_TAXA,
  taxaDoMetodo,
  type PaymentFees,
  decidirEfeito,
} from "../financial-events";

/**
 * Critérios de aceite do Bloco 1 — integridade do core financeiro.
 *
 * O que estes testes protegem: o fechamento de um mês não pode mudar porque
 * alguém alterou um cadastro depois. O percentual de comissão e a taxa de
 * pagamento são congelados na conclusão do atendimento, e o documento gravado
 * precisa ser reprodutível a partir dos próprios campos.
 */

const TAXAS: PaymentFees = { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 };

describe("taxa por forma de pagamento", () => {
  it("cada instrumento usa a taxa que a maquininha cobra dele", () => {
    expect(taxaDoMetodo("pix", TAXAS)).toBe(0);
    expect(taxaDoMetodo("cash", TAXAS)).toBe(0);
    expect(taxaDoMetodo("debit", TAXAS)).toBe(1.99);
    expect(taxaDoMetodo("credit", TAXAS)).toBe(3.49);
  });

  it("débito e crédito deixaram de ser o mesmo custo", () => {
    /* Enquanto o vocabulário era `cartao`, a função supunha crédito por
     * precaução e cobrava 3,49% de quem pagou 1,99% no débito. */
    expect(taxaDoMetodo("debit", TAXAS)).not.toBe(taxaDoMetodo("credit", TAXAS));
  });

  it("barbearia que ainda não cadastrou taxa não recebe custo inventado", () => {
    for (const m of ["pix", "cash", "debit", "credit"] as const) {
      expect(taxaDoMetodo(m, SEM_TAXA), m).toBe(0);
    }
  });
});

describe("cálculo do evento financeiro", () => {
  it("o exemplo do balcão: corte de R$ 50 no Pix, barbeiro a 40%", () => {
    const r = calcularEventoFinanceiro({
      valor: 50,
      metodo: "pix",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });

    expect(r.commission).toEqual({
      commissionPct: 40,
      commissionBase: 50,
      commissionAmount: 20,
    });
    expect(r.payment).toMatchObject({
      grossAmount: 50,
      feePct: 0,
      feeAmount: 0,
      netAmount: 50,
    });
  });

  it("cartão desconta a taxa do líquido", () => {
    const r = calcularEventoFinanceiro({
      valor: 100,
      metodo: "credit",
      commissionPctDoBarbeiro: 40,
      padraoPct: 40,
      fees: TAXAS,
    });
    expect(r.payment.feeAmount).toBe(3.49);
    expect(r.payment.netAmount).toBe(96.51);
  });

  it("líquido é sempre bruto menos taxa", () => {
    for (const valor of [37.9, 50, 89.99, 120, 233.33]) {
      for (const metodo of ["pix", "credit", "cash"] as const) {
        const { payment } = calcularEventoFinanceiro({
          valor, metodo, commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
        });
        expect(centavos(payment.grossAmount - payment.feeAmount)).toBe(payment.netAmount);
      }
    }
  });

  it("barbeiro sem percentual próprio cai no padrão da casa", () => {
    // O cadastro inicial grava `commissionPct: null`, não ausente.
    for (const pct of [null, undefined]) {
      const r = calcularEventoFinanceiro({
        valor: 100, metodo: "pix", commissionPctDoBarbeiro: pct,
        padraoPct: 40, fees: TAXAS,
      });
      expect(r.commission.commissionPct).toBe(40);
      expect(r.commission.commissionAmount).toBe(40);
    }
  });

  it("cada barbeiro comissiona pelo percentual dele", () => {
    const rômulo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 50, padraoPct: 40, fees: TAXAS,
    });
    const joão = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 30, padraoPct: 40, fees: TAXAS,
    });
    expect(rômulo.commission.commissionAmount).toBe(50);
    expect(joão.commission.commissionAmount).toBe(30);
  });

  it("não produz fração de centavo no documento", () => {
    const r = calcularEventoFinanceiro({
      valor: 33.33, metodo: "credit", commissionPctDoBarbeiro: 33,
      padraoPct: 40, fees: TAXAS,
    });
    for (const v of [
      r.commission.commissionAmount, r.payment.feeAmount, r.payment.netAmount,
    ]) {
      expect(Number.isInteger(Math.round(v * 100))).toBe(true);
      expect(v).toBe(centavos(v));
    }
  });
});

describe("os quatro instrumentos, ponta a ponta", () => {
  const casos = [
    { metodo: "pix" as const, taxa: 0, liquido: 50 },
    { metodo: "cash" as const, taxa: 0, liquido: 50 },
    { metodo: "debit" as const, taxa: 1, liquido: 49 },      // 1,99% de 50 = 0,995 -> 1,00
    { metodo: "credit" as const, taxa: 1.75, liquido: 48.25 }, // 3,49% de 50 = 1,745 -> 1,75
  ];

  it.each(casos)("$metodo desconta $taxa e deixa $liquido", ({ metodo, taxa, liquido }) => {
    const { payment } = calcularEventoFinanceiro({
      valor: 50, metodo, commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    expect(payment.feeAmount).toBe(taxa);
    expect(payment.netAmount).toBe(liquido);
    expect(payment.paymentMethod).toBe(metodo);
  });

  it("a comissão não muda com o instrumento — incide sobre o serviço", () => {
    const valores = casos.map(({ metodo }) =>
      calcularEventoFinanceiro({
        valor: 50, metodo, commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
      }).commission.commissionAmount
    );
    expect(new Set(valores).size).toBe(1);
    expect(valores[0]).toBe(20);
  });
});

describe("origem do pagamento", () => {
  /* `payments` é o registro histórico e precisa responder sobre o evento sem
   * depender de join com a reserva — que pode ser editada ou apagada. O campo
   * entra antes do gateway justamente para o histórico já nascer capaz de
   * separar o que veio do balcão do que virá pelo app. */
  it("carrega a origem junto com o método", () => {
    const { payment } = calcularEventoFinanceiro({
      valor: 50, metodo: "debit", origem: "in_person",
      commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    expect(payment.paymentOrigin).toBe("in_person");
    expect(payment.paymentMethod).toBe("debit");
  });

  it("reserva antiga, sem o campo, é tratada como balcão", () => {
    // Todo atendimento até aqui foi presencial: é a suposição correta, e a
    // única que não inventa um pagamento online que nunca existiu.
    for (const origem of [null, undefined]) {
      const { payment } = calcularEventoFinanceiro({
        valor: 50, metodo: "pix", origem,
        commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
      });
      expect(payment.paymentOrigin).toBe("in_person");
    }
  });

  it("origem não interfere na taxa nem na comissão", () => {
    const balcao = calcularEventoFinanceiro({
      valor: 50, metodo: "credit", origem: "in_person",
      commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    const online = calcularEventoFinanceiro({
      valor: 50, metodo: "credit", origem: "online",
      commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    expect(online.payment.feeAmount).toBe(balcao.payment.feeAmount);
    expect(online.commission).toEqual(balcao.commission);
    expect(online.payment.paymentOrigin).toBe("online");
  });
});

describe("atendimento concluído sem informar o método", () => {
  it("materializa o bruto e marca o método como desconhecido", () => {
    /* Caminho de exceção: a interface sempre pergunta. Gravar taxa 0 sem marca
     * apagaria a diferença entre "não teve taxa" e "não sabemos a taxa". */
    const { payment, commission } = calcularEventoFinanceiro({
      valor: 50, metodo: null, commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    expect(payment.paymentMethod).toBeNull();
    expect(payment.grossAmount).toBe(50);
    expect(payment.feeAmount).toBe(0);
    expect(commission.commissionAmount).toBe(20); // a comissão é devida de todo jeito
  });
});

describe("o histórico não muda quando o cadastro muda", () => {
  /* Este é o critério de aceite que originou o Bloco 1. Antes, a comissão era
   * lida de `staff.commissionPct` a cada leitura do DRE: renegociar em setembro
   * reescrevia agosto. */

  it("alterar a comissão do barbeiro não altera o atendimento já concluído", () => {
    // Dia 1 — Rômulo a 40%, atendimento de R$ 50.
    const dia1 = calcularEventoFinanceiro({
      valor: 50, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40, fees: TAXAS,
    });
    const gravado = { ...dia1.commission };

    // Dia 2 — Rômulo passa a 50%. O documento do dia 1 não é reescrito.
    const dia2 = calcularEventoFinanceiro({
      valor: 50, metodo: "pix", commissionPctDoBarbeiro: 50, padraoPct: 40, fees: TAXAS,
    });

    expect(gravado.commissionAmount).toBe(20);
    expect(gravado.commissionPct).toBe(40);
    expect(dia2.commission.commissionAmount).toBe(25); // vale só para o novo
  });

  it("alterar a taxa da maquininha não altera o pagamento já registrado", () => {
    const semTaxa: PaymentFees = { ...SEM_TAXA };
    const antigo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40, fees: semTaxa,
    });
    const gravado = { ...antigo.payment };

    // A barbearia passa a pagar 1% no Pix.
    const novo = calcularEventoFinanceiro({
      valor: 100, metodo: "pix", commissionPctDoBarbeiro: 40, padraoPct: 40,
      fees: { ...semTaxa, pix: 1 },
    });

    expect(gravado.feePct).toBe(0);
    expect(gravado.netAmount).toBe(100);
    expect(novo.payment.feePct).toBe(1);
    expect(novo.payment.netAmount).toBe(99);
  });

  it("o documento é reprodutível a partir dos próprios campos", () => {
    /* O invariante que sustenta a auditoria: com base e percentual gravados,
     * dá para reconferir o valor sem consultar cadastro nenhum. Guardar só o
     * `commissionAmount` diria QUANTO foi pago, não COMO se chegou lá. */
    const { commission, payment } = calcularEventoFinanceiro({
      valor: 80, metodo: "credit", commissionPctDoBarbeiro: 45, padraoPct: 40, fees: TAXAS,
    });

    expect(centavos((commission.commissionBase * commission.commissionPct) / 100))
      .toBe(commission.commissionAmount);
    expect(centavos((payment.grossAmount * payment.feePct) / 100))
      .toBe(payment.feeAmount);
  });

  it("mesma entrada sempre produz a mesma saída", () => {
    // Sem leitura de cadastro e sem relógio: reprocessar o gatilho grava o
    // mesmo documento, que é o que torna o `set` idempotente seguro.
    const entrada = {
      valor: 67.5, metodo: "credit" as const, commissionPctDoBarbeiro: 40,
      padraoPct: 40, fees: TAXAS,
    };
    expect(calcularEventoFinanceiro(entrada)).toEqual(calcularEventoFinanceiro(entrada));
  });
});

/* ------------------------------------------------------------------ */
/* Gate A2 — o fato financeiro consolidado não pode ser destruído      */
/* ------------------------------------------------------------------ */

describe("o que uma mudança de status faz com o fato financeiro", () => {
  it("concluir materializa", () => {
    expect(decidirEfeito("confirmed", "completed")).toBe("materializar");
    expect(decidirEfeito("confirmed_by_client", "completed")).toBe("materializar");
    expect(decidirEfeito("no_show", "completed")).toBe("materializar");
    expect(decidirEfeito("pending_payment", "completed")).toBe("materializar");
  });

  it("desfazer a conclusão para um estado operacional reverte", () => {
    /* É a correção de quem concluiu a reserva errada: o atendimento não
     * aconteceu, então comissão e pagamento têm de sumir junto. */
    expect(decidirEfeito("completed", "confirmed")).toBe("reverter");
    expect(decidirEfeito("completed", "confirmed_by_client")).toBe("reverter");
    expect(decidirEfeito("completed", "pending_payment")).toBe("reverter");
  });

  it("marcar falta depois de concluir reverte — não houve receita", () => {
    expect(decidirEfeito("completed", "no_show")).toBe("reverter");
  });

  it("CANCELAR um atendimento concluído NÃO destrói o fato", () => {
    /* O defeito que isto fecha: `cancelBooking` não checava status, o cliente
     * cancelava a própria reserva já atendida, e o gatilho apagava
     * `payments` e `commissions`. O corte aconteceu, o dinheiro entrou na
     * gaveta, e a receita sumia do DRE sem tela onde reencontrá-la.
     *
     * Devolver valor de atendimento realizado é ESTORNO — evento novo, não
     * remoção do anterior. Histórico financeiro se corrige somando. */
    expect(decidirEfeito("completed", "cancelled_by_client")).toBe("nada");
    expect(decidirEfeito("completed", "cancelled_by_shop")).toBe("nada");
    expect(decidirEfeito("completed", "expired")).toBe("nada");
  });

  it("mudança entre estados abertos não mexe em nada", () => {
    expect(decidirEfeito("confirmed", "cancelled_by_client")).toBe("nada");
    expect(decidirEfeito("fit_in_requested", "confirmed")).toBe("nada");
    expect(decidirEfeito("confirmed", "no_show")).toBe("nada");
  });

  it("reprocessamento do gatilho com o mesmo status não faz nada", () => {
    /* O Firestore reexecuta o gatilho em retry. `completed` → `completed` não
     * pode reverter nem duplicar. */
    expect(decidirEfeito("completed", "completed")).toBe("nada");
    expect(decidirEfeito("confirmed", "confirmed")).toBe("nada");
  });

  it("status ausente não derruba a decisão", () => {
    expect(decidirEfeito(undefined, "completed")).toBe("materializar");
    expect(decidirEfeito("completed", undefined)).toBe("nada");
    expect(decidirEfeito(undefined, undefined)).toBe("nada");
  });
});
