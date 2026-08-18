import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assinaturaAtivaDe,
  bookingStatusMeta,
  liquidacaoDoAtendimento,
  metaDoStatus,
  termosDoPlano,
} from "../booking-status";
import type { BookingDoc, SubscriberDoc } from "@/lib/domain";
import type { BookingStatus } from "@/lib/types";

/**
 * A tela de operação sob dado que ela não esperava — e o D2 do lado da tela.
 *
 * Dois defeitos verificados na interface em 18/08, os dois na tela **Hoje**:
 *
 * 1. Uma reserva com `status` fora da união derrubava a tela INTEIRA, com
 *    `Cannot read properties of undefined (reading 'tone')`. O boundary
 *    capturava; o dono perdia o dia de operação.
 * 2. O mensalista do plano Ilimitado concluía o corte e o produto perguntava
 *    "Como o cliente pagou? · R$ 50,00" — quatro meios de pagamento e nenhuma
 *    saída honesta.
 *
 * Os testes de fonte no fim do arquivo existem pela §19 do protocolo: a suíte
 * roda em `environment: "node"` e o projeto não monta componentes, e o
 * precedente do `plural.ts` — escrito, testado e ignorado por dois lugares
 * escritos depois dele — mostra que um módulo puro só vale pelo que o consome.
 */

const TONS_DO_PILL = ["gold", "success", "danger", "neutral"];

const bk = (over: Partial<BookingDoc> = {}): BookingDoc =>
  ({
    date: "2026-09-14",
    time: "10:00",
    status: "confirmed",
    value: 50,
    staffId: "leo",
    clientId: "marcos",
    serviceIds: ["corte"],
    paymentOrigin: "in_person",
    paymentMethod: null,
    ...over,
  }) as BookingDoc;

const assin = (over: Partial<SubscriberDoc> = {}): SubscriberDoc =>
  ({
    clientId: "marcos",
    name: "Marcos",
    planId: "ilimitado",
    planName: "Ilimitado",
    price: 149,
    status: "ativo",
    unlimited: true,
    ...over,
  }) as SubscriberDoc;

/* ================================================================== */
/* 1 · status desconhecido não derruba a tela                          */
/* ================================================================== */

describe("status desconhecido não derruba a tela Hoje", () => {
  it("reproduz o defeito: a leitura crua estoura ao ler `.tone`", () => {
    /* É o `page.tsx` de antes, linha por linha. Se este teste parar de estourar
     * é porque alguém tornou o mapa tolerante — e aí a guarda mudou de lugar,
     * não deixou de ser necessária. */
    const cru = bookingStatusMeta["importado_do_caderno" as BookingStatus];
    expect(cru).toBeUndefined();
    expect(() => (cru as { tone: string }).tone).toThrow(TypeError);
  });

  it("a leitura guardada devolve um tom legível em vez de estourar", () => {
    const meta = metaDoStatus("importado_do_caderno");
    expect(() => meta.tone).not.toThrow();
    expect(TONS_DO_PILL).toContain(meta.tone);
  });

  it("qualquer string devolve meta utilizável — nunca `undefined`", () => {
    const estranhos = [
      "importado_do_caderno",
      "COMPLETED",
      "em_atendimento",
      "status novo do servidor",
      "  ",
      "",
      "0",
      "null",
    ];
    for (const s of estranhos) {
      const meta = metaDoStatus(s);
      expect(typeof meta.label).toBe("string");
      expect(meta.label.length).toBeGreaterThan(0);
      expect(TONS_DO_PILL).toContain(meta.tone);
    }
  });

  it("valor ausente ou de outro tipo também é tratado", () => {
    /* `status` é uma string no Firestore, e o Firestore aceita o que gravarem.
     * Migração e escrita direta no banco produzem número, nulo e objeto. */
    for (const v of [null, undefined, 42, {}, [], true]) {
      const meta = metaDoStatus(v);
      expect(TONS_DO_PILL).toContain(meta.tone);
      expect(meta.label).toBe("Situação não reconhecida");
    }
  });

  it("chave herdada de Object.prototype não passa por status válido", () => {
    /* `bookingStatusMeta["constructor"]` devolve uma FUNÇÃO pelo protótipo —
     * verdadeira o bastante para passar por qualquer checagem de existência, e
     * sem `.tone`. Seria o mesmo defeito por uma porta que ninguém olha. */
    for (const chave of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const meta = metaDoStatus(chave);
      expect(TONS_DO_PILL).toContain(meta.tone);
      expect(meta.label).toContain("não reconhecida");
    }
  });

  it("o desconhecido é NEUTRO — não pinta de erro nem de sucesso", () => {
    /* O tom é semântico. `danger` afirmaria que a reserva deu errado e
     * `success` que está tudo certo; a única verdade é que o produto não sabe,
     * e neutro é o único tom que não inventa um fato. */
    expect(metaDoStatus("em_atendimento").tone).toBe("neutral");
  });

  it("o código cru vai no rótulo, para o dono ter o que reportar", () => {
    expect(metaDoStatus("em_atendimento").label).toBe(
      "Situação não reconhecida (em_atendimento)"
    );
  });

  it("código absurdamente longo não vira parágrafo dentro da célula", () => {
    const meta = metaDoStatus("x".repeat(500));
    expect(meta.label.length).toBeLessThan(60);
  });

  it("os nove status conhecidos continuam com o rótulo de sempre", () => {
    /* A guarda não pode ter mexido no que já funcionava. */
    for (const status of Object.keys(bookingStatusMeta) as BookingStatus[]) {
      expect(metaDoStatus(status)).toEqual(bookingStatusMeta[status]);
    }
    expect(Object.keys(bookingStatusMeta)).toHaveLength(9);
  });
});

