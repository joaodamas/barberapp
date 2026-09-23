import { describe, expect, it } from "vitest";
import {
  NOME_MAX,
  dataValida,
  desfechoDoCancelamento,
  horaValida,
  jornadaDoBarbeiro,
  nomeLimpo,
} from "../booking";

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

describe("formato de data, hora e nome — o que chega pela callable", () => {
  it("recusa hora que casava `\\d{2}:\\d{2}` e não existe", () => {
    for (const h of ["99:99", "24:00", "25:00", "12:60", "9:00", "", undefined]) {
      expect(horaValida(h), String(h)).toBe(false);
    }
    for (const h of ["00:00", "09:30", "19:45", "23:59"]) expect(horaValida(h), h).toBe(true);
  });

  it("recusa data que casa o formato e não o calendário", () => {
    for (const d of ["2026-02-31", "2026-13-01", "2026-00-10", "26-09-29", "2026-9-29"]) {
      expect(dataValida(d), d).toBe(false);
    }
    for (const d of ["2026-09-29", "2028-02-29"]) expect(dataValida(d), d).toBe(true);
  });

  it("limita o nome e desfaz espaços, sem inventar um", () => {
    expect(nomeLimpo("x".repeat(5000))).toHaveLength(NOME_MAX);
    expect(nomeLimpo("  João   Balcão ")).toBe("João Balcão");
    expect(nomeLimpo(undefined)).toBe("");
  });
});

describe("jornadaDoBarbeiro — uma régua só para criar e remarcar", () => {
  const loja = {
    schedule: { weekdays: [1, 2, 3, 4, 5, 6], opensAt: "09:00", closesAt: "19:00", breaks: [{ from: "12:00", to: "14:00" }], slotMinutes: 30 },
  };
  const semJornada = { get: () => undefined };
  const comFolgaNaTerca = {
    get: (k: string) =>
      k === "schedule" ? { weekdays: [1, 3, 4, 5, 6], opensAt: "10:00", closesAt: "18:00", slotMinutes: 20 } : "Zé",
  };

  it("sem jornada própria, vale a da loja", () => {
    const r = jornadaDoBarbeiro({ barbeiro: semJornada, shop: loja, date: "2026-09-29", timeZone: "America/Sao_Paulo" });
    expect(r.doDia.aberto).toBe(true);
    expect(r.slotMinutes).toBe(30);
    expect(r.temJornadaPropria).toBe(false);
  });

  it("a folga do barbeiro fecha o dia dele mesmo com a loja aberta", () => {
    // 29/09/2026 é terça.
    const r = jornadaDoBarbeiro({ barbeiro: comFolgaNaTerca, shop: loja, date: "2026-09-29", timeZone: "America/Sao_Paulo" });
    expect(r.doDia.aberto).toBe(false);
    expect(r.slotMinutes).toBe(20);
  });
});
