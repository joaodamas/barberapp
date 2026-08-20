"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Clock,
  Store,
  ChevronLeft,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMinhasAssinaturas, useServices, useStaff } from "@/lib/db/use-shop-data";
import { assinaturaAtivaDe, termosDoPlano } from "@/lib/booking-status";
import { useTenant } from "@/lib/tenant-context";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { CalendarX2 } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { contar } from "@/lib/plural";
import { estadoDosHorarios } from "./estado-dos-horarios";
import { bookableDays, firstBookableIndex } from "@/lib/slots";
import { useAuth } from "@/lib/auth-context";
import {
  lerPerfil,
  mascararWhatsapp,
  normalizarWhatsapp,
  salvarPerfil,
  whatsappValido,
} from "@/lib/db/perfil";
import type { TimeSlot } from "@/lib/types";

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Serviços",
  2: "Dia e horário",
  3: "Pagamento",
  4: "Confirmação",
};

export default function AgendarPage() {
  const tenant = useTenant();
  const { items: servicosDoc, status: statusServicos } = useServices();
  const { items: equipe } = useStaff();
  const barbeirosAtivos = equipe.filter((b) => b.active !== false);

  const services = servicosDoc
    .filter((s) => s.active !== false)
    .map((s) => ({
      id: s.id,
      name: s.name,
      durationMin: s.durationMin,
      price: s.price,
      priceFrom: s.priceFrom,
    }));

  const [step, setStep] = useState<Step>(1);
  const [staffId, setStaffId] = useState<string | null>(null);
  /* A resposta carrega a CHAVE que a originou, e a lista exibida é derivada
   * dela. Antes o efeito zerava o estado antes de cada busca — o que é setState
   * dentro de efeito e provoca render em cascata. Derivar resolve os dois
   * problemas de uma vez: não há limpeza a fazer, e a lista de um dia nunca
   * aparece sob o outro enquanto a consulta nova viaja. */
  const [resposta, setResposta] = useState<{ chave: string; slots: string[] } | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDayIndex, setSelectedDayIndex] = useState(() =>
    firstBookableIndex(bookableDays())
  );
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const { user } = useAuth();
  /* D2 · o mensalista precisa se reconhecer ANTES de confirmar.
   *
   * A tela oferecia "Corte R$ 50,00" e prometia "pague R$ 50,00 no salão" a
   * quem já tinha pago R$ 149,00 pelo plano no mesmo mês — duas afirmações
   * falsas para o lado que paga. O selo do plano existia na tela de Clientes,
   * do lado do dono; do lado do cliente, nada.
   *
   * Só o FATO do contrato entra aqui. Se ESTE atendimento está coberto, quem
   * decide é o fechamento, no servidor, com a cota do mês — e a tela não
   * antecipa essa resposta. */
  const { items: minhasAssinaturas } = useMinhasAssinaturas(user?.uid);
  const minhaAssinatura = assinaturaAtivaDe(minhasAssinaturas, user?.uid);
  const [confirmando, setConfirmando] = useState(false);
  const [erroReserva, setErroReserva] = useState<string | null>(null);

  /* O WhatsApp do cliente, que o produto inteiro pressupõe e nunca coletava.
   *
   * Vinha de `user.phoneNumber`, que só existe para quem entrou por SMS — e o
   * provider de SMS não está habilitado. Toda reserva nascia sem número: a
   * agenda do dono mostrava "—" na coluna Telefone, o aviso de cancelamento não
   * tinha para onde ir, e a confirmação automática não teria destinatário nem
   * depois de a Meta liberar o envio. */
  const [whatsapp, setWhatsapp] = useState("");

  /* Pré-preenche com o que a pessoa já informou numa reserva anterior. O
   * documento é dela e atravessa barbearias: quem corta em duas não digita o
   * telefone duas vezes.
   *
   * O `setState` é funcional para não puxar o texto debaixo do dedo de quem
   * começou a digitar antes de a leitura voltar — o que já digitou vence. */
  useEffect(() => {
    if (!user?.uid) return;
    let cancelado = false;
    lerPerfil(user.uid)
      .then((perfil) => {
        if (cancelado || !perfil?.whatsapp) return;
        setWhatsapp((atual) => atual || mascararWhatsapp(perfil.whatsapp));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [user?.uid]);

  const whatsappOk = whatsappValido(whatsapp);
  const politicaCancelamento = tenant.policies.cancellation;

  /**
   * A reserva é criada no SERVIDOR.
   *
   * Antes, o passo 4 dizia "Reserva confirmada!" e não gravava nada — o
   * cliente saía acreditando ter horário marcado. Agora a Cloud Function soma
   * o preço a partir do catálogo (o cliente não manda valor), checa conflito de
   * horário numa transação (dois toques simultâneos, um só ganha o slot) e
   * define o status, que as regras proíbem o cliente de escrever.
   */
  async function confirmarReserva() {
    if (!selectedDay || !selectedSlot) return;
    if (!whatsappOk) {
      setErroReserva("Informe um WhatsApp válido com DDD — é por ele que a barbearia fala com você.");
      return;
    }
    setConfirmando(true);
    setErroReserva(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("createBooking", {
        barbershopId: tenant.id,
        serviceIds: selectedServiceIds,
        staffId: barbeiroEscolhido?.id,
        date: selectedDay.iso,
        time: selectedSlot.time,
        paymentOrigin: "in_person",
        clientName: user?.displayName ?? undefined,
        clientWhatsapp: normalizarWhatsapp(whatsapp),
      });

      /* Guarda para a próxima reserva. Depois da reserva ter dado certo, e
       * fora do caminho de erro: falhar em salvar o perfil não pode derrubar um
       * agendamento que já está gravado. */
      if (user?.uid) {
        void salvarPerfil(user.uid, { whatsapp }).catch(() => undefined);
      }

      setStep(4);
    } catch (err) {
      const msg = (err as { message?: string })?.message;
      setErroReserva(msg ?? "Não foi possível concluir. Tente de novo.");
    } finally {
      setConfirmando(false);
    }
  }

  const days = useMemo(() => bookableDays(new Date(), tenant.schedule), [tenant.schedule]);

  const selectedServices = services.filter((s) =>
    selectedServiceIds.includes(s.id)
  );
  const totalPrice = selectedServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = selectedServices.reduce(
    (sum, s) => sum + s.durationMin,
    0
  );

  const selectedDay = days[selectedDayIndex];

  /* Os horários dependem da duração TOTAL escolhida: um combo de 60 min não
   * pode ocupar o último slot de 30 min da jornada. */
  // Sem useMemo: o React Compiler memoiza sozinho e o memo manual o faz
  // desistir de otimizar o componente inteiro.
  /* Quem escolhe o barbeiro quando há um só é o SISTEMA. Obrigar o cliente de
   * uma barbearia solo a escolher a única opção é atrito puro. */
  const barbeiroEscolhido =
    barbeirosAtivos.find((b) => b.id === staffId) ??
    (barbeirosAtivos.length === 1 ? barbeirosAtivos[0] : null);

  /* Os horários vêm do SERVIDOR.
   *
   * A tela calculava os slots sozinha a partir da jornada — e não tinha como
   * saber o que estava ocupado, porque as regras proíbem o cliente de ler
   * reserva alheia (e devem proibir). Resultado: oferecia TODO horário como
   * livre, o cliente escolhia, e só no "confirmar" o servidor respondia que
   * aquele horário já era de outra pessoa.
   *
   * `availableSlots` faz a conta no servidor e devolve só as horas livres —
   * disponibilidade sem entregar a agenda. */
  /* Primitivos, não os objetos: `selectedDay` e `barbeiroEscolhido` são
   * recriados a cada render, e declará-los como dependência refaria a consulta
   * sem parar. */
  const diaIso = selectedDay?.iso;
  const idDoBarbeiro = barbeiroEscolhido?.id;
  const chaveDaConsulta = `${diaIso ?? ""}|${idDoBarbeiro ?? ""}|${totalDuration}`;

  useEffect(() => {
    if (step !== 2 || !diaIso || !idDoBarbeiro) return;
    let cancelado = false;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<
          { barbershopId: string; date: string; staffId: string; durationMin: number },
          { slots: string[] }
        >("availableSlots", {
          barbershopId: tenant.id,
          date: diaIso,
          staffId: idDoBarbeiro,
          durationMin: totalDuration,
        });
        if (!cancelado) setResposta({ chave: chaveDaConsulta, slots: r.slots ?? [] });
      } catch (err) {
        console.error("[agendar] falha ao buscar horários", err);
        if (!cancelado) setResposta({ chave: chaveDaConsulta, slots: [] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [step, diaIso, idDoBarbeiro, totalDuration, tenant.id, chaveDaConsulta]);

  /* Só vale a resposta desta combinação de dia, barbeiro e duração. Trocar
   * qualquer uma volta a lista para "carregando" sem precisar limpá-la. */
  const horariosLivres = resposta?.chave === chaveDaConsulta ? resposta.slots : null;

  /* `availableSlots` devolve só o que está livre, então todo horário exibido é
   * agendável. O encaixe saiu da proposta em 17/08: ele existia aqui como
   * `isFitIn` sobre horário ocupado, e deixou de ter caminho no dia em que a
   * disponibilidade passou a vir do servidor — a tela seguiu anunciando
   * "peça um encaixe nos horários em vermelho" por semanas, para horários que
   * nunca apareciam. Ver `AUDITORIA-2026-08-17.md` (P1-3). */
  const slots: TimeSlot[] = (horariosLivres ?? []).map((time) => ({
    time,
    available: true,
  }));

  /* Cinco estados, não dois. A regra e o porquê moram em
   * `estado-dos-horarios.ts` — resumo: `null` significa "não perguntei ainda"
   * e `[]` significa "perguntei e não há", e a tela tratava os dois como o
   * segundo. Ver o cabeçalho daquele arquivo. */
  const estadoDaLista = estadoDosHorarios({
    diaFechado: !!selectedDay?.disabled,
    temProfissional: !!barbeiroEscolhido,
    horariosLivres,
  });

  /* Rótulo e trava do CTA existiam duplicados na barra fixa do mobile e no
   * card sticky do desktop — o mesmo ternário de 3 níveis escrito duas vezes. */
  const ctaDisabled =
    (step === 1 && selectedServiceIds.length === 0) ||
    (step === 2 && !selectedSlot) ||
    (step === 3 && !whatsappOk);
  const ctaLabel = step === 3 ? "Confirmar reserva" : "Continuar";

  function toggleService(id: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_340px] md:items-start md:gap-8 md:pt-4">
      <div className="flex items-center gap-2 md:col-span-2 md:gap-3">
        {step > 1 && step < 4 && (
          <button
            onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-ivory-muted transition-colors hover:border-gold/60 hover:text-ivory md:h-10 md:w-10"
            aria-label="Voltar"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <p className="text-xs uppercase tracking-wider text-ivory-muted md:text-sm">
            Passo {step} de 4
          </p>
          <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">{STEP_LABELS[step]}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-5 md:col-start-1 md:gap-7">
      <div className="flex gap-1.5">
        {([1, 2, 3, 4] as Step[]).map((s) => (
          <span
            key={s}
            className={
              s <= step
                ? "h-1 flex-1 rounded-full bg-gold"
                : "h-1 flex-1 rounded-full bg-surface-raised"
            }
          />
        ))}
      </div>

      {step === 1 && statusServicos === "carregando" && <LoadingRows rows={4} />}

      {step === 1 && statusServicos === "pronto" && services.length === 0 && (
        <EmptyState
          icon={CalendarX2}
          title="Nenhum serviço disponível ainda"
          description="A barbearia ainda não cadastrou os serviços. Volte em instantes ou fale com ela pelo WhatsApp."
        />
      )}

      {step === 1 && services.length > 0 && (
        <div className="grid gap-3 pb-24 md:grid-cols-2">
          {services.map((service) => {
            const checked = selectedServiceIds.includes(service.id);
            return (
              <button
                key={service.id}
                aria-pressed={checked}
                onClick={() => toggleService(service.id)}
                className={
                  "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors md:p-5 " +
                  (checked
                    ? "border-gold bg-gold/10"
                    : "border-border bg-surface hover:border-gold/40")
                }
              >
                <div>
                  <p className="text-sm text-ivory">{service.name}</p>
                  <p className="text-xs text-ivory-muted">
                    {service.durationMin} min
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-gold-light">
                    {service.priceFrom && "a partir de "}
                    {formatBRL(service.price)}
                  </p>
                  <span
                    className={
                      "flex h-6 w-6 items-center justify-center rounded-full border " +
                      (checked
                        ? "border-gold bg-gold text-ivory"
                        : "border-border text-transparent")
                    }
                  >
                    <Check size={14} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-4 pb-24">
          {/* Só aparece a partir do SEGUNDO barbeiro. Com um só, escolher a
              única opção é atrito — o servidor preenche sozinho. */}
          {barbeirosAtivos.length > 1 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
                Com quem você quer cortar
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {barbeirosAtivos
                  .filter((b) => {
                    // Lista vazia significa TODOS os serviços, não nenhum.
                    const faz: string[] = b.serviceIds ?? [];
                    return faz.length === 0 || selectedServiceIds.every((id) => faz.includes(id));
                  })
                  .map((b) => {
                    const ativo = barbeiroEscolhido?.id === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => {
                          setStaffId(b.id);
                          setSelectedSlot(null);
                        }}
                        className={
                          "min-h-11 shrink-0 cursor-pointer rounded-xl border px-4 text-sm transition-colors " +
                          (ativo
                            ? "border-gold bg-gold text-ivory"
                            : "border-border text-ivory-muted hover:border-gold/50 hover:text-ivory")
                        }
                      >
                        {b.name}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d, i) => {
              const active = i === selectedDayIndex;
              return (
                <button
                  key={d.iso}
                  disabled={d.disabled}
                  aria-pressed={active}
                  onClick={() => {
                    setSelectedDayIndex(i);
                    setSelectedSlot(null);
                  }}
                  className={
                    "flex min-w-14 shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-35 " +
                    (active
                      ? "border-gold bg-gold/10 text-gold-light"
                      : "border-border text-ivory-muted")
                  }
                >
                  <span className="text-[11px] uppercase">
                    {d.date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}
                  </span>
                  <span className="text-base font-semibold">{d.date.getDate()}</span>
                  {d.disabled && (
                    <span className="text-[11px] leading-none">
                      {d.reason === "fechado" ? "fechado" : "—"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {estadoDaLista === "dia-fechado" ? (
            <Card className="py-8 text-center text-sm text-ivory-muted">
              A barbearia não abre neste dia. Escolha outra data.
            </Card>
          ) : estadoDaLista === "escolher-profissional" ? (
            /* Quem escolhe o profissional é o cliente, e o produto não escolhe
             * por ele: qual barbeiro seria o padrão da casa é decisão de quem
             * opera, não do agendamento. O que a tela pode fazer é PEDIR, em
             * vez de responder por uma pergunta que não fez. */
            <Card className="flex flex-col gap-2 py-6 text-center text-sm text-ivory-muted">
              <span>Escolha com quem você quer cortar.</span>
              <span className="text-xs">
                Os horários livres mudam conforme o profissional — por isso a
                lista aparece depois da escolha.
              </span>
            </Card>
          ) : estadoDaLista === "carregando" ? (
            <LoadingRows rows={3} />
          ) : estadoDaLista === "sem-horario" ? (
            <Card className="flex flex-col gap-2 py-6 text-center text-sm text-ivory-muted">
              <span>
                {barbeiroEscolhido?.name} não tem horário livre de{" "}
                {totalDuration} min neste dia.
              </span>
              {/* "Tente outro profissional" numa barbearia de um barbeiro só
                  manda o cliente para uma porta que não existe. */}
              <span className="text-xs">
                Escolha outro dia
                {barbeirosAtivos.length > 1 && ", outro profissional"}, ou fale
                com a barbearia pelo WhatsApp para ver se dá para encaixar.
              </span>
            </Card>
          ) : null}

          {estadoDaLista === "com-horario" && (
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 md:gap-3">
            {slots.map((slot) => {
              const active = selectedSlot?.time === slot.time;
              return (
                <button
                  key={slot.time}
                  aria-pressed={active}
                  onClick={() => setSelectedSlot(slot)}
                  className={
                    "flex flex-col items-center rounded-xl border py-2.5 text-sm transition-colors " +
                    (active
                      ? "border-gold bg-gold text-ivory"
                      : "border-border text-ivory")
                  }
                >
                  {slot.time}
                </button>
              );
            })}
          </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4 pb-24">
          <Card className="flex flex-col gap-2 md:p-6">
            <p className="text-sm text-ivory md:text-base">
              {selectedServices.map((s) => s.name).join(" + ")}
            </p>
            {/* `capitalize` põe maiúscula em TODA palavra, e em português isso
                produz "Quarta-Feira, 19 De Agosto Às 14:00 · 30 Min" — mês,
                preposição e a abreviação de minuto, que é invariável. Só a
                primeira letra da frase sobe. */}
            <p className="text-xs text-ivory-muted first-letter:uppercase">
              {selectedDay?.date.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}{" "}
              às {selectedSlot?.time} · {totalDuration} min
            </p>
            <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
              <span className="text-ivory-muted">Total</span>
              <span className="font-semibold text-gold-light">
                {formatBRL(totalPrice)}
              </span>
            </div>
          </Card>

          {/* O contato vem ANTES do pagamento, e é obrigatório: é por ele que a
              barbearia confirma, lembra e avisa de qualquer mudança. Enquanto
              não existia, toda reserva nascia sem número e o dono descobria o
              cliente só quando ele aparecia — ou não aparecia. */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cliente-whatsapp" className="text-xs uppercase tracking-wider text-ivory-muted">
              Seu WhatsApp
            </label>
            <input
              id="cliente-whatsapp"
              name="tel"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="(11) 99999-9999"
              value={whatsapp}
              onChange={(e) => setWhatsapp(mascararWhatsapp(e.target.value))}
              aria-invalid={whatsapp.length > 0 && !whatsappOk}
              aria-describedby="ajuda-whatsapp"
              className="min-h-12 rounded-xl border border-border bg-surface px-4 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
            <p id="ajuda-whatsapp" className="text-xs text-ivory-muted">
              {whatsapp.length > 0 && !whatsappOk
                ? "Faltam dígitos — informe DDD e número."
                : `É por aqui que ${tenant.brand.name} confirma seu horário e avisa se algo mudar.`}
            </p>
          </div>

          {/* Antes havia três botões de pagamento e dois nasciam desabilitados:
              o servidor recusa qualquer pagamento antecipado enquanto não
              houver gateway. Oferecer uma escolha que não existe é pior que não
              oferecer escolha — agora a tela afirma o que de fato acontece, e
              quem informa COMO o cliente pagou é o balcão, no fechamento. */}
          <p className="text-xs uppercase tracking-wider text-ivory-muted">
            Pagamento
          </p>
          {/* D2 · quem tem plano não recebe a mesma frase de quem não tem.
              "Pague R$ 50,00 no dia" é falso para o mensalista do Ilimitado, e
              é a versão da cobrança em dobro que chega ao CLIENTE — ele guarda
              o valor na cabeça e chega no salão esperando pagar. A tela passa a
              dizer o que ele contratou, sem prometer que ESTE corte está
              coberto: a cota do mês é decidida no fechamento. */}
          {minhaAssinatura ? (
            <Card className="flex items-start gap-3 bg-surface-raised">
              <Store size={16} className="mt-0.5 shrink-0 text-gold-light" />
              <div>
                <p className="text-sm text-ivory">
                  Você é mensalista · {minhaAssinatura.planName}
                </p>
                <p className="mt-0.5 text-xs text-ivory-muted">
                  Seu plano: {termosDoPlano(minhaAssinatura).toLowerCase()}. O
                  que estiver incluído não é cobrado de novo no salão —{" "}
                  {tenant.brand.name} confirma no atendimento. O que passar do
                  plano você paga no dia, como preferir.
                </p>
              </div>
            </Card>
          ) : (
            <Card className="flex items-start gap-3 bg-surface-raised">
              <Store size={16} className="mt-0.5 shrink-0 text-gold-light" />
              <div>
                <p className="text-sm text-ivory">Você paga no salão</p>
                <p className="mt-0.5 text-xs text-ivory-muted">
                  Sua reserva é confirmada agora, sem cobrança. No dia, pague{" "}
                  {formatBRL(totalPrice)} como preferir — Pix, dinheiro ou
                  maquininha.
                </p>
              </div>
            </Card>
          )}

          {erroReserva && (
            <p role="alert" className="text-sm text-danger">
              {erroReserva}
            </p>
          )}

          {/* A política é DESTA barbearia, não a da plataforma.
            *
            * Os números estavam cravados no JSX (24h/6h), e numa barbearia que
            * configurou 48h/12h a tela prometia ao cliente uma janela que o
            * servidor não aplicaria — `cancelBooking` decide por
            * `policies.cancellation`. É o mesmo defeito que o painel do dono já
            * tinha corrigido, e que aqui, do lado de quem paga, tinha ficado. */}
          <Card className="flex gap-2 bg-surface-raised text-xs text-ivory-muted">
            <Clock size={14} className="mt-0.5 shrink-0 text-gold-light" />
            <p>
              Cancelamento até {politicaCancelamento.fullRefundHours}h antes:
              100% de volta. Entre {politicaCancelamento.fullRefundHours}h e{" "}
              {politicaCancelamento.partialRefundHours}h: retemos{" "}
              {politicaCancelamento.cancellationFeePct}% de taxa. Menos de{" "}
              {politicaCancelamento.partialRefundHours}h ou não comparecimento:
              sem reembolso.
            </p>
          </Card>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col items-center gap-4 pt-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold/15 text-gold-light">
            <Check size={30} />
          </div>
          <h2 className="text-lg text-ivory">Reserva confirmada!</h2>
          {/* A tela dizia "seu horário está garantido" sem dizer QUAL.
            *
            * O passo 4 é a última coisa que o cliente vê antes de fechar o
            * app, e era o único da jornada sem data, sem hora e sem o
            * profissional que ele mesmo tinha acabado de escolher — o fato
            * mais importante da reserva ficava a uma navegação de distância,
            * em "Ver minhas reservas". Confirmar é repetir o que foi
            * combinado, não anunciar que algo foi combinado. */}
          <Card className="w-full max-w-xs bg-surface-raised text-left">
            <p className="text-sm text-ivory">
              {selectedServices.map((s) => s.name).join(" + ")}
            </p>
            <p className="mt-0.5 text-xs text-ivory-muted first-letter:uppercase">
              {selectedDay?.date.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "long",
              })}{" "}
              às {selectedSlot?.time}
            </p>
            {barbeirosAtivos.length > 1 && barbeiroEscolhido && (
              <p className="mt-0.5 text-xs text-ivory-muted">
                com {barbeiroEscolhido.name}
              </p>
            )}
          </Card>
          {/* "Não esqueça: R$ 50,00" é a última coisa que o mensalista lê antes
              de sair da tela, e era a que ele levava para o balcão. */}
          <p className="max-w-xs text-sm text-ivory-muted">
            {minhaAssinatura
              ? "Seu horário está garantido. O que estiver incluído no seu plano não é cobrado no dia."
              : `Seu horário está garantido. Não esqueça: ${formatBRL(totalPrice)} no salão no dia do atendimento.`}
          </p>
          <Link href="/reservas" className="w-full">
            <Button className="w-full">Ver minhas reservas</Button>
          </Link>
        </div>
      )}

      {step < 4 && (
        <div className="fixed inset-x-0 bottom-16 z-10 mx-auto w-full max-w-md border-t border-border bg-bg/95 px-4 py-3 backdrop-blur safe-bottom md:hidden">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ivory-muted">
              {/* O `(s)` é o produto se recusando a concordar e devolvendo a
                  conta para quem lê — `UI-UX-GUIDELINES` §9. A regra mora em
                  `lib/plural`, e "min" fica invariável de propósito. */}
              {selectedServices.length > 0
                ? `${contar(selectedServices.length, "serviço", "serviços")} · ${totalDuration} min`
                : "Selecione ao menos um serviço"}
            </span>
            {totalPrice > 0 && (
              <span className="font-semibold text-gold-light">
                {formatBRL(totalPrice)}
              </span>
            )}
          </div>
          <Button
            className="w-full"
            disabled={ctaDisabled || confirmando}
            onClick={() => (step === 3 ? confirmarReserva() : setStep((s) => (s + 1) as Step))}
          >
            {confirmando ? "Confirmando…" : ctaLabel}
          </Button>
          {/* O cliente final é o único aqui que não contratou nada: ele quer
              cortar o cabelo e sai deixando nome, telefone e histórico. O aviso
              fica no passo da CONFIRMAÇÃO, imediatamente antes do ato que grava
              o dado — no rodapé de outra tela, ninguém leria. */}
          {step === 3 && (
            <p className="text-center text-[11px] leading-relaxed text-ivory-muted">
              Ao confirmar, seu nome e WhatsApp ficam com {tenant.brand.name} para
              gerenciar este atendimento.{" "}
              <Link href="/privacidade" className="underline hover:text-ivory">
                Como seus dados são tratados
              </Link>
              .
            </p>
          )}
        </div>
      )}
      </div>

      {step < 4 && (
        <Card className="hidden md:sticky md:top-6 md:col-start-2 md:flex md:flex-col md:gap-4 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
            Resumo da reserva
          </p>

          {selectedServices.length > 0 ? (
            <div className="flex flex-col gap-2 border-b border-border pb-4">
              {selectedServices.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <span className="text-ivory">{s.name}</span>
                  <span className="text-ivory-muted">{formatBRL(s.price)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="border-b border-border pb-4 text-sm text-ivory-muted">
              Selecione ao menos um serviço pra ver o resumo aqui.
            </p>
          )}

          {step >= 2 && selectedSlot && (
            <div className="flex flex-col gap-1 border-b border-border pb-4 text-sm">
              <span className="text-ivory-muted">Dia e horário</span>
              <span className="block text-ivory first-letter:uppercase">
                {selectedDay?.date.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}{" "}
                às {selectedSlot.time}
              </span>
            </div>
          )}

          {/* O resumo repetia serviço, dia, hora e preço — tudo menos a
              escolha que o cliente fez a mais nesta barbearia. Com um
              profissional só não há escolha a confirmar, e a linha seria
              ruído. */}
          {step >= 2 && barbeirosAtivos.length > 1 && barbeiroEscolhido && (
            <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
              <span className="text-ivory-muted">Profissional</span>
              <span className="text-ivory">{barbeiroEscolhido.name}</span>
            </div>
          )}

          {step === 3 && (
            <div className="flex items-center justify-between border-b border-border pb-4 text-sm">
              <span className="text-ivory-muted">Pagamento</span>
              <span className="text-ivory">No salão</span>
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-ivory-muted">
              {totalDuration > 0 ? `${totalDuration} min` : "Duração"}
            </span>
            <span className="font-display text-lg font-semibold text-gold-light">
              {formatBRL(totalPrice)}
            </span>
          </div>

          <Button
            className="w-full"
            disabled={ctaDisabled || confirmando}
            onClick={() => (step === 3 ? confirmarReserva() : setStep((s) => (s + 1) as Step))}
          >
            {confirmando ? "Confirmando…" : ctaLabel}
          </Button>

          {step === 3 && (
            <p className="text-center text-[11px] leading-relaxed text-ivory-muted">
              Ao confirmar, seu nome e WhatsApp ficam com {tenant.brand.name}{" "}
              para gerenciar este atendimento.{" "}
              <Link href="/privacidade" className="underline hover:text-ivory">
                Como seus dados são tratados
              </Link>
              .
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