/* ================================================================== */
/* 2 · D2 — como o atendimento foi liquidado                           */
/* ================================================================== */

const COBERTO = {
  tipo: "plano",
  subscriptionId: "assin-1",
  planId: "ilimitado",
  planName: "Ilimitado",
  competencia: "2026-09",
  valorCoberto: 50,
  usoNaCompetencia: 3,
  cota: null,
} as const;

describe("D2 · o atendimento coberto não pede cobrança na agenda", () => {
  it("coberto pelo plano diz que está coberto — e não 'A pagar no salão'", () => {
    /* O defeito exato: o servidor APAGA o pagamento do corte coberto, então
     * `paymentMethod` fica nulo, e a coluna caía no rótulo de reserva em
     * aberto. Um corte concluído e já pago pela mensalidade exibia "A pagar no
     * salão" — o produto mandando cobrar de novo. */
    const l = liquidacaoDoAtendimento(
      bk({ status: "completed", cobertura: COBERTO })
    );
    expect(l.label).toBe("Coberto pelo plano");
    expect(l.label).not.toContain("pagar");
    expect(l.coberto).toBe(true);
  });

  it("plano ilimitado mostra a posição no mês, sem teto inventado", () => {
    const l = liquidacaoDoAtendimento(bk({ status: "completed", cobertura: COBERTO }));
    expect(l.detalhe).toBe("Ilimitado · 3 atendimentos no mês");
  });

  it("plano com cota mostra 3 de 4 — o que o contrato pediu para a tela", () => {
    const l = liquidacaoDoAtendimento(
      bk({
        status: "completed",
        cobertura: { ...COBERTO, planName: "Mensal 4", cota: 4, usoNaCompetencia: 3 },
      })
    );
    expect(l.detalhe).toBe("Mensal 4 · 3 de 4 atendimentos do mês");
  });

  it("concorda no singular: 1 de 1 atendimento do mês", () => {
    const l = liquidacaoDoAtendimento(
      bk({
        status: "completed",
        cobertura: { ...COBERTO, planName: "Único", cota: 1, usoNaCompetencia: 1 },
      })
    );
    expect(l.detalhe).toBe("Único · 1 de 1 atendimento do mês");
  });

  it("avulso com motivo EXPLICA por que o plano não cobriu", () => {
    /* Sem isto, o mensalista que bateu a cota vê uma cobrança e conclui que o
     * produto errou — e o dono não tem o que responder. */
    const l = liquidacaoDoAtendimento(
      bk({
        status: "completed",
        paymentMethod: "pix",
        cobertura: { tipo: "avulso", motivo: "cota_esgotada", valorCoberto: 0 },
      })
    );
    expect(l.label).toBe("Pix");
    expect(l.detalhe).toBe("Fora do plano: a cota do mês já tinha acabado");
    expect(l.coberto).toBe(false);
  });

  it("'sem plano' não vira ruído em toda linha da agenda", () => {
    const l = liquidacaoDoAtendimento(
      bk({
        status: "completed",
        paymentMethod: "cash",
        cobertura: { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 },
      })
    );
    expect(l.label).toBe("Dinheiro");
    expect(l.detalhe).toBeNull();
  });

  it("motivo novo no servidor não quebra nem inventa explicação", () => {
    /* Mesma classe de defeito do status: enum do servidor que o web ainda não
     * conhece. Aqui ele degrada para "sem explicação", não para exceção. */
    const l = liquidacaoDoAtendimento(
      bk({
        status: "completed",
        paymentMethod: "pix",
        cobertura: {
          tipo: "avulso",
          motivo: "plano_suspenso_por_inadimplencia",
          valorCoberto: 0,
        } as unknown as BookingDoc["cobertura"],
      })
    );
    expect(l.label).toBe("Pix");
    expect(l.detalhe).toBeNull();
  });

  it("meio de pagamento desconhecido não derruba a linha", () => {
    const l = liquidacaoDoAtendimento(
      bk({ status: "completed", paymentMethod: "boleto" as never })
    );
    expect(l.label).toBe("Não informado");
  });

  it("concluído sem método e sem cobertura diz 'Não informado'", () => {
    /* É o caminho de exceção que o servidor já admite — taxa DESCONHECIDA, e
     * não zero. Dizer "A pagar no salão" num atendimento que já terminou é uma
     * cobrança que ninguém vai fazer. */
    const l = liquidacaoDoAtendimento(bk({ status: "completed" }));
    expect(l.label).toBe("Não informado");
  });

  it("reserva ainda em aberto continua dizendo o que dizia", () => {
    expect(liquidacaoDoAtendimento(bk({ status: "confirmed" })).label).toBe(
      "A pagar no salão"
    );
    expect(
      liquidacaoDoAtendimento(bk({ status: "confirmed", paymentOrigin: "online" })).label
    ).toBe("Aguardando pagamento");
    expect(liquidacaoDoAtendimento(bk({ paymentMethod: "credit" })).label).toBe("Crédito");
  });

  it("o histórico anterior ao campo continua legível — ausência é avulso", () => {
    const l = liquidacaoDoAtendimento(
      bk({ status: "completed", paymentMethod: "debit", cobertura: undefined })
    );
    expect(l.label).toBe("Débito");
    expect(l.detalhe).toBeNull();
    expect(l.coberto).toBe(false);
  });
});

