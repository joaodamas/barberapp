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

export function textoDoEncaixeRespondido(
  r: ReservaResumo,
  loja: string,
  desfecho: "confirmed" | "cancelled_by_shop" | "expired" | "ja_respondido",
  quem: string
): string {
  const fim =
    desfecho === "confirmed"
      ? `✅ <b>Aprovado</b> por ${esc(quem)}. O cliente vê na hora.`
      : desfecho === "cancelled_by_shop"
        ? `✖️ <b>Recusado</b> por ${esc(quem)}.`
        : desfecho === "expired"
          ? "⌛ O horário já passou — o pedido expirou."
          : "ℹ️ Esse pedido já tinha sido respondido (ou o cliente cancelou).";
  return [`🔔 <b>Pedido de encaixe</b> · ${esc(loja)}`, `${esc(r.clientName ?? "Cliente")} · ${esc(servicos(r))}`, linhaDoHorario(r), "", fim].join(
    "\n"
  );
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
  recebido: number;
}): string {
  const brl = params.recebido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const linhas = [
    `🌙 <b>Fechamento de hoje</b> · ${diaCurto(params.data)} · ${esc(params.loja)}`,
    "",
    `✂️ ${params.concluidos} ${params.concluidos === 1 ? "atendimento concluído" : "atendimentos concluídos"}`,
    `💰 ${brl} recebidos no balcão`,
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
