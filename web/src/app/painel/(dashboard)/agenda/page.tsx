"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CalendarPlus, FileText, Inbox, Lightbulb, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import { LiberacaoDaAgenda } from "@/components/agenda/liberacao-da-agenda";
import { useBookings, useStaff } from "@/lib/db/use-shop-data";
import { useAcesso, useTenant } from "@/lib/tenant-context";
import { liquidacaoDoAtendimento } from "@/lib/booking-status";
import { estaAtrasado, minutosDeAtraso } from "@/lib/action-center";
import { situacaoDoHorario } from "@/lib/situacao-do-horario";
import { Situacao } from "@/components/agenda/situacao";
import { AcoesDaLinha } from "@/components/agenda/acoes-da-linha";
import { useAtalhosDaAgenda } from "@/components/agenda/atalhos-da-agenda";
import { capacidadeDaData } from "@/lib/jornada";
import { EM_ABERTO, OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import { formatBRL, formatPhonePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { conflitosDoEncaixe, livresNoDia, recomendarEncaixe, type NivelDoEncaixe } from "@/lib/encaixe";
import { GradeDoDia, type LivreEscolhido } from "@/components/agenda/grade-do-dia";
import { FiltroDeBarbeiro, useFiltroDeBarbeiro } from "@/components/agenda/filtro-de-barbeiro";
import { reservasDoFiltro } from "@/lib/grade-por-barbeiro";
import { rotuloDosPedidos } from "@/lib/barra-da-agenda";
import { BarraFixa } from "@/components/agenda/barra-fixa";
import { SeletorDeDia } from "@/components/agenda/seletor-de-dia";
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
  /* A gaveta dos pedidos de encaixe (abre pelo contador da barra). */
  const [gaveta, setGaveta] = useState(false);
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

  /* Atalhos de teclado da LISTA (desktop). A grade abre o atendimento numa
   * janela e tem o próprio foco; aqui, cada atalho lê os mesmos fatos que o
   * botão da linha — o teclado nunca oferece o que o mouse não oferece. */
  const toleranciaMin = tenant.policies.booking.lateToleranceMinutes;
  const atalhos = useAtalhosDaAgenda({
    linhas: visiveis
      .filter((b) => b.status !== "fit_in_requested" && !encerrados(b))
      .map((b) => {
        const f = fatosDaLinha(b, hoje, agora, toleranciaMin);
        return { id: b.id, podeConcluir: f.podeConcluir, atrasado: f.atrasado, emAberto: f.emAberto };
      }),
    ativo: status === "pronto" && modo === "lista",
    aoConcluir: (id) => {
      const b = todas.find((x) => x.id === id);
      if (b && podeEditar) atendimento.abrirConcluir(b);
    },
    aoNaoVeio: (id) => {
      const b = todas.find((x) => x.id === id);
      if (b && podeEditar) atendimento.abrirFalta(b);
    },
    aoRemarcar: (id) => {
      const b = todas.find((x) => x.id === id);
      if (b && podeEditar) atendimento.abrirRemarcar(b);
    },
  });

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

  return (
    <div className="flex flex-col gap-4 pt-1 md:gap-5 md:pt-2">
      {/* O título é fixo ("Agenda"): a data por extenso mudava de comprimento
          conforme o dia e quebrava linha no celular, e a linha de cima da barra
          fixa não pode mudar de altura. O dia vive na navegação de data. */}
      <div className="flex h-11 items-center justify-between gap-3">
        <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink md:text-[28px]">
          Agenda
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {/* O mês do dia que está na tela: quem navegou até outubro quer o
              relatório de outubro. Aparece também no celular, e para quem só
              lê: imprimir não edita nada. */}
          <Link
            href={`/painel/agenda/relatorio?mes=${dia.slice(0, 7)}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-controle border border-border bg-surface-raised px-4 text-sm text-ink transition-colors duration-150 hover:border-gold/60"
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

      {/* A barra de ferramentas: colada no topo da área que rola e com altura que
          não depende de dado. Era aqui que a tela "pulava": os pedidos de encaixe,
          os avisos e a faixa da semana ficavam ACIMA dos chips e mudavam de
          altura ao vivo, e o clique no barbeiro caía no chip vizinho ("Todos").
          Agora tudo que varia mora ABAIXO dela. */}
      <BarraFixa className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="w-full sm:w-auto">
            <SeletorDeDia
              dia={dia}
              hoje={hoje}
              total={status === "pronto" ? contaDoDia(dia) : null}
              aoMudar={escolher}
            />
          </div>
          <div
            className="flex gap-0.5 rounded-controle border border-border bg-surface p-0.5"
            role="tablist"
            aria-label="Como ver o dia"
          >
            {(["grade", "lista"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={
                  "h-9 min-w-16 rounded-controle px-3 text-[13px] font-medium transition-colors duration-150 " +
                  (modo === m ? "bg-gold text-ink" : "text-ink-muted hover:bg-surface-raised")
                }
              >
                {m === "grade" ? "Grade" : "Lista"}
              </button>
            ))}
          </div>
          {/* Largura reservada: de 2 para 1 pedido, ou para nenhum, nada ao lado
              se mexe. Sem pedido o botão fica esmaecido (não há o que abrir). */}
          <button
            type="button"
            disabled={pedidos.length === 0}
            onClick={() => setGaveta(true)}
            className={
              "ml-auto inline-flex h-10 w-[12.5rem] shrink-0 items-center justify-center gap-2 rounded-controle border px-3 text-sm transition-colors duration-150 " +
              (pedidos.length > 0
                ? "cursor-pointer border-gold/60 bg-gold/10 font-medium text-gold-strong hover:bg-gold/20"
                : "border-border text-ink-muted opacity-60")
            }
          >
            <Inbox size={16} aria-hidden />
            {rotuloDosPedidos(pedidos.length)}
          </button>
        </div>
        <FiltroDeBarbeiro equipe={equipe} valor={filtro} aoMudar={setFiltro} />
      </BarraFixa>

      <LiberacaoDaAgenda />

      {atendimento.temAviso && <div className="flex flex-col">{atendimento.avisos}</div>}

      {/* Os pedidos de encaixe moram numa gaveta: antes eram cartões enormes no
          topo, e 2 virarem 1 durante o uso empurrava a tela inteira. Qualquer
          resposta fecha a gaveta — o aviso do resultado fica na vista. */}
      <Modal
        open={gaveta && pedidos.length > 0}
        onClose={() => setGaveta(false)}
        title={`Pedidos de encaixe · ${pedidos.length}`}
        className="sm:max-w-xl"
      >
        <div className="flex flex-col gap-3">
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
                atendimento={{
                  ...atendimento,
                  responderEncaixe: (b, aprovar, sugestoes) => {
                    setGaveta(false);
                    atendimento.responderEncaixe(b, aprovar, sugestoes);
                  },
                }}
                nomeDoBarbeiro={nomeDoBarbeiro(p)}
                aoVerDia={() => {
                  setGaveta(false);
                  escolher(p.date);
                  setModo("grade");
                  setSelecionadoId(p.id);
                }}
              />
            );
          })}
        </div>
      </Modal>

      {status === "carregando" && <LoadingRows rows={4} oQue="sua agenda" />}
      {status === "erro" && <ErroAoCarregar oQue="sua agenda" erro={error} />}

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
            emEnvio={atendimento.emEnvio}
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
              escolhida={atalhos.selecionadoId === b.id}
              aoEscolher={() => atalhos.selecionar(atalhos.selecionadoId === b.id ? null : b.id)}
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
 * Os fatos de uma linha, calculados num lugar só: a linha, o menu "Mais" e os
 * atalhos de teclado leem o mesmo resultado.
 *
 * Mesmas regras da tela Hoje: concluir só o que já chegou (concluir é dizer que
 * o corte aconteceu); "não veio" só depois da tolerância; cancelar e remarcar
 * só o que está em aberto.
 */
function fatosDaLinha(b: Doc<BookingDoc>, hoje: string, agora: Date | null, toleranciaMin: number) {
  const pedido = b.status === "fit_in_requested";
  const emAberto = EM_ABERTO.includes(b.status) && !pedido;
  const inicio = new Date(`${b.date}T${b.time}:00`);
  const jaChegou = b.date < hoje || (agora !== null && inicio.getTime() <= agora.getTime());
  const podeConcluir = (emAberto || b.status === "no_show") && jaChegou;
  const atrasado = !pedido && estaAtrasado({ booking: b, agora, toleranciaMin });
  return { pedido, emAberto, inicio, podeConcluir, atrasado };
}

/**
 * Um atendimento, com a ação principal à vista e o resto no "Mais".
 *
 * Corrigir e devolver só o concluído; cancelar, remarcar e apagar o fixo só o
 * que está em aberto — as condições moram em `AcoesDaLinha`, iguais às de
 * antes. A situação é texto com ponto, e o valor diz "no plano" quando o
 * cliente não paga aquele corte (em vez do preço de tabela, que ele não paga).
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
  escolhida = false,
  aoEscolher,
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
  /** Linha escolhida pelos atalhos de teclado (só na lista). */
  escolhida?: boolean;
  aoEscolher?: () => void;
}) {
  const duracao = b.durationMin || gradeMin;
  const liquidacao = liquidacaoDoAtendimento(b);
  const { pedido, emAberto, inicio, podeConcluir, atrasado } = fatosDaLinha(b, hoje, agora, toleranciaMin);
  const digitos = String(b.clientWhatsapp ?? "").replace(/\D/g, "");
  const servicos = ((b as { serviceNames?: string[] }).serviceNames ?? []).join(" + ");
  const encerrado = b.status.startsWith("cancelled") || b.status === "expired";
  const situacao = situacaoDoHorario({
    booking: b,
    atrasado,
    atrasoMin: agora ? minutosDeAtraso(b, agora) : null,
  });
  const noPlano = liquidacao.coberto || (emAberto && mensalista);

  return (
    <Card
      data-linha-id={b.id}
      onClick={
        aoEscolher
          ? (e) => {
              /* Clicar na linha a escolhe para os atalhos — mas não quando o
               * clique era num controle dela. */
              if ((e.target as HTMLElement).closest("button, a, input")) return;
              aoEscolher();
            }
          : undefined
      }
      className={
        "flex flex-col gap-2 py-3 transition-colors duration-150 " +
        (pedido ? "border-gold/50 bg-gold/5 " : "") +
        (b.isFitIn && !pedido ? "border-l-4 border-l-encaixe " : "") +
        (escolhida ? "border-gold-strong bg-surface-raised " : "") +
        (encerrado ? "opacity-60" : "")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold tabular-nums text-ink md:text-[15px]">
            {b.time} – {fimDoHorario(b.time, duracao)}
            {b.isFitIn && !pedido && <EtiquetaEncaixe className="ml-2 align-middle" />}
          </p>
          <p className="flex min-w-0 items-center gap-2 text-[14px] text-ink">
            <span className="truncate">{b.clientName}</span>
            {mensalista && <EtiquetaMensalista />}
          </p>
          <p className="text-[12.5px] text-ink-muted">
            {barbeiro && <span className="font-medium text-ink">{barbeiro} · </span>}
            {servicos || "Serviço"} · {duracao} min ·{" "}
            <span
              className="tabular-nums"
              title={noPlano && !liquidacao.coberto ? "Entra no plano se ainda houver cota no mês" : undefined}
            >
              {liquidacao.coberto ? "no plano" : noPlano ? "previsto no plano" : formatBRL(b.value ?? 0)}
            </span>
          </p>
          {digitos && (
            <a
              href={`https://wa.me/${digitos}`}
              target="_blank"
              rel="noopener noreferrer"
              className="alvo-toque text-[12.5px] text-ink-muted underline-offset-2 transition-colors duration-150 hover:text-gold-strong hover:underline"
            >
              {formatPhonePtBR(digitos)}
            </a>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {situacao && !atendimento.emEnvio.has(b.id) && <Situacao situacao={situacao} />}
          {podeEditar && !encerrado && (
            pedido ? (
              inicio.getTime() > (agora?.getTime() ?? 0) && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={atendimento.respondendoEncaixe}
                    onClick={() => atendimento.responderEncaixe(b, true)}
                  >
                    Aprovar encaixe
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={atendimento.respondendoEncaixe}
                    onClick={() => atendimento.responderEncaixe(b, false)}
                  >
                    Recusar
                  </Button>
                </div>
              )
            ) : (
              <AcoesDaLinha
                booking={b}
                liquidacao={liquidacao}
                podeConcluir={podeConcluir}
                atrasado={atrasado}
                emAberto={emAberto}
                comApagarSemana={!!b.horarioFixoId}
                atendimento={atendimento}
              />
            )
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Um pedido de encaixe com o que o barbeiro precisa para decidir: com quem ele
 * bate e o que o mesmo dia ainda tem livre (28/09 — "O horário já está
 * ocupado" sozinho não dizia se era um encaixe de 30 min dentro de um corte de
 * 90, ou 90 min por cima de três clientes).
 *
 * Formato compacto (a gaveta lista vários): a sugestão da plataforma é UMA
 * linha discreta com ícone — antes era uma caixa colorida que, no "não
 * recomendado", gritava em vermelho sobre um pedido que o barbeiro pode aprovar
 * mesmo assim. Os detalhes (quem bate, o que está livre) ficam à mão, sem
 * ocupar a tela.
 */
function PedidoDeEncaixe({
  pedido: p,
  conflitos,
  livres,
  sugestao,
  grade,
  podeEditar,
  atendimento,
  nomeDoBarbeiro = null,
  aoVerDia,
}: {
  pedido: Doc<BookingDoc>;
  conflitos: Doc<BookingDoc>[];
  livres: string[];
  sugestao: ReturnType<typeof recomendarEncaixe>;
  grade: number;
  podeEditar: boolean;
  atendimento: ReturnType<typeof useAcoesDoAtendimento>;
  /** Com mais de um barbeiro, de quem é o atendimento. */
  nomeDoBarbeiro?: string | null;
  /** Sem ele, o botão "Ver o dia" some — dentro da janela, o dia já está atrás. */
  aoVerDia?: () => void;
}) {
  const duracao = p.durationMin || grade;
  const servicos = ((p as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço";
  const digitos = String(p.clientWhatsapp ?? "").replace(/\D/g, "");
  const quando = new Date(`${p.date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const naoRecomendado = sugestao.nivel === "nao-recomendado" || sugestao.nivel === "apertado";
  const Icone = naoRecomendado ? AlertTriangle : Lightbulb;

  return (
    <Card className="flex flex-col gap-2 border-gold/40 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{p.clientName}</p>
          <p className="text-sm tabular-nums text-ink">
            <span className="first-letter:uppercase">{quando}</span> · {p.time} – {fimDoHorario(p.time, duracao)}
          </p>
          <p className="text-xs text-ink-muted">
            {nomeDoBarbeiro && <span className="font-medium text-ink">{nomeDoBarbeiro} · </span>}
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
        <Situacao situacao={{ tom: "alerta", texto: "Encaixe pendente" }} />
      </div>

      {/* A sugestão da plataforma, pelo tempo dos serviços. É sugestão: quem
          sabe se a luzes tem pausa em que dá para cortar outro é o barbeiro. */}
      <p className="flex items-start gap-2 text-[12.5px] text-ink-muted">
        <Icone
          size={14}
          aria-hidden
          className={"mt-0.5 shrink-0 " + (naoRecomendado ? "text-gold-strong" : "text-success")}
        />
        <span>
          <span className="font-medium text-ink">
            {sugestao.nivel === "vagou"
              ? "Pode aprovar."
              : sugestao.nivel === "cabe"
                ? "Dá para encaixar."
                : sugestao.nivel === "apertado"
                  ? "Apertado."
                  : "Não recomendado."}
          </span>{" "}
          {sugestao.minutosSobrepostos > 0
            ? `Passa ${sugestao.minutosSobrepostos} min por cima do que já está marcado${
                conflitos.length > 1 ? `, com ${conflitos.length} clientes` : ""
              }.`
            : "Não sobrepõe ninguém."}
          {sugestao.nivel !== "vagou" && sugestao.alternativa && ` Melhor: ${sugestao.alternativa} está livre.`}
        </span>
      </p>

      <details className="text-xs text-ink-muted">
        <summary className="cursor-pointer select-none py-1 hover:text-ink">
          {conflitos.length === 0
            ? "O horário vagou"
            : `Bate com ${contar(conflitos.length, "atendimento", "atendimentos")}`}
          {" · "}
          {livres.length > 0 ? `${contar(livres.length, "horário livre", "horários livres")} no dia` : "sem horário livre no dia"}
        </summary>
        <div className="flex flex-col gap-0.5 pb-1 pl-1">
          {conflitos.map((c) => (
            <p key={c.id}>
              {c.time} – {fimDoHorario(c.time, c.durationMin || grade)} · {c.clientName} ·{" "}
              {((c as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço"}
            </p>
          ))}
          <p>
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
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <>
            <Button
              size="sm"
              disabled={atendimento.respondendoEncaixe}
              onClick={() => atendimento.responderEncaixe(p, true)}
            >
              Aprovar
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={atendimento.respondendoEncaixe}
              onClick={() => atendimento.responderEncaixe(p, false, livres)}
            >
              Recusar{livres.length > 0 ? " e oferecer horário" : ""}
            </Button>
          </>
        )}
        {aoVerDia && (
          <Button variant="secondary" size="sm" onClick={aoVerDia}>
            Ver o dia
          </Button>
        )}
      </div>
    </Card>
  );
}
