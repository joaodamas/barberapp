import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { politicasDe } from "./politicas-financeiras";
import { exigirEdicao, vinculosDe } from "./acesso";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { SEM_TAXA, type PaymentFees, type PaymentMethod } from "./financial-events";
import {
  idDoAjusteDaCaixinha,
  idDoPagamento,
  somarLinhasDaCaixinha,
  valoresDoPagamento,
} from "./payments";
import { formasDoTenant, type FormaDePagamento } from "./formas-de-pagamento";
import { competenciaDe } from "./mensalistas";
import { metodoValido } from "./inventory";
import { DEFAULT_LOCALE, hojeNoFuso, localeDoDocumento } from "./locale";

/**
 * R1 — corrigir o pagamento de um atendimento concluído.
 *
 * ## O que esta função corrige, e o que ela NÃO é
 *
 * Não é "registrar pagamento esquecido". É corrigir um atendimento **já
 * concluído** cuja decisão de cobertura/pagamento resultou em estado financeiro
 * incorreto ou divergente. Dois casos, e a função não os distingue — ela troca
 * o método, qualquer que fosse o anterior:
 *
 * ```
 * caso 1 · VAZIO    o dono concluiu como "coberto pelo plano", o plano NÃO
 *                   cobriu, e o PaymentDoc nasceu com paymentMethod null e
 *                   taxa zero. O card crítico aponta para cá.
 * caso 2 · ERRADO   o dono marcou Pix e o cliente pagou em dinheiro. Nenhuma
 *                   tela detecta — a detecção fica fora do R1.
 * ```
 *
 * ## O vazamento que ela fecha
 *
 * O caminho antigo gravava **só** `bookings.paymentMethod`. O card sumia porque
 * `!b.paymentMethod` virava falso, e o `PaymentDoc` ficava nulo para sempre: a
 * agenda exibia "Pix" lendo a reserva enquanto o dinheiro, que sai de
 * `payments`, continuava sem método e com taxa zero.
 *
 * ## A duplicidade vira invariante
 *
 * `payments` é o **fato econômico** (seis leituras somam dinheiro dali);
 * `bookings.paymentMethod` é o **estado operacional** (seis leituras exibem, e
 * nenhuma soma). Os dois são atualizados na MESMA transação, com o `audit_log`
 * junto. Depois desta função, booking e payment nunca terminam divergentes —
 * de risco silencioso a propriedade verificada.
 *
 * ## Por que a taxa é a de HOJE
 *
 * R1.1: a tabela vigente no momento da correção, sem versionamento. A conta é
 * de `valoresDoPagamento` (`payments.ts`) e **não é reimplementada aqui** — três
 * cópias da mesma fórmula é o defeito mais encontrado nesta base
 * (`financial-events.ts:206-211`). A confirmação na tela diz que a taxa aplicada
 * é a de hoje.
 *
 * ## A dependência que esta função passa a ter — e que ela não controla
 *
 * `decidirEfeito("completed", "completed") === "nada"`
 * (`financial-events.ts:284`). Uma escrita em `bookings` acorda
 * `materializeFinancialsOnCompletion`, e se aquele invariante mudasse, o trigger
 * rematerializaria o pagamento por cima da correção — relendo policies e staff
 * de HOJE, com `set` sem merge (`financial-events.ts:513`). O botão que exerce
 * essa perna existe e se chama "Veio depois".
 *
 * O R1 **não conserta** esse caminho: ele testa e documenta o invariante do qual
 * depende (`correcao-de-pagamento.test.ts`, "o invariante do qual o R1 depende").
 *
 * ## O que fica de fora, por decisão
 *
 * - **Produto e mensalidade**: `inventory.ts:586` e `mensalistas.ts:543` exigem
 *   o método na origem — o caso 1 é impossível ali. Frente posterior.
 * - **Flag de "corrigido" no `PaymentDoc`**: o rastro é o `audit_log`, imutável
 *   e escrito pelo servidor (`allow write: if false`). O documento de pagamento
 *   continua com os campos que sempre teve.
 * - **Pagamento já estornado**: `refunds.ts:386` congelou o método antigo dentro
 *   do `RefundDoc`. Corrigir o pagamento faria o estorno apontar para um método
 *   que não existe mais no fato — e propagar para o estorno seria decidir, por
 *   conta própria, que o dinheiro voltou por um caminho que ninguém informou.
 *   **Recusa**, e a decisão está registrada como aberta.
 */

/* ================================================================== */
/* Decisões puras                                                     */
/* ================================================================== */

/**
 * Os quatro campos que a correção pode tocar — conjunto INDIVISÍVEL.
 *
 * Indivisível não é ênfase: esquecer `netAmount` deixa o Fluxo de Caixa e o
 * Caixa Diário com o líquido antigo enquanto o DRE já mostra a taxa nova, e as
 * duas telas passam a discordar sem que nenhuma esteja errada sozinha.
 *
 * Tudo o mais é histórico e fica parado: `origin`, `bookingId`, `movementId`,
 * `invoiceId`, `clientId`, `date`, `paymentOrigin`, `grossAmount`, `createdAt`,
 * `registradoPor`.
 */
export const CAMPOS_CORRIGIVEIS = [
  "paymentMethod",
  /* A forma entrou na lista com as formas de pagamento, e por necessidade: se
   * o método fosse corrigido de crédito para débito e a forma continuasse
   * "Crédito aproximação", o extrato passaria a exibir uma frase que contradiz
   * o próprio documento — e a taxa nova não teria como ser explicada. */
  "paymentFormId",
  "paymentFormLabel",
  "feePct",
  "feeAmount",
  "netAmount",
] as const;

