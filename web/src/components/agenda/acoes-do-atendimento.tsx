"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { EstornarValor } from "@/components/estornar-valor";
import { CorrigirPagamento } from "@/components/corrigir-pagamento";
import { RemarcarAtendimento } from "@/components/agenda/remarcar-atendimento";
import { AdicionarServico } from "@/components/agenda/adicionar-servico";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
import { formatBRL, formatPctPtBR, toISODate } from "@/lib/format";
import { refundAmountFor } from "@/lib/business-rules";
import { useTenant } from "@/lib/tenant-context";
import type { TenantPolicies } from "@/lib/tenant";
import { useSubscribers } from "@/lib/db/use-shop-data";
import { patchDoc } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { assinaturaAtivaDe, termosDoPlano } from "@/lib/booking-status";
import { useAuth } from "@/lib/auth-context";
import {
  MOTIVOS_DE_DESCONTO,
  calcularDesconto,
  camposDoDesconto,
  lerNumeroDigitado,
  valorCobrado,
} from "@/lib/desconto";
import type { BookingDoc, MotivoDoDesconto, TipoDeDesconto } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * O que o dono faz com UM atendimento — concluir, marcar falta, cancelar,
 * remarcar, corrigir pagamento, devolver e responder encaixe —, com os estados
 * e as janelas de cada ação.
 *
 * Morava dentro da tela Hoje. Com a aba Agenda (28/09) as mesmas ações passam a
 * existir em duas telas, e copiar as janelas seria o padrão que este produto
 * mais combate: duas fontes para a mesma operação, e a correção aplicada só
 * numa. Aqui é UM lugar; cada tela chama `abrir…` e renderiza `modais` e
 * `avisos`.
 */
