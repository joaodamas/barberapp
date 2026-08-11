"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarCheck,
  Check,
  ChevronRight,
  CreditCard,
  Landmark,
  Percent,
  Scissors,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { bookingStatusMeta } from "@/lib/booking-status";
import type { PaymentMethod } from "@/lib/types";
import { labelDoPagamento, PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import { formatBRL, formatPhonePtBR, safePct } from "@/lib/format";
import { bookingPolicy } from "@/lib/business-rules";
import { useTenant } from "@/lib/tenant-context";
import { useBookings, useServices, useStaff } from "@/lib/db/use-shop-data";
import { patchDoc } from "@/lib/db/repository";
import { capacidadeDiaria, caixaDoDia } from "@/lib/analytics";
import { OCCUPIES_SLOT } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { toISODate } from "@/lib/format";
import type { BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

export default function PainelHojePage() {
  const tenant = useTenant();
  const { brand } = tenant;
  const { items: todas, status } = useBookings();
  const { items: services, status: statusServicos } = useServices();
  const { items: equipe } = useStaff();

  const hoje = toISODate(new Date());
  const bookings = todas.filter((b) => b.date === hoje);

  const getServicesByIds = (ids: string[]) =>
    ids.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Array<{ name: string }>;

  /* Capacidade é POR CADEIRA. Com três barbeiros são três agendas paralelas —
   * calcular como se fosse uma faz a tela mostrar "lotado" com duas cadeiras
   * vazias, e a taxa de ocupação sair três vezes maior que a real. */
  const barbeirosAtivos = Math.max(equipe.filter((b) => b.active !== false).length, 1);
  const totalSlots = capacidadeDiaria(tenant.schedule) * barbeirosAtivos;

  const fitInRequests = bookings.filter((b) => b.status === "fit_in_requested");

  /* `localeCompare` em "HH:mm" ordena certo porque o formato é de largura fixa
   * e zero-padded — "09:00" < "10:00" < "12:00" como texto. */
  const bookingsDoDia = bookings
    .filter((b) => b.status !== "fit_in_requested")
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time));
  const agendados = bookings.filter((b) => OCCUPIES_SLOT.includes(b.status));

  const confirmedCount = agendados.length;
  const horariosLivres = Math.max(totalSlots - agendados.length, 0);
  const ocupacaoPct = Math.round(safePct(agendados.length, totalSlots));

  const previsaoHoje = agendados.reduce((s, b) => s + b.value, 0);

  /* "Precisa de você" derivado do estado real, não de uma lista fixa. */
  const precisaDeVoce = [
    fitInRequests.length > 0 && {
      id: "fit-in",
      label: `${fitInRequests.length} encaixe(s) aguardando sua resposta`,
      href: "/painel",
      tone: "gold" as const,
    },
    /* Só acusa falta de serviço depois que a consulta responde — antes disso
     * a lista está vazia porque ainda não chegou, não porque não existe. */
    statusServicos === "pronto" && services.length === 0 && {
      id: "servicos",
      label: "Nenhum serviço cadastrado — o cliente não tem o que agendar",
      href: "/painel/servicos",
      tone: "danger" as const,
    },
  ].filter(Boolean) as Array<{ id: string; label: string; href: string; tone: "gold" | "danger" }>;


  const semColunaLateral = precisaDeVoce.length === 0 && fitInRequests.length === 0;
  const [aFechar, setAFechar] = useState<Doc<BookingDoc> | null>(null);

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
  function concluirCom(metodo: PaymentMethod) {
    const booking = aFechar;
    if (!booking) return;
    setAFechar(null);
    void patchDoc(tenant.id, "bookings", booking.id, {
      status: "completed",
      paymentMethod: metodo,
    }).catch((e) => console.error("[hoje] falha ao concluir", e));
  }

  function resolveFitIn(booking: Doc<BookingDoc>, approve: boolean) {
    void patchDoc(tenant.id, "bookings", booking.id, {
      status: approve ? "confirmed" : "cancelled_by_shop",
    }).catch((e) => console.error("[hoje] falha ao resolver encaixe", e));

    const firstName = booking.clientName.split(" ")[0];
    const serviceNames = getServicesByIds(booking.serviceIds)
      .map((s) => s.name)
      .join(" + ");
    const message = approve
      ? `Olá ${firstName}! Seu encaixe de hoje às ${booking.time} (${serviceNames}) foi confirmado. Te esperamos! — ${brand.name}`
      : `Olá ${firstName}, infelizmente não conseguimos encaixar o horário das ${booking.time} hoje. Posso te mandar as próximas vagas livres?`;
    window.open(
      `https://wa.me/${booking.clientWhatsapp}?text=${encodeURIComponent(message)}`,
      "_blank"
    );
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
          <p className="text-xs text-ivory-muted">
            Pix e cartão contam assim que confirmados; dinheiro só entra quando
            o cliente é atendido e marcado como concluído.
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

      {precisaDeVoce.length > 0 && (
        <section className="md:col-start-2 md:row-start-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Precisa de você
          </h2>
          <div className="flex flex-col gap-2 md:gap-3">
            {precisaDeVoce.map((item) => (
              <Link key={item.id} href={item.href}>
                <Card interactive className="flex flex-row items-center gap-3 py-3">
                  <AlertCircle
                    size={18}
                    className={
                      item.tone === "danger" ? "text-danger" : "text-gold-light"
                    }
                  />
                  <p className="flex-1 text-sm text-ivory">{item.label}</p>
                  <ChevronRight size={16} className="text-ivory-muted" />
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {fitInRequests.length > 0 && (
        <section className="md:col-start-2 md:row-start-5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Encaixes pendentes
          </h2>
          <div className="flex flex-col gap-2 md:gap-3">
            {fitInRequests.map((booking) => (
              <Card key={booking.id} className="flex flex-col gap-3 md:p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-ivory">{booking.clientName}</p>
                    <p className="text-xs text-ivory-muted">
                      {getServicesByIds(booking.serviceIds)
                        .map((s) => s.name)
                        .join(" + ")}{" "}
                      · {booking.time}
                    </p>
                  </div>
                  <Pill tone="gold">
                    expira em até {bookingPolicy.fitInExpirationMinutes} min
                  </Pill>
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => resolveFitIn(booking, true)}
                  >
                    Aprovar
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => resolveFitIn(booking, false)}
                  >
                    Recusar
                  </Button>
                </div>
                <p className="text-[11px] text-ivory-muted">
                  Aprovar ou recusar já abre o WhatsApp do cliente com a
                  mensagem pronta.
                </p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* A coluna lateral de 360px só existe quando há algo nela — "precisa de
          você" ou encaixe pendente. Vazia, ela deixava a agenda parando no meio
          da tela com um vão à direita, enquanto os blocos de cima iam até a
          borda. Sem nada ao lado, a agenda ocupa a largura inteira: é a tabela
          com mais colunas do painel, e é onde a largura faz diferença. */}
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
                  const canComplete =
                    booking.status === "confirmed" ||
                    booking.status === "confirmed_by_client";
                  const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");

                  return (
                    <tr
                      key={booking.id}
                      className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-display text-gold-light md:px-6">
                        {booking.time}
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
                        {canComplete ? (
                          <button
                            onClick={() => setAFechar(booking)}
                            className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ivory-muted transition-colors hover:border-success hover:text-success"
                          >
                            <Check size={14} /> Concluir
                          </button>
                        ) : (
                          <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
                        )}
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
              onClick={() => concluirCom(metodo)}
              className="flex min-h-16 cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-medium text-ivory transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light"
            >
              {paymentMethodLabel[metodo]}
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs text-ivory-muted">
          A taxa da maquininha é registrada com o valor de hoje e não muda
          depois. Ajuste em Configurações.
        </p>
      </Modal>
    </div>
  );
}

