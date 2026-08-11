import { describe, expect, it } from "vitest";
import {
  avaliarOperacao,
  encaixesAguardando,
  fechamentosPendentes,
  LIMITE_CRITICOS,
  repartirParaExibicao,
  semServicoCadastrado,
  taxasNaoConfiguradas,
} from "@/lib/action-center";
import { mesPeriodo } from "@/lib/analytics";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, PaymentDoc, ServiceDoc } from "@/lib/domain";
import type { TenantPaymentFees } from "@/lib/tenant";

/**
 * O motor decide o que exige decisão. Estes testes protegem os invariantes do
 * contrato — principalmente os que, se quebrarem, fazem o dono parar de confiar
 * na seção: alerta que não morre, problema duplicado, urgência sem ordem.
 */

const P = mesPeriodo("2026-08");

const bk = (o: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> => ({
  clientId: "c1", staffId: "s1", clientName: "João", clientWhatsapp: "5511",
  serviceIds: ["corte"], date: "2026-08-11", time: "10:00",
  status: "completed", value: 50,
  paymentOrigin: "in_person", paymentMethod: "pix", ...o,
});
const sv = (o: Partial<ServiceDoc> & { id: string }): Doc<ServiceDoc> => ({
  name: "Corte", durationMin: 30, price: 50, active: true, ...o,
});
const pg = (o: Partial<PaymentDoc> & { id: string }): Doc<PaymentDoc> => ({
  clientId: "c1", date: "2026-08-11", paymentOrigin: "in_person",
  paymentMethod: "credit", grossAmount: 50, feePct: 3.49,
  feeAmount: 1.75, netAmount: 48.25, ...o,
});
const SEM_TAXA: TenantPaymentFees = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };
const COM_TAXA: TenantPaymentFees = { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 };

