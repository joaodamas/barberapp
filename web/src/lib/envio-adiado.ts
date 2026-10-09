/**
 * Envio adiado — o "Desfazer" que não mente.
 *
 * O produto NÃO tem caminho para reverter um atendimento concluído no servidor:
 * a conclusão materializa pagamento e comissão, e voltar atrás é outro assunto
 * (estorno). Um aviso "Concluído · Desfazer" que só escondesse o aviso seria
 * uma promessa falsa. O desfazer honesto é não ter enviado ainda: a linha muda
 * na hora, o aviso fica de pé por alguns segundos, e a gravação real só sai
 * quando o prazo acaba. Desfazer dentro do prazo cancela o envio, e nada nunca
 * chegou ao servidor.
 *
 * O preço dessa honestidade é o risco de PERDER a conclusão se o dono sair da
 * tela com o prazo correndo. Por isso `enviarTodos` existe e quem usa a fila o
 * liga a `visibilitychange`, `pagehide` e à saída da tela: sair não cancela,
 * antecipa.
 *
 * Puro de propósito (sem React, sem DOM, relógio injetável): a regra de quando
 * envia e quando não envia é a parte que não pode errar, e dentro de um
 * componente só se exerceria com um navegador de verdade.
 */

export type ResultadoDoEnvio = { ok: true } | { ok: false; erro: string };

export type ItemAdiado = {
  /** Identifica o alvo (id da reserva). Um item por id: reagendar substitui. */
  id: string;
  /** A gravação real — a MESMA função que o fluxo imediato chamaria. */
  enviar: () => Promise<ResultadoDoEnvio>;
};

export type FilaAdiada = {
  agendar: (item: ItemAdiado) => void;
  /** Cancela o envio. `true` se ainda deu tempo; `false` se já tinha saído. */
  desfazer: (id: string) => boolean;
  /** Envia tudo que está esperando, agora. Idempotente. */
  enviarTodos: () => void;
  /** Ids que ainda esperam o prazo (desfazer ainda é possível). */
  esperando: () => string[];
  /** Ids com a gravação em voo (já não dá para desfazer). */
  enviando: () => string[];
};

export function criarFilaAdiada(opcoes: {
  esperaMs: number;
  /** Depois de gravar, ou de o servidor recusar. */
  aoTerminar: (id: string, resultado: ResultadoDoEnvio) => void;
  /** Qualquer mudança nos conjuntos de espera/envio — para a tela reler. */
  aoMudar?: (estado: { esperando: string[]; enviando: string[] }) => void;
  /** Injetáveis para o teste; em produção são os do ambiente. */
  agendarTimer?: (fn: () => void, ms: number) => unknown;
  cancelarTimer?: (t: unknown) => void;
}): FilaAdiada {
  const agendarTimer = opcoes.agendarTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const cancelarTimer =
    opcoes.cancelarTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));

  const aguardando = new Map<string, { item: ItemAdiado; timer: unknown }>();
  const emVoo = new Set<string>();
  const estado = () => ({ esperando: [...aguardando.keys()], enviando: [...emVoo] });

  async function despachar(id: string) {
    const entrada = aguardando.get(id);
    if (!entrada) return;
    aguardando.delete(id);
    cancelarTimer(entrada.timer);
    emVoo.add(id);
    opcoes.aoMudar?.(estado());
    let resultado: ResultadoDoEnvio;
    try {
      resultado = await entrada.item.enviar();
    } catch (e) {
      /* `enviar` deveria devolver o resultado, mas um throw não pode virar
       * conclusão silenciosamente perdida: vira erro visível. */
      resultado = { ok: false, erro: e instanceof Error ? e.message : "Não foi possível salvar." };
    }
    emVoo.delete(id);
    opcoes.aoTerminar(id, resultado);
    opcoes.aoMudar?.(estado());
  }

  return {
    agendar(item) {
      /* Já saiu para o servidor: não há o que substituir. */
      if (emVoo.has(item.id)) return;
      const anterior = aguardando.get(item.id);
      if (anterior) cancelarTimer(anterior.timer);
      const timer = agendarTimer(() => void despachar(item.id), opcoes.esperaMs);
      aguardando.set(item.id, { item, timer });
      opcoes.aoMudar?.(estado());
    },
    desfazer(id) {
      const entrada = aguardando.get(id);
      if (!entrada) return false;
      cancelarTimer(entrada.timer);
      aguardando.delete(id);
      opcoes.aoMudar?.(estado());
      return true;
    },
    enviarTodos() {
      for (const id of [...aguardando.keys()]) void despachar(id);
    },
    esperando: () => [...aguardando.keys()],
    enviando: () => [...emVoo],
  };
}
