/**
 * Os textos do bot — puros, para teste de mesa. HTML do Telegram: só <b>,
 * <i>, e tudo que vem do usuário passa por `esc`.
 */

export const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "2026-10-03" → "sex 03/10". Meio-dia em UTC: o dia da semana não escorrega. */
export function diaCurto(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const [, m, dd] = iso.split("-");
  return `${DIAS[d.getUTCDay()]} ${dd}/${m}`;
}

export type ReservaResumo = {
  clientName?: unknown;
  date: string;
  time: string;
  serviceNames?: unknown;
  staffName?: unknown;
};

function servicos(r: ReservaResumo) {
  const lista = Array.isArray(r.serviceNames) ? r.serviceNames.map(String).filter(Boolean) : [];
  return lista.length ? lista.join(" + ") : "Serviço";
}

function linhaDoHorario(r: ReservaResumo) {
  const com = r.staffName ? ` · com ${esc(r.staffName)}` : "";
  return `${diaCurto(r.date)} às ${esc(r.time)}${com}`;
}

export function textoDoEncaixe(r: ReservaResumo, loja: string): string {
  return [
    `🔔 <b>Pedido de encaixe</b> · ${esc(loja)}`,
    `${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}`,
    linhaDoHorario(r),
    "",
    "O horário está ocupado. Dá para encaixar?",
  ].join("\n");
}

/**
 * O que aconteceu com o toque no botão do encaixe.
 *
 * Os três primeiros são a resposta DESTE toque. Os demais dizem por que o
 * pedido já não estava aberto — antes tudo virava "já tinha sido respondido",
 * e o barbeiro lia "respondido" num pedido que o cliente cancelou ou que
 * venceu, sem saber se alguém da equipe tinha falado com o cliente.
 */
export type DesfechoDoToque =
  | "confirmed"
  | "cancelled_by_shop"
  | "expired"
  | "ja_aprovado"
  | "ja_recusado"
  | "cancelado_pelo_cliente"
  | "ja_respondido";

/** O status atual da reserva → por que o toque não teve efeito. Puro, para teste. */
export function desfechoPeloStatusAtual(status: unknown): DesfechoDoToque {
  if (status === "confirmed" || status === "confirmed_by_client" || status === "completed" || status === "no_show") {
    return "ja_aprovado";
  }
  if (status === "cancelled_by_shop") return "ja_recusado";
  if (status === "cancelled_by_client") return "cancelado_pelo_cliente";
  if (status === "expired") return "expired";
  return "ja_respondido";
}

/** O aviso curto que aparece no topo do Telegram depois do toque. */
export function avisoDoToque(desfecho: DesfechoDoToque): string {
  switch (desfecho) {
    case "confirmed":
      return "Encaixe aprovado.";
    case "cancelled_by_shop":
      return "Encaixe recusado.";
    case "expired":
      return "O horário já passou — o pedido expirou.";
    case "ja_aprovado":
      return "Esse encaixe já tinha sido aprovado.";
    case "ja_recusado":
      return "Esse encaixe já tinha sido recusado.";
    case "cancelado_pelo_cliente":
      return "O cliente desistiu desse pedido.";
    default:
      return "Esse pedido não está mais aberto.";
  }
}

export function textoDoEncaixeRespondido(
  r: ReservaResumo,
  loja: string,
  desfecho: DesfechoDoToque,
  quem: string
): string {
  const fim =
    desfecho === "confirmed"
      ? `✅ <b>Aprovado</b> por ${esc(quem)}. O cliente vê na hora.`
      : desfecho === "cancelled_by_shop"
        ? `✖️ <b>Recusado</b> por ${esc(quem)}.`
        : desfecho === "expired"
          ? "⌛ O horário já passou — o pedido expirou."
          : desfecho === "ja_aprovado"
            ? "✅ Esse encaixe já tinha sido <b>aprovado</b>."
            : desfecho === "ja_recusado"
              ? "✖️ Esse encaixe já tinha sido <b>recusado</b>."
              : desfecho === "cancelado_pelo_cliente"
                ? "❌ O cliente <b>desistiu</b> do pedido antes da resposta."
                : "ℹ️ Esse pedido não está mais aberto.";
  return [`🔔 <b>Pedido de encaixe</b> · ${esc(loja)}`, `${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}`, linhaDoHorario(r), "", fim].join(
    "\n"
  );
}

/**
 * A confirmação de que a conversa foi ligada.
 *
 * Uma conversa só serve UMA barbearia; ligar em outra desliga a anterior. Isso
 * acontecia calado, e o barbeiro que trabalha em duas casas descobria dias
 * depois que a primeira parou de avisar. Agora a frase diz.
 */
