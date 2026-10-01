"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { RemarcarAtendimento } from "@/components/agenda/remarcar-atendimento";
import { useShopCollection } from "@/lib/db/use-collection";
import { mensagemDoErro } from "@/lib/direitos-do-titular";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, SubscriberDoc } from "@/lib/domain";

/**
 * As duas coisas que o dono pediu em 30/09 para o mensalista, sem sair da tela
 * de Mensalistas:
 *
 * 1. **Mexer numa semana só.** "Cliente de quinta precisa adiantar ou remarcar
 *    a da semana, e não tem como: faz um horário à mão e o fixo fica lá."
 *    Remarcar aqui é o MESMO `rescheduleBooking` da agenda: move a própria
 *    reserva da semana, e a rotina do horário fixo não recria aquela data
 *    (o id da ocorrência continua existindo). As outras semanas não mudam.
 *    "Apagar" tira só aquela semana (`apagarSemanaDoFixo`) — não é
 *    cancelamento: não conta em número nem relatório.
 *
 * 2. **Mudar o valor do mensal** de um cliente (`ajustarValorDoMensal`).
 */

const EM_ABERTO = ["confirmed", "confirmed_by_client", "pending_payment"];

export function ValorDoMensal({ assinatura, onClose }: { assinatura: Doc<SubscriberDoc>; onClose: () => void }) {
  const tenant = useTenant();
  const [texto, setTexto] = useState(String(assinatura.price ?? ""));
  const [naAberta, setNaAberta] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valor = Number(texto.replace(/\./g, "").replace(",", "."));
  const valido = Number.isFinite(valor) && valor > 0;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("ajustarValorDoMensal", {
        barbershopId: tenant.id,
        subscriptionId: assinatura.id,
        valor,
        aplicarNaFaturaAberta: naAberta,
      });
      onClose();
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Valor do mensal"
      description={`${assinatura.name} · ${assinatura.planName} · hoje ${formatBRL(Number(assinatura.price) || 0)}/mês`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={salvando}>
            Voltar
          </Button>
          <Button onClick={salvar} disabled={!valido || salvando}>
            {salvando ? "Salvando…" : "Salvar valor"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Novo valor por mês (R$)
          <input
            inputMode="decimal"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink"
          />
        </label>
        <label className="flex items-start gap-2 text-xs text-ink">
          <input type="checkbox" checked={naAberta} onChange={(e) => setNaAberta(e.target.checked)} className="mt-0.5" />
          <span>
            Aplicar também na mensalidade que já foi emitida e ainda não foi paga.
            <span className="block text-ink-muted">Mensalidade paga não muda.</span>
          </span>
        </label>
        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

export function SemanasDoMensalista({
  assinatura,
  onClose,
}: {
  assinatura: Doc<SubscriberDoc>;
  onClose: () => void;
}) {
  const tenant = useTenant();
  const hoje = toISODate(new Date());
  const { items, status } = useShopCollection<BookingDoc>("bookings", {
    equals: { horarioFixoId: assinatura.id },
  });
  const semanas = useMemo(
    () =>
      items
        .filter((b) => b.date >= hoje)
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [items, hoje]
  );

  const [aRemarcar, setARemarcar] = useState<Doc<BookingDoc> | null>(null);
  const [aPular, setAPular] = useState<Doc<BookingDoc> | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function pular() {
    if (!aPular) return;
    setTrabalhando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("apagarSemanaDoFixo", { barbershopId: tenant.id, bookingId: aPular.id });
      setAviso(`${formatDatePtBR(aPular.date)} apagado da agenda. Os próximos continuam fixos.`);
      setAPular(null);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setTrabalhando(false);
    }
  }

  return (
    <>
      <Modal
        open={!aRemarcar}
        onClose={onClose}
        title="Próximas semanas"
        description={`${assinatura.name} · remarque ou apague um agendamento sem mexer nos outros`}
      >
        <div className="flex flex-col gap-3">
          {aviso && (
            <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
              {aviso}
            </p>
          )}
          {status === "carregando" && <p className="text-sm text-ink-muted">Carregando…</p>}
          {status !== "carregando" && semanas.length === 0 && (
            <p className="text-sm text-ink-muted">Nenhuma semana reservada daqui para frente.</p>
          )}
          <ul className="flex flex-col divide-y divide-border/60">
            {semanas.map((b) => {
              const aberto = EM_ABERTO.includes(b.status);
              const de = (b as BookingDoc & { rescheduledFrom?: { date: string; time: string } }).rescheduledFrom;
              return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-ink">
                      {formatDatePtBR(b.date)} às {b.time}
                    </p>
                    {de && (
                      <p className="text-xs text-ink-muted">
                        remarcado de {formatDatePtBR(de.date)} às {de.time}
                      </p>
                    )}
                  </div>
                  {aberto ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setARemarcar(b)}>
                        Remarcar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAPular(b)}>
                        Apagar
                      </Button>
                    </div>
                  ) : (
                    <Pill tone="neutral">
                      {b.status === "removido"
                        ? "Apagada"
                        : b.status.startsWith("cancelled")
                        ? "Cancelada"
                        : b.status === "completed"
                          ? "Concluída"
                          : b.status === "no_show"
                            ? "Não veio"
                            : "Pendente"}
                    </Pill>
                  )}
                </li>
              );
            })}
          </ul>
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={!!aPular}
        onClose={() => setAPular(null)}
        title="Apagar este agendamento?"
        description={aPular ? `${formatDatePtBR(aPular.date)} às ${aPular.time} fica livre na agenda.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAPular(null)} disabled={trabalhando}>
              Voltar
            </Button>
            <Button onClick={pular} disabled={trabalhando}>
              {trabalhando ? "Apagando…" : "Apagar agendamento"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          Só este agendamento sai da agenda e não conta como cancelamento. Os próximos continuam fixos.
        </p>
      </Modal>

      {aRemarcar && (
        <RemarcarAtendimento
          booking={aRemarcar}
          aoFechar={() => setARemarcar(null)}
          aoRemarcar={(date, time) => {
            setAviso(`Remarcado para ${formatDatePtBR(date)} às ${time}. As outras semanas continuam fixas.`);
            setARemarcar(null);
          }}
        />
      )}
    </>
  );
}
