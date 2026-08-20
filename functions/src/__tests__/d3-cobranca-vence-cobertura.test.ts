import { describe, expect, it } from "vitest";
import { decidirCobertura } from "../mensalistas";

/**
 * D-3 — quando o dono cobra de quem tem plano.
 *
 * ## O que o produto fazia
 *
 * O dono concluía o atendimento escolhendo **Pix**. O servidor decidia
 * `cobertura: plano` porque o cliente tinha assinatura ativa, e então:
 *
 * ```
 * payments/pagamento_{bk}      NÃO EXISTE      a receita não é registrada
 * bookings.paymentMethod       "pix"           afirmação sem lastro nenhum
 * a tela                       "Coberto pelo plano"
 * ```
 *
 * A escolha do operador era descartada em silêncio. Medido na bancada em
 * 20/08, e **não** era exclusivo da reabertura: acontecia igual na primeira
 * conclusão de qualquer mensalista.
 *
 * ## A regra
 *
 * Método informado é afirmação de que houve dinheiro, e ela vence a decisão do
 * servidor. O caminho de cobertura continua existindo e é explícito — "Concluir
 * sem cobrar" conclui sem método.
 */

const ILIMITADO = {
  id: "sub1",
  status: "ativo" as const,
  startedAt: "2026-08-01",
  canceledAt: null,
  planId: "ilimitado",
  planName: "Ilimitado",
  unlimited: true,
};

const DUAS_VEZES = {
  id: "sub2",
  status: "ativo" as const,
  startedAt: "2026-08-01",
  canceledAt: null,
  planId: "duplo",
  planName: "2 cortes",
  unlimited: false,
  servicesIncluded: 2,
};

const BASE = { valor: 50, data: "2026-08-20", jaCobertosNaCompetencia: 0 };

describe("D-3 · sem método informado, o plano manda (comportamento de sempre)", () => {
  it("ilimitado cobre", () => {
    const c = decidirCobertura({ ...BASE, assinatura: ILIMITADO });
    expect(c.tipo).toBe("plano");
  });

  it("plano com cota cobre enquanto há vaga", () => {
    const c = decidirCobertura({ ...BASE, assinatura: DUAS_VEZES });
    expect(c.tipo).toBe("plano");
  });

  it("`null` explícito é o caminho de 'Concluir sem cobrar'", () => {
    const c = decidirCobertura({ ...BASE, assinatura: ILIMITADO, metodoInformado: null });
    expect(c.tipo).toBe("plano");
  });
});

describe("D-3 · com método informado, a afirmação do dono vence", () => {
  it("ilimitado + Pix → avulso, e o motivo diz o que houve", () => {
    const c = decidirCobertura({ ...BASE, assinatura: ILIMITADO, metodoInformado: "pix" });
    expect(c.tipo).toBe("avulso");
    expect(c).toMatchObject({ motivo: "cobrado_no_balcao", valorCoberto: 0 });
  });

  it("plano com cota + dinheiro → avulso", () => {
    const c = decidirCobertura({ ...BASE, assinatura: DUAS_VEZES, metodoInformado: "cash" });
    expect(c.tipo).toBe("avulso");
    expect(c).toMatchObject({ motivo: "cobrado_no_balcao" });
  });

  it("o atendimento cobrado NÃO consome vaga da cota", () => {
    /* Ele foi pago à parte. Debitar a cota faria o cliente perder um corte que
     * comprou duas vezes — uma na mensalidade, outra no balcão. */
    const cobrado = decidirCobertura({
      ...BASE,
      assinatura: DUAS_VEZES,
      metodoInformado: "credit",
    });
    expect(cobrado.tipo).toBe("avulso");

    /* A vaga continua livre: o próximo, sem cobrança, é coberto como o primeiro. */
    const seguinte = decidirCobertura({ ...BASE, assinatura: DUAS_VEZES });
    expect(seguinte).toMatchObject({ tipo: "plano", usoNaCompetencia: 1 });
  });
});

describe("D-3 · a guarda não rouba os motivos mais informativos", () => {
  /* Ela fica DEPOIS de toda a régua de propósito. `cobrado_no_balcao` descreve
   * só o caso em que o plano COBRIRIA e o dono cobrou assim mesmo. */

  it("sem plano continua `sem_plano`, não `cobrado_no_balcao`", () => {
    const c = decidirCobertura({ ...BASE, assinatura: null, metodoInformado: "pix" });
    expect(c).toMatchObject({ motivo: "sem_plano" });
  });

  it("plano que não inclui atendimento continua `plano_nao_cobre`", () => {
    /* É a explicação real de por que houve cobrança — o plano "2 cortes" do
     * seed, sem `servicesIncluded`, nunca cobre nada. */
    const c = decidirCobertura({
      ...BASE,
      assinatura: { ...DUAS_VEZES, servicesIncluded: 0 },
      metodoInformado: "pix",
    });
    expect(c).toMatchObject({ motivo: "plano_nao_cobre" });
  });

  it("cota esgotada continua `cota_esgotada`", () => {
    const c = decidirCobertura({
      ...BASE,
      assinatura: DUAS_VEZES,
      jaCobertosNaCompetencia: 2,
      metodoInformado: "pix",
    });
    expect(c).toMatchObject({ motivo: "cota_esgotada" });
  });

  it("plano inativo continua `plano_inativo`", () => {
    const c = decidirCobertura({
      ...BASE,
      assinatura: { ...ILIMITADO, status: "cancelado" as const },
      metodoInformado: "pix",
    });
    expect(c).toMatchObject({ motivo: "plano_inativo" });
  });
});

describe("D-3 · o que isso significa para o dinheiro", () => {
  it("cobrado no balcão tem `valorCoberto: 0` — o plano não absorveu nada", () => {
    const c = decidirCobertura({ ...BASE, assinatura: ILIMITADO, metodoInformado: "pix" });
    expect(c.valorCoberto).toBe(0);
  });

  it("coberto de verdade absorve o valor cheio", () => {
    const c = decidirCobertura({ ...BASE, assinatura: ILIMITADO });
    expect(c.valorCoberto).toBe(50);
  });

  it("a decisão é estável: mesma entrada, mesma saída", () => {
    const a = decidirCobertura({ ...BASE, assinatura: ILIMITADO, metodoInformado: "pix" });
    const b = decidirCobertura({ ...BASE, assinatura: ILIMITADO, metodoInformado: "pix" });
    expect(a).toEqual(b);
  });
});
