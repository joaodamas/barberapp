"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { LoadingRows } from "@/components/ui/empty-state";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import { useCadeira } from "@/components/barbeiro/area-do-barbeiro";
import { EtiquetaMensalista } from "@/components/agenda/etiqueta-mensalista";
import { mensalistaDoHorario } from "@/lib/mensalista-do-horario";
import { useAgendaDoBarbeiro, useServices } from "@/lib/db/use-shop-data";
import { useAcesso } from "@/lib/tenant-context";
import { atendimentoJaChegou, diaVizinho } from "@/lib/barbeiro";
import { liquidacaoDoAtendimento, metaDoStatus } from "@/lib/booking-status";
import { formatBRL, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";

const EM_ABERTO = ["pending_payment", "confirmed", "confirmed_by_client"];

/**
 * A agenda do barbeiro (05/10) — só a cadeira dele, um dia por vez.
 *
 * Concluir, "não veio" e responder encaixe passam pelos MESMOS fluxos da
 * agenda do dono (`useAcoesDoAtendimento`): mesma regra, mesmo modal, mesmo
 * gatilho financeiro. O que muda é o recorte — as regras do Firestore só deixam
 * ele ler e fechar o que é da cadeira dele.
 */
export default function AgendaDoBarbeiroPage() {
  const { staffId } = useCadeira();
  const { podeEditar } = useAcesso();
  const hoje = toISODate(new Date());
  const [dia, setDia] = useState(hoje);
  const [marcando, setMarcando] = useState(false);
  const { items, status, error } = useAgendaDoBarbeiro(staffId, dia, dia);
  const { items: servicos } = useServices();
  const atendimento = useAcoesDoAtendimento();
  /* Relógio da tela, como na Agenda do dono: decide o que já começou e pode
   * ser concluído (ou dado como falta). Montado no cliente para o servidor
   * não renderizar outra hora. */
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    const tique = () => setAgora(new Date());
    tique();
    const id = window.setInterval(tique, 60_000);
    return () => window.clearInterval(id);
  }, []);

  const linhas = useMemo(
    () =>
      items
        .filter((b) => b.date === dia)
        .slice()
        .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "")),
    [items, dia]
  );
  const nomeDosServicos = (ids: string[] = []) =>
    ids.map((id) => servicos.find((s) => s.id === id)?.name).filter(Boolean).join(" + ") || "Atendimento";

  const feitos = linhas.filter((b) => b.status === "completed").length;
  const pelaFrente = linhas.filter((b) => EM_ABERTO.includes(b.status)).length;
  const rotuloDoDia =
    dia === hoje
      ? "Hoje"
      : dia === diaVizinho(hoje, 1)
        ? "Amanhã"
        : dia === diaVizinho(hoje, -1)
          ? "Ontem"
          : new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" });
  const dataCurta = new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" aria-label="Dia anterior" className="min-h-11 px-2" onClick={() => setDia((d) => diaVizinho(d, -1))}>
            <ChevronLeft size={18} />
          </Button>
          <div className="min-w-32 text-center leading-tight">
            <p className="text-base font-semibold capitalize text-ink">{rotuloDoDia}</p>
            <p className="text-xs tabular-nums text-ink-muted">{dataCurta}</p>
          </div>
          <Button variant="ghost" aria-label="Próximo dia" className="min-h-11 px-2" onClick={() => setDia((d) => diaVizinho(d, 1))}>
            <ChevronRight size={18} />
          </Button>
          {dia !== hoje && (
            <Button variant="ghost" className="min-h-11 px-2 text-xs" onClick={() => setDia(hoje)}>
              Voltar para hoje
            </Button>
          )}
        </div>
        {podeEditar && (
          <Button onClick={() => setMarcando(true)}>
            <Plus size={16} /> Marcar cliente
          </Button>
        )}
      </div>

      {status === "pronto" && linhas.length > 0 && (
        <p className="text-sm text-ink-muted">
          {contar(linhas.length, "horário", "horários")} · {contar(feitos, "feito", "feitos")} · {pelaFrente} pela frente
        </p>
      )}

      {atendimento.avisos}

      {status === "carregando" && <LoadingRows rows={3} oQue="sua agenda" />}
      {status === "erro" && <ErroAoCarregar oQue="sua agenda" erro={error} />}
      {status === "pronto" && linhas.length === 0 && (
        <Card className="p-6 text-center">
          <p className="text-sm text-ink">Nada marcado {dia === hoje ? "hoje" : "neste dia"}.</p>
          <p className="mt-1 text-xs text-ink-muted">Quem marcar com você pelo link aparece aqui.</p>
        </Card>
      )}

      <ul className="flex flex-col gap-2">
        {linhas.map((b) => {
          const meta = metaDoStatus(b.status);
          /* Concluir e "não veio" só depois que o horário chegou (08/10): os
           * botões apareciam em qualquer dia, e concluir o corte da semana que
           * vem materializava pagamento e comissão de algo que não aconteceu.
           * A regra do Firestore recusa o mesmo para dia futuro. */
          const aberto = EM_ABERTO.includes(b.status) && atendimentoJaChegou(b, hoje, agora);
          const encaixe = b.status === "fit_in_requested";
          const liquidacao = b.status === "completed" ? liquidacaoDoAtendimento(b) : null;
          /* Quem tem plano não lê o preço cheio como "a cobrar": coberto pelo
           * plano não tem valor a cobrar, e o horário fixo ainda depende da
           * cota. A etiqueta vem do que está na reserva (`mensalista-do-horario`). */
          const plano = mensalistaDoHorario(b);
          const semValorACobrar = plano === "coberto" || (plano === "fixo" && EM_ABERTO.includes(b.status));
          return (
            <li key={b.id}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <p className="w-14 shrink-0 font-display text-lg tabular-nums text-gold-strong">{b.time}</p>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate font-medium text-ink">{b.clientName || "Cliente"}</p>
                      {plano && <EtiquetaMensalista />}
                    </div>
                    <p className="truncate text-sm text-ink-muted">{nomeDosServicos(b.serviceIds)}</p>
                    {liquidacao && (
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {liquidacao.label}
                        {liquidacao.detalheCurto ? ` · ${liquidacao.detalheCurto}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {semValorACobrar ? (
                      <p className="max-w-28 text-right text-xs text-ink-muted">
                        {plano === "coberto" ? "pago pelo plano" : "entra no plano, se tiver cota"}
                      </p>
                    ) : (
                      <p className="text-sm font-medium tabular-nums text-ink">{formatBRL(b.value)}</p>
                    )}
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </div>
                </div>
                {podeEditar && aberto && (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => atendimento.abrirConcluir(b)}>
                      <Check size={16} /> Concluir
                    </Button>
                    <Button variant="secondary" onClick={() => atendimento.abrirFalta(b)}>
                      <UserX size={16} /> Não veio
                    </Button>
                  </div>
                )}
                {podeEditar && encaixe && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      disabled={atendimento.respondendoEncaixe}
                      onClick={() => atendimento.responderEncaixe(b, true)}
                    >
                      Aprovar encaixe
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={atendimento.respondendoEncaixe}
                      onClick={() => atendimento.responderEncaixe(b, false)}
                    >
                      Recusar
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      {atendimento.modais}
      {marcando && (
        <MarcarNoBalcao open soBarbeiro={staffId} diaInicial={dia} onClose={() => setMarcando(false)} />
      )}
    </div>
  );
}
