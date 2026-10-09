import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { avisoDaCriacao, remarcadaPeloCliente } from "../telegram/gatilhos";
import { diaCurto } from "../telegram/mensagens";
import { notificarEquipe } from "./push";

/**
 * Notificação do app nos mesmos momentos do Telegram — mesma régua
 * (`avisoDaCriacao`), para os dois canais nunca discordarem do que é aviso.
 * Texto puro: notificação não tem HTML.
 */

const DOC = "barbershops/{barbershopId}/bookings/{bookingId}";

export function textoDaNotificacao(
  tipo: "encaixe" | "novo" | "cancelamento",
  r: { clientName?: unknown; serviceNames?: unknown; date: string; time: string; staffName?: unknown }
): { titulo: string; corpo: string } {
  const servicos = Array.isArray(r.serviceNames) && r.serviceNames.length ? r.serviceNames.join(" + ") : "Serviço";
  const quando = `${diaCurto(r.date)} às ${r.time}${r.staffName ? ` · ${r.staffName}` : ""}`;
  const cliente = String(r.clientName ?? "Cliente");
  if (tipo === "encaixe") return { titulo: "🔔 Pedido de encaixe", corpo: `${cliente} · ${servicos}\n${quando} — toque para responder` };
  if (tipo === "cancelamento") return { titulo: "❌ Cliente cancelou", corpo: `${cliente} · ${quando}\nO horário ficou livre.` };
  return { titulo: "📅 Novo agendamento", corpo: `${cliente} · ${servicos}\n${quando}` };
}

export const pushAoCriarReserva = onDocumentCreated({ document: DOC, region: "southamerica-east1" }, async (event) => {
  const r = event.data?.data();
  if (!r) return;
  const tipo = avisoDaCriacao(r);
  if (!tipo) return;
  const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
  await notificarEquipe(
    shopRef,
    { ...textoDaNotificacao(tipo, r as never), tag: `reserva-${event.params.bookingId}` },
    r.staffId as string | undefined
  );
});

export const pushAoMudarReserva = onDocumentUpdated({ document: DOC, region: "southamerica-east1" }, async (event) => {
  const antes = event.data?.before.data();
  const depois = event.data?.after.data();
  if (!antes || !depois) return;
  if (remarcadaPeloCliente(antes, depois)) {
    const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
    const cliente = String(depois.clientName ?? "Cliente");
    await notificarEquipe(
      shopRef,
      {
        titulo: "🔄 Cliente remarcou",
        corpo: `${cliente}\nDe ${diaCurto(String(antes.date))} às ${antes.time} para ${diaCurto(String(depois.date))} às ${depois.time}${depois.staffName ? ` · ${depois.staffName}` : ""}`,
        tag: `reserva-${event.params.bookingId}`,
      },
      depois.staffId as string | undefined
    );
    return;
  }
  if (antes.status === depois.status || depois.status !== "cancelled_by_client") return;
  if (antes.status === "fit_in_requested") return;
  const shopRef = getFirestore().doc(`barbershops/${event.params.barbershopId}`);
  await notificarEquipe(
    shopRef,
    { ...textoDaNotificacao("cancelamento", depois as never), tag: `reserva-${event.params.bookingId}` },
    depois.staffId as string | undefined
  );
});
