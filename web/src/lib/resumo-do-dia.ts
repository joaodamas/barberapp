import type { BookingDoc } from "@/lib/domain";
import type { BookingStatus } from "@/lib/types";
import { estaAtrasado, minutosDeAtraso } from "@/lib/action-center";
import { contar } from "@/lib/plural";

/**
 * O topo da tela Hoje, em números e frases (02/10).
 *
 * Puro: recebe as reservas DE HOJE e o relógio, devolve o que o cabeçalho
 * mostra — quem está na cadeira agora, o próximo atendimento com a contagem
 * regressiva, o atraso e o progresso do dia. A tela só desenha.
 *
 * Não muda regra nenhuma: "agendados" segue `OCCUPIES_SLOT` (quem conta na
 * ocupação), "em aberto" é o mesmo conjunto do motor de alertas, e o atraso é
 * `estaAtrasado` — a mesma régua da linha da agenda e do "Precisa de você".
 */

type ReservaDoDia = { id: string } & Pick<BookingDoc, "status" | "date" | "time" | "clientName" | "serviceIds" | "durationMin"> & { staffId?: string };

/** Ainda vai acontecer (ou devia estar acontecendo): sem desfecho. */
const SEM_DESFECHO: BookingStatus[] = ["pending_payment", "confirmed", "confirmed_by_client"];
const DURACAO_PADRAO_MIN = 30;

export type AtendimentoEmFoco = {
  id: string;
  hora: string;
  cliente: string;
  servico: string;
  staffId: string | null;
  duracaoMin: number;
  /** Minutos até começar (próximo), de atraso (atrasado) ou decorridos (na cadeira). */
  minutos: number;
};

/** Um horário do dia na régua de atendimentos: feito, falta ou ainda pela frente. */
export type SegmentoDoDia = { id: string; hora: string; estado: "feito" | "falta" | "pela-frente" };

export type ResumoDoDia = {
  total: number;
  feitos: number;
  faltas: number;
  pelaFrente: number;
  /** 0–100, feitos ÷ total. Nulo sem atendimentos. */
  progressoPct: number | null;
  naCadeira: AtendimentoEmFoco[];
  atrasado: AtendimentoEmFoco | null;
  proximo: AtendimentoEmFoco | null;
  /** Os próximos horários do dia (até 3), para o cartão "Agora" não sobrar vazio. */
  proximos: AtendimentoEmFoco[];
  segmentos: SegmentoDoDia[];
};

function inicio(b: Pick<BookingDoc, "date" | "time">): Date {
  return new Date(`${b.date}T${b.time}:00`);
}

