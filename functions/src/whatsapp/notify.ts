import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { loadWhatsappConfig, WHATSAPP_TOKEN } from "./config";
import { sendTemplate } from "./client";
import {
  dataPorExtenso,
  formaPagamento,
  listaDeServicos,
  moeda,
  primeiroNome,
} from "./format";
import { getFirestore } from "firebase-admin/firestore";
import { localeDoDocumento } from "../locale";

/**
 * Reserva criada → avisa o dono e o cliente.
 *
 * Este é o gatilho que decide se o teste com uma barbearia de verdade é
 * possível. Sem ele, o dono precisa manter o painel aberto para descobrir que
 * alguém marcou — e uma reserva que ele não vê é um cliente esperando na porta.
 *
 * É um gatilho do Firestore, e não uma chamada no fim de `createBooking`, por
 * um motivo prático: o envio não pode fazer parte da transação que grava a
 * reserva. Se o WhatsApp demorar ou falhar, a reserva já está salva e o retry é
 * do gatilho, não do cliente tocando "confirmar" de novo.
 *
 * `dedupeKey` em todo envio: gatilho do Firestore é reexecutado, e mensagem
 * repetida faz o cliente bloquear o número.
 */
export const notifyBookingCreated = onDocumentCreated(
  {
    document: "barbershops/{barbershopId}/bookings/{bookingId}",
    secrets: [WHATSAPP_TOKEN],
  },
  async (event) => {
    const reserva = event.data?.data();
    if (!reserva) return;

    const { barbershopId, bookingId } = event.params;

    const config = await loadWhatsappConfig(barbershopId);
    // Barbearia sem WhatsApp configurado segue funcionando sem aviso nenhum.
    if (!config) return;

    const db = getFirestore();
    const shop = await db.doc(`barbershops/${barbershopId}`).get();
    const nomeBarbearia = shop.get("brand.name") ?? "sua barbearia";
    const endereco = shop.get("contact.address") ?? "";

    const localeDaLoja = localeDoDocumento(shop.data());
    const servicos = listaDeServicos(reserva.serviceNames ?? []);
    const data = dataPorExtenso(reserva.date, localeDaLoja);
    const valor = moeda(reserva.value, localeDaLoja);
    const pagamento = formaPagamento(reserva.paymentMethod);
    const nomeCliente = String(reserva.clientName ?? "Cliente");

    /* O ramo de encaixe saiu em 17/08, junto com o fluxo.
     *
     * Ele avisava o dono de um `fit_in_requested` que nenhum caminho do produto
     * criava mais — e `createBooking` agora recusa explicitamente. O template
     * `encaixe_solicitacao` continua no catálogo, porque tirá-lo exigiria
     * ressubmissão na Meta e ele não custa nada parado.
     *
     * Reserva antiga nesse estado não gera aviso: ela é anterior à decisão, e
     * mandar mensagem sobre um fluxo que não existe mais confunde mais que
     * calar. */
    if (reserva.status !== "confirmed") return;

    /* Dono primeiro. Se só uma das duas mensagens sair, que seja a que evita
     * cliente esperando na porta. */
    if (config.ownerWhatsapp) {
      await sendTemplate({
        barbershopId,
        config,
        to: config.ownerWhatsapp,
        template: "nova_reserva",
        refId: bookingId,
        dedupeKey: `nova_reserva_${bookingId}`,
        params: {
          nomeCliente,
          servicos,
          data,
          hora: reserva.time,
          valor,
          formaPagamento: pagamento,
        },
      });
    }

    if (reserva.clientWhatsapp) {
      await sendTemplate({
        barbershopId,
        config,
        to: reserva.clientWhatsapp,
        template: "confirmacao_reserva",
        refId: bookingId,
        dedupeKey: `confirmacao_reserva_${bookingId}`,
        params: {
          primeiroNome: primeiroNome(nomeCliente),
          nomeBarbearia,
          servicos,
          data,
          hora: reserva.time,
          valor,
          formaPagamento: pagamento,
          endereco,
        },
      });
    }
  }
);
