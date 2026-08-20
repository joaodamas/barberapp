import { describe, expect, it } from "vitest";
import { decidirCobertura, type Cobertura, type SubscriptionDoc } from "../mensalistas";

/**
 * D2 · o atendimento coberto pelo plano.
 *
 * O que estes testes fecham não era um erro de soma: era a **ausência de
 * representação**. O produto não tinha como dizer "coberto", então o dono só
 * tinha dois caminhos, e os dois corrompiam o resultado em direções opostas —
 * cobrar de novo (receita e comissão fantasmas) ou não concluir o atendimento
 * (perde o registro operacional, a agenda nunca fecha).
 *
 * A reprodução de 18/08, pela interface: plano Ilimitado de R$ 149,00
 * contratado e pago; ao marcar um corte, a tela ofereceu "Corte R$ 50,00" e o
 * fechamento perguntou "Como o cliente pagou?" com quatro meios e nenhuma opção
 * de cobertura. O DRE resultante mostrou `Serviços avulsos R$ 100,00` **e**
 * `Mensalidades recebidas R$ 149,00`, do mesmo cliente, no mesmo dia.
 */

const ILIMITADO = {
  id: "assin-1",
  planId: "ilimitado",
  planName: "Ilimitado",
  status: "ativo",
  startedAt: "2026-09-01",
  canceledAt: null,
  unlimited: true,
  servicesIncluded: null,
} satisfies Parameters<typeof decidirCobertura>[0]["assinatura"];

const QUATRO_CORTES = { ...ILIMITADO, id: "assin-2", planId: "mensal-4", planName: "4 cortes", unlimited: false, servicesIncluded: 4 };

const DESCONTO = { ...ILIMITADO, id: "assin-3", planId: "desconto", planName: "Clube", unlimited: false, servicesIncluded: null };

const corte = (
  assinatura: Parameters<typeof decidirCobertura>[0]["assinatura"],
  jaCobertosNaCompetencia = 0,
  over: Partial<Parameters<typeof decidirCobertura>[0]> = {}
): Cobertura =>
  decidirCobertura({
    valor: 50,
    data: "2026-09-14",
    assinatura,
    jaCobertosNaCompetencia,
    ...over,
  });

describe("D2 · cliente sem plano continua sendo cobrado", () => {
  it("sem assinatura, o corte é avulso e diz por quê", () => {
    /* A regra não pode virar "todo mundo é coberto": quem não é mensalista
     * continua pagando, e o motivo fica no fato para a tela poder explicar. */
    expect(corte(null)).toEqual({ tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 });
  });
});

describe("D2 · plano ILIMITADO", () => {
  it("o corte não gera cobrança nova", () => {
    const r = corte(ILIMITADO);
    expect(r.tipo).toBe("plano");
    expect(r).toMatchObject({
      subscriptionId: "assin-1",
      planId: "ilimitado",
      planName: "Ilimitado",
      competencia: "2026-09",
      valorCoberto: 50,
      cota: null,
    });
  });

  it("corte após corte após corte, e NENHUM vira receita nova", () => {
    /* O caso que o produto precisa impedir: dez cortes no mês de um plano de
     * R$ 149,00 gerando R$ 500,00 de receita que ninguém recebeu. */
    const dez = Array.from({ length: 10 }, (_, i) => corte(ILIMITADO, i));
    expect(dez.every((c) => c.tipo === "plano")).toBe(true);
    expect(dez.map((c) => c.valorCoberto).reduce((a, b) => a + b)).toBe(500);
  });

  it("ilimitado não tem teto a exibir", () => {
    const r = corte(ILIMITADO, 99);
    expect(r.tipo === "plano" && r.cota).toBe(null);
  });
});

describe("D2 · plano COM LIMITE", () => {
  it("dentro da cota, o corte está coberto e a tela sabe dizer 'X de 4'", () => {
    for (let ja = 0; ja < 4; ja++) {
      const r = corte(QUATRO_CORTES, ja);
      expect(r.tipo, `corte ${ja + 1}`).toBe("plano");
      expect(r.tipo === "plano" && r.usoNaCompetencia).toBe(ja + 1);
      expect(r.tipo === "plano" && r.cota).toBe(4);
    }
  });

  it("o corte ADICIONAL além do limite volta a ser cobrado", () => {
    /* E é o comportamento correto — o quinto corte não está no contrato. O
     * motivo separado de `sem_plano` é o que permite a tela dizer "cota do mês
     * esgotada" em vez de "esse cliente não tem plano". */
    const r = corte(QUATRO_CORTES, 4);
    expect(r).toEqual({ tipo: "avulso", motivo: "cota_esgotada", valorCoberto: 0 });
  });

  it("a cota é POR COMPETÊNCIA — o mês novo começa do zero", () => {
    /* A contagem que alimenta `jaCobertosNaCompetencia` é recortada pela
     * competência do atendimento; aqui fica fixado que a decisão usa a
     * competência da DATA do corte, e não "hoje". */
    expect(corte(QUATRO_CORTES, 0, { data: "2026-10-02" })).toMatchObject({
      tipo: "plano",
      competencia: "2026-10",
    });
  });
});

