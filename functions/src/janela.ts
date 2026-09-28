/**
 * Até que data um CLIENTE pode marcar — a janela de agenda (pedido de 28/09).
 *
 * O barbeiro libera a agenda dos clientes avulsos por período: "aberta até
 * 13/10", e um botão empurra essa data de 15 em 15 dias. O mensalista, como
 * vantagem do plano, enxerga mais à frente — um número de dias que o barbeiro
 * define. Sem liberação configurada, vale o horizonte de sempre (60 dias), para
 * nenhuma barbearia ficar sem agenda no dia em que esta regra entrou.
 *
 * O balcão (dono e equipe) não passa por aqui: quem marca pelo painel marca
 * quando quiser. A MESMA regra existe em `web/src/lib/janela.ts`, para a tela
 * mostrar só os dias que o servidor vai aceitar — os testes dos dois lados
 * cobrem os mesmos casos.
 */
export type JanelaDaAgenda = {
  /** Última data (ISO) aberta para clientes avulsos. Ausente = horizonte padrão. */
  abertaAte?: string | null;
  /** Quantos dias à frente o mensalista marca. Ausente = horizonte padrão. */
  diasMensalista?: number | null;
};

export const HORIZONTE_PADRAO_DIAS = 60;
/** Teto de sanidade: ninguém libera agenda para daqui a dois anos. */
export const HORIZONTE_MAXIMO_DIAS = 365;

function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function limiteDoCliente(params: {
  hoje: string;
  janela?: JanelaDaAgenda | null;
  ehMensalista: boolean;
  horizontePadrao?: number;
}): string {
  const padrao = Number(params.horizontePadrao) || HORIZONTE_PADRAO_DIAS;
  const teto = somarDias(params.hoje, HORIZONTE_MAXIMO_DIAS);
  const janela = params.janela ?? {};

  if (params.ehMensalista) {
    const dias = Number(janela.diasMensalista);
    const limite = somarDias(params.hoje, Number.isFinite(dias) && dias > 0 ? dias : padrao);
    return limite < teto ? limite : teto;
  }

  const aberta = typeof janela.abertaAte === "string" && /^\d{4}-\d{2}-\d{2}$/.test(janela.abertaAte)
    ? janela.abertaAte
    : null;
  if (!aberta) return somarDias(params.hoje, padrao);
  return aberta < teto ? aberta : teto;
}

/**
 * O cliente é mensalista ATIVO desta barbearia? Decide a janela de agenda
 * dele (`janela.ts`). Uma igualdade só, filtrada em memória: índice composto
 * faltando derruba a criação de reserva em produção.
 */
export async function ehMensalistaAtivo(
  shopRef: FirebaseFirestore.DocumentReference,
  uid: string | undefined
): Promise<boolean> {
  if (!uid) return false;
  const assinaturas = await shopRef.collection("subscriptions").where("clientId", "==", uid).get();
  return assinaturas.docs.some((d) => d.get("status") === "ativo");
}