export function useAcoesDoAtendimento() {
  const tenant = useTenant();
  const { brand } = tenant;
  const formasDeCobranca = formasAtivas(tenant.policies);
  const { items: assinaturas } = useSubscribers();
  const hoje = toISODate(new Date());

  const [aFechar, setAFechar] = useState<Doc<BookingDoc> | null>(null);
  const [faltaDe, setFaltaDe] = useState<Doc<BookingDoc> | null>(null);
  const [aCancelar, setACancelar] = useState<Doc<BookingDoc> | null>(null);
  /* Apagar a semana do fixo (30/09) — não é cancelamento: ver
   * `apagarSemanaDoFixo` em functions/src/horario-fixo.ts. */
  const [aApagar, setAApagar] = useState<Doc<BookingDoc> | null>(null);
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState<string | null>(null);
  const [aEstornar, setAEstornar] = useState<Doc<BookingDoc> | null>(null);
  /* R1 · a correção de pagamento tem estado PRÓPRIO, separado de `aFechar`.
   * Compartilhar o estado com a conclusão era compartilhar o caminho, e é
   * exatamente o que a decisão de 18/08 recusa. */
  const [aCorrigir, setACorrigir] = useState<Doc<BookingDoc> | null>(null);
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

  /* D2 · o cliente que está sendo fechado tem plano contratado?
   *
   * `assinaturaAtivaDe` responde só isso. Não responde "este corte está
   * coberto" — essa decisão depende de competência e cota, mora em
   * `decidirCobertura` no servidor, e reimplementá-la aqui recriaria o D1 com
   * outro nome: o web afirmando uma coisa e o fato nascendo outra. */
  const assinaturaDoFechamento = aFechar
    ? assinaturaAtivaDe(assinaturas, aFechar.clientId)
    : null;

  /* DESCONTO NO FECHAMENTO — pedido do dono em 28/09.
   *
   * Só o DONO dá desconto: a regra do Firestore recusa os campos vindos de
   * qualquer outro papel, e mostrar o controle ao barbeiro seria oferecer um
   * botão que falha na hora de gravar.
   *
   * Para mensalista o controle não aparece (decisão 6 do dono). A tela não sabe
   * se ESTE corte está coberto — quem decide é o servidor, com a cota —, então
   * esconde para todo cliente com plano ativo. Desconto sobre corte coberto
   * seria desconto sobre dinheiro que não entrou no balcão. */
  const { user, claims } = useAuth();
  const ehDono = claims.barbershops?.[tenant.id] === "owner";
  const podeDarDesconto = !!aFechar && ehDono && !!user && !assinaturaDoFechamento;
  const [descontoAberto, setDescontoAberto] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<TipoDeDesconto>("valor");
  const [descontoTexto, setDescontoTexto] = useState("");
  const [descontoMotivo, setDescontoMotivo] = useState<MotivoDoDesconto | null>(null);
  const descontoEntrada = lerNumeroDigitado(descontoTexto);
  const descontoIlegivel = descontoTexto.trim() !== "" && descontoEntrada === null;
  /* Fechado ou invisível, o cálculo é o de "sem desconto" — nenhum campo vai
   * para a reserva. É o que garante que o caminho do mensalista (`null`) nunca
   * leve desconto junto por um estado esquecido aberto. */
  const calculoDoDesconto = calcularDesconto({
    valor: aFechar?.value ?? 0,
    tipo: descontoTipo,
    entrada: podeDarDesconto && descontoAberto ? descontoEntrada : null,
  });
  const descontoBloqueia = podeDarDesconto && descontoAberto && (calculoDoDesconto.excedeu || descontoIlegivel);

  function limparDesconto() {
    setDescontoAberto(false);
    setDescontoTipo("valor");
    setDescontoTexto("");
    setDescontoMotivo(null);
  }

  /* Remarcar pelo dono: o servidor (`rescheduleBooking`) já aceitava o dono
   * sem os limites do cliente — faltava a tela. O aviso ao cliente é um botão
   * depois de gravar, como no encaixe. */
  const [aRemarcar, setARemarcar] = useState<Doc<BookingDoc> | null>(null);
  const [remarcado, setRemarcado] = useState<{
    booking: Doc<BookingDoc>;
    date: string;
    time: string;
  } | null>(null);

  function linkDoAvisoDeRemarcacao(booking: Doc<BookingDoc>, date: string, time: string) {
    const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");
    if (!digitos) return null;
    const nome = booking.clientName.split(" ")[0];
    const quando = date === hoje ? "hoje" : `no dia ${formatarDiaCurto(date)}`;
    const texto = `Olá ${nome}! Seu horário foi remarcado para ${quando} às ${time}. Qualquer coisa, é só chamar. — ${brand.name}`;
    return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
  }

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
   *
   * `metodo: null` é o fechamento do mensalista — D2. Não é ausência de
   * resposta: é a resposta "não entrou dinheiro no balcão". A tela não afirma
   * que o plano cobriu; ela deixa de inventar um meio de pagamento para um
   * valor que ninguém recebeu, e quem decide a cobertura continua sendo o
   * servidor, que lê a assinatura e a cota na conclusão.
   */
  async function concluirCom(forma: FormaDePagamento | null) {
    const booking = aFechar;
    if (!booking) return;
    if (descontoBloqueia) return;
    /* O desconto vai na MESMA escrita, pela mesma razão do método: o gatilho
     * lê o documento atualizado, e gravar depois materializaria o pagamento
     * cheio. `null` = sem desconto, e a escrita fica idêntica à de antes. */
    const desconto =
      podeDarDesconto && user
        ? camposDoDesconto({
            calculo: calculoDoDesconto,
            tipo: descontoTipo,
            entrada: descontoEntrada,
            motivo: descontoMotivo,
            uid: user.uid,
          })
        : null;
    /* Cortesia conclui SEM forma — não entrou dinheiro. Com forma, é desconto
     * parcial; a regra recusa as duas combinações trocadas. */
    if (desconto && calculoDoDesconto.cortesia !== (forma === null)) return;
    setSalvando(true);
    setErroAoFechar(null);
    const r = await soAvisaSeGravou({
      gravar: async () => {
        /* `discountAt` é o relógio do SERVIDOR: a regra o confere contra
         * `request.time`. Carregado sob demanda, como o resto do SDK. */
        const autoria = desconto
          ? { discountAt: (await import("firebase/firestore")).serverTimestamp() }
          : {};
        return patchDoc(tenant.id, "bookings", booking.id, {
          status: "completed",
          /* O MEIO e a FORMA, na mesma escrita.
           *
           * O meio é o que todo relatório já sabe agrupar; a forma é o que diz
           * qual taxa a maquininha cobrou. O servidor lê os dois do documento
           * atualizado — gravar em duas etapas materializaria o pagamento antes
           * de a forma existir, e a taxa nasceria da forma errada. */
          paymentMethod: forma?.base ?? null,
          paymentFormId: forma?.id ?? null,
          paymentFormLabel: forma?.label ?? null,
          ...(desconto ?? {}),
          ...autoria,
        });
      },
      // Fechar o diálogo É o aviso: é assim que o dono lê "deu certo".
      avisar: () => {
        setAFechar(null);
        limparDesconto();
      },
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

  async function confirmarApagarSemana() {
    const booking = aApagar;
    if (!booking) return;
    setApagando(true);
    setErroApagar(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("apagarSemanaDoFixo", { barbershopId: tenant.id, bookingId: booking.id });
      setAApagar(null);
    } catch (err) {
      setErroApagar((err as { message?: string })?.message ?? "Não foi possível apagar agora.");
    } finally {
      setApagando(false);
    }
  }

  /* Só depois de o cancelamento ter dado certo. Abrir a conversa antes faria o
   * dono avisar o cliente de algo que pode ter falhado na escrita. */
  function avisarCancelamento(booking: Doc<BookingDoc>) {
    const firstName = booking.clientName.split(" ")[0];
    const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");
    if (!digitos) return;
    const quando = booking.date === hoje ? "de hoje" : `do dia ${formatarDiaCurto(booking.date)}`;
    const message = `Olá ${firstName}, seu horário das ${booking.time} ${quando} foi cancelado. Qualquer coisa, é só chamar para remarcar. — ${brand.name}`;
    window.open(`https://wa.me/${digitos}?text=${encodeURIComponent(message)}`, "_blank");
  }

  /**
   * Resposta a um pedido de encaixe.
   *
   * O servidor decide o desfecho (pode ter expirado, ou o cliente pode ter
   * cancelado no mesmo instante), e a tela mostra o que ele GRAVOU. O aviso ao
   * cliente vem depois, como um botão que o dono toca: abrir o WhatsApp
   * sozinho depois de uma espera é bloqueado pelo navegador do celular, e
   * avisar antes de gravar é o defeito que `soAvisaSeGravou` documenta.
   */
  const [respondendoEncaixe, setRespondendoEncaixe] = useState(false);
  const [respostaEncaixe, setRespostaEncaixe] = useState<
    | {
        booking: Doc<BookingDoc>;
        status: "confirmed" | "cancelled_by_shop" | "expired";
        /** Horários livres no mesmo dia, para a recusa já oferecer um. */
        sugestoes?: string[];
      }
    | { erro: string }
    | null
  >(null);

  async function responderEncaixe(booking: Doc<BookingDoc>, aprovar: boolean, sugestoes?: string[]) {
    if (respondendoEncaixe) return;
    setRespondendoEncaixe(true);
    setRespostaEncaixe(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        { barbershopId: string; bookingId: string; aprovar: boolean },
        { status: "confirmed" | "cancelled_by_shop" | "expired" }
      >("responderEncaixe", { barbershopId: tenant.id, bookingId: booking.id, aprovar });
      setRespostaEncaixe({ booking, status: r.status, sugestoes });
    } catch (err) {
      setRespostaEncaixe({
        erro: (err as { message?: string })?.message ?? "Não foi possível responder agora. Nada foi alterado.",
      });
    } finally {
      setRespondendoEncaixe(false);
    }
  }

  function linkDoAvisoDeEncaixe(
    booking: Doc<BookingDoc>,
    aprovado: boolean,
    sugestoes: string[] = []
  ): string | null {
    const digitos = String(booking.clientWhatsapp ?? "").replace(/\D/g, "");
    if (!digitos) return null;
    const nome = booking.clientName.split(" ")[0];
    const quando = booking.date === hoje ? "hoje" : `no dia ${formatarDiaCurto(booking.date)}`;
    const texto = aprovado
      ? `Olá ${nome}! Seu encaixe está confirmado: ${quando} às ${booking.time}. Te esperamos! — ${brand.name}`
      : sugestoes.length > 0
        ? `Olá ${nome}, não consigo te encaixar ${quando} às ${booking.time}, mas tenho livre ${quando} às ${sugestoes
            .slice(0, 3)
            .join(", ")}. Algum desses serve? Dá para marcar direto pelo app. — ${brand.name}`
        : `Olá ${nome}, infelizmente não consigo te encaixar ${quando} às ${booking.time}. Dá para escolher outro horário pelo app. — ${brand.name}`;
    return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
  }

  const avisos = (
    <>
      {remarcado && (
        <Card role="status" className="mb-2 flex flex-col gap-2 border-gold/40">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-ink">
              Remarcado: {remarcado.booking.clientName} agora é{" "}
              {remarcado.date === hoje ? "hoje" : formatarDiaCurto(remarcado.date)} às {remarcado.time}.
            </p>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => setRemarcado(null)}
              className="alvo-toque shrink-0 text-ink-muted hover:text-ink"
            >
              ×
            </button>
          </div>
          {(() => {
            const href = linkDoAvisoDeRemarcacao(remarcado.booking, remarcado.date, remarcado.time);
            return href ? (
              <a href={href} target="_blank" rel="noopener noreferrer" className="self-start">
                <Button variant="secondary">
                  Avisar {remarcado.booking.clientName.split(" ")[0]} no WhatsApp
                </Button>
              </a>
            ) : (
              <p className="text-xs text-ink-muted">Sem WhatsApp no cadastro: avise o cliente por outro meio.</p>
            );
          })()}
        </Card>
      )}
        {respostaEncaixe && (
          <Card
            role="status"
            className={
              "mb-2 flex flex-col gap-2 " +
              ("erro" in respostaEncaixe || respostaEncaixe.status === "expired"
                ? "border-danger/30"
                : "border-gold/40")
            }
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-ink">
                {"erro" in respostaEncaixe
                  ? respostaEncaixe.erro
                  : respostaEncaixe.status === "confirmed"
                    ? `Encaixe aprovado: ${respostaEncaixe.booking.clientName}, ${respostaEncaixe.booking.time} de ${formatarDiaCurto(respostaEncaixe.booking.date)}. Já está na agenda.`
                    : respostaEncaixe.status === "cancelled_by_shop"
                      ? `Encaixe recusado. ${respostaEncaixe.booking.clientName} vê a recusa em Reservas.`
                      : "O horário desse pedido já passou. Ele foi encerrado sem aprovação."}
              </p>
              <button
                type="button"
                aria-label="Fechar aviso"
                onClick={() => setRespostaEncaixe(null)}
                className="alvo-toque shrink-0 text-ink-muted hover:text-ink"
              >
                ×
              </button>
            </div>
            {!("erro" in respostaEncaixe) &&
              respostaEncaixe.status !== "expired" &&
              (() => {
                const href = linkDoAvisoDeEncaixe(
                  respostaEncaixe.booking,
                  respostaEncaixe.status === "confirmed",
                  respostaEncaixe.sugestoes
                );
                return href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="self-start">
                    <Button variant="secondary">
                      Avisar {respostaEncaixe.booking.clientName.split(" ")[0]} no WhatsApp
                    </Button>
                  </a>
                ) : (
                  <p className="text-xs text-ink-muted">Sem WhatsApp no cadastro: avise o cliente por outro meio.</p>
                );
              })()}
          </Card>
        )}
    </>
  );

  const modais = (
    <>
      {/* D22 · devolver valor de atendimento concluído. */}
      {aEstornar && (
        <EstornarValor
          aberto
          aoFechar={() => setAEstornar(null)}
          origem="servico"
          refId={aEstornar.id}
          descricao={`${aEstornar.clientName} · ${formatBRL(valorCobrado(aEstornar))} · ${aEstornar.time}`}
          /* O que o cliente PAGOU, e não o preço: com desconto, devolver o
           * valor cheio devolveria dinheiro que nunca entrou. O servidor já
           * limita pelo `grossAmount` do pagamento; a tela diz o mesmo. */
          valorPago={valorCobrado(aEstornar)}
        />
      )}

      {/* R1 · corrigir como o atendimento concluído foi pago.
          Modal PRÓPRIO, montado condicionalmente: cada abertura ganha uma chave
          de idempotência nova — reaproveitá-la faria a segunda correção cair no
          caminho de retry do servidor e a tela diria "pronto" sem nada ter
          acontecido. */}
      {aCorrigir && (
        <CorrigirPagamento
          aberto
          aoFechar={() => setACorrigir(null)}
          bookingId={aCorrigir.id}
          descricao={`${aCorrigir.clientName} · ${formatBRL(valorCobrado(aCorrigir))} · ${aCorrigir.time}`}
          /* O bruto do pagamento é o COBRADO: a correção troca a forma e a
           * taxa, e o desconto dado no fechamento continua valendo. */
          valor={valorCobrado(aCorrigir)}
          metodoAtual={aCorrigir.paymentMethod ?? null}
          formaAtual={aCorrigir.paymentFormId ?? null}
          formaAtualLabel={aCorrigir.paymentFormLabel ?? null}
        />
      )}

      {/* Uma pergunta e opções que JÁ concluem — nenhuma exige um "Confirmar"
          depois. Um segundo clique no gesto mais repetido do dia é o que faz o
          dono voltar para o caderno.
          Qual pergunta, depende de quem está na cadeira: o avulso responde
          COMO pagou; o mensalista responde SE houve cobrança — D2. */}
      <Modal
        open={!!aFechar}
        onClose={() => {
          setAFechar(null);
          limparDesconto();
        }}
        title={
          assinaturaDoFechamento ? "Concluir atendimento" : "Como o cliente pagou?"
        }
      >
        <p className="mb-4 text-sm text-ink-muted">
          {aFechar?.clientName} ·{" "}
          {aFechar && calculoDoDesconto.desconto > 0 ? (
            <>
              <s>{formatBRL(aFechar.value)}</s>{" "}
              <span className="font-medium text-ink">{formatBRL(calculoDoDesconto.cobrar)}</span>
            </>
          ) : aFechar ? (
            formatBRL(aFechar.value)
          ) : (
            ""
          )}
        </p>

        {aFechar && !assinaturaDoFechamento && (
          <AdicionarServico
            barbershopId={tenant.id}
            bookingId={aFechar.id}
            servicosAtuais={((aFechar as { serviceNames?: string[] }).serviceNames ?? []).map(String)}
            aoAdicionar={(novo) => setAFechar((atual) => (atual ? { ...atual, ...novo } : atual))}
          />
        )}

        {/* DESCONTO — decisões do dono em 28/09.
            Fechado por padrão: o gesto mais repetido do dia continua sendo um
            toque na forma de pagamento. Aberto, a conta aparece enquanto ele
            digita, e as formas de pagamento concluem com o valor descontado —
            nenhum "Aplicar" no meio. */}
        {podeDarDesconto && !descontoAberto && (
          <button
            type="button"
            onClick={() => setDescontoAberto(true)}
            className="alvo-toque mb-4 -mt-2 cursor-pointer text-sm font-medium text-gold-strong underline-offset-4 hover:underline"
          >
            Dar desconto
          </button>
        )}
        {podeDarDesconto && descontoAberto && aFechar && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised px-3 py-3">
            <div className="flex items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-muted">
                Desconto
                <input
                  inputMode="decimal"
                  autoComplete="off"
                  value={descontoTexto}
                  onChange={(e) => setDescontoTexto(e.target.value)}
                  placeholder={descontoTipo === "pct" ? "Ex.: 10" : "Ex.: 5,00"}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <div className="w-28 shrink-0">
                <Segmented
                  label="Desconto em reais ou em percentual"
                  value={descontoTipo}
                  onChange={setDescontoTipo}
                  options={[
                    { value: "valor", label: "R$" },
                    { value: "pct", label: "%" },
                  ]}
                />
              </div>
            </div>

            {/* A conta em tempo real. Acima do valor, a tela AVISA e não
                conclui: limitar em silêncio gravaria um número diferente do
                que o dono digitou (decisão 4 — sem teto, mas nunca acima do
                valor do atendimento). */}
            {descontoIlegivel ? (
              <p role="alert" className="text-sm text-danger">
                Digite só o número — por exemplo, 5 ou 5,50.
              </p>
            ) : calculoDoDesconto.excedeu ? (
              <p role="alert" className="text-sm text-danger">
                O desconto não pode passar do valor do atendimento ({formatBRL(aFechar.value)}).
              </p>
            ) : calculoDoDesconto.cortesia ? (
              <p className="text-sm text-ink">
                <span className="font-medium">Cortesia</span> · não entra dinheiro, nem
                taxa, e a comissão do barbeiro fica em {formatBRL(0)}.
              </p>
            ) : (
              <p className="text-sm text-ink">
                Cobrar <span className="font-medium">{formatBRL(calculoDoDesconto.cobrar)}</span>
                {calculoDoDesconto.desconto > 0 && (
                  <span className="text-ink-muted">
                    {" "}· {formatBRL(calculoDoDesconto.desconto)} de desconto; a
                    comissão e a taxa saem do valor cobrado
                  </span>
                )}
              </p>
            )}

            {/* Motivo OPCIONAL, um toque — tocar de novo desmarca. */}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Motivo do desconto (opcional)">
              {MOTIVOS_DE_DESCONTO.map((m) => {
                const ativo = descontoMotivo === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setDescontoMotivo(ativo ? null : m.id)}
                    className={
                      "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors " +
                      (ativo
                        ? "border-gold bg-gold/15 text-gold-strong"
                        : "border-border text-ink-muted hover:border-gold hover:text-ink")
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={limparDesconto}
              className="alvo-toque self-start cursor-pointer text-xs text-ink-muted hover:text-ink"
            >
              Tirar o desconto
            </button>
          </div>
        )}

        {/* D2 · o mensalista deixa de ser obrigado a escolher um meio de
            pagamento para dinheiro que não entrou.
            Era o F2 visto do balcão: o dono do plano Ilimitado concluía o corte
            e o produto perguntava "Como o cliente pagou? · R$ 50,00", com
            quatro opções e nenhuma saída honesta — cobrar de novo (receita e
            comissão fantasmas) ou não concluir (a agenda nunca fecha).

            Os meios de pagamento CONTINUAM aqui, e isso é deliberado: o quinto
            corte de um plano de quatro é cobrança legítima, e esconder as
            opções tiraria do dono a única chance de registrar o método — o
            gatilho financeiro só materializa na transição para `completed`, e
            não há caminho de volta para informá-lo depois. */}
        {assinaturaDoFechamento && (
          <div className="mb-5 flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5">
              <p className="text-sm text-ink">
                Mensalista · {assinaturaDoFechamento.planName}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {termosDoPlano(assinaturaDoFechamento)}
              </p>
            </div>

            <button
              type="button"
              disabled={salvando}
              onClick={() => void concluirCom(null)}
              className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/10 text-sm font-medium text-gold-strong transition-colors hover:border-gold hover:bg-gold/15"
            >
              <Check size={16} /> Concluir sem cobrar
            </button>

            {/* A tela não promete cobertura — ela diz quem decide e quando.
                Prometer aqui seria afirmar um fato que ainda não existe: a
                cobertura é gravada na conclusão, pelo servidor, com a cota do
                mês na mão. */}
            <p className="text-xs text-ink-muted">
              Quem decide se o plano cobre este atendimento é o fechamento, com a
              cota do mês. Se a cota já tiver acabado, ele entra como avulso — a
              agenda mostra o motivo, e aí a cobrança é com você.
            </p>

            <p className="mt-1 text-xs uppercase tracking-wider text-ink-muted">
              Ou registre a cobrança
            </p>
          </div>
        )}

        {/* Duas colunas até quatro formas; três quando a barbearia cadastrou
            mais, para a lista não virar uma coluna de rolagem no celular de
            quem está com o cliente esperando. */}
        {/* Cortesia (100%) conclui sem perguntar a forma: não entrou dinheiro,
            e oferecer "Pix" ou "Dinheiro" ali seria pedir ao dono que
            inventasse um meio para R$ 0,00 — decisão 2 do dono. */}
        {podeDarDesconto && calculoDoDesconto.cortesia && !descontoBloqueia ? (
          <button
            type="button"
            disabled={salvando}
            onClick={() => void concluirCom(null)}
            className="flex min-h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-gold/50 bg-gold/10 text-sm font-medium text-gold-strong transition-colors hover:border-gold hover:bg-gold/15"
          >
            <Check size={16} /> Concluir como cortesia
          </button>
        ) : (
        <div className={formasDeCobranca.length > 4 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3"}>
          {formasDeCobranca.map((forma) => (
            <button
              key={forma.id}
              type="button"
              disabled={salvando || descontoBloqueia}
              onClick={() => void concluirCom(forma)}
              className="flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-border px-2 text-center text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-strong"
            >
              <span className="leading-tight">{forma.label}</span>
              {forma.feePct > 0 && (
                <span className="text-[11px] font-normal text-ink-muted">
                  {formatPctPtBR(forma.feePct, 2)}
                </span>
              )}
            </button>
          ))}
        </div>
        )}
        {erroAoFechar && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {erroAoFechar}
          </p>
        )}
        <p className="mt-4 text-xs text-ink-muted">
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
        <p className="mb-3 text-sm text-ink">
          {faltaDe?.clientName} · {faltaDe?.time} ·{" "}
          {faltaDe ? formatBRL(faltaDe.value) : ""}
        </p>
        <p className="mb-5 text-sm text-ink-muted">
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
        <p className="mb-3 text-sm text-ink">
          {aCancelar?.clientName} · {aCancelar?.time} ·{" "}
          {aCancelar ? formatBRL(aCancelar.value) : ""}
        </p>
        <p className="mb-2 text-sm text-ink-muted">{devolucao?.label}</p>
        <p className="mb-5 text-sm text-ink-muted">
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

      <Modal
        open={!!aApagar}
        onClose={() => !apagando && setAApagar(null)}
        title="Apagar este agendamento?"
      >
        <p className="mb-3 text-sm text-ink">
          {aApagar?.clientName} · {aApagar ? formatarDiaCurto(aApagar.date) : ""} às {aApagar?.time}
        </p>
        <p className="mb-5 text-sm text-ink-muted">
          Só este agendamento do horário fixo sai da agenda — para quando o cliente adiantou ou adiou.
          Não conta como cancelamento, e os próximos agendamentos fixos dele continuam.
        </p>
        {erroApagar && (
          <p className="mb-4 text-sm text-danger" role="alert">
            {erroApagar}
          </p>
        )}
        <div className="flex gap-2">
          <Button className="flex-1" disabled={apagando} onClick={() => void confirmarApagarSemana()}>
            {apagando ? "Apagando…" : "Apagar agendamento"}
          </Button>
          <Button variant="secondary" className="flex-1" disabled={apagando} onClick={() => setAApagar(null)}>
            Voltar
          </Button>
        </div>
      </Modal>

      {aRemarcar && (
        <RemarcarAtendimento
          booking={aRemarcar}
          aoFechar={() => setARemarcar(null)}
          aoRemarcar={(date: string, time: string) => {
            setRemarcado({ booking: aRemarcar, date, time });
            setARemarcar(null);
          }}
        />
      )}
    </>
  );

  return {
    abrirConcluir: (b: Doc<BookingDoc>) => {
      setErroAoFechar(null);
      limparDesconto();
      /* 🔒 R1 · concluído nunca reabre a conclusão: vai para a correção. */
      if (b.status === "completed") return setACorrigir(b);
      setAFechar(b);
    },
    abrirFalta: (b: Doc<BookingDoc>) => {
      setErroDaFalta(null);
      setFaltaDe(b);
    },
    abrirCancelar: (b: Doc<BookingDoc>) => {
      setErroCancelar(null);
      setACancelar(b);
    },
    abrirApagarSemana: (b: Doc<BookingDoc>) => {
      setErroApagar(null);
      setAApagar(b);
    },
    abrirCorrecao: (b: Doc<BookingDoc>) => setACorrigir(b),
    abrirEstorno: (b: Doc<BookingDoc>) => setAEstornar(b),
    abrirRemarcar: (b: Doc<BookingDoc>) => setARemarcar(b),
    responderEncaixe: (b: Doc<BookingDoc>, aprovar: boolean, sugestoes?: string[]) =>
      void responderEncaixe(b, aprovar, sugestoes),
    respondendoEncaixe,
    temAviso: !!respostaEncaixe || !!remarcado,
    avisos,
    modais,
  };
}

function formatarDiaCurto(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
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


