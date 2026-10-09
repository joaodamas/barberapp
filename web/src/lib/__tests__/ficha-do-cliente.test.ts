import { describe, expect, it } from "vitest";
import { fichaDoCliente, totalGasto, listaDeClientes, paresDeMesmoNumero } from "@/lib/ficha-do-cliente";
import type { Doc } from "@/lib/db/repository";
import type {
  BookingDoc,
  ClientDoc,
  InventoryMovementDoc,
  SubscriberDoc,
} from "@/lib/domain";

/**
 * D26 · a ficha do cliente.
 *
 * Tudo aqui é DERIVADO. O blueprint §3.2 é explícito: visitas, ticket médio,
 * total gasto e última visita são "derivados, nunca gravados" — materializá-los
 * criaria a mesma classe de defeito de `dueStage`, campo que envelhece no dia
 * seguinte e ninguém atualiza.
 */

const HOJE = new Date("2026-09-20T12:00:00");
const HOJE_ISO = "2026-09-20";

const cliente = (o: Partial<ClientDoc> & { id: string }): Doc<ClientDoc> => ({
  uid: null,
  name: "Seu Zé",
  whatsapp: "5511977776666",
  origin: "balcao",
  active: true,
  ...o,
});

const bk = (o: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> => ({
  clientId: "c1",
  staffId: "b1",
  clientName: "Seu Zé",
  clientWhatsapp: "5511977776666",
  serviceIds: ["corte"],
  date: "2026-09-01",
  time: "15:00",
  status: "completed",
  value: 50,
  paymentOrigin: "in_person",
  paymentMethod: "pix",
  ...o,
});

const mov = (o: Partial<InventoryMovementDoc> & { id: string }): Doc<InventoryMovementDoc> => ({
  productId: "pomada",
  kind: "venda",
  quantity: 1,
  value: 45,
  date: "2026-09-05",
  ...o,
});

const base = { movements: [] as Doc<InventoryMovementDoc>[], subscribers: [] as Doc<SubscriberDoc>[], hoje: HOJE, hojeISO: HOJE_ISO };

describe("D26 · visitas e última visita", () => {
  it("conta só atendimento CONCLUÍDO", () => {
    /* Reserva marcada não é visita. Contá-la faria "cliente fiel" incluir quem
     * marcou e nunca apareceu — e a régua de reativação chamaria a pessoa
     * errada. */
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [
        bk({ id: "1", status: "completed", date: "2026-09-01" }),
        bk({ id: "2", status: "confirmed", date: "2026-09-25" }),
        bk({ id: "3", status: "no_show", date: "2026-09-10" }),
        bk({ id: "4", status: "cancelled_by_client", date: "2026-09-12" }),
      ],
    });
    expect(f.visitas).toBe(1);
  });

  it("a última visita é a mais recente CONCLUÍDA", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [
        bk({ id: "1", date: "2026-09-01" }),
        bk({ id: "2", date: "2026-09-15" }),
        bk({ id: "3", date: "2026-09-08" }),
      ],
    });
    expect(f.ultimaVisita).toBe("2026-09-15");
    expect(f.diasSemVir).toBe(5);
  });

  it("quem nunca veio não tem visita nem dias — e isso NÃO é zero", () => {
    /* Zero dias sem vir significaria "veio hoje". Nulo separa "nunca veio" de
     * "veio agora", que é a diferença entre chamar e não chamar. */
    const f = fichaDoCliente({ ...base, cliente: cliente({ id: "c1" }), bookings: [] });
    expect(f.visitas).toBe(0);
    expect(f.ultimaVisita).toBeNull();
    expect(f.diasSemVir).toBeNull();
  });

  it("não mistura o atendimento de outro cliente", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", clientId: "c1" }), bk({ id: "2", clientId: "c2" })],
    });
    expect(f.visitas).toBe(1);
  });
});