export type CamposDaCorrecao = {
  paymentMethod: PaymentMethod;
  paymentFormId: string | null;
  paymentFormLabel: string | null;
  feePct: number;
  feeAmount: number;
  netAmount: number;
};

/**
 * Os quatro valores novos, derivados da tabela de taxas de HOJE.
 *
 * Delega a `valoresDoPagamento` e devolve **apenas** os quatro: a função de
 * origem também calcula `grossAmount`, e deixá-lo passar para o `update` faria
 * a correção reescrever um campo congelado com o valor "certo" — que é
 * exatamente o tipo de escrita que ninguém revisa até divergir.
 */
export function camposDaCorrecao(params: {
  bruto: number;
  metodo: PaymentMethod;
  fees: PaymentFees;
  formas?: FormaDePagamento[];
  formaId?: string | null;
}): CamposDaCorrecao {
  const v = valoresDoPagamento({
    bruto: params.bruto,
    metodo: params.metodo,
    fees: params.fees,
    formas: params.formas,
    formaId: params.formaId,
  });
  return {
    paymentMethod: params.metodo,
    paymentFormId: v.paymentFormId,
    paymentFormLabel: v.paymentFormLabel,
    feePct: v.feePct,
    feeAmount: v.feeAmount,
    netAmount: v.netAmount,
  };
}

/**
 * A janela: mês corrente pelo `date` do pagamento — R1.2.
 *
 * `date` é a data do FATO, e a correção não a altera: nada atravessa mês. A
 * comparação usa `competenciaDe` (`YYYY-MM-DD` → `YYYY-MM`), a mesma do módulo
 * de mensalistas — ela não carrega semântica de mensalista, só recorta o mês.
 *
 * ⚠️ `hoje` precisa vir de `hojeNoFuso(timeZone da barbearia)`, nunca de
 * `new Date()` no processo: a function roda em UTC, e 31/07 23:50 em São Paulo
 * já é 01/08 em UTC. Uma correção legítima do último dia do mês seria recusada
 * por três horas de diferença — e a recusa não deixaria rastro nenhum.
 *
 * **Não existe fechamento de mês no produto.** A janela é o mês corrente, e o
 * fechamento explícito está registrado como frente futura.
 */
export function dentroDaJanela(dataDoPagamento: string, hoje: string, criadoEm?: string | null): boolean {
  const mesDeHoje = competenciaDe(String(hoje));
  if (competenciaDe(String(dataDoPagamento)) === mesDeHoje) return true;
  /* O atendimento de 30/09 fechado no dia 1º: o fato é de setembro, mas o
   * pagamento nasceu em outubro, e o dono precisa conseguir corrigir o erro de
   * quem acabou de fechar. A exceção é ESTREITA: só o mês imediatamente
   * anterior ao da criação — fechar em outubro um atendimento de julho não
   * reabre julho. */
  return (
    !!criadoEm &&
    competenciaDe(criadoEm) === mesDeHoje &&
    competenciaDe(String(dataDoPagamento)) === mesAnteriorDe(competenciaDe(criadoEm))
  );
}

