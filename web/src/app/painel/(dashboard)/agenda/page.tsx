"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  RotateCcw,
  UserX,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import { useBookings } from "@/lib/db/use-shop-data";
import { useAcesso, useTenant } from "@/lib/tenant-context";
import { liquidacaoDoAtendimento, metaDoStatus } from "@/lib/booking-status";
import { estaAtrasado } from "@/lib/action-center";
import { capacidadeDaData } from "@/lib/jornada";
import { EM_ABERTO, OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import { formatBRL, formatPhonePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import type { Doc } from "@/lib/db/repository";

/**
 * A agenda do dono, em tela própria (pedido de 28/09).
 *
 * A do Hoje é UM dia, espremida entre os números do caixa. Aqui cabem a semana
 * — para ver de relance quais dias estão cheios — e o dia inteiro com as ações
 * de cada atendimento: marcar, remarcar, cancelar, concluir, marcar falta,
 * responder encaixe. As ações e as janelas vêm de `useAcoesDoAtendimento`, o
 * MESMO hook da tela Hoje: uma regra, duas telas.
 */
export default function AgendaPage() {
  const tenant = useTenant();
  const { podeEditar } = useAcesso();
  const { items: todas, status, error } = useBookings();
  const atendimento = useAcoesDoAtendimento();
  const [marcando, setMarcando] = useState(false);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  const hoje = toISODate(new Date());
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  /* `null` é "hoje" e acompanha o relógio, como na tela Hoje. */
  const dia = diaEscolhido ?? hoje;
  const escolher = (iso: string) => setDiaEscolhido(iso === hoje ? null : iso);

  /* Relógio da tela: decide o que já passou (concluir) e o que atrasou
   * (não veio). Montado no cliente para o servidor não renderizar outra hora. */
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    const tique = () => setAgora(new Date());
    tique();
    const id = window.setInterval(tique, 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* Semana de segunda a domingo, a que contém o dia escolhido. */
  const semana = useMemo(() => {
    const base = new Date(`${dia}T12:00:00`);
    const segunda = new Date(base);
    segunda.setDate(base.getDate() - ((base.getDay() + 6) % 7));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(segunda);
      d.setDate(segunda.getDate() + i);
      return toISODate(d);
    });
  }, [dia]);

  const contaDoDia = (iso: string) =>
    todas.filter(
      (b) => b.date === iso && (OCCUPIES_SLOT.includes(b.status) || b.status === "fit_in_requested")
    ).length;
  const abre = (iso: string) =>
    capacidadeDaData({
      schedule: tenant.schedule,
      weekday: new Date(`${iso}T12:00:00`).getDay(),
      date: iso,
    }) > 0;

  const doDia = todas
    .filter((b) => b.date === dia)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const encerrados = (b: Doc<BookingDoc>) =>
    b.status.startsWith("cancelled") || b.status === "expired";
  const visiveis = doDia.filter((b) => mostrarCancelados || !encerrados(b));
  const qtdEncerrados = doDia.filter(encerrados).length;

  const moverSemana = (n: number) => {
    const d = new Date(`${dia}T12:00:00`);
    d.setDate(d.getDate() + 7 * n);
    escolher(toISODate(d));
  };

  const rotuloCurto = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const rotuloLongo = new Date(`${dia}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });

  return (
    <div className="flex flex-col gap-4 pt-1 md:gap-6 md:pt-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted md:text-base">Agenda</p>
          <h1 className="text-xl text-ink first-letter:uppercase md:text-4xl md:tracking-tight">
            {rotuloLongo}
          </h1>
        </div>
        {podeEditar && (
          <Button onClick={() => setMarcando(true)} className="hidden md:inline-flex">
            <CalendarPlus size={16} />
            Marcar atendimento
          </Button>
        )}
      </div>

      {/* A semana: um toque escolhe o dia; o número é quantos horários ele tem. */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Semana anterior"
          onClick={() => moverSemana(-1)}
          className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink md:w-10"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {semana.map((iso) => {
            const ativo = iso === dia;
            const fechado = !abre(iso);
            const n = contaDoDia(iso);
            return (
              <button
                key={iso}
                type="button"
                aria-pressed={ativo}
                aria-label={`${rotuloCurto(iso)} ${iso.slice(8)}: ${fechado ? "fechado" : contar(n, "horário", "horários")}`}
                onClick={() => escolher(iso)}
                className={
                  "flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-0.5 py-1.5 text-center transition-colors " +
                  (ativo
                    ? "border-gold bg-gold/10 text-ink"
                    : fechado
                      ? "border-border text-ink-muted/60"
                      : "border-border bg-surface text-ink")
                }
              >
                <span className="text-[11px] uppercase text-ink-muted">{rotuloCurto(iso)}</span>
                <span className={"text-base font-semibold " + (iso === hoje ? "text-gold-strong" : "")}>
                  {iso.slice(8)}
                </span>
                <span className="text-[11px] text-ink-muted">{fechado ? "fechado" : n > 0 ? n : "–"}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-label="Próxima semana"
          onClick={() => moverSemana(1)}
          className="flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:text-ink md:w-10"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      {dia !== hoje && (
        <button
          type="button"
          onClick={() => setDiaEscolhido(null)}
          className="-mt-2 self-start rounded-lg bg-gold/15 px-3 py-1.5 text-sm font-medium text-gold-strong"
        >
          Voltar para hoje
        </button>
      )}

      {atendimento.temAviso && <div className="flex flex-col">{atendimento.avisos}</div>}

      {status === "carregando" && <LoadingRows rows={4} oQue="sua agenda" />}
      {status === "erro" && <ErroAoCarregar oQue="sua agenda" erro={error} />}
      {status === "pronto" && visiveis.length === 0 && (
        <EmptyState
          icon={CalendarClock}
          title={abre(dia) ? "Nenhum horário marcado neste dia" : "A barbearia não abre neste dia"}
          description={
            abre(dia)
              ? "Marque quem ligou ou chegou no balcão, ou compartilhe seu link para receber agendamentos."
              : "Para abrir num dia especial, use Ajustes › Horários."
          }
          actionLabel={podeEditar && abre(dia) ? "Marcar atendimento" : undefined}
          onAction={podeEditar && abre(dia) ? () => setMarcando(true) : undefined}
        />
      )}

      {status === "pronto" && visiveis.length > 0 && (
        <div className="flex flex-col gap-2 md:max-w-3xl">
          {visiveis.map((b) => (
            <LinhaDaAgenda
              key={b.id}
              booking={b}
              hoje={hoje}
              agora={agora}
              toleranciaMin={tenant.policies.booking.lateToleranceMinutes}
              podeEditar={podeEditar}
              atendimento={atendimento}
            />
          ))}
        </div>
      )}

      {qtdEncerrados > 0 && (
        <button
          type="button"
          onClick={() => setMostrarCancelados((v) => !v)}
          className="self-start text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {mostrarCancelados
            ? "Esconder cancelados"
            : `Mostrar ${contar(qtdEncerrados, "cancelado ou expirado", "cancelados ou expirados")}`}
        </button>
      )}

      <MarcarNoBalcao
        key={marcando ? dia : "fechado"}
        open={marcando}
        onClose={() => setMarcando(false)}
        diaInicial={dia}
      />
      {atendimento.modais}
    </div>
  );
}

function fimDoHorario(time: string, minutos: number | undefined) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + (minutos ?? 0);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Um atendimento, com as ações que fazem sentido PARA ELE agora.
 *
 * Mesmas regras da tela Hoje: concluir só o que já chegou (concluir é dizer que
 * o corte aconteceu); "não veio" só depois da tolerância; cancelar e remarcar
 * só o que está em aberto; corrigir e devolver só o concluído.
 */
function LinhaDaAgenda({
  booking: b,
  hoje,
  agora,
  toleranciaMin,
  podeEditar,
  atendimento,
}: {
  booking: Doc<BookingDoc>;
  hoje: string;
  agora: Date | null;
  toleranciaMin: number;
  podeEditar: boolean;
  atendimento: ReturnType<typeof useAcoesDoAtendimento>;
}) {
  const meta = metaDoStatus(b.status);
  const liquidacao = liquidacaoDoAtendimento(b);
  const pedido = b.status === "fit_in_requested";
  const emAberto = EM_ABERTO.includes(b.status) && !pedido;
  const inicio = new Date(`${b.date}T${b.time}:00`);
  const jaChegou = b.date < hoje || (agora !== null && inicio.getTime() <= agora.getTime());
  const podeConcluir = (emAberto || b.status === "no_show") && jaChegou;
  const atrasado = !pedido && estaAtrasado({ booking: b, agora, toleranciaMin });
  const digitos = String(b.clientWhatsapp ?? "").replace(/\D/g, "");
  const servicos = ((b as { serviceNames?: string[] }).serviceNames ?? []).join(" + ");
  const encerrado = b.status.startsWith("cancelled") || b.status === "expired";

  const botao =
    "flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ink-muted transition-colors";

  return (
    <Card
      className={
        "flex flex-col gap-2 py-3 " +
        (pedido ? "border-gold/50 bg-gold/5 " : "") +
        (atrasado ? "border-danger/40 " : "") +
        (encerrado ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink md:text-base">
            {b.time} – {fimDoHorario(b.time, b.durationMin)}
            {b.isFitIn && !pedido && (
              <span className="ml-2 text-xs font-normal text-ink-muted">encaixe</span>
            )}
          </p>
          <p className="truncate text-sm text-ink">{b.clientName}</p>
          <p className="text-xs text-ink-muted">
            {servicos || "Serviço"} · {b.durationMin ?? "?"} min · {formatBRL(b.value ?? 0)}
          </p>
          {digitos && (
            <a
              href={`https://wa.me/${digitos}`}
              target="_blank"
              rel="noopener noreferrer"
              className="alvo-toque text-xs text-ink-muted underline-offset-2 hover:text-gold-strong hover:underline"
            >
              {formatPhonePtBR(digitos)}
            </a>
          )}
          {atrasado && (
            <p className="text-xs font-medium text-danger">Passou do horário — atendeu ou não veio?</p>
          )}
        </div>
        {pedido ? (
          <Pill tone="gold">Encaixe pendente</Pill>
        ) : (
          !emAberto && <Pill tone={meta.tone}>{meta.label}</Pill>
        )}
      </div>

      {podeEditar && !encerrado && (
        <div className="flex flex-wrap gap-2">
          {pedido && inicio.getTime() > (agora?.getTime() ?? 0) && (
            <>
              <Button
                className="min-h-9 px-3 text-xs"
                disabled={atendimento.respondendoEncaixe}
                onClick={() => atendimento.responderEncaixe(b, true)}
              >
                Aprovar encaixe
              </Button>
              <Button
                variant="secondary"
                className="min-h-9 px-3 text-xs"
                disabled={atendimento.respondendoEncaixe}
                onClick={() => atendimento.responderEncaixe(b, false)}
              >
                Recusar
              </Button>
            </>
          )}
          {podeConcluir && (
            <button
              type="button"
              onClick={() => atendimento.abrirConcluir(b)}
              className={botao + " hover:border-success hover:text-success"}
            >
              <Check size={14} />
              {b.status === "no_show" ? "Veio depois" : "Concluir"}
            </button>
          )}
          {atrasado && (
            <button
              type="button"
              onClick={() => atendimento.abrirFalta(b)}
              className={botao + " hover:border-danger hover:text-danger"}
            >
              <UserX size={14} /> Não veio
            </button>
          )}
          {emAberto && (
            <button
              type="button"
              onClick={() => atendimento.abrirRemarcar(b)}
              className={botao + " hover:border-gold hover:text-gold-strong"}
            >
              <CalendarClock size={14} /> Remarcar
            </button>
          )}
          {emAberto && (
            <button
              type="button"
              onClick={() => atendimento.abrirCancelar(b)}
              className={botao + " hover:border-danger hover:text-danger"}
            >
              <CalendarX size={14} /> Cancelar
            </button>
          )}
          {b.status === "completed" && !liquidacao.coberto && (
            <button
              type="button"
              onClick={() => atendimento.abrirCorrecao(b)}
              className={botao + " hover:border-gold hover:text-gold-strong"}
            >
              <CreditCard size={14} /> Corrigir pagamento
            </button>
          )}
          {b.status === "completed" && (
            <button
              type="button"
              onClick={() => atendimento.abrirEstorno(b)}
              className={botao + " hover:border-gold hover:text-gold-strong"}
            >
              <RotateCcw size={14} /> Devolver
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
