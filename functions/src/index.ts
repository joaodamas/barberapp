/**
 * Ponto de entrada das Cloud Functions.
 *
 * `functions/package.json` aponta `main: lib/index.js`. Sem este arquivo o
 * `tsc` compilava só o catálogo de templates, `lib/index.js` nunca existia e
 * `firebase deploy --only functions` falhava ao carregar o módulo.
 *
 * Região: `southamerica-east1` (São Paulo) — a mesma que o cliente web usa em
 * `getAppFunctions()`. Divergir de região quebra a chamada silenciosamente.
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";

initializeApp();

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

export { provisionBarbershop, grantShopRole } from "./provisioning";
export {
  criarConviteDeBarbeiro,
  cancelarConviteDeBarbeiro,
  lerConviteDeBarbeiro,
  aceitarConviteDeBarbeiro,
  revogarAcessoDoBarbeiro,
  removerBarbeiro,
  sincronizarMeuAcessoDeBarbeiro,
} from "./convite-equipe";
export { planoDoAtendimento } from "./plano-do-atendimento";
export {
  signUpBarbershop,
  checkSlugAvailability,
  completeOnboardingStep,
} from "./signup";
export { creditLoyaltyOnCompletion, redeemLoyaltyReward } from "./loyalty";
export { materializeFinancialsOnCompletion } from "./financial-events";
export { changeInitialPassword } from "./account";
export { trocarCodigoDeEntrada } from "./entrada";
export { notifyBookingCreated } from "./whatsapp/notify";
export { whatsappWebhook } from "./whatsapp/webhook";
export {
  createBooking,
  createBookingAtCounter,
  cancelBooking,
  responderEncaixe,
  expirarEncaixes,
  rescheduleBooking,
} from "./booking";
export { registrarVendaDeProduto, registrarEntradaDeEstoque } from "./inventory";
export { registrarEstorno } from "./refunds";
export { corrigirPagamentoDeAtendimento } from "./correcao-de-pagamento";
export { comecarDoZero } from "./comecar-do-zero";
export { registrarMovimentoDeCaixa } from "./caixa";
export { conferirFinanceiroDaNoite } from "./conferencia-financeira";
export {
  criarMensalista,
  cancelarMensalista,
  ajustarValorDoMensal,
  gerarFaturasDoMes,
  registrarPagamentoDeMensalidade,
  dispensarMensalidade,
} from "./mensalistas";
export { vincularCadastroDeBalcao, vincularMinhaContaPeloTelefone } from "./vinculo-de-cadastro";
export { availableSlots } from "./availability";
export { apagarSemanaDoFixo, definirHorarioFixo, garantirHorariosFixos } from "./horario-fixo";
export { meusDestinos } from "./destinos";
export { revisarAssinaturas } from "./billing";
export { definirPlano } from "./subscription";
export {
  encerrarConta,
  reabrirConta,
  expurgarContasEncerradas,
} from "./data-deletion";
export {
  exportarDadosDoCliente,
  anonimizarCliente,
  excluirMinhaConta,
} from "./titular";
/* Integração com o JP Projects Hub — `docs/INTEGRACAO-HUB.md`. */
export { plataforma } from "./hub/plataforma";
export { enviarAvisoAoHub, reenviarAvisosAoHub } from "./hub/saida";
export { escolherPlano, pedirCancelamento } from "./hub/pedidos";
export { minhaAssinatura, segundaVia } from "./hub/cobrancas";
export { TEMPLATES } from "./whatsapp/templates";
export type {
  TemplateDef,
  TemplateCategory,
  ButtonAction,
  QuickReply,
} from "./whatsapp/templates";

/** Confirma que o deploy subiu e que a região está correta. */
export const healthcheck = onCall(() => ({
  ok: true,
  region: "southamerica-east1",
}));

/* `setOwnerRole` (dono GLOBAL, claim `role`) saiu em 08/10. Nenhum fluxo
 * emitia mais o claim, as regras nunca o honraram e a interface deixou de
 * lê-lo — mas quem o tivesse cunhava outros donos globais. O vínculo é por
 * barbearia (`grantShopRole`). A function publicada precisa ser apagada à mão
 * (`firebase functions:delete setOwnerRole`): o deploy não remove órfãs. */

export { criarConviteTelegram, desligarTelegram, ajustarAvisosTelegram } from "./telegram/convite";
export { telegramWebhook } from "./telegram/webhook";
export {
  telegramAoCriarReserva,
  telegramAoMudarReserva,
  telegramAgendaDoDia,
  telegramFechamentoDoDia,
} from "./telegram/gatilhos";
export { registrarPush, removerPush } from "./push/push";
export { pushAoCriarReserva, pushAoMudarReserva } from "./push/gatilhos";
export { adicionarServicosAoAtendimento } from "./servicos-extras";
export { editarCobrancaDoAtendimento } from "./edicao-de-cobranca";