/** `2026-10` → `2026-09`; `2026-01` → `2025-12`. */
export function mesAnteriorDe(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  if (!a || !m) return "";
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** `2026-10-01` → `2026-09-30`. */
export function diaAnteriorDe(data: string): string {
  const d = new Date(`${data}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** O dia (`YYYY-MM-DD`) em que o documento foi criado, no fuso da barbearia. */
export function diaDeCriacao(createdAt: unknown, timeZone: string): string | null {
  const c = createdAt as { toDate?: () => Date } | null | undefined;
  const d = typeof c?.toDate === "function" ? c.toDate() : null;
  return d && !Number.isNaN(d.getTime()) ? hojeNoFuso(timeZone, d) : null;
}

/** Por que uma correção não pode acontecer. `null` = pode. */
export type MotivoDaRecusa =
  | "sem_pagamento"
  | "nao_e_servico"
  | "ja_estornado"
  | "reserva_ausente"
  | "nao_concluido"
  | "fora_da_janela"
  | "mesmo_metodo";

/**
 * Toda a régua de recusa, pura — separada da transação de propósito.
 *
 * Dentro do `runTransaction` estas condições só seriam verificáveis com
 * emulador. Aqui cada uma é um caso de teste de mesa, e a transação vira o que
 * ela deve ser: leituras, esta decisão, escritas.
 *
 * A ORDEM importa e é deliberada — cada recusa vira uma frase na tela, e a
 * primeira que se aplica é a que explica melhor o que aconteceu. "Já estornado"
 * antes de "fora da janela" porque o estorno é o fato mais forte: mudar o mês
 * não o resolveria.
 */
export function motivoDaRecusa(params: {
  temPagamento: boolean;
  /** `PaymentDoc.origin`. Ausente nos pagamentos anteriores a G1.6. */
  origemDoPagamento: string | null | undefined;
  jaEstornado: boolean;
  temReserva: boolean;
  statusDaReserva: string | null | undefined;
  dataDoPagamento: string;
  /** O dia em que o pagamento foi criado (fuso da barbearia), se conhecido. */
  criadoEm?: string | null;
  hoje: string;
  metodoAtual: PaymentMethod | null;
  metodoNovo: PaymentMethod;
}): MotivoDaRecusa | null {
  /* Coberto pelo plano não tem pagamento, e criar um aqui seria inventar fato
   * novo — o que R1.3 proíbe. A mensalidade já é a receita daquele corte. */
  if (!params.temPagamento) return "sem_pagamento";

  /* `undefined` é pagamento de serviço anterior ao G1.6, quando o campo ainda
   * não era gravado nesta origem. Recusar por ausência excluiria justamente o
   * histórico mais antigo, que é o que mais precisa de correção. */
  if (params.origemDoPagamento != null && params.origemDoPagamento !== "servico") {
    return "nao_e_servico";
  }

  if (params.jaEstornado) return "ja_estornado";
  if (!params.temReserva) return "reserva_ausente";

  /* A correção é sobre atendimento CONCLUÍDO. Numa reserva em aberto o método
   * ainda vai ser perguntado na conclusão, e o pagamento sequer existe; numa
   * revertida o trigger já apagou o pagamento. */
  if (params.statusDaReserva !== "completed") return "nao_concluido";

  if (!dentroDaJanela(params.dataDoPagamento, params.hoje, params.criadoEm)) return "fora_da_janela";

  /* Sem isso o `audit_log` registraria uma correção que não corrigiu nada, e o
   * histórico passaria a ter eventos que não distinguem "o dono conferiu" de
   * "o dono mudou". Cobre o cenário 4 da matriz: Pix → Pix não tem efeito. */
  if (params.metodoAtual === params.metodoNovo) return "mesmo_metodo";

  return null;
}

/** A frase que o dono lê, por motivo. */
export const FRASE_DA_RECUSA: Record<MotivoDaRecusa, string> = {
  sem_pagamento:
    "Esse atendimento não tem pagamento registrado — a mensalidade já cobriu. Não há valor a corrigir.",
  nao_e_servico: "Por enquanto só o pagamento de atendimento pode ser corrigido.",
  ja_estornado:
    "Esse pagamento já teve devolução registrada, e o estorno guardou o meio de pagamento antigo. Corrigir aqui deixaria os dois em desacordo.",
  reserva_ausente: "Esse atendimento não está mais registrado.",
  nao_concluido: "Só atendimento concluído tem pagamento a corrigir.",
  fora_da_janela:
    "Esse pagamento é de outro mês. A correção vale para o mês corrente.",
  mesmo_metodo: "Esse já é o meio de pagamento registrado — não há o que corrigir.",
};

/** O código HTTP de cada recusa, para a tela distinguir o que é erro do que é regra. */
const CODIGO_DA_RECUSA: Record<MotivoDaRecusa, "not-found" | "failed-precondition"> = {
  sem_pagamento: "failed-precondition",
  nao_e_servico: "failed-precondition",
  ja_estornado: "failed-precondition",
  reserva_ausente: "not-found",
  nao_concluido: "failed-precondition",
  fora_da_janela: "failed-precondition",
  mesmo_metodo: "failed-precondition",
};

/**
 * O id do evento de auditoria, DERIVADO — nunca `.doc()` automático.
 *
 * É o único ponto do R1 que duplica. A varredura de triggers confirmou que não
 * existe nenhum sobre `payments` (só três, todos sobre `bookings`), e nenhum
 * agregado é pré-computado: atualizar o pagamento não acorda ninguém e não
 * soma dinheiro duas vezes. O `audit_log`, esse sim, ganharia uma linha por
 * retry se o id fosse sorteado.
 *
 * Mesma família de `idDoPagamento` e `idDoEstorno`: idempotência por
 * construção, não por checagem — que teria corrida entre a leitura e a escrita.
 */
export function idDaCorrecao(bookingId: string, chave: string): string {
  return `correcao_${bookingId}_${chave}`;
}

/* ================================================================== */
/* A transação                                                        */
/* ================================================================== */

/**
 * O estado ANTERIOR do pagamento, como o `audit_log` o guarda.
 *
 * Comum à correção de atendimento e à de venda de produto: o mesmo documento
 * (`PaymentDoc`), a mesma leitura.
 */
export function estadoDoPagamento(
  pagamentoSnap: FirebaseFirestore.DocumentSnapshot
): Omit<CamposDaCorrecao, "paymentMethod"> & { paymentMethod: PaymentMethod | null } {
  return {
    paymentMethod: (pagamentoSnap.get("paymentMethod") ?? null) as PaymentMethod | null,
    /* Nulos nos pagamentos anteriores às formas — e o `audit_log` precisa
     * registrar isso como o que é: não havia forma, não que ela era vazia. */
    paymentFormId: (pagamentoSnap.get("paymentFormId") ?? null) as string | null,
    paymentFormLabel: (pagamentoSnap.get("paymentFormLabel") ?? null) as string | null,
    feePct: Number(pagamentoSnap.get("feePct")) || 0,
    feeAmount: Number(pagamentoSnap.get("feeAmount")) || 0,
    netAmount: Number(pagamentoSnap.get("netAmount")) || 0,
  };
}

export type ResultadoDaCorrecao = {
  paymentId: string;
  bookingId: string;
  /* O estado ANTERIOR. Mesmo formato do novo, com o método podendo ser nulo:
   * é exatamente o caso que a porta existe para corrigir — o atendimento
   * concluído sem informar como o cliente pagou. */
  de: Omit<CamposDaCorrecao, "paymentMethod"> & { paymentMethod: PaymentMethod | null };
  para: CamposDaCorrecao;
  /** `true` quando a mesma chave já tinha sido gravada — retry, não correção nova. */
  repetida: boolean;
};

/**
 * Pagamento, reserva e auditoria numa transação só.
 *
 * Exportada separada da callable porque é ela que o teste de emulador exerce —
 * a MESMA transação que roda em produção, não uma cópia da sequência.
 *
 * ## `update`, nunca `set`, nunca `delete` + `create`
 *
 * `set` sem `{ merge: true }` reescreve o documento inteiro e apagaria
 * `createdAt`, `origin` e `paymentOrigin` em silêncio — é literalmente o que a
 * rematerialização faz em `financial-events.ts:513`, e é de onde vem o risco do
 * cenário 6. `delete` + `create` perderia o `createdAt` e trocaria a identidade
 * do fato. A correção **altera quatro campos** de um documento que continua
 * sendo o mesmo.
 */
export async function gravarCorrecao(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  bookingId: string;
  metodo: PaymentMethod;
  /** A tabela vigente HOJE — R1.1, sem versionamento. */
  fees: PaymentFees;
  /** As formas vigentes hoje, pela mesma regra do R1.1. */
  formas?: FormaDePagamento[];
  /** A forma escolhida na correção. */
  formaId?: string | null;
  /** Hoje no fuso DA BARBEARIA. Define a janela do mês corrente. */
  hoje: string;
  /** Fuso da barbearia, para o dia em que o pagamento foi criado. */
  fuso?: string;
  chave: string;
  /** Quem corrigiu. Vai para o `audit_log`, nunca para o `PaymentDoc`. */
  autor: string | null;
}): Promise<ResultadoDaCorrecao> {
  const { db, shopRef, bookingId } = params;

  const paymentId = idDoPagamento({ origem: "servico", bookingId });
  const pagamentoRef = shopRef.collection("payments").doc(paymentId);
  const reservaRef = shopRef.collection("bookings").doc(bookingId);
  const logRef = shopRef.collection("audit_log").doc(idDaCorrecao(bookingId, params.chave));
  const estornosQuery = shopRef.collection("refunds").where("paymentId", "==", paymentId);

  return db.runTransaction(async (tx) => {
    /* ================= LEITURAS =================
     *
     * TODAS antes de qualquer escrita: o Firestore recusa uma leitura posterior
     * a uma escrita na mesma transação, e o erro só aparece em runtime. */
    const [pagamentoSnap, reservaSnap, logSnap, estornosSnap] = await Promise.all([
      tx.get(pagamentoRef),
      tx.get(reservaRef),
      tx.get(logRef),
      tx.get(estornosQuery),
    ]);

    /* Idempotência: a mesma chave não corrige duas vezes.
     *
     * Vem ANTES de qualquer recusa, e a ordem é o ponto. Depois da primeira
     * correção o pagamento já está no método novo — um retry cairia em
     * `mesmo_metodo` e a tela mostraria erro sobre uma correção que deu certo.
     * Precedente literal de `refunds.ts:362-373`: um retry precisa ser
     * indistinguível de sucesso. */
    if (logSnap.exists) {
      const detail = (logSnap.get("detail") ?? {}) as {
        de?: ResultadoDaCorrecao["de"];
        para?: CamposDaCorrecao;
      };
      return {
        paymentId,
        bookingId,
        de:
          detail.de ?? {
            paymentMethod: null,
            paymentFormId: null,
            paymentFormLabel: null,
            feePct: 0,
            feeAmount: 0,
            netAmount: 0,
          },
        para:
          detail.para ??
          camposDaCorrecao({
            bruto: Number(pagamentoSnap.get("grossAmount")) || 0,
            metodo: params.metodo,
            fees: params.fees,
            formas: params.formas,
            formaId: params.formaId,
          }),
        repetida: true,
      };
    }

    const motivo = motivoDaRecusa({
      temPagamento: pagamentoSnap.exists,
      origemDoPagamento: pagamentoSnap.get("origin") as string | null | undefined,
      jaEstornado: !estornosSnap.empty,
      temReserva: reservaSnap.exists,
      statusDaReserva: reservaSnap.get("status") as string | null | undefined,
      dataDoPagamento: String(pagamentoSnap.get("date") ?? ""),
      criadoEm: diaDeCriacao(pagamentoSnap.get("createdAt"), params.fuso ?? DEFAULT_LOCALE.timeZone),
      hoje: params.hoje,
      metodoAtual: (pagamentoSnap.get("paymentMethod") ?? null) as PaymentMethod | null,
      metodoNovo: params.metodo,
    });

    if (motivo) throw new HttpsError(CODIGO_DA_RECUSA[motivo], FRASE_DA_RECUSA[motivo]);

    /* O bruto sai do PAGAMENTO, não de `booking.value`.
     *
     * `grossAmount` é o valor congelado no momento da conclusão; o preço do
     * serviço pode ter mudado desde então, e recalcular a taxa sobre o preço de
     * hoje faria a correção do meio de pagamento alterar, de lado, o valor
     * recebido. */
    const bruto = Number(pagamentoSnap.get("grossAmount")) || 0;

    const de = estadoDoPagamento(pagamentoSnap);

    const para = camposDaCorrecao({
      bruto,
      metodo: params.metodo,
      fees: params.fees,
      formas: params.formas,
      formaId: params.formaId,
    });

    /* A CAIXINHA vai pelo mesmo meio do atendimento (regra do dono: não tem
     * seletor próprio), então corrigir o meio corrige o dela também. Lida aqui,
     * ainda antes de qualquer escrita. */
    const caixinha = await lerCaixinhaDaReserva(tx, shopRef, bookingId);

    /* ================= ESCRITAS ================= */

    /* O fato econômico. Exatamente os quatro campos — o objeto é `para`, e não
     * um espalhamento de `valoresDoPagamento`, justamente para que a lista de
     * chaves gravadas seja a lista declarada em `CAMPOS_CORRIGIVEIS`. */
    tx.update(pagamentoRef, para);

    const correcaoDaCaixinha = gravarMeioDaCaixinha(tx, shopRef, caixinha, {
      bookingId,
      metodo: params.metodo,
      fees: params.fees,
      formas: params.formas,
      formaId: params.formaId,
      idDoAjuste: idDoAjusteDaCaixinha(bookingId, params.chave),
      dataSemLinha: String(pagamentoSnap.get("date") ?? ""),
    });

    /* O estado operacional, na MESMA transação. Corrigir só o pagamento
     * deixaria o card crítico na tela para sempre e a agenda exibindo o método
     * antigo; corrigir só a reserva é o vazamento de hoje. */
    tx.update(reservaRef, {
      paymentMethod: params.metodo,
      paymentFormId: para.paymentFormId,
      paymentFormLabel: para.paymentFormLabel,
    });

    /* O rastro — §26. Dentro da transação, e não com `.add()` depois: um log
     * que pode falhar sozinho registra um mundo que não aconteceu.
     *
     * O `PaymentDoc` NÃO ganha marca de "corrigido": o histórico mora aqui,
     * onde é imutável até para o dono (`firestore.rules:344`). */
    tx.set(logRef, {
      action: "payment.corrigido",
      by: params.autor,
      at: FieldValue.serverTimestamp(),
      detail: {
        bookingId,
        paymentId,
        de,
        para,
        ...(correcaoDaCaixinha ? { caixinha: correcaoDaCaixinha } : {}),
      },
    });

    return { paymentId, bookingId, de, para, repetida: false };
  });
}

/* ================================================================== */
/* A caixinha acompanha o meio do atendimento                         */
/* ================================================================== */

/**
 * O que existe de caixinha nesta reserva — lido antes de qualquer escrita.
 *
 * Por reserva, e não pelo id do ciclo: a edição de cobrança troca a comissão
 * vigente do serviço sem tocar na gorjeta, e o ajuste de taxa soma linhas.
 */
export async function lerCaixinhaDaReserva(
  tx: FirebaseFirestore.Transaction,
  shopRef: FirebaseFirestore.DocumentReference,
  bookingId: string
) {
  const pagamentoRef = shopRef.collection("payments").doc(idDoPagamento({ origem: "caixinha", bookingId }));
  const [pagamentoSnap, linhasSnap] = await Promise.all([
    tx.get(pagamentoRef),
    tx.get(
      shopRef
        .collection("commissions")
        .where("bookingId", "==", bookingId)
        .where("origin", "==", "caixinha")
    ),
  ]);
  return {
    pagamentoRef,
    pagamentoSnap,
    doBarbeiro: somarLinhasDaCaixinha(linhasSnap.docs.map((d) => d.data())),
    data: linhasSnap.docs[0]?.get("date") as string | undefined,
  };
}

/**
 * Leva a caixinha para o meio novo — a mesma porta para a CORREÇÃO do meio e
 * para a EDIÇÃO de cobrança que troca o meio. Antes só a correção acompanhava,
 * e a edição deixava a gorjeta no Pix com o atendimento já no crédito: duas
 * versões do mesmo pagamento, e o barbeiro sem a taxa que é dele.
 *
 * A taxa da caixinha é do BARBEIRO: se o líquido mudou, o que ele recebe mudou
 * junto. A comissão original não é reescrita (histórico financeiro se corrige
 * somando): entra uma linha de AJUSTE com o delta, de id derivado da operação —
 * o retry regrava a mesma linha. Pix → crédito a 3% sobre R$ 10,00 gera
 * −R$ 0,30. Sem caixinha, não faz nada e devolve `null`.
 */
export function gravarMeioDaCaixinha(
  tx: FirebaseFirestore.Transaction,
  shopRef: FirebaseFirestore.DocumentReference,
  caixinha: Awaited<ReturnType<typeof lerCaixinhaDaReserva>>,
  params: {
    bookingId: string;
    metodo: PaymentMethod;
    fees: PaymentFees;
    formas?: FormaDePagamento[];
    formaId?: string | null;
    idDoAjuste: string;
    dataSemLinha: string;
  }
): { de: ReturnType<typeof estadoDoPagamento>; para: CamposDaCorrecao } | null {
  if (!caixinha.pagamentoSnap.exists) return null;
  const de = estadoDoPagamento(caixinha.pagamentoSnap);
  const para = camposDaCorrecao({
    bruto: Number(caixinha.pagamentoSnap.get("grossAmount")) || 0,
    metodo: params.metodo,
    fees: params.fees,
    formas: params.formas,
    formaId: params.formaId,
  });
  tx.update(caixinha.pagamentoRef, para);

  const delta = Math.round((para.netAmount - de.netAmount) * 100) / 100;
  if (delta !== 0 && caixinha.doBarbeiro) {
    tx.set(shopRef.collection("commissions").doc(params.idDoAjuste), {
      origin: "caixinha",
      bookingId: params.bookingId,
      staffId: caixinha.doBarbeiro.staffId,
      uid: caixinha.doBarbeiro.uid,
      staffName: caixinha.doBarbeiro.staffName,
      date: caixinha.data ?? params.dataSemLinha,
      commissionPct: 100,
      /* A caixinha em si não mudou; só a taxa. */
      commissionBase: 0,
      feeAmount: Math.round((para.feeAmount - de.feeAmount) * 100) / 100,
      commissionAmount: delta,
      ajuste: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { de, para };
}

/* ================================================================== */
/* A porta de entrada                                                 */
/* ================================================================== */

type CorrecaoInput = {
  barbershopId: string;
  bookingId: string;
  paymentMethod: PaymentMethod;
  /** A forma exata, quando a barbearia cadastrou as dela. */
  paymentFormId?: string | null;
  idempotencyKey?: string;
};

/**
 * O dono corrige como um atendimento concluído foi pago.
 *
 * **Só o DONO.** Não porque o staff não deveria ter essa capacidade para
 * sempre, mas porque isto mexe em fato financeiro já materializado e o primeiro
 * piloto vai com o controle mais conservador. O argumento a favor do balcão —
 * quem está lá é quem percebe o erro — está reconhecido e registrado: a saída
 * futura é uma permissão específica `corrigir_pagamento`, sem acesso
 * administrativo completo.
 *
 * Precedente que a decisão segue: `registrarEstorno` é dono-only
 * (`refunds.ts:593`).
 */
export const corrigirPagamentoDeAtendimento = onCall<CorrecaoInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const data = request.data ?? ({} as CorrecaoInput);
  const { barbershopId } = data;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  /* A guarda de vínculo. As regras do Firestore protegem o DADO e o Admin SDK
   * as ignora: sem esta leitura do claim, o dono da Alfa corrigiria o pagamento
   * da Beta com um token perfeitamente válido. */
  const papel = vinculosDe(request)?.[
    barbershopId
  ];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono corrige pagamento.");
  }
  await exigirEdicao(barbershopId);

  const bookingId = String(data.bookingId ?? "");
  if (!bookingId) throw new HttpsError("invalid-argument", "Atendimento não informado.");

  /* A validação do método é a MESMA de venda e mensalidade (`inventory.ts:93`).
   * `null` não passa de propósito: correção é dizer COMO o cliente pagou, e
   * "não sei" já é o estado de onde ela parte. */
  if (!metodoValido(data.paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o cliente pagou.");
  }

  const { db, shopRef, fees, formas, hoje, fuso, chave } = await contextoDaCorrecao(
    barbershopId,
    data.idempotencyKey
  );

  return gravarCorrecao({
    db,
    shopRef,
    bookingId,
    metodo: data.paymentMethod,
    fees,
    formas,
    formaId: data.paymentFormId ? String(data.paymentFormId) : null,
    hoje,
    fuso,
    chave,
    autor: uid,
  });
});

/* ================================================================== */
/* A mesma correção, para a VENDA de produto                          */
/* ================================================================== */

/*
 * "Pix → Cartão" numa venda da Loja. Antes só o atendimento tinha porta
 * (`gravarCorrecao`), e `payments` de produto ficava com o meio errado e a taxa
 * errada para sempre — o dono só tinha como devolver e vender de novo.
 *
 * Reaproveita tudo o que é comum: `camposDaCorrecao` (a conta da taxa, sem
 * cópia), `dentroDaJanela` (o mesmo mês corrente), `idDaCorrecao` (o id derivado
 * do log) e `estadoDoPagamento` (o "de"). O que muda é o "operacional": no
 * atendimento é a reserva, aqui é o movimento de venda, que também guarda o
 * `paymentMethod` (o caixa diário o lê).
 *
 * Comissão e CMV não mudam: nascem do preço e do custo, nunca da forma de
 * pagamento. A taxa nova é a de HOJE, congelada — a mesma decisão R1.1.
 */

export type MotivoDaRecusaDaVenda =
  | "venda_ausente"
  | "nao_e_venda"
  | "sem_pagamento"
  | "ja_devolvida"
  | "fora_da_janela"
  | "mesma_forma";

export const FRASE_DA_RECUSA_DA_VENDA: Record<MotivoDaRecusaDaVenda, string> = {
  venda_ausente: "Essa venda não está mais registrada.",
  nao_e_venda: "Esse movimento não é uma venda.",
  sem_pagamento:
    "Essa venda é anterior ao registro de pagamentos e não tem pagamento para corrigir.",
  ja_devolvida:
    "Essa venda já teve devolução registrada, e a devolução guardou a forma de pagamento antiga. Corrigir aqui deixaria os dois em desacordo.",
  fora_da_janela: "Essa venda é de outro mês. A correção vale para o mês corrente.",
  mesma_forma: "Essa já é a forma de pagamento registrada — não há o que corrigir.",
};

const CODIGO_DA_RECUSA_DA_VENDA: Record<MotivoDaRecusaDaVenda, "not-found" | "failed-precondition"> = {
  venda_ausente: "not-found",
  nao_e_venda: "failed-precondition",
  sem_pagamento: "failed-precondition",
  ja_devolvida: "failed-precondition",
  fora_da_janela: "failed-precondition",
  mesma_forma: "failed-precondition",
};

/**
 * A régua de recusa da venda, pura e na ordem em que cada frase explica melhor.
 *
 * "Já devolvida" vale para devolução TOTAL ou PARCIAL: o estorno congela o meio
 * antigo (`documentoDeEstorno`), e corrigir o pagamento deixaria o estorno
 * apontando para um meio que não existe mais no fato.
 */
export function motivoDaRecusaDaVenda(params: {
  temMovimento: boolean;
  tipoDoMovimento: string | null | undefined;
  temPagamento: boolean;
  origemDoPagamento: string | null | undefined;
  jaDevolvida: boolean;
  dataDoPagamento: string;
  criadoEm?: string | null;
  hoje: string;
  metodoAtual: PaymentMethod | null;
  formaAtual: string | null;
  metodoNovo: PaymentMethod;
  /** A forma escolhida; nula = "a primeira ativa do meio", como na venda. */
  formaNova: string | null;
}): MotivoDaRecusaDaVenda | null {
  if (!params.temMovimento) return "venda_ausente";
  if (params.tipoDoMovimento !== "venda") return "nao_e_venda";
  if (!params.temPagamento) return "sem_pagamento";
  if (params.origemDoPagamento != null && params.origemDoPagamento !== "produto") return "nao_e_venda";
  if (params.jaDevolvida) return "ja_devolvida";
  if (!dentroDaJanela(params.dataDoPagamento, params.hoje, params.criadoEm)) return "fora_da_janela";

  /* Mesmo meio E mesma forma: crédito à vista → crédito parcelado é meio igual
   * e taxa diferente, e é uma correção legítima. */
  const mesmoMeio = params.metodoAtual === params.metodoNovo;
  const mesmaForma = params.formaNova === null || params.formaNova === params.formaAtual;
  if (mesmoMeio && mesmaForma) return "mesma_forma";

  return null;
}

type LinhaCorrigida = {
  paymentId: string;
  movementId: string;
  de: ResultadoDaCorrecao["de"];
  para: CamposDaCorrecao;
};

export type ResultadoDaCorrecaoDaVenda = LinhaCorrigida & {
  repetida: boolean;
  /** Todas as linhas corrigidas (venda com vários produtos). A primeira repete os campos acima. */
  itens: LinhaCorrigida[];
};

/**
 * Pagamento, movimento e auditoria numa transação só. `update`, nunca `set`: o
 * pagamento continua sendo o mesmo documento, com os mesmos `createdAt`, `origin`
 * e `grossAmount`.
 *
 * Uma venda de vários produtos tem um movimento (e um pagamento) por linha.
 * Corrigir a forma é corrigir o carrinho inteiro: `movementIds` leva todas as
 * linhas e a transação é UMA — ou todas mudam, ou nenhuma.
 */
export async function gravarCorrecaoDeVenda(params: {
  db: FirebaseFirestore.Firestore;
  shopRef: FirebaseFirestore.DocumentReference;
  movementIds: string[];
  metodo: PaymentMethod;
  fees: PaymentFees;
  formas?: FormaDePagamento[];
  formaId?: string | null;
  hoje: string;
  fuso?: string;
  chave: string;
  autor: string | null;
}): Promise<ResultadoDaCorrecaoDaVenda> {
  const { db, shopRef } = params;
  const ids = [...new Set(params.movementIds)];
  if (ids.length === 0) throw new HttpsError("invalid-argument", "Venda não informada.");
  if (ids.length > 20) throw new HttpsError("invalid-argument", "Venda com itens demais.");

  const linhas = ids.map((movementId) => {
    const paymentId = idDoPagamento({ origem: "produto", movementId });
    return {
      movementId,
      paymentId,
      pagamentoRef: shopRef.collection("payments").doc(paymentId),
      movimentoRef: shopRef.collection("inventory_movements").doc(movementId),
      logRef: shopRef.collection("audit_log").doc(idDaCorrecao(movementId, params.chave)),
      devolucoesQuery: shopRef.collection("refunds").where("paymentId", "==", paymentId),
    };
  });

  return db.runTransaction(async (tx) => {
    /* ================= LEITURAS — todas antes de qualquer escrita ================= */
    const lidas = await Promise.all(
      linhas.map(async (l) => {
        const { pagamentoRef, movimentoRef, logRef, devolucoesQuery } = l;
        const [pagamentoSnap, movimentoSnap, logSnap, devolucoesSnap] = await Promise.all([
          tx.get(pagamentoRef),
          tx.get(movimentoRef),
          tx.get(logRef),
          tx.get(devolucoesQuery),
        ]);
        return { ...l, pagamentoSnap, movimentoSnap, logSnap, devolucoesSnap };
      })
    );

    /* Idempotência ANTES de qualquer recusa: depois da primeira correção o
     * pagamento já está na forma nova, e um retry cairia em `mesma_forma`. */
    if (lidas.every((l) => l.logSnap.exists)) {
      const itens: LinhaCorrigida[] = lidas.map((l) => {
        const detail = (l.logSnap.get("detail") ?? {}) as {
          de?: ResultadoDaCorrecao["de"];
          para?: CamposDaCorrecao;
        };
        return {
          paymentId: l.paymentId,
          movementId: l.movementId,
          de:
            detail.de ?? {
              paymentMethod: null,
              paymentFormId: null,
              paymentFormLabel: null,
              feePct: 0,
              feeAmount: 0,
              netAmount: 0,
            },
          para:
            detail.para ??
            camposDaCorrecao({
              bruto: Number(l.pagamentoSnap.get("grossAmount")) || 0,
              metodo: params.metodo,
              fees: params.fees,
              formas: params.formas,
              formaId: params.formaId,
            }),
        };
      });
      return { ...itens[0], itens, repetida: true };
    }
    if (lidas.some((l) => l.logSnap.exists)) {
      throw new HttpsError(
        "failed-precondition",
        "Essa correção já foi registrada com outros itens. Confira a lista de vendas antes de tentar de novo."
      );
    }

    /* Valida TODAS as linhas antes de escrever qualquer uma: carrinho corrigido
     * pela metade seria pior que nenhum. */
    const planos = lidas.map((l) => {
      const de = estadoDoPagamento(l.pagamentoSnap);

      const motivo = motivoDaRecusaDaVenda({
        temMovimento: l.movimentoSnap.exists,
        tipoDoMovimento: l.movimentoSnap.get("kind") as string | null | undefined,
        temPagamento: l.pagamentoSnap.exists,
        origemDoPagamento: l.pagamentoSnap.get("origin") as string | null | undefined,
        jaDevolvida: !l.devolucoesSnap.empty,
        dataDoPagamento: String(l.pagamentoSnap.get("date") ?? ""),
        criadoEm: diaDeCriacao(l.pagamentoSnap.get("createdAt"), params.fuso ?? DEFAULT_LOCALE.timeZone),
        hoje: params.hoje,
        metodoAtual: de.paymentMethod,
        formaAtual: de.paymentFormId,
        metodoNovo: params.metodo,
        formaNova: params.formaId ?? null,
      });
      if (motivo) {
        throw new HttpsError(CODIGO_DA_RECUSA_DA_VENDA[motivo], FRASE_DA_RECUSA_DA_VENDA[motivo]);
      }

      /* O bruto sai do PAGAMENTO congelado, nunca do preço de hoje do produto. */
      const para = camposDaCorrecao({
        bruto: Number(l.pagamentoSnap.get("grossAmount")) || 0,
        metodo: params.metodo,
        fees: params.fees,
        formas: params.formas,
        formaId: params.formaId,
      });
      return { l, de, para };
    });

    /* ================= ESCRITAS ================= */
    for (const { l, de, para } of planos) {
      const { pagamentoRef, movimentoRef, logRef, movementId, paymentId } = l;
      tx.update(pagamentoRef, para);
      /* O estado operacional, na MESMA transação: o caixa diário lê o meio do
       * movimento. Só o meio — preço, custo e quantidade são o fato e não mudam. */
      tx.update(movimentoRef, { paymentMethod: params.metodo });
      tx.set(logRef, {
        action: "payment.corrigido",
        by: params.autor,
        at: FieldValue.serverTimestamp(),
        detail: { movementId, paymentId, de, para },
      });
    }

    const itens: LinhaCorrigida[] = planos.map(({ l, de, para }) => ({
      paymentId: l.paymentId,
      movementId: l.movementId,
      de,
      para,
    }));
    return { ...itens[0], itens, repetida: false };
  });
}

type CorrecaoDaVendaInput = {
  barbershopId: string;
  /** Uma venda de vários produtos leva todas as linhas em `movementIds`. */
  movementId?: string;
  movementIds?: string[];
  paymentMethod: PaymentMethod;
  paymentFormId?: string | null;
  idempotencyKey?: string;
};

/**
 * O dono corrige como uma venda da Loja foi paga. Dono-only, pelo mesmo motivo
 * de `corrigirPagamentoDeAtendimento`: mexe em fato financeiro materializado.
 */
export const corrigirPagamentoDeVenda = onCall<CorrecaoDaVendaInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const data = request.data ?? ({} as CorrecaoDaVendaInput);
  const { barbershopId } = data;
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  const papel = vinculosDe(request)?.[barbershopId];
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono corrige pagamento.");
  }
  await exigirEdicao(barbershopId);

  const movementIds = (Array.isArray(data.movementIds) ? data.movementIds : [data.movementId])
    .map((m) => String(m ?? ""))
    .filter(Boolean);
  if (movementIds.length === 0) throw new HttpsError("invalid-argument", "Venda não informada.");
  if (!metodoValido(data.paymentMethod)) {
    throw new HttpsError("invalid-argument", "Informe como o cliente pagou.");
  }

  const { db, shopRef, fees, formas, hoje, fuso, chave } = await contextoDaCorrecao(
    barbershopId,
    data.idempotencyKey
  );

  return gravarCorrecaoDeVenda({
    db,
    shopRef,
    movementIds,
    metodo: data.paymentMethod,
    fees,
    formas,
    formaId: data.paymentFormId ? String(data.paymentFormId) : null,
    hoje,
    fuso,
    chave,
    autor: uid,
  });
});

/**
 * O que as portas de entrada (atendimento e venda) leem igual: a tabela de taxas
 * e as formas vigentes AGORA, o dia no fuso da barbearia e a chave.
 */
async function contextoDaCorrecao(barbershopId: string, idempotencyKey: unknown) {
  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  /* R1.1 · a tabela vigente AGORA, sem versionamento. O merge raso sobre
   * `SEM_TAXA` é o mesmo de `materializeFinancialsOnCompletion`: taxa ausente é
   * zero porque o dono ainda não preencheu, e o sistema não inventa custo. */
  const policies = (await politicasDe(shopSnap)) as {
    paymentFees?: Partial<PaymentFees>;
    paymentForms?: unknown;
  };
  const fees: PaymentFees = { ...SEM_TAXA, ...(policies.paymentFees ?? {}) };
  const formas = formasDoTenant(policies);

  /* No fuso DA BARBEARIA. A function roda em UTC, e a janela do mês corrente
   * decidida em UTC recusaria uma correção legítima feita às 23h50 de 31/07 em
   * São Paulo. */
  const fuso = localeDoDocumento(shopSnap.data()).timeZone;
  const hoje = hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone);

  /* Sanitizada porque vira ID de documento: uma chave com "/" criaria uma
   * subcoleção em vez de um evento, e o Firestore aceitaria sem reclamar. */
  const chave = String(idempotencyKey ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!chave) throw new HttpsError("invalid-argument", "Chave de idempotência ausente.");

  return { db, shopRef, fees, formas, hoje, fuso, chave };
}