describe("D26 · gasto e ticket", () => {
  it("separa serviço de produto", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", value: 50 }), bk({ id: "2", value: 90, date: "2026-09-10" })],
      movements: [mov({ id: "v1", clientId: "c1", value: 45 })],
    });
    expect(f.gastoEmServicos).toBe(140);
    expect(f.gastoEmProdutos).toBe(45);
  });

  it("o ticket é do ATENDIMENTO — não soma produto", () => {
    /* Repetir aqui o erro de D2 seria dividir o numerador de uma grandeza pelo
     * denominador de outra: (140 + 45) ÷ 2 não é ticket de atendimento. */
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", value: 50 }), bk({ id: "2", value: 90, date: "2026-09-10" })],
      movements: [mov({ id: "v1", clientId: "c1", value: 45 })],
    });
    expect(f.ticketMedio).toBe(70);
    expect(f.ticketMedio).not.toBe(93);
  });

  it("venda AVULSA não entra em ficha nenhuma", () => {
    /* `clientId: null` é o caso normal do balcão. Atribuí-la a alguém seria
     * inventar — e é justamente o que G1 decidiu não fazer. */
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [],
      movements: [mov({ id: "v1", clientId: null, value: 45 })],
    });
    expect(f.gastoEmProdutos).toBe(0);
  });

  it("compra de estoque não vira gasto do cliente", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [],
      movements: [mov({ id: "c01", kind: "compra", clientId: "c1", value: 180 })],
    });
    expect(f.gastoEmProdutos).toBe(0);
  });

  it("sem visita, ticket é zero e não NaN", () => {
    const f = fichaDoCliente({ ...base, cliente: cliente({ id: "c1" }), bookings: [] });
    expect(f.ticketMedio).toBe(0);
  });
});

describe("D26 · próximo atendimento", () => {
  it("mostra o mais próximo a partir de hoje", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [
        bk({ id: "1", status: "confirmed", date: "2026-10-05" }),
        bk({ id: "2", status: "confirmed", date: "2026-09-22" }),
      ],
    });
    expect(f.proximoAtendimento?.date).toBe("2026-09-22");
  });

  it("inclui HOJE — o atendimento das 18h ainda é próximo às 12h", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", status: "confirmed", date: HOJE_ISO, time: "18:00" })],
    });
    expect(f.proximoAtendimento?.id).toBe("1");
  });

  it("cancelado não é próximo atendimento", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", status: "cancelled_by_shop", date: "2026-09-25" })],
    });
    expect(f.proximoAtendimento).toBeNull();
  });

  it("passado não é próximo", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", status: "completed", date: "2026-09-01" })],
    });
    expect(f.proximoAtendimento).toBeNull();
  });
});

describe("D26 · mensalista", () => {
  const assinatura = (o: Partial<SubscriberDoc>): Doc<SubscriberDoc> => ({
    id: "s1",
    clientId: "c1",
    name: "Seu Zé",
    planId: "p1",
    planName: "Ilimitado",
    price: 149,
    status: "ativo",
    ...o,
  });

  it("aponta a assinatura ativa", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [],
      subscribers: [assinatura({})],
    });
    expect(f.mensalista?.planName).toBe("Ilimitado");
  });

  it("assinatura CANCELADA não faz do cliente um mensalista", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [],
      subscribers: [assinatura({ status: "cancelado" })],
    });
    expect(f.mensalista).toBeNull();
  });

  it("suspenso continua sendo mensalista — ele volta ao regularizar", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [],
      subscribers: [assinatura({ status: "suspenso" })],
    });
    expect(f.mensalista?.status).toBe("suspenso");
  });
});

describe("D26 · a lista", () => {
  it("ordena em ordem alfabética, sem importar a última visita", () => {
    /* Pedido do dono (02/10): ele procura o cliente pelo nome. */
    const r = listaDeClientes({
      ...base,
      clientes: [
        cliente({ id: "c3", name: "Zeca" }),
        cliente({ id: "c2", name: "Bruno" }),
        cliente({ id: "c1", name: "Ana" }),
      ],
      bookings: [
        bk({ id: "1", clientId: "c3", date: "2026-09-18" }),
        bk({ id: "2", clientId: "c1", date: "2026-09-01" }),
      ],
    });
    expect(r.map((f) => f.cliente.name)).toEqual(["Ana", "Bruno", "Zeca"]);
  });

  it("ignora acento e maiúscula, como no Brasil", () => {
    const r = listaDeClientes({
      ...base,
      clientes: [
        cliente({ id: "c1", name: "joão" }),
        cliente({ id: "c2", name: "Álvaro" }),
        cliente({ id: "c3", name: "Alberto" }),
        cliente({ id: "c4", name: "Ícaro" }),
        cliente({ id: "c5", name: "Igor" }),
      ],
      bookings: [],
    });
    expect(r.map((f) => f.cliente.name)).toEqual(["Alberto", "Álvaro", "Ícaro", "Igor", "joão"]);
  });

  it("cadastro fundido não aparece", () => {
    /* Resultado de fusão: marcar reserva nele criaria histórico num registro
     * já substituído. */
    const r = listaDeClientes({
      ...base,
      clientes: [cliente({ id: "c1" }), cliente({ id: "c2", active: false })],
      bookings: [],
    });
    expect(r).toHaveLength(1);
  });
});

