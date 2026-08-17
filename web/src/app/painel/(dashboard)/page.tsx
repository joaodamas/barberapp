"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarCheck,
  CalendarX,
  Check,
  ChevronRight,
  CreditCard,
  Landmark,
  Percent,
  Scissors,
  UserX,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { bookingStatusMeta } from "@/lib/booking-status";
import {
  avaliarOperacao,
  estaAtrasado,
  minutosDeAtraso,
  repartirParaExibicao,
  type ActionIntent,
  type ActionItem,
} from "@/lib/action-center";
import { usePayments } from "@/lib/db/use-shop-data";
import type { PaymentMethod } from "@/lib/types";
import { labelDoPagamento, PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import { formatBRL, formatPhonePtBR, safePct } from "@/lib/format";
import { refundAmountFor } from "@/lib/business-rules";
import { useTenant } from "@/lib/tenant-context";
import type { TenantPolicies } from "@/lib/tenant";
import { useBookings, useServices, useStaff } from "@/lib/db/use-shop-data";
import { patchDoc } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { capacidadeDiaria, caixaDoDia, mesPeriodo, previsaoDoDia } from "@/lib/analytics";
import { monthOf, OCCUPIES_SLOT } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { toISODate } from "@/lib/format";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

export default function PainelHojePage() {
  const tenant = useTenant();
  const { brand } = tenant;
  const { items: todas, status } = useBookings();
  const { items: services, status: statusServicos } = useServices();
  const payments = usePayments();
  const { items: equipe } = useStaff();

  const hoje = toISODate(new Date());
  const bookings = todas.filter((b) => b.date === hoje);

  const agora = useRelogio();
  const toleranciaAtrasoMin = tenant.policies.booking.lateToleranceMinutes;

  const getServicesByIds = (ids: string[]) =>
    ids.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Array<{ name: string }>;

  /* Capacidade é POR CADEIRA. Com três barbeiros são três agendas paralelas —
   * calcular como se fosse uma faz a tela mostrar "lotado" com duas cadeiras
   * vazias, e a taxa de ocupação sair três vezes maior que a real. */
  const barbeirosAtivos = Math.max(equipe.filter((b) => b.active !== false).length, 1);
  const totalSlots = capacidadeDiaria(tenant.schedule) * barbeirosAtivos;

  /* `localeCompare` em "HH:mm" ordena certo porque o formato é de largura fixa
   * e zero-padded — "09:00" < "10:00" < "12:00" como texto. */
  /* Sem filtro por status: a seção "Encaixes pendentes" saiu junto com o
   * encaixe, e um `fit_in_requested` antigo ficaria invisível — some da agenda
   * e não tem mais onde ser encontrado. Ele aparece na tabela como qualquer
   * outra reserva, com o rótulo que `bookingStatusMeta` já dá. */
  const bookingsDoDia = bookings
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));
  const agendados = bookings.filter((b) => OCCUPIES_SLOT.includes(b.status));

  const confirmedCount = agendados.length;
  const horariosLivres = Math.max(totalSlots - agendados.length, 0);
  const ocupacaoPct = Math.round(safePct(agendados.length, totalSlots));

  /* A previsão é sobre o que ainda pode virar receita — e a falta já
   * confirmada não pode. Ver `previsaoDoDia`: a cadeira continua ocupada
   * (`agendados`), o valor é que sai da conta. */
  const previsaoHoje = previsaoDoDia(bookings);

  /* "Precisa de você" derivado do estado real, não de uma lista fixa. */
  /* A decisão de o que exige atenção mora no motor (`lib/action-center.ts`),
   * não aqui. Antes era um array montado na tela com duas condicionais: cada
   * regra nova cresceria em JSX, e a operação passaria a ser interpretada de
   * um jeito em cada tela. */
  const itensDeAcao = avaliarOperacao({
    bookings,
    /* Sem filtrar por data: o que conta como "ficou para trás" é decisão de
     * operação, e ela mora no motor. A tela entrega tudo que conhece. */
    todasAsReservas: todas,
    hoje,
    services,
    statusServicos,
    payments: payments.items,
    fees: tenant.policies.paymentFees,
    periodo: mesPeriodo(monthOf(hoje)),
    agora,
    toleranciaAtrasoMin,
  });
  const { visiveis: acoesVisiveis, ocultos: acoesOcultas } =
    repartirParaExibicao(itensDeAcao);

  const semColunaLateral = itensDeAcao.length === 0;
  const [aFechar, setAFechar] = useState<Doc<BookingDoc> | null>(null);
  const [faltaDe, setFaltaDe] = useState<Doc<BookingDoc> | null>(null);
  const [aCancelar, setACancelar] = useState<Doc<BookingDoc> | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);
  /* Uma falha de gravação precisa aparecer ONDE a ação foi disparada. Antes ela
   * ia só para o console: o diálogo fechava, o dono entendia "pronto", e no
   * caso do encaixe o WhatsApp ainda saía confirmando o que não existia. */
  const [salvando, setSalvando] = useState(false);
  const [erroAoFechar, setErroAoFechar] = useState<string | null>(null);
  const [erroDaFalta, setErroDaFalta] = useState<string | null>(null);

  /* A conta que o dono vê antes de confirmar, com a política DESTA barbearia —
   * a mesma que `cancelBooking` vai aplicar do lado do servidor. Enquanto isto
   * lia a constante do módulo, a barbearia com política própria via na tela uma
   * devolução diferente da que era gravada. */
  const devolucao = aCancelar
    ? devolucaoDoCancelamento(aCancelar, tenant.policies.cancellation)
    : null;

  const caixaHoje = caixaDoDia(agendados);
  const recebidoReal = caixaHoje.total;

  /**
   * Concluir passa a perguntar COMO o cliente pagou.
   *
   * O cliente marca sem pagar — quem sabe se entrou Pix, dinheiro ou maquininha
   * é quem está no balcão. Sem essa informação, `payments.feePct` seria zero
   * para sempre e o lucro apareceria maior do que é.
   *
   * Método e status vão na MESMA escrita: o trigger financeiro lê o documento
   * depois da atualização, e gravar em duas etapas materializaria o pagamento
   * antes de o método existir.
   */
  async function concluirCom(metodo: PaymentMethod) {
    const booking = aFechar;
    if (!booking) return;
    setSalvando(true);
    setErroAoFechar(null);
    const r = await soAvisaSeGravou({
      gravar: () =>
        patchDoc(tenant.id, "bookings", booking.id, {
          status: "completed",
          paymentMethod: metodo,
        }),
      // Fechar o diálogo É o aviso: é assim que o dono lê "deu certo".
      avisar: () => setAFechar(null),
    });
    setSalvando(false);
    if (!r.ok) setErroAoFechar(r.erro);
  }

  /**
   * A falta é marcada por quem estava no balcão — nunca pelo sistema.
   *
   * Fechar o expediente convertendo em falta tudo que ficou em aberto seria
   * mais cômodo e estaria errado: o dono que atendeu, cobrou e esqueceu de
   * fechar ganharia uma falta falsa no histórico do cliente — que amanhã
   * alimenta régua de pagamento antecipado. O sistema aponta o que está em
   * aberto; quem viu a cadeira decide o que aconteceu.
   *
   * Não materializa dinheiro: `payments` e `commissions` nascem da conclusão,
   * e falta não é receita. O horário continua ocupado na agenda (`no_show`
   * está em `OCCUPIES_SLOT`), porque ele foi reservado e ninguém mais pôde
   * usá-lo — é exatamente o custo que a falta representa.
   */
  async function marcarFalta() {
    const booking = faltaDe;
    if (!booking) return;
    setSalvando(true);
    setErroDaFalta(null);
    const r = await soAvisaSeGravou({
      gravar: () => patchDoc(tenant.id, "bookings", booking.id, { status: "no_show" }),
      avisar: () => setFaltaDe(null),
    });
    setSalvando(false);
    if (!r.ok) setErroDaFalta(r.erro);
  }

  /**
   * Cancelamento pelo DONO — o caminho que faltava.
   *
   * `cancelBooking` existia desde sempre e só o app do cliente chamava. Na
   * operação real o cliente liga, manda mensagem ou avisa no balcão, e o dono
   * não tinha o que fazer: o horário ficava preso como confirmado, entrava na
   * previsão do dia e virava alerta de atraso de um cliente que já tinha
   * desmarcado.
   *
   * Vai pela Cloud Function, e não por `patchDoc` como as outras ações desta
   * tela, porque aqui há DINHEIRO. Quem calcula a devolução é o servidor, com a
   * política da barbearia; deixar a tela gravar `refundedAmount` poria a conta
   * do cliente na mão de quem tem o botão. A função já distingue os dois casos
   * e grava `cancelled_by_shop` quando quem cancela é o dono.
   */
  async function confirmarCancelamento() {
    const booking = aCancelar;
    if (!booking) return;
    setCancelando(true);
    setErroCancelar(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("cancelBooking", {
        barbershopId: tenant.id,
        bookingId: booking.id,
      });
      setACancelar(null);
      avisarCancelamento(booking);
    } catch (err) {
      console.error("[hoje] falha ao cancelar", err);
      setErroCancelar(
        (err as { message?: string })?.message ?? "Não foi possível cancelar agora."
      );
    } finally {
      setCancelando(false);
    }
  }

  /* Só depois de o cancelamento ter dado certo. Abrir a conversa antes faria o
   * dono avisar o cliente de algo que pode ter falhado na escrita. */
  function avisarCancelamento(booking: Doc<BookingDoc>) {
    const firstName = booking.clientName.split(" ")[0];
    const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");
    if (!digitos) return;
    const message = `Olá ${firstName}, seu horário das ${booking.time} de hoje foi cancelado. Qualquer coisa, é só chamar para remarcar. — ${brand.name}`;
    window.open(`https://wa.me/${digitos}?text=${encodeURIComponent(message)}`, "_blank");
  }

  /* A tela não decide nada: recebe a intenção que o motor declarou e sabe onde
   * ela acontece. `navegar` nem chega aqui — vira `Link` no próprio item. */
  function executarIntencao(intent: ActionIntent) {
    if (intent.kind === "navegar") return;
    /* Procura em TODAS, não só nas de hoje: o item de desfecho esquecido
     * aponta para uma reserva de outro dia, e buscá-la na lista do dia faria o
     * clique não fazer nada — silenciosamente. */
    const alvo = todas.find((b) => b.id === intent.bookingId);
    if (!alvo) return;
    if (intent.kind === "fecharAtendimento") setAFechar(alvo);
    else setFaltaDe(alvo);
  }

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_360px] md:items-start md:gap-x-10 md:gap-y-10 md:pt-2">
      <div className="md:col-span-2">
        <p className="text-sm text-ivory-muted md:text-base">Hoje</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-2 md:col-span-2 md:grid-cols-4 md:gap-4">
        <Card className="flex flex-col items-center gap-1 p-3 text-center md:flex-row md:justify-start md:gap-3 md:p-5">
          <Wallet size={16} className="mx-auto text-gold-light md:mx-0 md:h-9 md:w-9 md:shrink-0 md:rounded-xl md:bg-gold/10 md:p-2" />
          <div className="md:text-left">
            <p className="font-display text-sm font-semibold text-ivory md:text-2xl">
              {formatBRL(previsaoHoje)}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs md:uppercase md:tracking-wide">
              previsto hoje
            </p>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-3 text-center md:flex-row md:justify-start md:gap-3 md:p-5">
          <Scissors size={16} className="mx-auto text-gold-light md:mx-0 md:h-9 md:w-9 md:shrink-0 md:rounded-xl md:bg-gold/10 md:p-2" />
          <div className="md:text-left">
            <p className="font-display text-sm font-semibold text-ivory md:text-2xl">
              {confirmedCount}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs md:uppercase md:tracking-wide">
              atendimentos
            </p>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-3 text-center md:flex-row md:justify-start md:gap-3 md:p-5">
          <Percent size={16} className="mx-auto text-gold-light md:mx-0 md:h-9 md:w-9 md:shrink-0 md:rounded-xl md:bg-gold/10 md:p-2" />
          <div className="md:text-left">
            <p className="font-display text-sm font-semibold text-ivory md:text-2xl">
              {ocupacaoPct}%
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs md:uppercase md:tracking-wide">
              ocupação
            </p>
          </div>
        </Card>
        <Card className="flex flex-col items-center gap-1 p-3 text-center md:flex-row md:justify-start md:gap-3 md:p-5">
          <CalendarCheck size={16} className="mx-auto text-gold-light md:mx-0 md:h-9 md:w-9 md:shrink-0 md:rounded-xl md:bg-gold/10 md:p-2" />
          <div className="md:text-left">
            <p className="font-display text-sm font-semibold text-ivory md:text-2xl">
              {horariosLivres}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs md:uppercase md:tracking-wide">
              horários livres
            </p>
          </div>
        </Card>
      </div>

      <section className="md:col-span-2">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
          Previsão × recebido
        </h2>
        <Card className="flex flex-col gap-3 md:p-6">
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ivory-muted">Previsão do dia (agenda confirmada)</span>
            <span className="font-display font-semibold text-ivory md:text-lg">
              {formatBRL(previsaoHoje)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised">
            <div
              className="h-full rounded-full bg-success transition-[width] duration-300"
              style={{ width: `${safePct(recebidoReal, previsaoHoje)}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ivory-muted">Recebido até agora</span>
            <span className="font-display font-semibold text-success md:text-lg">
              {formatBRL(recebidoReal)}
            </span>
          </div>
          {/* A regra é UMA para todos os meios desde agosto: o dinheiro entra
              quando o atendimento é concluído. A legenda anterior descrevia o
              comportamento anterior — Pix e cartão contando na confirmação — e
              ensinava ao dono que ele já tinha recebido o que ainda não
              recebeu. Ver `isReceived` em `lib/domain.ts`. */}
          <p className="text-xs text-ivory-muted">
            O valor entra aqui quando você conclui o atendimento — em qualquer
            forma de pagamento. A previsão desconta faltas e cancelamentos.
          </p>
        </Card>
      </section>

      <section className="md:col-span-2">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
          Caixa de hoje
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0 md:flex-row md:divide-x md:divide-y-0">
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <Landmark size={16} className="shrink-0 text-gold-light" />
            <span className="flex-1 text-sm text-ivory-muted">Pix</span>
            <span className="font-display font-semibold text-ivory">
              {formatBRL(caixaHoje.pix)}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <CreditCard size={16} className="shrink-0 text-gold-light" />
            <span className="flex-1 text-sm text-ivory-muted">Cartão</span>
            <span className="font-display font-semibold text-ivory">
              {formatBRL(caixaHoje.cartao)}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <Wallet size={16} className="shrink-0 text-gold-light" />
            <span className="flex-1 text-sm text-ivory-muted">Dinheiro</span>
            <span className="font-display font-semibold text-ivory">
              {formatBRL(caixaHoje.dinheiro)}
            </span>
          </div>
        </Card>
      </section>

      {acoesVisiveis.length > 0 && (
        <section className="md:col-start-2 md:row-start-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Precisa de você
          </h2>
          <div className="flex flex-col gap-2 md:gap-3">
            {acoesVisiveis.map((item) => (
              <ItemDeAcao key={item.id} item={item} onExecutar={executarIntencao} />
            ))}
            {acoesOcultas.length > 0 && (
              <p className="px-1 text-xs text-ivory-muted">
                E mais {acoesOcultas.length} pendência(s) — resolva as de cima
                para ver as próximas.
              </p>
            )}
          </div>
        </section>
      )}

      {/* A coluna lateral de 360px só existe quando há algo nela — hoje, o
          "precisa de você". Vazia, ela deixava a agenda parando no meio da tela
          com um vão à direita, enquanto os blocos de cima iam até a borda. Sem
          nada ao lado, a agenda ocupa a largura inteira: é a tabela com mais
          colunas do painel, e é onde a largura faz diferença. */}
      <section
        className={
          semColunaLateral
            ? "md:col-span-2"
            : "md:col-start-1 md:row-start-4 md:row-span-2"
        }
      >
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
          Agenda do dia
        </h2>
        {status === "carregando" && <LoadingRows rows={3} />}
        {status === "pronto" && bookings.length === 0 && (
          <EmptyState
            icon={CalendarCheck}
            title="Nenhum horário marcado para hoje"
            description="Compartilhe seu link com os clientes para começar a receber agendamentos."
            actionLabel="Ver meu link"
            actionHref="/comecar"
          />
        )}
        {/* Ordenado por HORA.
         *
         * A lista vinha na ordem da coleção — que é por data decrescente, e
         * dentro do mesmo dia, arbitrária. Na tela isso aparecia como
         * "09:00, 10:00, 12:00, 11:00": a agenda do dia fora de ordem, que é
         * justamente a informação que o dono lê primeiro de manhã. */}
        {bookingsDoDia.length > 0 && (
          <Card className="table-scroll overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
                  <th className="px-4 py-3 font-medium md:px-6">Hora</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Telefone</th>
                  <th className="px-4 py-3 font-medium">Serviço</th>
                  <th className="px-4 py-3 font-medium">Pagamento</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium md:px-6">Situação</th>
                </tr>
              </thead>
              <tbody>
                {bookingsDoDia.map((booking) => {
                  const statusMeta = bookingStatusMeta[booking.status];
                  const bookingServices = getServicesByIds(booking.serviceIds);
                  const emAberto =
                    booking.status === "confirmed" ||
                    booking.status === "confirmed_by_client";
                  /* A falta não é beco sem saída: cliente que aparece 40 min
                   * depois volta a ser atendimento pelo mesmo caminho. Sem
                   * isso, um toque errado no "Não veio" viraria receita perdida
                   * no relatório, e a única correção seria mexer no banco. */
                  const podeConcluir = emAberto || booking.status === "no_show";
                  /* Quem responde "isto está atrasado?" é o motor — a tela só
                   * pergunta. Comparar minuto com tolerância aqui daria duas
                   * verdades: a coluna lateral acusando o atraso e a linha ao
                   * lado sem oferecer a ação. */
                  const atrasado = estaAtrasado({
                    booking,
                    agora,
                    toleranciaMin: toleranciaAtrasoMin,
                  });
                  const atrasoMin = agora ? minutosDeAtraso(booking, agora) : null;
                  const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");

                  return (
                    <tr
                      key={booking.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-display text-gold-light md:px-6">
                        {booking.time}
                        {atrasado && (
                          <span className="block font-sans text-[11px] text-danger">
                            {atrasoMin} min atrasado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ivory">
                        {booking.clientName}
                        {booking.isFitIn && (
                          <span className="ml-2 text-xs text-ivory-muted">encaixe</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {digitos ? (
                          /* Toque no telefone abre a conversa. É o que o dono faz
                           * hoje quando o cliente atrasa — e fazia saindo do app. */
                          <a
                            href={`https://wa.me/${digitos}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-ivory-muted underline-offset-2 transition-colors hover:text-gold-light hover:underline"
                          >
                            {formatPhonePtBR(digitos)}
                          </a>
                        ) : (
                          <span className="text-ivory-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ivory-muted">
                        {bookingServices.map((s) => s.name).join(" + ")}
                      </td>
                      <td className="px-4 py-3 text-ivory-muted">
                        {labelDoPagamento(booking.paymentOrigin, booking.paymentMethod)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-ivory">
                        {formatBRL(booking.value)}
                      </td>
                      <td className="px-4 py-3 md:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          {!emAberto && (
                            <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
                          )}
                          {podeConcluir && (
                            <button
                              onClick={() => {
                                setErroAoFechar(null);
                                setAFechar(booking);
                              }}
                              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ivory-muted transition-colors hover:border-success hover:text-success"
                            >
                              <Check size={14} />
                              {booking.status === "no_show" ? "Veio depois" : "Concluir"}
                            </button>
                          )}
                          {/* Só depois da tolerância. Oferecer "não veio" às
                              13:59 para um horário das 14:00 é convidar o erro
                              no gesto mais repetido do dia. */}
                          {atrasado && (
                            <button
                              onClick={() => {
                                setErroDaFalta(null);
                                setFaltaDe(booking);
                              }}
                              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ivory-muted transition-colors hover:border-danger hover:text-danger"
                            >
                              <UserX size={14} /> Não veio
                            </button>
                          )}
                          {/* Só enquanto está em aberto. Cancelar depois de
                              concluído mexeria em dinheiro já materializado, e
                              desfazer a conclusão é outro caminho. */}
                          {emAberto && (
                            <button
                              onClick={() => {
                                setErroCancelar(null);
                                setACancelar(booking);
                              }}
                              className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ivory-muted transition-colors hover:border-danger hover:text-danger"
                            >
                              <CalendarX size={14} /> Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* Uma pergunta, quatro opções, e cada opção JÁ conclui.
          Um botão "Confirmar" separado somaria um segundo clique ao gesto mais
          repetido do dia — o fechamento precisa custar um toque, senão o dono
          volta para o caderno. */}
      <Modal
        open={!!aFechar}
        onClose={() => setAFechar(null)}
        title="Como o cliente pagou?"
      >
        <p className="mb-4 text-sm text-ivory-muted">
          {aFechar?.clientName} · {aFechar ? formatBRL(aFechar.value) : ""}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PAYMENT_METHODS.map((metodo) => (
            <button
              key={metodo}
              type="button"
              disabled={salvando}
              onClick={() => void concluirCom(metodo)}
              className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-medium text-ivory transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light"
            >
              {paymentMethodLabel[metodo]}
            </button>
          ))}
        </div>
        {erroAoFechar && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {erroAoFechar}
          </p>
        )}
        <p className="mt-4 text-xs text-ivory-muted">
          A taxa da maquininha é registrada com o valor de hoje e não muda
          depois. Ajuste em Configurações.
        </p>
      </Modal>

      {/* Falta pede confirmação; concluir não.
          Não é simetria perdida — concluir é o desfecho esperado e acontece
          dezenas de vezes por dia, enquanto a falta entra no histórico do
          cliente e é a única das duas que alguém pode acionar sem querer, a
          partir de um item da coluna lateral. */}
      <Modal
        open={!!faltaDe}
        onClose={() => setFaltaDe(null)}
        title="Marcar falta?"
      >
        <p className="mb-3 text-sm text-ivory">
          {faltaDe?.clientName} · {faltaDe?.time} ·{" "}
          {faltaDe ? formatBRL(faltaDe.value) : ""}
        </p>
        <p className="mb-5 text-sm text-ivory-muted">
          O valor não entra como receita do dia, e o horário continua ocupado na
          agenda — foi reservado e ninguém mais pôde usá-lo. Se ele aparecer
          depois, é só concluir o atendimento normalmente.
        </p>
        {erroDaFalta && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {erroDaFalta}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={salvando} onClick={() => void marcarFalta()}>
            {salvando ? "Salvando…" : "Confirmar falta"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={salvando}
            onClick={() => setFaltaDe(null)}
          >
            Cancelar
          </Button>
        </div>
      </Modal>

      {/* O único diálogo desta tela que mexe em dinheiro do cliente, e por isso
          o único que mostra a conta ANTES de gravar. O valor exibido sai da
          política DESTA barbearia — a mesma que o servidor vai aplicar. */}
      <Modal
        open={!!aCancelar}
        onClose={() => !cancelando && setACancelar(null)}
        title="Cancelar este horário?"
      >
        <p className="mb-3 text-sm text-ivory">
          {aCancelar?.clientName} · {aCancelar?.time} ·{" "}
          {aCancelar ? formatBRL(aCancelar.value) : ""}
        </p>
        <p className="mb-2 text-sm text-ivory-muted">{devolucao?.label}</p>
        <p className="mb-5 text-sm text-ivory-muted">
          O horário volta a ficar livre na agenda e sai da previsão do dia. O
          cliente é avisado pelo WhatsApp em seguida.
        </p>
        {erroCancelar && (
          <p className="mb-4 text-sm text-danger" role="alert">
            {erroCancelar}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={cancelando}
            onClick={() => void confirmarCancelamento()}
          >
            {cancelando ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={cancelando}
            onClick={() => setACancelar(null)}
          >
            Voltar
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Quanto volta para o cliente se o dono cancelar agora, e a frase que explica.
 *
 * A política é passada de fora, e não lida da constante do módulo, porque quem
 * decide é `shop.policies.cancellation` no servidor. As duas contas precisam
 * dar o mesmo número: prometer na tela uma devolução que o servidor não grava
 * é um erro que aparece no bolso do cliente, e em log nenhum.
 *
 * A hora é a do navegador. O dono está no balcão da barbearia, no fuso dela —
 * e a decisão de qual fuso vale já é do servidor, que recalcula tudo com
 * `tenant.locale.timeZone` antes de gravar. Aqui é previsão, não escrita.
 */
function devolucaoDoCancelamento(
  booking: Doc<BookingDoc>,
  policy: TenantPolicies["cancellation"]
) {
  const inicio = new Date(`${booking.date}T${booking.time}:00`);
  const horas = (inicio.getTime() - Date.now()) / 3_600_000;
  const refund = refundAmountFor({
    value: booking.value,
    paymentMethod: booking.paymentMethod,
    hoursUntilStart: horas,
    policy,
  });

  const label =
    refund.tier === "sem_pagamento"
      ? "O cliente ainda não pagou — não há valor a devolver."
      : refund.tier === "integral"
        ? `Faltam mais de ${policy.fullRefundHours}h: devolução integral de ${formatBRL(refund.amount)}.`
        : refund.tier === "parcial"
          ? `Faltam menos de ${policy.fullRefundHours}h: retém ${refund.retainedPct}% de taxa e devolve ${formatBRL(refund.amount)}.`
          : `Faltam menos de ${policy.partialRefundHours}h: a política não prevê devolução.`;

  return { ...refund, label };
}

/**
 * O relógio como fonte externa — que é o que ele é: um sistema fora do React,
 * que muda sozinho e que ninguém deriva de estado nenhum.
 *
 * Por que existe: `new Date()` lido no render congela no instante da montagem.
 * O atendimento das 14:00 continuaria "no horário" às 15:30 até que outra coisa
 * provocasse re-render — e a única coisa que provoca é chegar reserva nova, que
 * é justamente o que não acontece num dia parado.
 *
 * Um intervalo só, compartilhado por quem estiver ouvindo, e desligado quando o
 * último sai. `useSyncExternalStore` exige que a leitura devolva a MESMA
 * referência enquanto o dado não muda — daí o cache; devolver `new Date()` a
 * cada leitura faria o React re-renderizar para sempre.
 */
const INTERVALO_RELOGIO_MS = 60_000;

let agoraCache: Date | null = null;
let timerRelogio: ReturnType<typeof setInterval> | null = null;
const ouvintesDoRelogio = new Set<() => void>();

function assinarRelogio(notificar: () => void) {
  ouvintesDoRelogio.add(notificar);

  if (!timerRelogio) {
    timerRelogio = setInterval(() => {
      agoraCache = new Date();
      for (const ouvinte of ouvintesDoRelogio) ouvinte();
    }, INTERVALO_RELOGIO_MS);
  }

  /* A primeira hora chega aqui, na assinatura — e não no render. É o que tira
   * o relógio do servidor: lá o valor é `null`, e um alerta que aparece no HTML
   * e some na hidratação é pior que um que chega um instante depois. */
  agoraCache = new Date();
  notificar();

  return () => {
    ouvintesDoRelogio.delete(notificar);
    if (ouvintesDoRelogio.size === 0 && timerRelogio) {
      clearInterval(timerRelogio);
      timerRelogio = null;
    }
  };
}

function useRelogio() {
  return useSyncExternalStore(
    assinarRelogio,
    () => agoraCache,
    () => null
  );
}

/**
 * Um item do Action Center.
 *
 * A tela NÃO decide se algo é alerta, nem qual a gravidade — só sabe desenhar o
 * que o motor entregou e executar a intenção declarada. `navegar` vira link; o
 * resto abre o modal correspondente aqui mesmo, porque a ação acontece nesta
 * tela e o motor não pode conhecer React.
 */
function ItemDeAcao({
  item,
  onExecutar,
}: {
  item: ActionItem;
  onExecutar: (intent: ActionIntent) => void;
}) {
  const tom =
    item.severity === "critical"
      ? "text-danger"
      : item.severity === "warning"
        ? "text-gold-light"
        : "text-ivory-muted";

  const cabecalho = (
    <>
      <p className="text-sm text-ivory">{item.title}</p>
      <p className="mt-0.5 text-xs text-ivory-muted">{item.reason}</p>
    </>
  );

  /* Duas saídas para o mesmo fato: o card deixa de ser um alvo de clique só.
   * Card inteiro clicável com dois botões dentro é o desenho que produz o
   * toque errado — e aqui o toque errado marca falta em quem foi atendido. */
  if (item.secondary) {
    const secundaria = item.secondary;
    return (
      <Card className="flex flex-col gap-3 py-3">
        <div className="flex flex-row items-start gap-3">
          <AlertCircle size={18} className={`mt-0.5 shrink-0 ${tom}`} />
          <div className="min-w-0 flex-1">{cabecalho}</div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => onExecutar(item.intent)}>
            {item.actionLabel}
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => onExecutar(secundaria.intent)}
          >
            {secundaria.actionLabel}
          </Button>
        </div>
      </Card>
    );
  }

  const conteudo = (
    <Card interactive className="flex flex-row items-start gap-3 py-3">
      <AlertCircle size={18} className={`mt-0.5 shrink-0 ${tom}`} />
      <div className="min-w-0 flex-1">
        {cabecalho}
        <p className="mt-1.5 text-xs font-medium text-gold-light">
          {item.actionLabel}
        </p>
      </div>
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-ivory-muted" />
    </Card>
  );

  if (item.intent.kind === "navegar") {
    return <Link href={item.intent.href}>{conteudo}</Link>;
  }

  return (
    <button
      type="button"
      onClick={() => onExecutar(item.intent)}
      className="text-left"
    >
      {conteudo}
    </button>
  );
}
