import { metaDoStatus } from "./booking-status";
import { ehCortesia, valorCobrado } from "./desconto";
import type { BookingDoc } from "./domain";
import { mesAtual } from "./format";

/**
 * O relatório mensal da agenda — pedido do dono em 28/09: "pra ele clicar no
 * PDF e ver mais fácil".
 *
 * Lógica pura, sem React e sem Firestore, para o agrupamento e as contas serem
 * provados por teste (`__tests__/relatorio-da-agenda.test.ts`). A tela só
 * desenha o que sai daqui; se o total do cabeçalho não bater com as linhas da
 * tabela, o defeito está neste arquivo e o teste acusa.
 */

/** Como cada status entra no relatório. */
export type Grupo = "concluido" | "a_fazer" | "falta" | "encaixe_pendente" | "cancelado" | "outro";

/**
 * O grupo de cada status — os status reais de `BookingStatus`.
 *
 * `pending_payment` entra em "a fazer": ele ocupa a cadeira (`OCCUPIES_SLOT`) e
 * o cliente está a caminho, só falta o pagamento online. `fit_in_requested`
 * NÃO entra: é pedido que o barbeiro ainda não aprovou, e somá-lo ao previsto
 * seria afirmar um atendimento que pode não acontecer.
 *
 * Status fora da união cai em "outro" e continua aparecendo — a mesma regra de
 * `metaDoStatus`: um enum desconhecido não some do relatório nem vira dinheiro.
 */
export function grupoDoStatus(status: unknown): Grupo {
  switch (status) {
    case "completed":
      return "concluido";
    case "pending_payment":
    case "confirmed":
    case "confirmed_by_client":
      return "a_fazer";
    case "no_show":
      return "falta";
    case "fit_in_requested":
      return "encaixe_pendente";
    case "cancelled_by_client":
    case "cancelled_by_shop":
    case "expired":
      return "cancelado";
    default:
      return "outro";
  }
}

/* ------------------------------------------------------------------ */
/* Mês                                                                 */
/* ------------------------------------------------------------------ */

/**
 * O mês pedido na URL, ou o mês atual.
 *
 * A URL é digitável e compartilhável: `?mes=2026-13` ou `?mes=abc` não podem
 * virar um relatório vazio que parece verdadeiro ("nenhum atendimento em
 * 2026-13"). Mês inválido volta para o atual.
 */
export function mesDoParametro(param: unknown, hoje = new Date()): string {
  if (typeof param === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(param)) return param;
  return mesAtual(0, hoje);
}

/** O mês `delta` meses depois de `mes` (negativo = antes). */
export function mesVizinho(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  /* `mesAtual` já resolve a virada de ano e o dia 31; o offset dele conta para
   * trás, daí o sinal invertido. */
  return mesAtual(-delta, new Date(ano, m - 1, 1));
}

/** A reserva cai neste mês? `date` é `YYYY-MM-DD`, então o prefixo basta. */
export function doMes(date: unknown, mes: string): boolean {
  return typeof date === "string" && date.startsWith(`${mes}-`);
}

/* ------------------------------------------------------------------ */
/* Horário                                                             */
/* ------------------------------------------------------------------ */

/**
 * `HH:mm` + minutos → `HH:mm`.
 *
 * Reserva antiga sem `durationMin` ocupa a grade da jornada — a mesma regra da
 * Agenda. Horário ilegível devolve o que veio, em vez de `NaN:NaN`.
 */
