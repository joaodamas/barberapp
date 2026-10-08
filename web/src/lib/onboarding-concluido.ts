/**
 * Quando mandar o dono para o onboarding — sem mandar de volta quem acabou.
 *
 * ## O defeito
 *
 * Ao concluir o último passo, `/comecar` fazia `window.location.href =
 * "/painel"` contando com a ficha nova. Mas a ficha que o painel recebe do
 * servidor é cacheada por 300 s (`tenant-server.ts`), e o `AuthGuard` decidia
 * `precisaOnboarding` com ela: o dono terminava o cadastro, via o painel
 * piscar e caía de novo no passo 1 — por até cinco minutos.
 *
 * ## A regra
 *
 * - ficha completa (a do servidor ou a ao vivo) → segue para o painel;
 * - ficha incompleta, mas a ao vivo ainda não chegou do servidor → espera
 *   (a do servidor pode ser a velha); vale também quando o dono acabou de
 *   concluir neste aparelho;
 * - o dono acabou de concluir e a ficha ao vivo não pôde ser confirmada
 *   (offline, sem escuta) → confia na conclusão: o servidor aceitou o último
 *   passo, que é o que `concluirPasso` esperou antes de navegar;
 * - a ficha ao vivo, confirmada pelo servidor, diz incompleta → onboarding.
 *
 * ## Por que não revalidar o cache no servidor
 *
 * A ficha vem de `fetch` com `next: { revalidate: 300 }`. Chamar
 * `revalidateTag` ao concluir limparia o cache só da instância que atendeu a
 * chamada — o backend do Firebase Hosting roda várias, cada uma com o próprio
 * cache — e abriria uma rota pública capaz de esvaziar o cache à vontade. A
 * decisão certa mora no cliente, que tem a ficha ao vivo.
 */

/**
 * Em que pé está a ficha ao vivo do `TenantLive`.
 *
 * `sem-escuta` é fora do painel (app do cliente): não há ficha ao vivo, e a
 * do servidor é tudo o que existe.
 */
export type EstadoDaFichaAoVivo = "sem-escuta" | "aguardando" | "confirmada" | "sem-confirmacao";

export function decidirOnboarding(params: {
  isOwner: boolean;
  /** O onboarding da ficha que a tela tem agora (servidor ou ao vivo). */
  completo: boolean;
  estadoDaFicha: EstadoDaFichaAoVivo;
  /** O dono concluiu o último passo neste aparelho há pouco. */
  concluidoAgora: boolean;
}): "seguir" | "esperar" | "onboarding" {
  if (!params.isOwner || params.completo) return "seguir";
  if (params.estadoDaFicha === "confirmada") return "onboarding";
  if (params.estadoDaFicha === "aguardando") return "esperar";
  return params.concluidoAgora ? "seguir" : "onboarding";
}

/** Folga maior que o cache de 300 s da ficha no servidor. */
const VALIDADE_MS = 15 * 60 * 1000;
const CHAVE = (barbershopId: string) => `topete-onboarding-concluido:${barbershopId}`;

/** Chamado por `/comecar` depois que o servidor aceitou o último passo. */
export function marcarOnboardingConcluido(barbershopId: string, agora = Date.now()) {
  try {
    localStorage.setItem(CHAVE(barbershopId), String(agora));
  } catch {
    /* modo privado: sem o marcador, o painel espera a ficha ao vivo */
  }
}

export function onboardingConcluidoAgora(barbershopId: string, agora = Date.now()): boolean {
  try {
    const quando = Number(localStorage.getItem(CHAVE(barbershopId)));
    return Number.isFinite(quando) && quando > 0 && agora - quando < VALIDADE_MS;
  } catch {
    return false;
  }
}
