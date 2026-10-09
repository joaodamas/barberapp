import { liquidacaoDoAtendimento, metaDoStatus, type BookingTone } from "./booking-status";
import type { BookingDoc } from "./domain";

/**
 * A situação de um horário, em UMA frase curta com um tom.
 *
 * Substitui a pílula preenchida ("Concluído" em verde, "Cancelado" em
 * vermelho) por texto com um ponto colorido: a cor passa a ser um sinal pequeno
 * ao lado da palavra, e não um bloco que disputa o olho com a ação da linha.
 * A palavra continua carregando o significado — cor nenhuma responde sozinha
 * "pago" ou "atrasado".
 *
 * `null` é "em aberto e no horário": o estado normal de quem ainda vai ser
 * atendido não precisa de etiqueta, e a linha só fala quando há o que dizer.
 */
export type SituacaoDoHorario = { tom: "ok" | "alerta" | "erro" | "neutro"; texto: string } | null;

const TOM: Record<BookingTone, "ok" | "alerta" | "erro" | "neutro"> = {
  success: "ok",
  gold: "alerta",
  danger: "erro",
  neutral: "neutro",
};

export function situacaoDoHorario(params: {
  booking: Pick<
    BookingDoc,
    | "status"
    | "paymentOrigin"
    | "paymentMethod"
    | "cobertura"
    | "paymentFormLabel"
    | "value"
    | "discountAmount"
  >;
  atrasado: boolean;
  /** Minutos desde o horário, quando o relógio já existe. */
  atrasoMin: number | null;
}): SituacaoDoHorario {
  const { booking, atrasado, atrasoMin } = params;

  if (booking.status === "completed") {
    const l = liquidacaoDoAtendimento(booking);
    return { tom: "ok", texto: `Concluído · ${l.coberto ? "plano" : l.label}` };
  }

  if (atrasado) {
    return {
      tom: "erro",
      texto: atrasoMin !== null && atrasoMin > 0 ? `Atrasado ${atrasoMin} min` : "Atrasado",
    };
  }

  /* Confirmado é o estado normal de quem ainda vai ser atendido. Já "aguardando
   * pagamento" e "encaixe pendente" pedem algo de alguém, e dizem isso. */
  if (booking.status === "confirmed" || booking.status === "confirmed_by_client") return null;

  const meta = metaDoStatus(booking.status);
  return { tom: TOM[meta.tone], texto: meta.label };
}