/* ================================================================== */
/* 3 · a tela pergunta, o servidor decide                              */
/* ================================================================== */

describe("D2 · a assinatura é FATO lido, não decisão recalculada", () => {
  it("acha a assinatura ativa do cliente que está sendo fechado", () => {
    const a = assinaturaAtivaDe([assin()], "marcos");
    expect(a?.planName).toBe("Ilimitado");
  });

  it("assinatura de outro cliente não vale para este fechamento", () => {
    expect(assinaturaAtivaDe([assin({ clientId: "joao" })], "marcos")).toBeNull();
  });

  it("cancelada e suspensa não abrem a opção de concluir sem cobrar", () => {
    expect(assinaturaAtivaDe([assin({ status: "cancelado" })], "marcos")).toBeNull();
    expect(assinaturaAtivaDe([assin({ status: "suspenso" })], "marcos")).toBeNull();
  });

  it("cliente sem cadastro (reserva de balcão antiga) não quebra", () => {
    expect(assinaturaAtivaDe([assin()], null)).toBeNull();
    expect(assinaturaAtivaDe([assin()], undefined)).toBeNull();
    expect(assinaturaAtivaDe([], "marcos")).toBeNull();
  });

  it("responde 'tem plano', e NÃO 'este corte está coberto'", () => {
    /* A distinção é o ponto: `decidirCobertura` também olha competência e cota,
     * e vive no servidor. Aqui a assinatura ativa aparece mesmo quando a cota
     * do mês já acabou — porque a tela usa isto para escolher a PERGUNTA, e a
     * resposta continua sendo do servidor. Se um dia este teste precisar mudar,
     * é sinal de que a regra foi duplicada no web. */
    expect(assinaturaAtivaDe([assin({ unlimited: false, servicesIncluded: 0 })], "marcos"))
      .not.toBeNull();
  });
});

