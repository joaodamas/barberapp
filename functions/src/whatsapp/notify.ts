import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { loadWhatsappConfig, WHATSAPP_TOKEN } from "./config";
import { normalizarNumero, sendTemplate } from "./client";
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
 * O número da reserva é de quem reservou? (09/10)
 *
 * O WhatsApp da reserva é o que a pessoa DIGITOU, e a confirmação sai da conta
 * da barbearia para ele: com um número alheio, o app vira disparador de
 * mensagem para terceiros. Só se envia quando há algum motivo para crer que o
 * número é da pessoa:
 *
 * - a conta tem o telefone provado (`telefoneConfirmado`, que o SMS grava) E é
 *   este número;
 * - esse número já escreveu para a barbearia (`whatsapp_messages` recebida);
 * - a reserva é de balcão: quem digitou foi a própria barbearia, no cadastro
 *   dela, e não uma conta do app informando o número de alguém.
 */
export function numeroDaReservaConfere(params: {
  origem: unknown;
  numeroDaReserva: unknown;
  cliente: { whatsapp?: unknown; telefoneConfirmado?: unknown } | null;
  jaEscreveuParaALoja: boolean;
}): boolean {
  const numero = normalizarNumero(String(params.numeroDaReserva ?? ""));
  if (!numero) return false;
  if (params.origem === "balcao") return true;
  if (params.jaEscreveuParaALoja) return true;
  const doCadastro = normalizarNumero(String(params.cliente?.whatsapp ?? ""));
  return params.cliente?.telefoneConfirmado === true && doCadastro === numero;
}

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

    /* Pedido de encaixe (`fit_in_requested`, de volta em 27/09) não gera
     * mensagem aqui: ele ainda não é reserva, e "nova reserva" seria afirmar o
     * que o barbeiro não aprovou. Enquanto o WhatsApp automático não entra, o
     * próprio cliente avisa a barbearia pela tela, com a mensagem pronta. O
     * template `encaixe_solicitacao` segue no catálogo para quando entrar. */
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

    if (reserva.clientWhatsapp && (await numeroDoClienteConfere(db, barbershopId, reserva))) {
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

async function numeroDoClienteConfere(
  db: FirebaseFirestore.Firestore,
  barbershopId: string,
  reserva: FirebaseFirestore.DocumentData
): Promise<boolean> {
  const numero = normalizarNumero(String(reserva.clientWhatsapp ?? ""));
  if (!numero) return false;
  if (reserva.origin === "balcao") return true;

  const [cliente, recebida] = await Promise.all([
    reserva.clientId ? db.doc(`barbershops/${barbershopId}/clients/${reserva.clientId}`).get() : null,
    db.collection(`barbershops/${barbershopId}/whatsapp_messages`).where("de", "==", numero).limit(1).get(),
  ]);
  return numeroDaReservaConfere({
    origem: reserva.origin,
    numeroDaReserva: reserva.clientWhatsapp,
    cliente: cliente?.exists ? cliente.data() ?? null : null,
    jaEscreveuParaALoja: !recebida.empty,
  });
}