describe("fechamento pendente", () => {
  it("levanta o atendimento concluído sem forma de pagamento", () => {
    const itens = fechamentosPendentes([
      bk({ id: "1", paymentMethod: null }),
      bk({ id: "2", paymentMethod: "pix" }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].id).toBe("fechamento-pendente:1");
    expect(itens[0].severity).toBe("critical");
    expect(itens[0].confidence).toBe("real");
  });

  it("não levanta reserva que ainda não foi concluída", () => {
    // Sem método é o estado NORMAL de quem ainda vai ser atendido.
    expect(
      fechamentosPendentes([bk({ id: "1", status: "confirmed", paymentMethod: null })])
    ).toHaveLength(0);
  });

  it("morre quando o pagamento é registrado, não por descarte", () => {
    const antes = fechamentosPendentes([bk({ id: "1", paymentMethod: null })]);
    const depois = fechamentosPendentes([bk({ id: "1", paymentMethod: "debit" })]);
    expect(antes).toHaveLength(1);
    expect(depois).toHaveLength(0);
  });

  it("a ação acontece na própria tela, e o motor só declara a intenção", () => {
    const [item] = fechamentosPendentes([bk({ id: "abc", paymentMethod: null })]);
    expect(item.intent).toEqual({ kind: "fecharAtendimento", bookingId: "abc" });
  });
});

describe("taxas não configuradas", () => {
  it("cobra a configuração quando houve cartão e a taxa está zerada", () => {
    const itens = taxasNaoConfiguradas({
      fees: SEM_TAXA, payments: [pg({ id: "1", paymentMethod: "credit" })], periodo: P,
    });
    expect(itens).toHaveLength(1);
    expect(itens[0].urgency).toBe(3);
  });

  it("cala a boca quando a barbearia só recebe Pix e dinheiro", () => {
    /* Taxa zero é a verdade dessa barbearia. Cobrar configuração seria pedir
     * que ela informe um custo que não tem. */
    const itens = taxasNaoConfiguradas({
      fees: SEM_TAXA,
      payments: [pg({ id: "1", paymentMethod: "pix" }), pg({ id: "2", paymentMethod: "cash" })],
      periodo: P,
    });
    expect(itens).toHaveLength(0);
  });

  it("some depois de qualquer taxa ser informada", () => {
    expect(
      taxasNaoConfiguradas({
        fees: COM_TAXA, payments: [pg({ id: "1" })], periodo: P,
      })
    ).toHaveLength(0);
  });

  it("ignora cartão de outro mês", () => {
    expect(
      taxasNaoConfiguradas({
        fees: SEM_TAXA, payments: [pg({ id: "1", date: "2026-07-10" })], periodo: P,
      })
    ).toHaveLength(0);
  });
});

describe("sem serviço cadastrado", () => {
  it("espera a consulta responder antes de acusar", () => {
    // Lista vazia porque não chegou é diferente de vazia porque não existe.
    expect(
      semServicoCadastrado({ services: [], statusConsulta: "carregando" })
    ).toHaveLength(0);
    expect(
      semServicoCadastrado({ services: [], statusConsulta: "erro" })
    ).toHaveLength(0);
    expect(
      semServicoCadastrado({ services: [], statusConsulta: "pronto" })
    ).toHaveLength(1);
  });

  it("serviço existente mas oculto conta como nenhum serviço", () => {
    // O cliente não vê o que está oculto — para ele, não há o que agendar.
    expect(
      semServicoCadastrado({
        services: [sv({ id: "1", active: false })], statusConsulta: "pronto",
      })
    ).toHaveLength(1);
  });
});

describe("encaixe aguardando", () => {
  it("agrupa vários pedidos num item só", () => {
    const itens = encaixesAguardando([
      bk({ id: "1", status: "fit_in_requested" }),
      bk({ id: "2", status: "fit_in_requested" }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0].title).toContain("2");
  });

  it("nomeia o cliente quando é um só", () => {
    const [item] = encaixesAguardando([
      bk({ id: "1", status: "fit_in_requested", clientName: "Pedro" }),
    ]);
    expect(item.title).toContain("Pedro");
  });
});

describe("motor", () => {
  it("ordena por severidade e depois por urgência", () => {
    const itens = avaliarOperacao({
      bookings: [
        bk({ id: "1", paymentMethod: null }),            // crítico, urgência 1
        bk({ id: "2", status: "fit_in_requested" }),     // crítico, urgência 2
      ],
      services: [], statusServicos: "pronto",            // crítico, urgência 1
      payments: [pg({ id: "p1" })], fees: SEM_TAXA,      // crítico, urgência 3
      periodo: P,
    });
    expect(itens.map((i) => i.urgency)).toEqual([1, 1, 2, 3]);
  });

  it("não repete o mesmo problema", () => {
    /* Rede de segurança do invariante canônico: o mesmo id nunca aparece duas
     * vezes, mesmo que dois avaliadores descrevam a mesma situação. */
    const itens = avaliarOperacao({
      bookings: [bk({ id: "1", paymentMethod: null })],
      services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
    });
    expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length);
  });

  it("operação saudável não gera item nenhum", () => {
    // O Action Center vazio é o estado bom — não é lugar de elogio.
    const itens = avaliarOperacao({
      bookings: [bk({ id: "1", paymentMethod: "pix" })],
      services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [pg({ id: "p" })], fees: COM_TAXA, periodo: P,
    });
    expect(itens).toEqual([]);
  });

  it("todo item responde o que aconteceu, por que importa e o que fazer", () => {
    const itens = avaliarOperacao({
      bookings: [bk({ id: "1", paymentMethod: null }), bk({ id: "2", status: "fit_in_requested" })],
      services: [], statusServicos: "pronto",
      payments: [pg({ id: "p1" })], fees: SEM_TAXA, periodo: P,
    });
    for (const i of itens) {
      expect(i.title.length, i.id).toBeGreaterThan(0);
      expect(i.reason.length, i.id).toBeGreaterThan(0);
      expect(i.actionLabel.length, i.id).toBeGreaterThan(0);
      expect(i.intent, i.id).toBeTruthy();
    }
  });

  it("nenhum item nasce com confiança insuficiente", () => {
    // `insufficient` não é um valor possível no tipo — o teste existe para o
    // dia em que alguém tentar afrouxar isso.
    const itens = avaliarOperacao({
      bookings: [bk({ id: "1", paymentMethod: null })],
      services: [], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
    });
    for (const i of itens) expect(["real", "estimated"]).toContain(i.confidence);
  });
});

describe("repartição para exibição", () => {
  const criticos = (n: number) =>
    Array.from({ length: n }, (_, i) => bk({ id: String(i), paymentMethod: null }));

  it("mostra no máximo três críticos", () => {
    const itens = avaliarOperacao({
      bookings: criticos(5), services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
    });
    const { visiveis, ocultos } = repartirParaExibicao(itens);
    expect(visiveis).toHaveLength(LIMITE_CRITICOS);
    expect(ocultos).toHaveLength(2);
  });

  it("o excedente não desaparece — some é pior que listar demais", () => {
    const itens = avaliarOperacao({
      bookings: criticos(5), services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
    });
    const { visiveis, ocultos } = repartirParaExibicao(itens);
    expect(visiveis.length + ocultos.length).toBe(itens.length);
  });

  it("com poucos itens, não há nada escondido", () => {
    const itens = avaliarOperacao({
      bookings: criticos(2), services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
    });
    expect(repartirParaExibicao(itens).ocultos).toHaveLength(0);
  });
});