export function textoDaConexao(params: {
  contato: { nome: string };
  loja: string;
  doQue: string;
  lojaDesligada?: string | null;
}): string {
  const linhas = [
    `✅ Pronto, ${esc(params.contato.nome)}! Este Telegram está ligado à <b>${esc(params.loja)}</b>.`,
    "",
    `Você vai receber aqui ${params.doQue}.`,
  ];
  if (params.lojaDesligada) {
    linhas.push(
      "",
      `⚠️ Ele estava ligado à <b>${esc(params.lojaDesligada)}</b> e foi <b>desligado de lá</b> — cada Telegram recebe os avisos de uma barbearia só. Para voltar a receber de lá, peça um novo convite a ela.`
    );
  }
  linhas.push("", "Para pausar, mande /parar.");
  return linhas.join("\n");
}

export function textoDoCancelamento(r: ReservaResumo, loja: string): string {
  return [
    `❌ <b>Cliente cancelou</b> · ${esc(loja)}`,
    `${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}`,
    linhaDoHorario(r),
    "",
    "O horário ficou livre na agenda.",
  ].join("\n");
}

export function textoDoNovoAgendamento(r: ReservaResumo, loja: string): string {
  return [
    `📅 <b>Novo agendamento</b> · ${esc(loja)}`,
    `${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}`,
    linhaDoHorario(r),
  ].join("\n");
}

export function textoDaAgendaDoDia(params: {
  loja: string;
  data: string;
  reservas: Array<ReservaResumo & { mensalista?: boolean }>;
  deQuem?: string | null;
}): string {
  const titulo = `☀️ <b>Agenda de hoje</b> · ${diaCurto(params.data)}${params.deQuem ? ` · ${esc(params.deQuem)}` : ""}`;
  if (params.reservas.length === 0) return `${titulo}\n\nNenhum horário marcado ainda.`;
  const linhas = params.reservas.map(
    (r) =>
      `<b>${esc(r.time)}</b> ${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}` +
      (r.mensalista ? " · <i>mensalista</i>" : "") +
      (!params.deQuem && r.staffName ? ` · ${esc(r.staffName)}` : "")
  );
  const n = params.reservas.length;
  return [titulo, `${n} ${n === 1 ? "horário" : "horários"} · ${esc(params.loja)}`, "", ...linhas].join("\n");
}

export function textoDoFechamento(params: {
  loja: string;
  data: string;
  concluidos: number;
  faltas: number;
  emAberto: number;
  /** Soma dos pagamentos com a DATA DO ATENDIMENTO de hoje, já sem os estornos do dia. */
  recebido: number;
  /** Estornos lançados hoje — já descontados de `recebido`. */
  estornado?: number;
}): string {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  /* O rótulo diz o critério de verdade: `payments.date` é a data do
   * ATENDIMENTO, não a hora em que o dinheiro entrou na gaveta — "recebidos
   * no balcão" prometia uma conta que não era a feita. E o estorno do dia
   * sai do total, como no caixa. */
  const linhas = [
    `🌙 <b>Fechamento de hoje</b> · ${diaCurto(params.data)} · ${esc(params.loja)}`,
    "",
    `✂️ ${params.concluidos} ${params.concluidos === 1 ? "atendimento concluído" : "atendimentos concluídos"}`,
    `💰 ${brl(params.recebido)} pelos atendimentos de hoje` +
      (params.estornado ? ` (já descontados ${brl(params.estornado)} de estornos)` : ""),
  ];
  if (params.faltas) linhas.push(`🚫 ${params.faltas} ${params.faltas === 1 ? "falta" : "faltas"}`);
  if (params.emAberto) {
    linhas.push(
      "",
      `⚠️ ${params.emAberto} ${params.emAberto === 1 ? "horário ainda está" : "horários ainda estão"} em aberto — conclua no painel para o caixa fechar certo.`
    );
  }
  return linhas.join("\n");
}

/**
 * `enc:a:{bookingId}` — o callback_data tem no máximo 64 bytes, e a barbearia
 * não precisa ir junto: ela sai de quem tocou (o chat ligado a ela). Assim um
 * botão também não pode apontar para reserva de outra loja.
 */
export function dadoDoBotao(acao: "a" | "r", bookingId: string): string {
  return `enc:${acao}:${bookingId}`;
}

export function lerDadoDoBotao(dado: unknown): { aprovar: boolean; bookingId: string } | null {
  const m = /^enc:([ar]):([A-Za-z0-9_-]{1,57})$/.exec(String(dado ?? ""));
  return m ? { aprovar: m[1] === "a", bookingId: m[2] } : null;
}
