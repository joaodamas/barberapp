import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fechamentosPendentes, avaliarOperacao } from "@/lib/action-center";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * R1 — a porta da correção de pagamento, do lado do web.
 *
 * O servidor é testado em `functions/src/__tests__/`. O que só se prova aqui é
 * que **existe caminho de interface** para os dois casos, e que o caminho que
 * produzia o vazamento deixou de existir.
 *
 * ## Por que testes de FONTE
 *
 * Mesmo motivo de `concordancia.test.ts` e `densidade.test.ts`: o padrão de
 * projeto da casa é `environment: "node"`, sem testing-library — `.test.tsx`
 * sequer seria coletado. E o que precisa ser travado aqui é uma FORMA, não um
 * valor: "a tela não reabre o modal de conclusão sobre `completed`" é uma
 * afirmação sobre o código, e um teste de valor provaria só o caso que alguém
 * lembrou de escrever.
 */

const raiz = fileURLToPath(new URL("../../", import.meta.url));
const PAINEL = readFileSync(`${raiz}app/painel/(dashboard)/page.tsx`, "utf8");
const MODAL = readFileSync(`${raiz}components/corrigir-pagamento.tsx`, "utf8");
const ACTION_CENTER = readFileSync(`${raiz}lib/action-center.ts`, "utf8");
const FINANCEIRO = readFileSync(`${raiz}app/painel/(dashboard)/financeiro/page.tsx`, "utf8");
const BUSINESS_RULES = readFileSync(`${raiz}lib/business-rules.ts`, "utf8");
const DOMAIN = readFileSync(`${raiz}lib/domain.ts`, "utf8");

function reserva(over: Partial<BookingDoc> & { id: string }): Doc<BookingDoc> {
  return {
    clientId: "c1",
    clientName: "Joana",
    clientWhatsapp: "11999999999",
    date: "2026-08-18",
    time: "10:00",
    value: 50,
    serviceIds: ["corte"],
    staffId: "s1",
    status: "completed",
    paymentMethod: null,
    paymentOrigin: "in_person",
    ...over,
  } as unknown as Doc<BookingDoc>;
}

/* ================================================================== */
/* O card continua sendo o alerta do caso 1 — e aponta para a correção */
/* ================================================================== */

describe("R1 · o card crítico aponta para a porta de correção", () => {
  it("o atendimento concluído sem método continua levantando o alerta", () => {
    const itens = fechamentosPendentes([reserva({ id: "b1" })]);
    expect(itens).toHaveLength(1);
    expect(itens[0].actionLabel).toBe("Registrar pagamento");
    expect(itens[0].severity).toBe("critical");
  });

  it("🔒 mas a intenção dele NÃO é mais reabrir a conclusão", () => {
    /* Era aqui o vazamento: o card mandava reabrir o modal de conclusão, que
     * grava `bookings.paymentMethod` e mais nada. */
    const [item] = fechamentosPendentes([reserva({ id: "b1" })]);
    expect(item.intent).toEqual({ kind: "corrigirPagamento", bookingId: "b1" });
    expect(item.intent.kind).not.toBe("fecharAtendimento");
  });

  it("coberto pelo plano continua fora — não é pendência, é desfecho completo", () => {
    const coberto = reserva({
      id: "b2",
      cobertura: { tipo: "plano", subscriptionId: "a1", competencia: "2026-08" },
    } as Partial<BookingDoc> & { id: string });
    expect(fechamentosPendentes([coberto])).toHaveLength(0);
  });

  it("o atendimento COM método não levanta card — e é por isso que a linha precisa da porta", () => {
    /* O caso 2 é invisível ao produto: nenhuma tela o detecta. A ação na linha
     * do atendimento é o único acesso, e a §3.2 do briefing existe por isto. */
    expect(fechamentosPendentes([reserva({ id: "b3", paymentMethod: "pix" })])).toHaveLength(0);
  });

  it("🔒 `corrigirPagamento` é uma intenção declarada, não um `kind` solto", () => {
    /* Sem estar na união, um `kind` novo passaria como string qualquer e a tela
     * cairia no ramo errado sem erro de tipo. */
    expect(ACTION_CENTER).toContain('| { kind: "corrigirPagamento"; bookingId: string }');
  });

  it("🔒 o único avaliador que via `completed` deixou de emitir `fecharAtendimento`", () => {
    /* O corpo de `fechamentosPendentes` é o que apontava para a conclusão. */
    const avaliador = ACTION_CENTER.slice(
      ACTION_CENTER.indexOf("export function fechamentosPendentes"),
      ACTION_CENTER.indexOf("export function", ACTION_CENTER.indexOf("export function fechamentosPendentes") + 10)
    );
    expect(avaliador).toContain("corrigirPagamento");
    expect(avaliador).not.toContain('kind: "fecharAtendimento"');
  });

  it("nenhum avaliador declara `fecharAtendimento` sobre um concluído", () => {
    /* `desfechosEsquecidos` e `atendimentosAtrasados` filtram estados em aberto;
     * o único que via `completed` era o card de fechamento pendente. */
    const itens = avaliarOperacao({
      bookings: [reserva({ id: "b1" }), reserva({ id: "b3", paymentMethod: "pix" })],
      todasAsReservas: [reserva({ id: "b1" })],
      hoje: "2026-08-18",
      agora: new Date("2026-08-18T12:00:00"),
      toleranciaAtrasoMin: 10,
      services: [{ id: "corte", name: "Corte" }] as never,
      statusServicos: "pronto",
      fees: { dinheiro: 0, pix: 0, debito: 0, credito: 0 },
      payments: [],
      periodo: { inicio: "2026-08-01", fim: "2026-08-31" },
    } as never);

    const sobreConcluido = itens.filter(
      (i) => i.intent.kind === "fecharAtendimento" && i.intent.bookingId === "b1"
    );
    expect(sobreConcluido).toHaveLength(0);
  });
});

