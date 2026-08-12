import { describe, expect, it } from "vitest";
import {
  atendimentosAtrasados,
  avaliarOperacao,
  desfechosEsquecidos,
  encaixesAguardando,
  estaAtrasado,
  fechamentosPendentes,
  LIMITE_CRITICOS,
  repartirParaExibicao,
  semServicoCadastrado,
  taxasNaoConfiguradas,
  type EstadoOperacional,
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

describe("atendimento atrasado", () => {
  /* `bk` marca 10:00. O relógio é sempre explícito: teste de atraso que lê a
   * hora da máquina passa de manhã e falha à noite. */
  const AS_10h20 = new Date("2026-08-11T10:20:00");
  const emAberto = (o: Partial<BookingDoc> & { id: string }) =>
    bk({ status: "confirmed", paymentMethod: null, ...o });

  it("não acusa antes da tolerância", () => {
    // 20 min de atraso com 30 de tolerância ainda é a terça-feira normal.
    expect(
      atendimentosAtrasados({
        bookings: [emAberto({ id: "1" })], agora: AS_10h20, toleranciaMin: 30,
      })
    ).toHaveLength(0);
  });

  it("acusa depois da tolerância", () => {
    const [item] = atendimentosAtrasados({
      bookings: [emAberto({ id: "1", clientName: "Pedro" })],
      agora: AS_10h20, toleranciaMin: 15,
    });
    expect(item.id).toBe("atendimento-atrasado:1");
    expect(item.title).toContain("Pedro");
    expect(item.title).toContain("20 min");
  });

  it("oferece as duas saídas, porque o dado não diz qual aconteceu", () => {
    /* Uma opção só faria o dono marcar falta de quem ele acabou de atender —
     * é o item inteiro que passa a mentir. */
    const [item] = atendimentosAtrasados({
      bookings: [emAberto({ id: "1" })], agora: AS_10h20, toleranciaMin: 15,
    });
    expect(item.intent).toEqual({ kind: "fecharAtendimento", bookingId: "1" });
    expect(item.secondary?.intent).toEqual({ kind: "marcarFalta", bookingId: "1" });
  });

  it("é crítico com confiança real — o motor não afirma que o cliente faltou", () => {
    /* Invariante 3: estimado nunca é crítico. O que se afirma aqui é
     * verificável — a reserva não teve desfecho e o horário passou. */
    const [item] = atendimentosAtrasados({
      bookings: [emAberto({ id: "1" })], agora: AS_10h20, toleranciaMin: 15,
    });
    expect(item.severity).toBe("critical");
    expect(item.confidence).toBe("real");
  });

  it("morre quando o atendimento tem desfecho, não por descarte", () => {
    expect(
      atendimentosAtrasados({
        bookings: [
          bk({ id: "1", status: "completed" }),
          bk({ id: "2", status: "no_show" }),
          bk({ id: "3", status: "cancelled_by_client" }),
        ],
        agora: AS_10h20, toleranciaMin: 15,
      })
    ).toHaveLength(0);
  });

  it("ignora quem ainda não pagou", () => {
    /* Reserva sem pagamento não tem horário garantido e pode expirar. Cobrar
     * desfecho dela é alarme sobre um fato que não aconteceu. */
    expect(
      atendimentosAtrasados({
        bookings: [bk({ id: "1", status: "pending_payment" })],
        agora: AS_10h20, toleranciaMin: 15,
      })
    ).toHaveLength(0);
  });

  it("sem relógio, não acusa atraso nenhum", () => {
    // No servidor não existe o relógio do balcão — e alerta que some na
    // hidratação é pior que alerta que chega um minuto depois.
    expect(
      atendimentosAtrasados({
        bookings: [emAberto({ id: "1" })], agora: null, toleranciaMin: 15,
      })
    ).toHaveLength(0);
  });

  it("motor e tela concordam sobre quem está atrasado", () => {
    /* A tela usa `estaAtrasado` para decidir se oferece o botão "Não veio". Se
     * as duas respostas divergirem, o painel acusa o atraso na coluna lateral
     * e não oferece a ação na linha ao lado. */
    const bookings = [
      emAberto({ id: "1", time: "09:00" }),
      emAberto({ id: "2", time: "10:15" }),
      bk({ id: "3", status: "completed" }),
    ];
    const doMotor = atendimentosAtrasados({
      bookings, agora: AS_10h20, toleranciaMin: 15,
    }).map((i) => i.id.replace("atendimento-atrasado:", ""));
    const daTela = bookings
      .filter((b) => estaAtrasado({ booking: b, agora: AS_10h20, toleranciaMin: 15 }))
      .map((b) => b.id);

    expect(doMotor.sort()).toEqual(daTela.sort());
    expect(doMotor).toHaveLength(1);
  });

  it("põe o mais atrasado na frente", () => {
    /* Com teto de três críticos, ordem errada esconde justamente quem está
     * esperando há mais tempo. */
    const itens = atendimentosAtrasados({
      bookings: [
        emAberto({ id: "recente", time: "10:10" }),
        emAberto({ id: "antigo", time: "09:00" }),
      ],
      agora: AS_10h20, toleranciaMin: 5,
    });
    expect(itens.map((i: { id: string }) => i.id)).toEqual([
      "atendimento-atrasado:antigo",
      "atendimento-atrasado:recente",
    ]);
  });
});

describe("motor", () => {
  /* Estado saudável; cada teste sobrescreve só o que investiga. Sem relógio por
   * padrão: assim nenhum teste que não é sobre atraso passa a depender da hora
   * em que a suíte roda. */
  const operacao = (o: Partial<EstadoOperacional> = {}): EstadoOperacional => ({
    bookings: [], services: [sv({ id: "s" })], statusServicos: "pronto",
    payments: [], fees: COM_TAXA, periodo: P,
    agora: null, toleranciaAtrasoMin: 15,
    ...o,
  });

  it("ordena por severidade e depois por urgência", () => {
    const itens = avaliarOperacao(operacao({
      bookings: [
        bk({ id: "1", paymentMethod: null }),            // crítico, urgência 1
        bk({ id: "2", status: "fit_in_requested" }),     // crítico, urgência 2
        bk({ id: "3", status: "confirmed", time: "09:00" }), // crítico, urgência 2
      ],
      services: [],                                      // crítico, urgência 1
      payments: [pg({ id: "p1" })], fees: SEM_TAXA,      // crítico, urgência 3
      agora: new Date("2026-08-11T10:20:00"),
    }));
    expect(itens.map((i) => i.urgency)).toEqual([1, 1, 2, 2, 3]);
  });

  it("não repete o mesmo problema", () => {
    /* Rede de segurança do invariante canônico: o mesmo id nunca aparece duas
     * vezes, mesmo que dois avaliadores descrevam a mesma situação. */
    const itens = avaliarOperacao(operacao({
      bookings: [bk({ id: "1", paymentMethod: null })],
    }));
    expect(new Set(itens.map((i) => i.id)).size).toBe(itens.length);
  });

  it("operação saudável não gera item nenhum", () => {
    // O Action Center vazio é o estado bom — não é lugar de elogio.
    const itens = avaliarOperacao(operacao({
      bookings: [bk({ id: "1", paymentMethod: "pix" })],
      payments: [pg({ id: "p" })],
    }));
    expect(itens).toEqual([]);
  });

  it("atendimento dentro do horário não vira item", () => {
    // O relógio existe, e mesmo assim a agenda em dia fica quieta.
    expect(
      avaliarOperacao(operacao({
        bookings: [bk({ id: "1", status: "confirmed", paymentMethod: null })],
        agora: new Date("2026-08-11T10:05:00"),
      }))
    ).toEqual([]);
  });

  it("todo item responde o que aconteceu, por que importa e o que fazer", () => {
    const itens = avaliarOperacao(operacao({
      bookings: [
        bk({ id: "1", paymentMethod: null }),
        bk({ id: "2", status: "fit_in_requested" }),
        bk({ id: "3", status: "confirmed", paymentMethod: null }),
      ],
      services: [],
      payments: [pg({ id: "p1" })], fees: SEM_TAXA,
      agora: new Date("2026-08-11T10:20:00"),
    }));
    expect(itens.length).toBeGreaterThan(3);
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
    const itens = avaliarOperacao(operacao({
      bookings: [bk({ id: "1", paymentMethod: null })],
      services: [],
    }));
    for (const i of itens) expect(["real", "estimated"]).toContain(i.confidence);
  });

  it("crítico estimado não existe — invariante 3", () => {
    /* Alerta inferido não pode ser vermelho: no dia em que o dono descobre que
     * um crítico era chute, ele para de ler a seção inteira. */
    const itens = avaliarOperacao(operacao({
      bookings: [
        bk({ id: "1", paymentMethod: null }),
        bk({ id: "2", status: "fit_in_requested" }),
        bk({ id: "3", status: "confirmed", paymentMethod: null }),
      ],
      services: [],
      payments: [pg({ id: "p1" })], fees: SEM_TAXA,
      agora: new Date("2026-08-11T10:20:00"),
    }));
    for (const i of itens) {
      if (i.severity === "critical") expect(i.confidence, i.id).toBe("real");
    }
  });
});

describe("repartição para exibição", () => {
  const criticos = (n: number) =>
    Array.from({ length: n }, (_, i) => bk({ id: String(i), paymentMethod: null }));

  const comCriticos = (n: number) =>
    avaliarOperacao({
      bookings: criticos(n), services: [sv({ id: "s" })], statusServicos: "pronto",
      payments: [], fees: COM_TAXA, periodo: P,
      agora: null, toleranciaAtrasoMin: 15,
    });

  it("mostra no máximo três críticos", () => {
    const { visiveis, ocultos } = repartirParaExibicao(comCriticos(5));
    expect(visiveis).toHaveLength(LIMITE_CRITICOS);
    expect(ocultos).toHaveLength(2);
  });

  it("o excedente não desaparece — some é pior que listar demais", () => {
    const itens = comCriticos(5);
    const { visiveis, ocultos } = repartirParaExibicao(itens);
    expect(visiveis.length + ocultos.length).toBe(itens.length);
  });

  it("com poucos itens, não há nada escondido", () => {
    expect(repartirParaExibicao(comCriticos(2)).ocultos).toHaveLength(0);
  });
});

describe("desfecho esquecido — o que ficou para trás", () => {
  const HOJE = "2026-08-12";

  it("acha a reserva de ontem que ninguém fechou", () => {
    /* O painel Hoje mostra `date === hoje` e o DRE só conta `completed`: sem
     * este avaliador, o corte que aconteceu ontem e ninguém concluiu some à
     * meia-noite, e o dono só percebe quando o mês fecha menor. */
    const itens = desfechosEsquecidos({
      todas: [bk({ id: "1", date: "2026-08-11", status: "confirmed", clientName: "Léo" })],
      hoje: HOJE,
    });

    expect(itens).toHaveLength(1);
    expect(itens[0].severity).toBe("critical");
    expect(itens[0].title).toMatch(/ontem/);
    expect(itens[0].intent).toEqual({ kind: "fecharAtendimento", bookingId: "1" });
  });

  it("oferece as DUAS saídas, porque o dado não diz qual aconteceu", () => {
    // Concluir sozinho inventa receita; marcar falta sozinho mancha o cliente.
    const [item] = desfechosEsquecidos({
      todas: [bk({ id: "1", date: "2026-08-11", status: "confirmed" })],
      hoje: HOJE,
    });
    expect(item.secondary?.intent).toEqual({ kind: "marcarFalta", bookingId: "1" });
  });

  it("não alarma sobre o dia de hoje — isso é a agenda, não uma pendência", () => {
    expect(
      desfechosEsquecidos({
        todas: [bk({ id: "1", date: HOJE, status: "confirmed" })],
        hoje: HOJE,
      })
    ).toEqual([]);
  });

  it("ignora o que já teve desfecho", () => {
    const itens = desfechosEsquecidos({
      todas: [
        bk({ id: "1", date: "2026-08-10", status: "completed" }),
        bk({ id: "2", date: "2026-08-10", status: "no_show" }),
        bk({ id: "3", date: "2026-08-10", status: "cancelled_by_client" }),
        bk({ id: "4", date: "2026-08-10", status: "cancelled_by_shop" }),
      ],
      hoje: HOJE,
    });
    expect(itens).toEqual([]);
  });

  it("reserva não paga não vira cobrança de desfecho", () => {
    // Mesma razão do avaliador de atraso: quem não pagou não tem horário
    // garantido, e cobrar desfecho de algo que talvez expire é alarme falso.
    expect(
      desfechosEsquecidos({
        todas: [bk({ id: "1", date: "2026-08-10", status: "pending_payment" })],
        hoje: HOJE,
      })
    ).toEqual([]);
  });

  it("quanto mais velho, mais urgente — a lembrança é o dado que se perde", () => {
    const [ontem] = desfechosEsquecidos({
      todas: [bk({ id: "1", date: "2026-08-11", status: "confirmed" })],
      hoje: HOJE,
    });
    const [antigo] = desfechosEsquecidos({
      todas: [bk({ id: "2", date: "2026-08-01", status: "confirmed" })],
      hoje: HOJE,
    });

    expect(antigo.urgency).toBeLessThan(ontem.urgency);
    expect(antigo.title).toMatch(/11 dias/);
  });

  it("do mais antigo para o mais recente", () => {
    const itens = desfechosEsquecidos({
      todas: [
        bk({ id: "novo", date: "2026-08-11", status: "confirmed" }),
        bk({ id: "velho", date: "2026-08-05", status: "confirmed" }),
      ],
      hoje: HOJE,
    });
    expect(itens.map((i) => i.id)).toEqual([
      "desfecho-esquecido:velho",
      "desfecho-esquecido:novo",
    ]);
  });
});