export function fimDoHorario(time: string, minutos: number): string {
  const [h, m] = String(time ?? "").split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const total = h * 60 + m + (Number.isFinite(minutos) ? minutos : 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Montagem                                                            */
/* ------------------------------------------------------------------ */

type Reserva = Pick<
  BookingDoc,
  "clientId" | "staffId" | "clientName" | "clientWhatsapp" | "serviceIds" | "date" | "time" | "status" | "value"
> &
  Partial<Pick<BookingDoc, "durationMin" | "isFitIn" | "cobertura" | "discountAmount">> & {
    id: string;
    /** Gravado pelo servidor na reserva; não está no tipo do front (ver Agenda). */
    serviceNames?: string[];
  };

export type LinhaDoRelatorio = {
  id: string;
  data: string;
  inicio: string;
  fim: string;
  cliente: string;
  telefone: string;
  servicos: string;
  barbeiro: string;
  mensalista: boolean;
  /** Encaixe aprovado ou pedido de encaixe ainda sem resposta. */
  encaixe: boolean;
  grupo: Grupo;
  status: string;
  valor: number;
};

export type DiaDoRelatorio = { data: string; linhas: LinhaDoRelatorio[] };

export type ResumoDoMes = {
  /** Toda reserva do mês — a soma exata das contagens abaixo. */
  total: number;
  concluidos: number;
  aFazer: number;
  faltas: number;
  encaixesPendentes: number;
  cancelados: number;
  /** Status que o produto não reconhece. Aparece só quando existe. */
  outros: number;
  /** A fazer + concluídos. */
  valorPrevisto: number;
  /**
   * Só concluídos — o COBRADO, pela mesma régua da receita de serviço do
   * Financeiro (`valorCobrado`; cortesia e coberto pelo plano valem zero).
   */
  valorRealizado: number;
  /**
   * A parte do realizado que o plano do mensalista cobriu (`cobertura`).
   *
   * Sem ela, "realizado" aqui e a receita do Financeiro divergem sem
   * explicação: o corte coberto conta o valor do serviço, mas o dinheiro dele
   * entrou pela mensalidade. O relatório mostra a diferença em vez de escondê-la.
   */
  valorCobertoPeloPlano: number;
};

export type RelatorioDoMes = {
  mes: string;
  resumo: ResumoDoMes;
  /** Dias com ao menos uma reserva que não foi cancelada, em ordem. */
  dias: DiaDoRelatorio[];
  /** Cancelados e expirados, fora da agenda do dia para não poluí-la. */
  cancelados: LinhaDoRelatorio[];
};

export type Contexto = {
  /** Nome do barbeiro pelo `staffId`. */
  nomeDoBarbeiro: (staffId: string) => string | undefined;
  /** Nome do serviço pelo id — para reserva sem `serviceNames`. */
  nomeDoServico: (serviceId: string) => string | undefined;
  /** Clientes com assinatura ATIVA hoje (`assinaturaAtivaDe`). */
  mensalistas: ReadonlySet<string>;
  /** A grade da jornada, para reserva sem duração. */
  gradeMin: number;
};

const valorSeguro = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const centavos = (v: number) => Math.round(v * 100) / 100;

function paraLinha(b: Reserva, ctx: Contexto): LinhaDoRelatorio {
  const duracao = b.durationMin || ctx.gradeMin;
  const nomes =
    b.serviceNames && b.serviceNames.length > 0
      ? b.serviceNames
      : (b.serviceIds ?? []).map((id) => ctx.nomeDoServico(id)).filter((n): n is string => !!n);
  return {
    id: b.id,
    data: b.date,
    inicio: b.time,
    fim: fimDoHorario(b.time, duracao),
    cliente: b.clientName || "Cliente sem nome",
    telefone: String(b.clientWhatsapp ?? ""),
    servicos: nomes.join(" + ") || "Serviço",
    barbeiro: ctx.nomeDoBarbeiro(b.staffId) ?? "—",
    /* O fato gravado vence: o atendimento coberto pelo plano foi de mensalista
     * mesmo que a assinatura tenha sido cancelada depois. Para o que ainda não
     * foi liquidado, vale a assinatura ativa hoje. */
    mensalista: b.cobertura?.tipo === "plano" || (!!b.clientId && ctx.mensalistas.has(b.clientId)),
    encaixe: b.isFitIn === true || b.status === "fit_in_requested",
    grupo: grupoDoStatus(b.status),
    status: metaDoStatus(b.status).label,
    /* O COBRADO (08/10): com desconto no fechamento, o preço da agenda não é
     * o que entrou. Reserva em aberto não tem desconto e fica com o valor. */
    valor: valorCobrado({ value: valorSeguro(b.value), discountAmount: b.discountAmount }),
  };
}

/** Por data e, dentro dela, por horário; empate desfeito pelo cliente. */
function emOrdem(a: LinhaDoRelatorio, b: LinhaDoRelatorio) {
  return (
    a.data.localeCompare(b.data) ||
    a.inicio.localeCompare(b.inicio) ||
    a.cliente.localeCompare(b.cliente, "pt-BR")
  );
}

/**
 * Monta o relatório de `mes` a partir das reservas — de qualquer mês; o recorte
 * acontece aqui.
 */
export function montarRelatorio(reservas: readonly Reserva[], mes: string, ctx: Contexto): RelatorioDoMes {
  const resumo: ResumoDoMes = {
    total: 0,
    concluidos: 0,
    aFazer: 0,
    faltas: 0,
    encaixesPendentes: 0,
    cancelados: 0,
    outros: 0,
    valorPrevisto: 0,
    valorRealizado: 0,
    valorCobertoPeloPlano: 0,
  };
  const ativas: LinhaDoRelatorio[] = [];
  const cancelados: LinhaDoRelatorio[] = [];

  for (const b of reservas) {
    if (!doMes(b.date, mes)) continue;
    /* Semana do fixo apagada pelo dono: não aconteceu e não foi desmarcada —
     * fora do relatório, nem como cancelado. */
    if (b.status === "removido") continue;
    const linha = paraLinha(b, ctx);
    resumo.total += 1;

    switch (linha.grupo) {
      case "concluido":
        resumo.concluidos += 1;
        resumo.valorPrevisto += linha.valor;
        {
          /* A MESMA régua de `receitaDeServico` (08/10): o realizado somava
           * `b.value` — o preço, não o cobrado —, e o PDF dizia mais do que o
           * Financeiro sempre que houve desconto. Agora:
           *  - avulso: `valorCobrado` (preço − desconto);
           *  - cortesia: zero (não entrou dinheiro; o custo dela está em
           *    "Descontos do mês");
           *  - coberto pelo plano: zero, e o valor do serviço vai para
           *    `valorCobertoPeloPlano` — a mensalidade entra como receita
           *    própria no Financeiro, que exclui o atendimento coberto inteiro
           *    (revisão do PR #81). */
          if (b.cobertura?.tipo === "plano") {
            resumo.valorCobertoPeloPlano += linha.valor;
          } else if (!ehCortesia({ value: valorSeguro(b.value), discountAmount: b.discountAmount, cobertura: b.cobertura })) {
            resumo.valorRealizado += linha.valor;
          }
        }
        break;
      case "a_fazer":
        resumo.aFazer += 1;
        resumo.valorPrevisto += linha.valor;
        break;
      case "falta":
        resumo.faltas += 1;
        break;
      case "encaixe_pendente":
        resumo.encaixesPendentes += 1;
        break;
      case "cancelado":
        resumo.cancelados += 1;
        break;
      default:
        resumo.outros += 1;
    }

    (linha.grupo === "cancelado" ? cancelados : ativas).push(linha);
  }

  resumo.valorPrevisto = centavos(resumo.valorPrevisto);
  resumo.valorRealizado = centavos(resumo.valorRealizado);
  resumo.valorCobertoPeloPlano = centavos(resumo.valorCobertoPeloPlano);

  ativas.sort(emOrdem);
  cancelados.sort(emOrdem);

  const dias: DiaDoRelatorio[] = [];
  for (const linha of ativas) {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.data === linha.data) ultimo.linhas.push(linha);
    else dias.push({ data: linha.data, linhas: [linha] });
  }

  return { mes, resumo, dias, cancelados };
}