describe("02/10 · conta e balcão com o mesmo número", () => {
  const balcao = cliente({ id: "b1", uid: null, name: "Bruno Teste", whatsapp: "11988887777" });
  const conta = cliente({ id: "u1", uid: "u1", name: "Bruno", whatsapp: "11988887777", mesmoNumeroQue: "b1" });

  it("acha o par quando a conta aponta para um balcão vivo", () => {
    const pares = paresDeMesmoNumero([balcao, conta]);
    expect(pares).toHaveLength(1);
    expect(pares[0].conta.id).toBe("u1");
    expect(pares[0].balcao.id).toBe("b1");
  });
  it("acha o par pelo indício gravado no balcão (09/10), sem depender da conta", () => {
    const contaSemIndicio = cliente({ id: "u1", uid: "u1", name: "Bruno", whatsapp: "11988887777" });
    const pares = paresDeMesmoNumero([{ ...balcao, contasDoMesmoNumero: ["u1", "u9"] }, contaSemIndicio]);
    expect(pares).toHaveLength(1);
    expect(pares[0].conta.id).toBe("u1");
    expect(pares[0].balcao.id).toBe("b1");
  });
  it("o mesmo par pelos dois indícios aparece uma vez só", () => {
    expect(paresDeMesmoNumero([{ ...balcao, contasDoMesmoNumero: ["u1"] }, conta])).toHaveLength(1);
  });
  it("balcão já vinculado ou inativo não aparece", () => {
    expect(paresDeMesmoNumero([{ ...balcao, mergedInto: "u1" }, conta])).toHaveLength(0);
    expect(paresDeMesmoNumero([{ ...balcao, active: false }, conta])).toHaveLength(0);
  });
  it("indício apontando para outra conta não é par", () => {
    const outra = cliente({ id: "u2", uid: "u2", name: "Outro", whatsapp: "11988887777" });
    expect(paresDeMesmoNumero([outra, { ...conta, mesmoNumeroQue: "u2" }])).toHaveLength(0);
  });
});

/** Revisão financeira de 08/10 — a régua única do "total gasto". */
describe("gasto: coberto pelo plano e devoluções", () => {
  const plano = {
    tipo: "plano" as const,
    subscriptionId: "s1",
    planId: "p1",
    planName: "Ilimitado",
    competencia: "2026-09",
    valorCoberto: 50,
    usoNaCompetencia: 1,
    cota: null,
  };
  it("corte coberto pelo plano não é gasto do atendimento (quem pagou foi a mensalidade)", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", value: 50, cobertura: plano }), bk({ id: "2", value: 60, date: "2026-09-10" })],
    });
    expect(f.gastoEmServicos).toBe(60);
    expect(f.visitas).toBe(2);
    expect(f.ticketMedio).toBe(60);
  });
  it("devolução de produto e de serviço abate o gasto", () => {
    const f = fichaDoCliente({
      ...base,
      cliente: cliente({ id: "c1" }),
      bookings: [bk({ id: "1", value: 50 })],
      movements: [mov({ id: "v1", clientId: "c1", value: 45 })],
      refunds: [
        { id: "r1", origin: "produto", movementId: "v1", paymentId: "p", clientId: "c1", date: "2026-09-06", originalDate: "2026-09-05", reason: "", paymentMethod: "pix", grossAmount: 45, feeAmount: 0, netAmount: 45, parcial: false },
        { id: "r2", origin: "servico", bookingId: "1", paymentId: "p2", clientId: "c1", date: "2026-09-02", originalDate: "2026-09-01", reason: "", paymentMethod: "pix", grossAmount: 20, feeAmount: 0, netAmount: 20, parcial: true },
      ],
    });
    expect(f.gastoEmProdutos).toBe(0);
    expect(f.gastoEmServicos).toBe(30);
  });
  it("totalGasto: a mesma régua do app do cliente (Reservas e Perfil)", () => {
    expect(
      totalGasto([
        { value: 50, discountAmount: 10 },
        { value: 50, cobertura: plano },
        { value: 50, discountAmount: 50 },
      ])
    ).toBe(40);
  });
});