/* ================================================================== */
/* O elo que fecha o vazamento                                        */
/* ================================================================== */

describe("R1 · `executarIntencao` não reabre a conclusão sobre `completed`", () => {
  it("🔒 concluído vai para a correção, nunca para `setAFechar`", () => {
    /* O contrato, item 13. Reabrir `completed` é a mesma superfície por onde o
     * "Veio depois" opera, e as duas operações não podem compartilhar caminho. */
    const fn = PAINEL.slice(
      PAINEL.indexOf("function executarIntencao"),
      PAINEL.indexOf("return (", PAINEL.indexOf("function executarIntencao"))
    );
    expect(fn).toContain('alvo.status === "completed"');
    expect(fn).toContain("setACorrigir(alvo)");

    /* E a guarda vem ANTES da única chamada a `setAFechar`: se ela viesse
     * depois, existiria por decoração. */
    expect(fn.indexOf('alvo.status === "completed"')).toBeLessThan(
      fn.indexOf("setAFechar(alvo)")
    );
  });

  it("🔒 a intenção de correção tem caminho próprio", () => {
    const fn = PAINEL.slice(
      PAINEL.indexOf("function executarIntencao"),
      PAINEL.indexOf("return (", PAINEL.indexOf("function executarIntencao"))
    );
    expect(fn).toContain('intent.kind === "corrigirPagamento"');
  });

  it("🔒 a correção tem estado próprio, separado do fechamento", () => {
    expect(PAINEL).toContain("const [aCorrigir, setACorrigir]");
    /* Se `aCorrigir` fosse o mesmo `aFechar`, os dois modais abririam juntos. */
    expect(PAINEL).toContain("const [aFechar, setAFechar]");
  });
});

/* ================================================================== */
/* A porta na linha do atendimento                                    */
/* ================================================================== */

describe("R1 · a ação existe na linha do atendimento concluído", () => {
  it("🔒 há um botão 'Corrigir pagamento' para o concluído", () => {
    expect(PAINEL).toContain("Corrigir pagamento");
    expect(PAINEL).toContain('booking.status === "completed" && !liquidacao.coberto');
    expect(PAINEL).toContain("setACorrigir(booking)");
  });

  it("🔒 e o modal de correção é montado condicionalmente", () => {
    /* Montagem condicional é o que dá uma chave de idempotência nova por
     * abertura. Um modal sempre montado reaproveitaria a chave, e a segunda
     * correção cairia no caminho de retry do servidor. */
    expect(PAINEL).toContain("{aCorrigir && (");
    expect(PAINEL).toContain("<CorrigirPagamento");
  });

  it("não oferece a porta no coberto pelo plano — ali não existe pagamento", () => {
    expect(PAINEL).toContain("!liquidacao.coberto");
  });
});