describe("D2 · os termos do plano são exibidos, não recalculados", () => {
  it("ilimitado", () => {
    expect(termosDoPlano(assin())).toBe("Atendimentos ilimitados");
  });

  it("com cota, concordando no plural e no singular", () => {
    expect(termosDoPlano(assin({ unlimited: false, servicesIncluded: 4 }))).toBe(
      "4 atendimentos por mês"
    );
    expect(termosDoPlano(assin({ unlimited: false, servicesIncluded: 1 }))).toBe(
      "1 atendimento por mês"
    );
  });

  it("assinatura anterior ao D2 vale como plano que não inclui atendimento", () => {
    /* É o comportamento que ela teve a vida inteira, e dizê-lo é melhor que
     * omitir: o dono precisa saber por que o plano não cobriu. */
    expect(termosDoPlano({ unlimited: undefined, servicesIncluded: undefined })).toBe(
      "Sem atendimento incluso"
    );
  });
});

/* ================================================================== */
/* 4 · o elo — a regra chega às telas                                  */
/* ================================================================== */

const fonte = (caminho: string) =>
  readFileSync(new URL(`../../app/${caminho}`, import.meta.url), "utf8");

/** Comentário que CITA uma chamada não faz a chamada. */
const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const HOJE = () => semComentarios(fonte("painel/(dashboard)/page.tsx"));
const AGENDAR = () => semComentarios(fonte("(cliente)/agendar/page.tsx"));

describe("a guarda chega à tela Hoje", () => {
  it("a tela não indexa mais o mapa cru — era a linha que a derrubava", () => {
    expect(HOJE()).not.toContain("bookingStatusMeta[");
    expect(HOJE()).toContain("metaDoStatus(");
  });

  it("a coluna de pagamento passa pela liquidação, e não pelo rótulo antigo", () => {
    expect(HOJE()).toContain("liquidacaoDoAtendimento(");
    expect(HOJE()).not.toContain("labelDoPagamento(");
  });
});

describe("o D2 chega às duas telas", () => {
  it("o fechamento consulta a assinatura do cliente", () => {
    const codigo = HOJE();
    expect(codigo).toContain("useSubscribers(");
    expect(codigo).toContain("assinaturaAtivaDe(");
  });

  it("o fechamento oferece concluir SEM meio de pagamento", () => {
    /* `concluirCom(null)` é a opção que não existia: era escolher um meio de
     * pagamento para dinheiro que não entrou, ou não concluir. */
    expect(HOJE()).toContain("concluirCom(null)");
  });

  it("os meios de pagamento CONTINUAM disponíveis para o mensalista", () => {
    /* O quinto corte de um plano de quatro é cobrança legítima, e o gatilho
     * financeiro só materializa na transição para `completed` — esconder as
     * opções tiraria a única chance de registrar o método. */
    expect(HOJE()).toContain("PAYMENT_METHODS.map");
  });

  it("a tela do cliente reconhece o mensalista antes de prometer o preço", () => {
    const codigo = AGENDAR();
    expect(codigo).toContain("useMinhasAssinaturas(");
    expect(codigo).toContain("minhaAssinatura");
  });
});

describe("a decisão de cobertura NÃO foi duplicada no web", () => {
  it("nenhuma tela do território grava `cobertura`", () => {
    /* O campo é escrito pelo servidor, na conclusão, e congelado como a
     * comissão. Uma tela que o gravasse recriaria o D1 — o web afirmando uma
     * coisa e o fato nascendo outra. */
    for (const codigo of [HOJE(), AGENDAR()]) {
      expect(codigo).not.toMatch(/cobertura\s*:/);
    }
  });

  it("o web não tem uma `decidirCobertura` própria", () => {
    const modulo = readFileSync(new URL("../booking-status.ts", import.meta.url), "utf8");
    expect(semComentarios(modulo)).not.toContain("decidirCobertura");
    /* Nem a contagem por competência, que é a metade da regra que exigiria
     * varrer as reservas do cliente e reproduzir o recorte do servidor. */
    expect(semComentarios(modulo)).not.toContain("competenciaDe");
  });
});
