/**
 * A trava que faz o modo leitura existir de verdade.
 *
 * `acessoDaBarbearia` decidia `podeEditar` com cuidado — trial vencido, conta
 * suspensa e conta encerrada caem em leitura — e **nenhuma tela consultava a
 * resposta**. Uma varredura por `podeEditar` encontrava dois usos: a definição,
 * e a barra que anuncia ao dono que ele "não consegue alterar". Ele conseguia:
 * concluía atendimento, editava serviço, mexia na equipe e salvava
 * configurações, com o aviso na tela dizendo o contrário.
 *
 * Por que a trava mora AQUI, e não em cada botão: são dez telas e dezenas de
 * pontos de escrita, e a garantia precisa ser de que nenhum escapou — inclusive
 * os que ainda não foram escritos. Todo caminho de escrita do painel passa por
 * `repository.ts`; fechar aqui fecha todos de uma vez, e uma tela nova nasce
 * travada sem ninguém precisar lembrar.
 *
 * Por que é estado de módulo: a alternativa seria cada chamada de escrita
 * receber o acesso por parâmetro, o que espalha a decisão de novo — que é
 * exatamente o defeito que isto corrige. O valor é escrito num lugar só
 * (`TenantLive`, no layout do painel) e lido num lugar só (as funções de
 * escrita abaixo).
 *
 * ⚠️ Isto é defesa de INTERFACE, e não substitui regra de segurança. As regras
 * do Firestore autorizam por `isOwnerOf` e não consultam `status` — por decisão
 * explícita, para não custar um `get()` por avaliação. Quem quiser escrever
 * fora do app continua conseguindo; o que esta trava garante é que **o produto
 * não contradiz o que promete ao dono**.
 */

export type MotivoDeLeitura = "trial_vencido" | "suspensa" | "cancelada";

const MENSAGEM: Record<MotivoDeLeitura, string> = {
  trial_vencido:
    "Seu teste terminou, então a conta está em modo leitura. Nada foi alterado — escolha um plano para voltar a editar.",
  suspensa:
    "Sua conta está suspensa, então ela está em modo leitura. Nada foi alterado — regularize para voltar a editar.",
  cancelada:
    "Esta conta foi encerrada e está em modo leitura. Nada foi alterado — seus dados seguem disponíveis para exportação.",
};

let travadoPor: MotivoDeLeitura | null = null;

/**
 * Liga ou desliga a trava. Chamado pelo layout do painel a cada mudança da
 * ficha da barbearia — inclusive quando ela chega ao vivo pelo `onSnapshot`,
 * que é o caso do trial que vence com o painel aberto.
 */
export function definirTravaDeEscrita(motivo: MotivoDeLeitura | null) {
  travadoPor = motivo;
}

/** Só para teste e diagnóstico. */
export function travaAtual() {
  return travadoPor;
}

/**
 * Lançado em vez de gravar.
 *
 * É um `Error` comum de propósito: as telas já tratam falha de escrita por
 * `soAvisaSeGravou`, que devolve a mensagem ao dono sem inventar caminho novo.
 * A mensagem é a que ele lê — daí ela dizer o que aconteceu e o que fazer, e
 * não "permissão negada".
 */
export class EscritaBloqueada extends Error {
  readonly motivo: MotivoDeLeitura;

  constructor(motivo: MotivoDeLeitura) {
    super(MENSAGEM[motivo]);
    this.name = "EscritaBloqueada";
    this.motivo = motivo;
  }
}

/**
 * Chamado no começo de toda escrita. Lança quando a conta está em leitura.
 *
 * Falha ANTES de tocar a rede, de propósito: o dono precisa ver que nada foi
 * enviado, e não uma escrita que sai e volta negada.
 */
export function conferirEscrita() {
  if (travadoPor) throw new EscritaBloqueada(travadoPor);
}
