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
  FileText,
  Eraser,
  RotateCcw,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import { LiberacaoDaAgenda } from "@/components/agenda/liberacao-da-agenda";
import { useBookings, useStaff } from "@/lib/db/use-shop-data";
import { useAcesso, useTenant } from "@/lib/tenant-context";
import { liquidacaoDoAtendimento, metaDoStatus } from "@/lib/booking-status";
import { estaAtrasado } from "@/lib/action-center";
import { capacidadeDaData } from "@/lib/jornada";
import { EM_ABERTO, OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import { formatBRL, formatPhonePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { conflitosDoEncaixe, livresNoDia, recomendarEncaixe, type NivelDoEncaixe } from "@/lib/encaixe";
import { GradeDoDia, type LivreEscolhido } from "@/components/agenda/grade-do-dia";
import { FiltroDeBarbeiro, useFiltroDeBarbeiro } from "@/components/agenda/filtro-de-barbeiro";
import { reservasDoFiltro } from "@/lib/grade-por-barbeiro";
import { EtiquetaMensalista, useMensalistasAtivos } from "@/components/agenda/etiqueta-mensalista";
import { EtiquetaEncaixe } from "@/components/agenda/etiqueta-encaixe";
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
  const mensalistas = useMensalistasAtivos();
  const [marcando, setMarcando] = useState(false);
  /* O "Livre · marcar" de uma coluna abre o balcão já na hora e no barbeiro dela. */
  const [livreEscolhido, setLivreEscolhido] = useState<LivreEscolhido | null>(null);
  const { items: equipe } = useStaff();
  const [filtro, setFiltro] = useFiltroDeBarbeiro(equipe, "agenda");
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  /* Grade é o padrão (pedido de 28/09: ver livre, ocupado e encaixes lado a
   * lado). A lista continua para quem prefere rolar. */
  const [modo, setModo] = useState<"grade" | "lista">("grade");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  /* As ações de dentro da janela do atendimento: cada uma fecha a janela
   * antes de abrir o próprio diálogo (remarcar, cancelar, concluir…). */
  const atendimentoNaJanela: typeof atendimento = {
    ...atendimento,
    abrirConcluir: (b) => (setSelecionadoId(null), atendimento.abrirConcluir(b)),
    abrirFalta: (b) => (setSelecionadoId(null), atendimento.abrirFalta(b)),
    abrirCancelar: (b) => (setSelecionadoId(null), atendimento.abrirCancelar(b)),
    abrirCorrecao: (b) => (setSelecionadoId(null), atendimento.abrirCorrecao(b)),
    abrirEstorno: (b) => (setSelecionadoId(null), atendimento.abrirEstorno(b)),
    abrirRemarcar: (b) => (setSelecionadoId(null), atendimento.abrirRemarcar(b)),
    responderEncaixe: (b, aprovar, sugestoes) => {
      setSelecionadoId(null);
      atendimento.responderEncaixe(b, aprovar, sugestoes);
    },
  };

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

  /* `removido` (semana do fixo apagada) nunca aparece, nem com "mostrar
   * cancelados": não é horário encerrado, é horário que não existe. */
  const doDia = todas
    .filter((b) => b.date === dia && b.status !== "removido")
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const encerrados = (b: Doc<BookingDoc>) =>
    b.status.startsWith("cancelled") || b.status === "expired";
  /* O filtro por barbeiro vale para a lista e para a grade (a grade filtra por
   * dentro, `montarGrade`). A fila de pedidos de encaixe abaixo NÃO: é decisão
   * pendente, e esconder o pedido de outro barbeiro seria deixá-lo sem resposta. */
  const doDiaFiltrado = reservasDoFiltro(doDia, filtro);
  const visiveis = doDiaFiltrado.filter((b) => mostrarCancelados || !encerrados(b));
  const qtdEncerrados = doDiaFiltrado.filter(encerrados).length;

  /* Todos os pedidos de encaixe ainda respondíveis, de qualquer dia: é a fila
   * de decisões do barbeiro, e ela não pode depender do dia que ele está vendo. */
  const agoraHHmm = agora
    ? `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`
    : undefined;
  const pedidos = todas
    .filter(
      (b) =>
        b.status === "fit_in_requested" &&
        (agora === null || new Date(`${b.date}T${b.time}:00`).getTime() > agora.getTime())
    )
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const grade = tenant.schedule?.slotMinutes ?? 30;

  /* Tudo que o barbeiro precisa para decidir um encaixe: com quem bate, o que
   * o dia tem livre, e a sugestão pelo tempo dos serviços. */
  const analisar = (p: Doc<BookingDoc>) => {
    const conflitos = conflitosDoEncaixe(p, todas, grade);
    const livres = livresNoDia({
      schedule: tenant.schedule,
      date: p.date,
      staffId: p.staffId,
      duracao: p.durationMin || grade,
      todas,
      agora: p.date === hoje ? agoraHHmm : undefined,
    });
    return { conflitos, livres, sugestao: recomendarEncaixe({ pedido: p, conflitos, grade, livres }) };
  };

  /* Com mais de um barbeiro, o cartão diz de quem é o atendimento. */
  const variosBarbeiros = equipe.filter((b) => b.active !== false).length > 1;
  const nomeDoBarbeiro = (b: Doc<BookingDoc>) =>
    variosBarbeiros ? (equipe.find((s) => s.id === b.staffId)?.name ?? null) : null;

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
        <div className="flex shrink-0 items-center gap-2">
          {/* O mês do dia que está na tela: quem navegou até outubro quer o
              relatório de outubro. Aparece também no celular, e para quem só
              lê: imprimir não edita nada. */}
          <Link
            href={`/painel/agenda/relatorio?mes=${dia.slice(0, 7)}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-surface-raised px-4 text-sm text-ink transition-colors hover:border-gold/60"
          >
            <FileText size={16} />
            {/* No celular o título do dia já disputa a linha. */}
            <span className="sm:hidden">Relatório</span>
            <span className="hidden sm:inline">Relatório do mês</span>
          </Link>
          {podeEditar && (
            <Button onClick={() => setMarcando(true)} className="hidden md:inline-flex">
              <CalendarPlus size={16} />
              Marcar atendimento
            </Button>
          )}
        </div>
      </div>

      <LiberacaoDaAgenda />

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
                <span className="text-[11px] text-ink-muted">
                  {fechado
                    ? "fechado"
                    : n > 0
                      ? n
                      : tenant.policies.janela?.abertaAte && iso > tenant.policies.janela.abertaAte
                        ? "não lib."
                        : "–"}
                </span>
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

      {pedidos.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Pedidos de encaixe · {pedidos.length}
          </h2>
          {pedidos.map((p) => {
            const a = analisar(p);
            return (
              <PedidoDeEncaixe
                key={p.id}
                pedido={p}
                conflitos={a.conflitos}
                livres={a.livres}
                sugestao={a.sugestao}
                grade={grade}
                podeEditar={podeEditar}
                atendimento={atendimento}
                aoVerDia={() => {
                  escolher(p.date);
                  setModo("grade");
                  setSelecionadoId(p.id);
                }}
              />
            );
          })}
        </section>
      )}

      {status === "carregando" && <LoadingRows rows={4} oQue="sua agenda" />}
      {status === "erro" && <ErroAoCarregar oQue="sua agenda" erro={error} />}
      {status === "pronto" && (
        <div className="flex gap-1 self-start rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Como ver o dia">
          {(["grade", "lista"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={modo === m}
              onClick={() => setModo(m)}
              className={
                "min-h-9 rounded-lg px-3 text-xs font-medium " +
                (modo === m ? "bg-gold text-ink" : "text-ink-muted hover:bg-surface-raised")
              }
            >
              {m === "grade" ? "Grade do dia" : "Lista"}
            </button>
          ))}
        </div>
      )}

      {status === "pronto" && <FiltroDeBarbeiro equipe={equipe} valor={filtro} aoMudar={setFiltro} />}

      {status === "pronto" && modo === "grade" && (() => {
        const pedidosDoDia = pedidos.filter((p) => p.date === dia);
        const ativosDoDia = doDia.filter((b) => !encerrados(b) && b.status !== "fit_in_requested");
        const selecionado = doDia.find((b) => b.id === selecionadoId) ?? null;
        const grid = (
          <GradeDoDia
            dia={dia}
            reservas={ativosDoDia}
            pedidos={pedidosDoDia.map((p) => ({ booking: p, nivel: analisar(p).sugestao.nivel as NivelDoEncaixe }))}
            schedule={tenant.schedule}
            equipe={equipe}
            openWeekdays={tenant.policies.openWeekdays}
            filtro={filtro}
            selecionadoId={selecionadoId}
            aoSelecionar={(id) => setSelecionadoId((atual) => (atual === id ? null : id))}
            aoMarcarLivre={(livre) => {
              setLivreEscolhido(livre);
              setMarcando(true);
            }}
            podeEditar={podeEditar}
            mensalistas={mensalistas}
          />
        );
        return (
          <div className="flex flex-col gap-2">
            {abre(dia) || ativosDoDia.length > 0 || pedidosDoDia.length > 0 ? (
              grid
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="A barbearia não abre neste dia"
                description="Para abrir num dia especial, use Ajustes › Horários."
              />
            )}
            {/* Tocar na grade abre o atendimento numa janela (pedido do dono,
                28/09): antes o cartão aparecia lá embaixo, fora da vista. No
                celular o Modal vira gaveta. Qualquer ação fecha a janela antes
                de abrir a sua — dois diálogos empilhados brigariam pelo foco. */}
            <Modal
              open={!!selecionado}
              onClose={() => setSelecionadoId(null)}
              title={
                selecionado?.status === "fit_in_requested" ? "Pedido de encaixe" : "Atendimento"
              }
              className="sm:max-w-xl"
            >
              {selecionado &&
                (selecionado.status === "fit_in_requested" ? (
                  (() => {
                    const a = analisar(selecionado);
                    return (
                      <PedidoDeEncaixe
                        pedido={selecionado}
                        conflitos={a.conflitos}
                        livres={a.livres}
                        sugestao={a.sugestao}
                        grade={grade}
                        podeEditar={podeEditar}
                        atendimento={atendimentoNaJanela}
                      />
                    );
                  })()
                ) : (
                  <LinhaDaAgenda
                    mensalista={mensalistas.has(selecionado.clientId)}
                    barbeiro={nomeDoBarbeiro(selecionado)}
                    booking={selecionado}
                    hoje={hoje}
                    agora={agora}
                    toleranciaMin={tenant.policies.booking.lateToleranceMinutes}
                    gradeMin={grade}
                    podeEditar={podeEditar}
                    atendimento={atendimentoNaJanela}
                  />
                ))}
            </Modal>
          </div>
        );
      })()}

      {status === "pronto" && modo === "lista" && visiveis.length === 0 && (
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

      {status === "pronto" && modo === "lista" && visiveis.length > 0 && (
        <div className="flex flex-col gap-2">
          {visiveis.map((b) => (
            <LinhaDaAgenda
              key={b.id}
              mensalista={mensalistas.has(b.clientId)}
              barbeiro={nomeDoBarbeiro(b)}
              booking={b}
              hoje={hoje}
              agora={agora}
              toleranciaMin={tenant.policies.booking.lateToleranceMinutes}
              gradeMin={tenant.schedule?.slotMinutes ?? 30}
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
        key={marcando ? `${dia}|${livreEscolhido?.barbeiroId ?? ""}|${livreEscolhido?.hora ?? ""}` : "fechado"}
        open={marcando}
        onClose={() => {
          setMarcando(false);
          setLivreEscolhido(null);
        }}
        diaInicial={dia}
        barbeiroInicial={livreEscolhido?.barbeiroId ?? undefined}
        horaInicial={livreEscolhido?.hora}
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
  barbeiro = null,
  mensalista = false,
  booking: b,
  hoje,
  agora,
  toleranciaMin,
  gradeMin,
  podeEditar,
  atendimento,
}: {
  /** Nome do barbeiro, quando a barbearia tem mais de um. */
  barbeiro?: string | null;
  /** Cliente com plano ativo — etiqueta ao lado do nome. */
  mensalista?: boolean;
  booking: Doc<BookingDoc>;
  hoje: string;
  agora: Date | null;
  toleranciaMin: number;
  /** Reserva antiga sem `durationMin` ocupa a grade — a mesma regra da agenda. */
  gradeMin: number;
  podeEditar: boolean;
  atendimento: ReturnType<typeof useAcoesDoAtendimento>;
}) {
  const meta = metaDoStatus(b.status);
  const duracao = b.durationMin || gradeMin;
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
        (b.isFitIn && !pedido ? "border-l-4 border-l-encaixe " : "") +
        (atrasado ? "border-danger/40 " : "") +
        (encerrado ? "opacity-60" : "")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink md:text-base">
            {b.time} – {fimDoHorario(b.time, duracao)}
            {b.isFitIn && !pedido && <EtiquetaEncaixe className="ml-2 align-middle" />}
          </p>
          <p className="flex min-w-0 items-center gap-2 text-sm text-ink">
            <span className="truncate">{b.clientName}</span>
            {mensalista && <EtiquetaMensalista />}
          </p>
          <p className="text-xs text-ink-muted">
            {barbeiro && <span className="font-medium text-ink">{barbeiro} · </span>}
            {servicos || "Serviço"} · {duracao} min · {formatBRL(b.value ?? 0)}
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
          {emAberto && b.horarioFixoId && (
            <button
              type="button"
              onClick={() => atendimento.abrirApagarSemana(b)}
              className={botao + " hover:border-danger hover:text-danger"}
            >
              <Eraser size={14} /> Apagar agendamento
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
          {b.status === "completed" && (b.edicoesDeCobranca?.length ?? 0) > 0 && (
                <span className="text-xs text-ink-muted">Cobrança editada</span>
              )}
              {b.status === "completed" && !liquidacao.coberto && !liquidacao.cortesia && (
            <button
              type="button"
              onClick={() => atendimento.abrirCorrecao(b)}
              className={botao + " hover:border-gold hover:text-gold-strong"}
            >
              <CreditCard size={14} /> Editar cobrança
            </button>
          )}
          {b.status === "completed" && !liquidacao.cortesia && (
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

/**
 * Um pedido de encaixe com o que o barbeiro precisa para decidir: com quem ele
 * bate e o que o mesmo dia ainda tem livre (28/09 — "O horário já está
 * ocupado" sozinho não dizia se era um encaixe de 30 min dentro de um corte de
 * 90, ou 90 min por cima de três clientes).
 */
function PedidoDeEncaixe({
  pedido: p,
  conflitos,
  livres,
  sugestao,
  grade,
  podeEditar,
  atendimento,
  aoVerDia,
}: {
  pedido: Doc<BookingDoc>;
  conflitos: Doc<BookingDoc>[];
  livres: string[];
  sugestao: ReturnType<typeof recomendarEncaixe>;
  grade: number;
  podeEditar: boolean;
  atendimento: ReturnType<typeof useAcoesDoAtendimento>;
  /** Sem ele, o botão "Ver o dia" some — dentro da janela, o dia já está atrás. */
  aoVerDia?: () => void;
}) {
  const duracao = p.durationMin || grade;
  const servicos = ((p as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço";
  const digitos = String(p.clientWhatsapp ?? "").replace(/\D/g, "");
  const quando = new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
  const pesado = conflitos.length >= 2;

  return (
    <Card className="flex flex-col gap-3 border-gold/50 bg-gold/5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink md:text-base">{p.clientName} pede encaixe</p>
          <p className="text-sm text-ink first-letter:uppercase">
            {quando} · {p.time} – {fimDoHorario(p.time, duracao)}
          </p>
          <p className="text-xs text-ink-muted">
            {servicos} · {duracao} min · {formatBRL(p.value ?? 0)}
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
        </div>
        <Pill tone="gold">Encaixe pendente</Pill>
      </div>

      {/* A sugestão da plataforma, pelo tempo dos serviços. É sugestão: quem
          sabe se a luzes tem pausa em que dá para cortar outro é o barbeiro. */}
      <p
        className={
          "rounded-xl border px-3 py-2 text-xs " +
          (sugestao.nivel === "nao-recomendado"
            ? "border-danger/40 bg-danger/5 text-danger"
            : sugestao.nivel === "apertado"
              ? "border-gold/50 bg-gold/10 text-gold-strong"
              : "border-success/40 bg-success/5 text-success")
        }
      >
        <span className="font-semibold">
          {sugestao.nivel === "vagou"
            ? "Sugestão: pode aprovar."
            : sugestao.nivel === "cabe"
              ? "Sugestão: dá para encaixar."
              : sugestao.nivel === "apertado"
                ? "Sugestão: apertado."
                : "Sugestão: não recomendado."}
        </span>{" "}
        {sugestao.minutosSobrepostos > 0
          ? `Passa ${sugestao.minutosSobrepostos} min por cima do que já está marcado${
              conflitos.length > 1 ? `, com ${conflitos.length} clientes` : ""
            }.`
          : "Não sobrepõe ninguém."}
        {sugestao.nivel !== "vagou" && sugestao.alternativa && ` Melhor: ${sugestao.alternativa} está livre.`}
      </p>

      <div className="rounded-xl border border-border bg-surface px-3 py-2">
        <p className={"text-xs font-semibold " + (pesado ? "text-danger" : "text-ink")}>
          {conflitos.length === 0
            ? "O horário vagou — dá para aprovar sem sobrepor ninguém."
            : `Bate com ${contar(conflitos.length, "atendimento", "atendimentos")}`}
        </p>
        {conflitos.map((c) => (
          <p key={c.id} className="mt-0.5 text-xs text-ink-muted">
            {c.time} – {fimDoHorario(c.time, c.durationMin || grade)} · {c.clientName} ·{" "}
            {((c as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço"}
          </p>
        ))}
      </div>

      <p className="text-xs text-ink-muted">
        {livres.length > 0 ? (
          <>
            Livre nesse dia para {duracao} min:{" "}
            <span className="font-medium text-ink">{livres.slice(0, 6).join(", ")}</span>
            {livres.length > 6 && ` e mais ${livres.length - 6}`}. Ao recusar, a mensagem já oferece os
            primeiros.
          </>
        ) : (
          `Nenhum horário livre de ${duracao} min nesse dia.`
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <>
            <Button
              className="min-h-9 px-3 text-xs"
              disabled={atendimento.respondendoEncaixe}
              onClick={() => atendimento.responderEncaixe(p, true)}
            >
              Aprovar encaixe
            </Button>
            <Button
              variant="secondary"
              className="min-h-9 px-3 text-xs"
              disabled={atendimento.respondendoEncaixe}
              onClick={() => atendimento.responderEncaixe(p, false, livres)}
            >
              Recusar{livres.length > 0 ? " e oferecer horário" : ""}
            </Button>
          </>
        )}
        {aoVerDia && (
          <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={aoVerDia}>
            Ver o dia
          </Button>
        )}
      </div>
    </Card>
  );
}
