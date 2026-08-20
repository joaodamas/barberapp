import type { BookingDoc, SubscriberDoc } from "./domain";
import { paymentMethodLabel } from "./payment-method";
import { contar, contarDeTotal } from "./plural";
import type { BookingStatus } from "./types";

export type BookingTone = "gold" | "success" | "danger" | "neutral";
export type BookingStatusMeta = { label: string; tone: BookingTone };

export const bookingStatusMeta: Record<BookingStatus, BookingStatusMeta> = {
  pending_payment: { label: "Aguardando pagamento", tone: "gold" },
  confirmed: { label: "Confirmado", tone: "success" },
  confirmed_by_client: { label: "Confirmou presença", tone: "success" },
  completed: { label: "Concluído", tone: "neutral" },
  no_show: { label: "Não compareceu", tone: "danger" },
  cancelled_by_client: { label: "Cancelado pelo cliente", tone: "danger" },
  cancelled_by_shop: { label: "Cancelado pela loja", tone: "danger" },
  expired: { label: "Expirado", tone: "danger" },
  fit_in_requested: { label: "Encaixe pendente", tone: "gold" },
};

/**
 * O que a tela mostra para um status que ela não conhece.
 *
 * ## Por que `neutral`, e não `danger`
 *
 * O tom é semântico (`UI-UX-GUIDELINES` §3: verde e vermelho só para resultado
 * e estado). `danger` afirmaria que a reserva deu errado; `success`, que está
 * tudo certo; `gold`, que alguém precisa agir. Nenhuma das três é verdade — a
 * única coisa que o produto sabe é que **não sabe**, e `neutral` é o único tom
 * que não inventa um fato. É a §9 aplicada a um caso onde a informação que
 * falta é a própria informação.
 *
 * ## Por que o código cru aparece no rótulo
 *
 * A §9 pede a consequência, não o estado interno — e aqui o estado interno é o
 * único fato existente. Sem ele, dois status desconhecidos diferentes ficam
 * indistinguíveis na tela, e o dono que ligar para o suporte não tem o que
 * dizer além de "apareceu uma reserva estranha". Com ele, a linha é
 * diagnosticável por quem pode corrigi-la.
 */
const STATUS_DESCONHECIDO: BookingStatusMeta = {
  label: "Situação não reconhecida",
  tone: "neutral",
};

/** Limite do código cru no rótulo: uma célula de tabela não pode virar parágrafo. */
const MAX_CODIGO_CRU = 24;

function conhecido<T>(mapa: Record<string, T>, chave: unknown): T | undefined {
  if (typeof chave !== "string") return undefined;
  /* `hasOwnProperty` e não `mapa[chave]` direto: o objeto literal herda de
   * `Object.prototype`, então `status === "constructor"` devolveria uma função
   * — verdadeira o bastante para passar por qualquer checagem de existência e
   * quebrar uma linha depois, ao ler `.tone`. O status vem do banco, e o banco
   * aceita qualquer string. */
  return Object.prototype.hasOwnProperty.call(mapa, chave) ? mapa[chave] : undefined;
}

/**
 * A leitura SEGURA do status de uma reserva.
 *
 * Existe porque `bookingStatusMeta[booking.status]` devolve `undefined` para
 * qualquer valor fora da união, e o `.tone` seguinte derruba a tela inteira com
 * `Cannot read properties of undefined`. Verificado em 18/08: uma única reserva
 * com status estranho, e a tela **Hoje** não abre — o boundary captura, e o
 * dono perde o dia inteiro de operação por causa de uma linha da tabela.
 *
 * Nenhum caminho do produto grava status inválido hoje. Mas o campo é uma
 * string no Firestore, e três coisas o produzem sem passar por tela nenhuma:
 * migração, escrita direta no banco, e um status novo no servidor que suba
 * antes do deploy do web. **Um enum desconhecido não pode derrubar a tela de
 * operação** — ele degrada para uma linha honesta e o resto do dia continua
 * legível.
 */
export function metaDoStatus(status: unknown): BookingStatusMeta {
  const meta = conhecido(bookingStatusMeta, status);
  if (meta) return meta;

  const cru = typeof status === "string" ? status.trim() : "";
  if (!cru) return STATUS_DESCONHECIDO;
  return {
    ...STATUS_DESCONHECIDO,
    label: `${STATUS_DESCONHECIDO.label} (${cru.slice(0, MAX_CODIGO_CRU)})`,
  };
}

/**
 * Por que o atendimento NÃO foi coberto — D2.
 *
 * `sem_plano` fica de fora de propósito: é o caso da esmagadora maioria dos
 * atendimentos, e escrever "não coberto porque o cliente não tem plano" em toda
 * linha da agenda seria ruído puro. Os outros só acontecem com quem TEM plano, e
 * aí a explicação é o que impede o dono de achar que o produto errou.
 *
 * `cobrado_no_balcao` é o único em que o produto não errou NEM o plano falhou:
 * o dono cobrou de um cliente cujo plano cobriria, e a linha diz isso em vez de
 * exibir "Coberto pelo plano" sobre um atendimento que teve dinheiro — que é o
 * que a tela fazia antes do D-3.
 */
const MOTIVO_AVULSO: Record<string, string> = {
  plano_inativo: "o plano não valia nesta data",
  plano_nao_cobre: "o plano não inclui atendimento",
  cota_esgotada: "a cota do mês já tinha acabado",
  cobrado_no_balcao: "o plano cobriria, e você registrou a cobrança",
};

