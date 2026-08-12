import { describe, expect, it } from "vitest";
import { desfechoDoCancelamento } from "../booking";

/**
 * O cancelamento é o caminho onde a barbearia toca em dinheiro do CLIENTE, e
 * até 12/08 nada aqui tinha teste: a conta morava dentro do `onCall`, e exercer
 * exigia emulador, autenticação e reserva semeada.
 *
 * Passou a importar porque o painel ganhou o botão de cancelar. Antes disso, a
 * única forma de cancelar era o app do cliente — e na operação real o cliente
 * avisa no balcão, ou seja, o caminho mais usado era o que não existia.
 */
const POLITICA = { fullRefundHours: 24, partialRefundHours: 6, cancellationFeePct: 25 };
const base = {
  value: 100,
  paymentMethod: "pix",
  politica: POLITICA,
  peloDono: false,
};

describe("devolução do cancelamento", () => {
  it("devolve tudo acima da janela integral", () => {
    const r = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 25 });
    expect(r.refund).toBe(100);
  });

  it("retém a taxa na faixa intermediária", () => {
    const r = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 10 });
    expect(r.refund).toBe(75);
  });

  it("não devolve nada em cima da hora", () => {
    expect(desfechoDoCancelamento({ ...base, horasAteOAtendimento: 1 }).refund).toBe(0);
    expect(desfechoDoCancelamento({ ...base, horasAteOAtendimento: -2 }).refund).toBe(0);
  });

  it("sem pagamento não há o que devolver, por mais cedo que seja", () => {
    const r = desfechoDoCancelamento({
      ...base,
      paymentMethod: null,
      horasAteOAtendimento: 72,
    });
    expect(r.refund).toBe(0);
  });

  it("respeita a política da barbearia, e não a da plataforma", () => {
    /* 25h é integral pelo padrão (24h) e parcial numa barbearia que exige 48h.
     * É a faixa em que a tela e o servidor discordariam se a conta fosse feita
     * duas vezes com fontes diferentes. */
    const r = desfechoDoCancelamento({
      ...base,
      horasAteOAtendimento: 25,
      politica: { fullRefundHours: 48, partialRefundHours: 12, cancellationFeePct: 50 },
    });
    expect(r.refund).toBe(50);
  });

  it("barbearia sem política gravada cai no padrão da plataforma", () => {
    // Documento antigo, criado antes de `policies.cancellation` existir.
    const r = desfechoDoCancelamento({ ...base, politica: {}, horasAteOAtendimento: 25 });
    expect(r.refund).toBe(100);
  });
});

describe("quem cancelou fica registrado", () => {
  it("o dono cancelando reserva de outro grava cancelled_by_shop", () => {
    const r = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 25, peloDono: true });
    expect(r.status).toBe("cancelled_by_shop");
  });

  it("o cliente cancelando a própria reserva grava cancelled_by_client", () => {
    const r = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 25, peloDono: false });
    expect(r.status).toBe("cancelled_by_client");
  });

  it("o rótulo não muda a devolução — são decisões independentes", () => {
    /* A barbearia que desmarca não pode reter taxa por isso, e o cliente que
     * desmarca cedo não pode perder dinheiro por ter avisado ao dono em vez de
     * usar o app. Mesmas horas, mesmo refund. */
    const cliente = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 10 });
    const dono = desfechoDoCancelamento({ ...base, horasAteOAtendimento: 10, peloDono: true });
    expect(dono.refund).toBe(cliente.refund);
  });
});