/* ================================================================== */
/* O modal                                                            */
/* ================================================================== */

describe("R1 · o modal de correção", () => {
  it("🔒 chama a callable, e nunca escreve direto no banco", () => {
    /* §26 item 2: `audit_log` é imutável para o cliente. Ou a mudança nasce
     * numa callable, ou ela não é auditável — não existe terceira saída. */
    expect(MODAL).toContain('callFunction("corrigirPagamentoDeAtendimento"');
    expect(MODAL).not.toContain("patchDoc");
    expect(MODAL).not.toContain("setDoc");
    expect(MODAL).not.toContain("updateDoc");
  });

  it("🔒 manda chave de idempotência, criada na montagem", () => {
    expect(MODAL).toContain("idempotencyKey: chave");
    expect(MODAL).toContain("useState(chaveDeIdempotencia)");
  });

  it("🔒 diz que a taxa aplicada é a de HOJE", () => {
    /* R1.1 · a obrigação que veio junto com a decisão da taxa. Sem a frase, a
     * diferença aparece no DRE sem explicação. */
    expect(MODAL).toMatch(/taxa aplicada é a que está cadastrada hoje/i);
  });

  it("🔒 não oferece o método que já está registrado", () => {
    /* O servidor recusa corrigir para o mesmo meio; um botão que só existe para
     * dar erro é promessa falsa. */
    expect(MODAL).toContain("PAYMENT_METHODS.filter((m) => m !== params.metodoAtual)");
  });

  it("diz o que vai ser registrado antes de gravar", () => {
    expect(MODAL).toContain("O que vai ser registrado");
    expect(MODAL).toMatch(/quem corrigiu, quando, e o que mudou/i);
  });

  it("exige um segundo clique — não é o gesto repetido do dia", () => {
    expect(MODAL).toContain("Confirmar correção");
  });

  it("mostra a mensagem do servidor, não uma genérica por cima", () => {
    expect(MODAL).toContain("e instanceof Error ? e.message");
  });

  it("o caso 1 é dito com as palavras do que aconteceu", () => {
    /* "A pagar no salão" num atendimento que já terminou é uma cobrança que
     * ninguém vai fazer. */
    expect(MODAL).toContain('"Não informado"');
  });
});

/* ================================================================== */
/* T10 · a promessa de versionamento caiu nos três lugares            */
/* ================================================================== */

describe("R1.1 · o produto para de prometer taxa versionada", () => {
  it("🔒 a tela de Financeiro não diz 'versionadas'", () => {
    expect(FINANCEIRO).not.toContain("versionadas");
  });

  it("🔒 nem `business-rules.ts`, nem `domain.ts`, afirmam vigência", () => {
    /* Os três lugares do D-c. A menção que sobra em `business-rules.ts` é a
     * NEGAÇÃO explícita ("não são versionadas por vigência"), que é o oposto de
     * uma promessa. */
    expect(BUSINESS_RULES).not.toMatch(/vão\s+viver em `\/barbershops\/\{id\}` quando o gateway entrar, versionadas/);
    expect(DOMAIN).not.toContain("versionada por vigência (PRD §5)");
  });

  it("🔒 e nenhuma fonte de produção promete versionamento de taxa", () => {
    for (const [nome, fonte] of [
      ["financeiro/page.tsx", FINANCEIRO],
      ["domain.ts", DOMAIN],
    ] as const) {
      expect(fonte, nome).not.toMatch(/taxas são\s+versionadas/);
    }
  });

  it("a tela passa a dizer a MESMA coisa que o modal de conclusão", () => {
    /* O texto antigo contradizia o modal, que já dizia a verdade: "A taxa da
     * maquininha é registrada com o valor de hoje e não muda depois." */
    expect(FINANCEIRO).toMatch(/não muda depois/);
    expect(PAINEL).toMatch(/A taxa da maquininha é registrada com o valor de hoje/);
  });
});
