"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useShopCollection } from "@/lib/db/use-collection";
import { useSubscribers } from "@/lib/db/use-shop-data";
import type { BookingDoc } from "@/lib/domain";
import { toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { contarPresos } from "@/lib/presos-do-barbeiro";

/**
 * Antes de desligar ou remover um barbeiro (09/10): quantos horários futuros e
 * quantos fixos de mensalista ele deixa para trás.
 *
 * Desligar não move ninguém: o horário que ele tinha continua na agenda dele, o
 * cliente que vai até a barbearia não é atendido, o fixo vira "semana sem
 * reserva" toda madrugada e remarcar recusa "barbeiro não está disponível" —
 * para quem não é o dono. Remover era um toque na lixeira, sem pergunta, e
 * ainda apaga o histórico de salário dele. Por isso a pergunta vem antes, com o
 * número, e diz o caminho: remarcar trocando o barbeiro.
 */

export type Acao = "desligar" | "remover";

export function ConfirmarSaidaDoBarbeiro({
  barbeiro,
  acao,
  trabalhando,
  erro,
  onConfirmar,
  onClose,
}: {
  /** O erro da gravação, dentro do modal (o da página fica atrás dele). */
  erro?: string | null;
  barbeiro: { id: string; name: string };
  acao: Acao;
  trabalhando: boolean;
  onConfirmar: () => void;
  onClose: () => void;
}) {
  const hoje = toISODate(new Date());
  /* Só as datas de hoje em diante, e o barbeiro filtrado em memória: filtrar
   * por barbeiro E data na consulta pediria um índice composto. */
  const { items: futuras, status } = useShopCollection<BookingDoc>("bookings", {
    range: { field: "date", from: hoje },
  });
  const { items: mensalistas } = useSubscribers();
  const { reservas, fixos } = contarPresos({
    staffId: barbeiro.id,
    hoje,
    reservas: futuras,
    fixos: mensalistas,
  });
  const nome = barbeiro.name || "o barbeiro";
  const remover = acao === "remover";

  return (
    <Modal
      open
      onClose={() => !trabalhando && onClose()}
      title={remover ? `Remover ${nome}?` : `Parar de atender com ${nome}?`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          {status === "carregando"
            ? "Conferindo a agenda dele…"
            : status === "erro"
              ? "Não deu para conferir a agenda dele agora."
              : reservas + fixos === 0
                ? "Ele não tem horário futuro nem horário fixo."
                : `${contar(reservas, "horário futuro marcado", "horários futuros marcados")} e ${contar(
                    fixos,
                    "mensalista com horário fixo",
                    "mensalistas com horário fixo"
                  )} com ele.`}
        </p>
        {reservas + fixos > 0 && (
          <p className="text-xs text-ink-muted">
            {remover ? "Remover" : "Desligar"} <strong>não passa esses horários para outro barbeiro</strong>: eles
            ficam na agenda dele. Antes, abra cada um em{" "}
            <Link href="/painel/agenda" className="underline underline-offset-2">
              Agenda
            </Link>
            , toque em <em>Remarcar</em> e escolha quem assume. O horário fixo se troca em Horário fixo dos
            mensalistas.
          </p>
        )}
        {remover && (
          <p className="text-xs text-danger">
            Remover apaga a ficha dele e desfaz o acesso dele ao painel. O salário dele sai da folha dos meses
            anteriores (o registro fica guardado). Os atendimentos e as comissões já feitos ficam. Para parar
            de atender sem mexer no histórico, desligue em vez de remover.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={trabalhando}>
            Voltar
          </Button>
          <Button onClick={onConfirmar} disabled={trabalhando}>
            {trabalhando ? "Aguarde…" : remover ? "Remover barbeiro" : "Parar de atender"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
