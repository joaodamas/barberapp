import * as logger from "firebase-functions/logger";

/**
 * O campo fixo que a política "Topete · alerta da plataforma" filtra
 * (`jsonPayload.alertaDaPlataforma=true`, ver `docs/MONITORAMENTO.md`).
 */
export const MARCADOR_ALERTA = "alertaDaPlataforma" as const;

/** Os campos estruturados do log de um alerta. Puro, testado. */
export function camposDoAlerta(tipo: string, resumo: Record<string, unknown>): Record<string, unknown> {
  return { [MARCADOR_ALERTA]: true, tipo, ...resumo };
}

/**
 * Registra no log, com severidade ERROR e o marcador estável, o que a rotina
 * também grava em `alertas_da_plataforma`. Sem isto a falha só existia no
 * Firestore, onde ninguém olha — e o e-mail nunca saía.
 */
export function logarAlertaDaPlataforma(tipo: string, mensagem: string, resumo: Record<string, unknown>): void {
  logger.error(mensagem, camposDoAlerta(tipo, resumo));
}