describe("D2 · plano de DESCONTO não cobre corte nenhum", () => {
  it("sem cota e sem ilimitado, o corte continua sendo cobrado", () => {
    /* É o plano que a tela do cliente descreve como "~~R$ 50,00~~ no avulso ·
     * economize 20%". Ele baixa o preço; não inclui atendimento. Tratá-lo como
     * coberto zeraria a receita de serviço de quem paga por corte. */
    expect(corte(DESCONTO)).toEqual({
      tipo: "avulso",
      motivo: "plano_nao_cobre",
      valorCoberto: 0,
    });
  });

  it("cota zero é o mesmo que não cobrir", () => {
    expect(corte({ ...QUATRO_CORTES, servicesIncluded: 0 }).tipo).toBe("avulso");
  });

  it("assinatura anterior ao D2, sem a regra copiada, não cobre nada", () => {
    /* As assinaturas que já existem não têm `unlimited` nem `servicesIncluded`.
     * Elas precisam continuar se comportando como sempre se comportaram —
     * cobrando —, e não virar cobertura retroativa que apagaria receita
     * já reconhecida. */
    const antiga = { ...DESCONTO, unlimited: undefined, servicesIncluded: undefined } as unknown as SubscriptionDoc & { id: string };
    expect(corte(antiga).tipo).toBe("avulso");
  });
});

describe("D2 · a assinatura precisa estar valendo NA competência do corte", () => {
  it("assinatura suspensa não cobre", () => {
    expect(corte({ ...ILIMITADO, status: "suspenso" })).toMatchObject({
      tipo: "avulso",
      motivo: "plano_inativo",
    });
  });

  it("corte ANTES do início do contrato não é coberto retroativamente", () => {
    /* Contratar em setembro não pode transformar em coberto um corte de agosto
     * que já entrou como receita e já pagou comissão. */
    expect(corte(ILIMITADO, 0, { data: "2026-08-20" })).toMatchObject({
      tipo: "avulso",
      motivo: "plano_inativo",
    });
  });

  it("cancelada NO MÊS, o ciclo pago vale até o fim", () => {
    /* Mesma régua de `valeNaCompetencia`, e de propósito: a competência que
     * gera fatura é a que dá direito ao corte. Duas contas para a mesma
     * pergunta fariam o cliente pagar o mês e o corte sair como avulso. */
    const r = corte({ ...ILIMITADO, status: "ativo", canceledAt: "2026-09-20" });
    expect(r.tipo).toBe("plano");
  });

  it("cancelada no mês ANTERIOR não cobre mais", () => {
    expect(corte({ ...ILIMITADO, status: "ativo", canceledAt: "2026-08-30" })).toMatchObject({
      tipo: "avulso",
      motivo: "plano_inativo",
    });
  });
});

describe("D2 · o fato responde as cinco perguntas", () => {
  it("coberto: qual plano, qual competência, quanto foi coberto, quanto virou receita", () => {
    const r = corte(ILIMITADO, 2);
    expect(r.tipo).toBe("plano");
    if (r.tipo !== "plano") throw new Error("inalcançável");

    expect(r.planName).toBe("Ilimitado"); // qual plano
    expect(r.competencia).toBe("2026-09"); // qual mensalidade pagou
    expect(r.valorCoberto).toBe(50); // quanto o plano absorveu
    expect(50 - r.valorCoberto).toBe(0); // receita reconhecida do atendimento
    expect(r.usoNaCompetencia).toBe(3); // houve cobrança adicional? ainda não
  });

  it("avulso: nada foi coberto, e a receita é o valor inteiro", () => {
    const r = corte(null);
    expect(r.valorCoberto).toBe(0);
    expect(50 - r.valorCoberto).toBe(50);
  });
});