export type LiquidacaoDoAtendimento = {
  /** Como o dinheiro entrou — ou por que não entrou. */
  label: string;
  /** A linha que explica: o plano e a cota, ou por que o plano não cobriu. */
  detalhe: string | null;
  coberto: boolean;
};

/**
 * Como o atendimento foi liquidado — D2, do lado da tela.
 *
 * ## O defeito que ela corrige
 *
 * A coluna "Pagamento" chamava `labelDoPagamento(origin, method)`, e o
 * atendimento coberto pelo plano **não tem método** — o servidor apaga o
 * pagamento de propósito, porque a mensalidade já é a receita. O resultado era
 * um corte concluído e pago pelo plano exibindo *"A pagar no salão"*: o produto
 * pedindo ao dono que cobrasse de novo o que já estava cobrado. É a mesma
 * doença do F2, um passo depois — a decisão passou a ser certa no servidor e a
 * tela continuou contando a história antiga.
 *
 * ## O que ela NÃO faz
 *
 * Não decide cobertura. Lê `booking.cobertura`, que é o fato gravado pelo
 * servidor na conclusão. Enquanto o gatilho não escreveu, ela diz que não sabe
 * — e dizer "não sei" é o comportamento correto, não uma lacuna.
 */
export function liquidacaoDoAtendimento(
  booking: Pick<BookingDoc, "status" | "paymentOrigin" | "paymentMethod" | "cobertura">
): LiquidacaoDoAtendimento {
  const cobertura = booking.cobertura;

  if (cobertura?.tipo === "plano") {
    /* A cota aparece porque é a informação que o dono precisa para saber se o
     * PRÓXIMO corte deste cliente ainda entra no plano — decidir isso no balcão
     * é operação, não relatório. Plano ilimitado não tem teto a exibir, então
     * mostra a posição sem denominador. */
    const uso =
      cobertura.cota === null
        ? contar(cobertura.usoNaCompetencia, "atendimento no mês", "atendimentos no mês")
        : contarDeTotal(
            cobertura.usoNaCompetencia,
            cobertura.cota,
            "atendimento do mês",
            "atendimentos do mês"
          );
    return {
      label: "Coberto pelo plano",
      detalhe: `${cobertura.planName} · ${uso}`,
      coberto: true,
    };
  }

  const motivo =
    cobertura?.tipo === "avulso" ? (conhecido(MOTIVO_AVULSO, cobertura.motivo) ?? null) : null;
  const detalhe = motivo ? `Fora do plano: ${motivo}` : null;

  const metodo = conhecido(paymentMethodLabel, booking.paymentMethod);
  if (metodo) return { label: metodo, detalhe, coberto: false };

  /* Concluído e sem método é o caminho de exceção que o servidor já admite
   * (`paymentMethod: null` explícito, taxa DESCONHECIDA e não zero). A tela
   * precisa dizer isso com essas palavras: "A pagar no salão" num atendimento
   * que já terminou é uma cobrança que ninguém vai fazer. */
  if (booking.status === "completed") {
    return { label: "Não informado", detalhe, coberto: false };
  }

  return {
    label: booking.paymentOrigin === "online" ? "Aguardando pagamento" : "A pagar no salão",
    detalhe,
    coberto: false,
  };
}

/**
 * A assinatura ATIVA deste cliente, se existir.
 *
 * ## O que esta função responde, e o que ela deliberadamente NÃO responde
 *
 * Ela responde *"este cliente tem plano contratado?"* — um campo lido do
 * documento. Ela **não** responde *"este atendimento está coberto?"*, que é
 * decisão de `decidirCobertura` (`functions/src/mensalistas.ts`) e depende de
 * competência, cota e de quantos cortes já foram cobertos no mês.
 *
 * A distinção é o ponto inteiro deste arquivo. Reimplementar a decisão aqui
 * recriaria o D1 — o web dizendo 40% e o servidor gravando 0% — só que com
 * cobertura no lugar da comissão, e num campo que ninguém confere. A tela usa
 * este fato para escolher **que pergunta fazer**, nunca para afirmar a
 * resposta: quem afirma é o servidor, e a tela só exibe depois, por
 * `liquidacaoDoAtendimento`.
 */
export function assinaturaAtivaDe<T extends Pick<SubscriberDoc, "clientId" | "status">>(
  assinaturas: readonly T[],
  clientId: string | null | undefined
): T | null {
  if (!clientId) return null;
  return assinaturas.find((a) => a.clientId === clientId && a.status === "ativo") ?? null;
}

/**
 * O que o plano CONTRATADO promete — os termos, não a decisão.
 *
 * Copiados para a assinatura no ato da contratação (`SubscriberDoc.unlimited` e
 * `servicesIncluded`), justamente para que reajustar o plano em novembro não
 * reescreva o que foi assinado em agosto. Exibi-los é devolver ao cliente o que
 * ele contratou; não é calcular se este corte entra.
 */
export function termosDoPlano(
  assinatura: Pick<SubscriberDoc, "unlimited" | "servicesIncluded">
): string {
  if (assinatura.unlimited) return "Atendimentos ilimitados";
  const inclusos = Number(assinatura.servicesIncluded) || 0;
  if (inclusos > 0) return `${contar(inclusos, "atendimento", "atendimentos")} por mês`;
  /* Assinatura anterior ao D2 não tem os dois campos, e vale como plano que não
   * cobre — que é o comportamento que ela teve a vida inteira. Dizer isso é
   * melhor que omitir: o dono precisa saber por que o plano não apareceu como
   * opção de cobertura. */
  return "Sem atendimento incluso";
}
