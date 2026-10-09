"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MenuMais, type ItemDoMenu } from "@/components/ui/menu-mais";
import type { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import type { LiquidacaoDoAtendimento } from "@/lib/booking-status";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * As ações de UMA linha da agenda: uma primária à vista e o resto no "Mais".
 *
 * Eram três botões contornados do mesmo peso em toda linha (Concluir, Cancelar,
 * Remarcar) — e a ação que o dono faz dez vezes por dia se perdia no meio da
 * que ele faz uma por semana. Agora "Concluir" (ou "Veio depois") é o único
 * botão; o resto mora no menu, com os MESMOS handlers e as MESMAS condições de
 * antes — nenhuma regra mudou, só onde cada ação fica.
 *
 * Enquanto a conclusão/falta espera o prazo do "Desfazer", a linha mostra o
 * estado ("Concluindo…") no lugar das ações: não dá para agir sobre o que está
 * a caminho do servidor.
 */
export function AcoesDaLinha({
  booking,
  liquidacao,
  podeConcluir,
  atrasado,
  emAberto,
  podeEditar = true,
  comApagarSemana = false,
  atendimento,
}: {
  booking: Doc<BookingDoc>;
  liquidacao: LiquidacaoDoAtendimento;
  podeConcluir: boolean;
  atrasado: boolean;
  /** Ainda vai acontecer (confirmado): pode remarcar e cancelar. */
  emAberto: boolean;
  podeEditar?: boolean;
  /** Reserva do horário fixo: oferece "Apagar agendamento". */
  comApagarSemana?: boolean;
  atendimento: ReturnType<typeof useAcoesDoAtendimento>;
}) {
  const textoDeEnvio = atendimento.emEnvio.get(booking.id);
  if (textoDeEnvio) {
    return <span className="linha-muda text-[13px] text-ink-muted">{textoDeEnvio}</span>;
  }
  if (!podeEditar) return null;

  const itens: ItemDoMenu[] = [];
  /* Só depois da tolerância: oferecer "não veio" às 13:59 para um horário das
   * 14:00 é convidar o erro no gesto mais repetido do dia. */
  if (atrasado) {
    itens.push({ id: "falta", rotulo: "Não veio", atalho: "N", aoEscolher: () => atendimento.abrirFalta(booking) });
  }
  if (emAberto) {
    itens.push({ id: "remarcar", rotulo: "Remarcar", atalho: "R", aoEscolher: () => atendimento.abrirRemarcar(booking) });
    if (comApagarSemana) {
      itens.push({
        id: "apagar",
        rotulo: "Apagar agendamento",
        perigo: true,
        aoEscolher: () => atendimento.abrirApagarSemana(booking),
      });
    }
    /* Só enquanto está em aberto: cancelar depois de concluído mexeria em
     * dinheiro já materializado — para isso existe Devolver. */
    itens.push({ id: "cancelar", rotulo: "Cancelar", perigo: true, aoEscolher: () => atendimento.abrirCancelar(booking) });
  }
  if (booking.status === "completed") {
    /* Coberto pelo plano e cortesia não têm pagamento: o servidor recusa
     * corrigir ou devolver, e a tela não oferece o que o sistema não faz. */
    if (!liquidacao.coberto && !liquidacao.cortesia) {
      itens.push({ id: "cobranca", rotulo: "Editar cobrança", aoEscolher: () => atendimento.abrirCorrecao(booking) });
    }
    if (!liquidacao.cortesia) {
      itens.push({ id: "devolver", rotulo: "Devolver", aoEscolher: () => atendimento.abrirEstorno(booking) });
    }
  }

  const editada = booking.status === "completed" && (booking.edicoesDeCobranca?.length ?? 0) > 0;

  return (
    <div className="flex items-center justify-end gap-1">
      {editada && <span className="mr-1 text-[12.5px] text-ink-muted">editada</span>}
      {podeConcluir && (
        <Button size="sm" onClick={() => atendimento.abrirConcluir(booking)}>
          <Check size={14} strokeWidth={2} aria-hidden />
          {booking.status === "no_show" ? "Veio depois" : "Concluir"}
        </Button>
      )}
      <MenuMais
        rotulo={`Mais ações de ${booking.clientName}`}
        itens={itens}
        dica="↑ ↓ escolhe · Enter conclui · Esc limpa"
      />
    </div>
  );
}