export function resumoDoDia(params: {
  /** Só as de hoje. */
  reservas: ReservaDoDia[];
  agora: Date | null;
  toleranciaMin: number;
  nomeDoServico: (ids: string[]) => string;
}): ResumoDoDia {
  const { agora, toleranciaMin, nomeDoServico } = params;
  const ordenadas = params.reservas
    .filter((b) => Boolean(b.time))
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));

  const contam = ordenadas.filter((b) =>
    (["pending_payment", "confirmed", "confirmed_by_client", "completed", "no_show"] as BookingStatus[]).includes(b.status)
  );
  const feitos = contam.filter((b) => b.status === "completed").length;
  const abertas = contam.filter((b) => SEM_DESFECHO.includes(b.status));

  const foco = (b: ReservaDoDia, minutos: number): AtendimentoEmFoco => ({
    id: b.id,
    hora: b.time,
    cliente: (b.clientName ?? "").trim() || "Cliente",
    servico: nomeDoServico(b.serviceIds ?? []),
    staffId: b.staffId ?? null,
    duracaoMin: b.durationMin ?? DURACAO_PADRAO_MIN,
    minutos,
  });

  let naCadeira: AtendimentoEmFoco[] = [];
  let atrasado: AtendimentoEmFoco | null = null;
  let proximo: AtendimentoEmFoco | null = null;
  let proximos: AtendimentoEmFoco[] = [];

  if (agora) {
    const t = agora.getTime();
    naCadeira = abertas
      .filter((b) => {
        const ini = inicio(b).getTime();
        const fim = ini + (b.durationMin ?? DURACAO_PADRAO_MIN) * 60_000;
        return ini <= t && t < fim && !estaAtrasado({ booking: b, agora, toleranciaMin });
      })
      .map((b) => foco(b, Math.floor((t - inicio(b).getTime()) / 60_000)));

    const primeiroAtrasado = abertas.find((b) => estaAtrasado({ booking: b, agora, toleranciaMin }));
    if (primeiroAtrasado) atrasado = foco(primeiroAtrasado, minutosDeAtraso(primeiroAtrasado, agora));

    const seguinte = abertas.find((b) => inicio(b).getTime() > t);
    if (seguinte) proximo = foco(seguinte, Math.ceil((inicio(seguinte).getTime() - t) / 60_000));
    proximos = abertas
      .filter((b) => inicio(b).getTime() > t)
      .slice(0, 3)
      .map((b) => foco(b, Math.ceil((inicio(b).getTime() - t) / 60_000)));
  }

  return {
    total: contam.length,
    feitos,
    faltas: contam.filter((b) => b.status === "no_show").length,
    pelaFrente: abertas.length,
    progressoPct: contam.length > 0 ? Math.round((feitos / contam.length) * 100) : null,
    naCadeira,
    atrasado,
    proximo,
    proximos,
    segmentos: contam.map((b) => ({
      id: b.id,
      hora: b.time,
      estado: b.status === "completed" ? "feito" : b.status === "no_show" ? "falta" : "pela-frente",
    })),
  };
}

export type FatiaDoRecebido = { forma: string; valor: number };

/**
 * O recebido de hoje repartido por forma — a MESMA fonte do "Recebido hoje"
 * (`caixaDoDia`): atendimento, venda e mensalidade entram na forma em que
 * foram pagos. Cartão = débito + crédito. "Não informado" só aparece quando
 * existe, para a soma das fatias bater sempre com o total.
 */
export function recebidoPorForma(caixa: {
  pix: number;
  cartao: number;
  dinheiro: number;
  naoInformado: number;
}): FatiaDoRecebido[] {
  const fatias: FatiaDoRecebido[] = [
    { forma: "Pix", valor: caixa.pix },
    { forma: "Cartão", valor: caixa.cartao },
    { forma: "Dinheiro", valor: caixa.dinheiro },
  ];
  if (Math.abs(caixa.naoInformado) > 0.004) fatias.push({ forma: "Não informado", valor: caixa.naoInformado });
  return fatias;
}

/** "em 12 min", "em 1h05", "em 2h". */
export function textoDeContagem(minutos: number): string {
  if (minutos <= 0) return "agora";
  if (minutos < 60) return `em ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `em ${h}h` : `em ${h}h${String(m).padStart(2, "0")}`;
}

/** "Atrasado 7 min", "Atrasado 1h10". */
export function textoDeAtraso(minutos: number): string {
  if (minutos < 60) return `Atrasado ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `Atrasado ${h}h` : `Atrasado ${h}h${String(m).padStart(2, "0")}`;
}

/**
 * O que dizer sobre os horários livres que SOBRAM no dia.
 *
 * "Agenda cheia" só quando o dia lotou de verdade (ocupação 100%). Sem horário
 * livre pela frente num dia que não lotou (fim do expediente, buracos que já
 * passaram) é outra coisa: "88%" ao lado de "Agenda cheia" se contradiz.
 */
export function textoDeLivres(livres: number, ocupacaoPct: number): string {
  if (livres > 0) return contar(livres, "horário livre", "horários livres");
  return ocupacaoPct >= 100 ? "Agenda cheia" : "Sem horário livre pela frente";
}
