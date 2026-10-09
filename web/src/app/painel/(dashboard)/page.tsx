"use client";

import { useEstadoDoFinanceiro } from "@/lib/tenant-live";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HelpCircle,
  PencilLine,
  Landmark,
  RotateCcw,
  UserX,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { EtiquetaEncaixe } from "@/components/agenda/etiqueta-encaixe";
import { EtiquetaMensalista, useMensalistasAtivos } from "@/components/agenda/etiqueta-mensalista";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import {
  liquidacaoDoAtendimento,
  metaDoStatus,
} from "@/lib/booking-status";
import {
  avaliarOperacao,
  estaAtrasado,
  minutosDeAtraso,
  repartirParaExibicao,
  type ActionIntent,
  type ActionItem,
} from "@/lib/action-center";
import { usePayments, useRefunds } from "@/lib/db/use-shop-data";
import { recebidoDoDia } from "@/lib/recebido-do-dia";
import { FiltroDeBarbeiro, useFiltroDeBarbeiro } from "@/components/agenda/filtro-de-barbeiro";
import { reservasDoFiltro } from "@/lib/grade-por-barbeiro";
import { formasAtivas } from "@/lib/formas-de-pagamento";
import { formatBRL, formatPhonePtBR, safePct } from "@/lib/format";
import { contar } from "@/lib/plural";
import { useTenant } from "@/lib/tenant-context";
import { useBookings, useServices, useStaff } from "@/lib/db/use-shop-data";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { ResumoDoDiaTopo } from "@/components/hoje/resumo-do-dia";
import { porBarbeiro, recebidoPorForma, resumoDeAmanha, resumoDoDia } from "@/lib/resumo-do-dia";
import { useAcoesDoAtendimento } from "@/components/agenda/acoes-do-atendimento";
import { caixaDoDia, mesPeriodo, previsaoDoDia } from "@/lib/analytics";
import { capacidadeDaData, horariosLivresRestantes } from "@/lib/jornada";
import { monthOf, OCCUPIES_SLOT } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { toISODate } from "@/lib/format";

export default function PainelHojePage() {
  const tenant = useTenant();
  const estadoDoFinanceiro = useEstadoDoFinanceiro();
  /* As formas que o dono cadastrou — ou as quatro de sempre, derivadas das
   * taxas, para a barbearia que nunca abriu a tela de Ajustes. */
  const formasDeCobranca = formasAtivas(tenant.policies);
  const { items: todas, status, error: erroDaAgenda } = useBookings();
  const { items: services, status: statusServicos } = useServices();
  const payments = usePayments();
  const refunds = useRefunds();
  const { items: equipe } = useStaff();
  /* Filtro por barbeiro: só a lista da agenda do dia. Os números do topo e o
   * caixa são da barbearia inteira. */
  const [filtro, setFiltro] = useFiltroDeBarbeiro(equipe);
  const variosBarbeiros = equipe.filter((b) => b.active !== false).length > 1;
  const nomeDoBarbeiro = (b: { staffId?: string | null; staffName?: string | null }) =>
    equipe.find((s) => s.id === b.staffId)?.name ?? b.staffName ?? "—";

  const hoje = toISODate(new Date());
  const bookings = todas.filter((b) => b.date === hoje);

  /* O dia que a AGENDA mostra — os números do topo continuam sendo de hoje.
   * A agenda só mostrava hoje: o dono não tinha onde ver amanhã, nem conferir
   * ontem (pedido em 24/09). `null` é "hoje" e acompanha o relógio: aberta
   * de um dia para o outro, a tela não fica presa na data de ontem. */
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const dia = diaEscolhido ?? hoje;
  /* Para que lado a lista desliza ao trocar de dia: dia seguinte entra pela
   * direita, anterior pela esquerda — o mesmo sentido das setas ‹ ›. `null`
   * até a primeira troca, para a tela não abrir já deslizando. */
  const [sentidoDoDia, setSentidoDoDia] = useState<"antes" | "depois" | null>(null);
  const ehHoje = dia === hoje;

  const agora = useRelogio();
  const toleranciaAtrasoMin = tenant.policies.booking.lateToleranceMinutes;

  const getServicesByIds = (ids: string[]) =>
    ids.map((id) => services.find((s) => s.id === id)).filter(Boolean) as Array<{ name: string }>;

  /* Capacidade é POR CADEIRA. Com três barbeiros são três agendas paralelas —
   * calcular como se fosse uma faz a tela mostrar "lotado" com duas cadeiras
   * vazias, e a taxa de ocupação sair três vezes maior que a real. */
  const barbeirosAtivos = Math.max(equipe.filter((b) => b.active !== false).length, 1);
  /* Capacidade DE HOJE, não a do dia comum: numa terça que fecha às 17:30 a
   * ocupação era calculada contra quatro horários que a barbearia não abre, e
   * um dia cheio aparecia como 78%. Em dia fechado por exceção a capacidade é
   * zero, e a barra some em vez de mostrar ocupação de um dia que não houve. */
  const totalSlots =
    capacidadeDaData({
      schedule: tenant.schedule,
      weekday: new Date().getDay(),
      date: hoje,
    }) * barbeirosAtivos;

  /* `localeCompare` em "HH:mm" ordena certo porque o formato é de largura fixa
   * e zero-padded — "09:00" < "10:00" < "12:00" como texto. */
  /* Sem filtro por status: a seção "Encaixes pendentes" saiu junto com o
   * encaixe, e um `fit_in_requested` antigo ficaria invisível — some da agenda
   * e não tem mais onde ser encontrado. Ele aparece na tabela como qualquer
   * outra reserva, com o rótulo que `metaDoStatus` já dá. */
  /* `?? ""` porque uma reserva sem `time` derrubava a tela INTEIRA do dia.
   *
   * `undefined.localeCompare` estoura dentro do `sort`, o erro sobe até o error
   * boundary e o dono vê "Esta tela não abriu" — perdendo a agenda, o caixa e o
   * Action Center por causa de um documento. As regras permitem escrita direta
   * em `bookings` ao dono e à equipe (`firestore.rules:246`), então o campo pode
   * faltar sem que nenhuma tela tenha errado. Encontrado em 20/08, ao semear uma
   * reserva pelo Admin SDK sem o campo. */
  const reservasDaAgenda = todas.filter((b) => b.date === dia);
  const bookingsDoDia = reservasDoFiltro(reservasDaAgenda, filtro)
    .slice()
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  const agendados = bookings.filter((b) => OCCUPIES_SLOT.includes(b.status));

  /* De agora em diante, por cadeira, pela duração real — ver
   * `horariosLivresRestantes`. Era "capacidade do dia − número de reservas". */
  const idsAtivos = equipe.filter((b) => b.active !== false).map((b) => b.id);
  const horariosLivres = horariosLivresRestantes({
    schedule: tenant.schedule,
    weekday: new Date().getDay(),
    date: hoje,
    agora: agora
      ? `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`
      : undefined,
    barbeiros: idsAtivos.length > 0 ? idsAtivos : [""],
    ocupadas: agendados,
  });
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
  const itensDeAcaoBrutos = avaliarOperacao({
    bookings,
    /* Sem filtrar por data: o que conta como "ficou para trás" é decisão de
     * operação, e ela mora no motor. A tela entrega tudo que conhece. */
    todasAsReservas: todas,
    hoje,
    services,
    statusServicos,
    payments: payments.items,
    formas: formasDeCobranca,
    periodo: mesPeriodo(monthOf(hoje)),
    agora,
    toleranciaAtrasoMin,
  });
  /* "Taxas não informadas" só com as taxas CONFIRMADAS pelo servidor (02/10):
   * o cache local já afirmou 0% para taxas que existiam. */
  const itensDeAcao = estadoDoFinanceiro === "confirmado"
    ? itensDeAcaoBrutos
    : itensDeAcaoBrutos.filter((i) => i.id !== "taxas-nao-configuradas");
  /* O atendimento atrasado de HOJE já está na agenda logo abaixo, com os
   * mesmos botões — no "Precisa de você" ele aparecia duas vezes na mesma
   * tela (apontado pelo dono em 24/09). Fica só na agenda, em destaque.
   * Com a agenda mostrando outro dia, ele volta para cá: senão sumiria. */
  const itensSoDaColuna = itensDeAcao.filter(
    (i) => !(ehHoje && i.id.startsWith("atendimento-atrasado:"))
  );
  const { visiveis: acoesVisiveis, ocultos: acoesOcultas } =
    repartirParaExibicao(itensSoDaColuna);

  const [balcaoAberto, setBalcaoAberto] = useState(false);
  const atendimento = useAcoesDoAtendimento();
  /* Quem é mensalista (plano ativo): etiqueta ao lado do nome e no
   * pagamento dos horários em aberto — no fechamento é que o plano decide. */
  const mensalistas = useMensalistasAtivos();

  /* D2 · o caixa do dia nasce do PAGAMENTO, não da reserva concluída.
   *
   * Passava `agendados`, e toda reserva concluída virava dinheiro. Com o
   * atendimento coberto pelo plano isso deixou de valer: o servidor conclui,
   * grava `cobertura` e não cria pagamento nenhum — e a tela exibia
   * `Recebido até agora R$ 50,00` de dinheiro que não entrou.
   *
   * Aqui entram TODAS as origens do dia — serviço, produto e mensalidade —
   * porque a pergunta do bloco é "quanto passou pelo meu caixa hoje", e a
   * gaveta não distingue de onde veio. É também o que faz o número parar de
   * divergir do Fluxo de Caixa por população. */
  const pagamentosDeHoje = payments.items.filter((p) => p.date === hoje);
  const caixaHoje = caixaDoDia(pagamentosDeHoje);
  /* Menos o que voltou para o cliente hoje — a mesma conta do fechamento do
   * Telegram. O detalhe por forma (`caixaHoje`) segue bruto: a devolução não
   * grava a forma de cada fatia, e inventar a divisão seria chute. */
  const recebidoReal = recebidoDoDia(caixaHoje.total, refunds.items, hoje).recebido;

  /* D3 · o recebido tem fonte PRÓPRIA desde o D2, e some pela falha dela.
   *
   * Enquanto o caixa saía de `bookings`, um gate só bastava. Agora a agenda
   * pode estar ilegível com os pagamentos perfeitamente legíveis — e nesse dia
   * "quanto entrou" continua sendo uma pergunta respondível. É a segunda metade
   * da regra do D3: suprimir o que não dá para apurar, preservar o que dá. */
  /* Sem ler os estornos, o recebido seria maior que o caixa: não apurar. */
  const pagamentosIlegiveis = payments.status === "erro" || refunds.status === "erro";

  /* D3 · sem a agenda, todo número desta tela é zero por falta de leitura.
   *
   * `agendados` sai de `bookings`; com a coleção ilegível ela vira `[]` e a
   * tela afirma "0 atendimentos", "0% de ocupação" e um caixa do dia zerado —
   * exatamente o que o dono veria num dia em que ninguém apareceu. O banner de
   * erro fica na seção da agenda, abaixo destes números. */
  const agendaIlegivel = status === "erro";


  /* A tela não decide nada: recebe a intenção que o motor declarou e sabe onde
   * ela acontece. `navegar` nem chega aqui — vira `Link` no próprio item. */
  function executarIntencao(intent: ActionIntent) {
    if (intent.kind === "navegar") return;
    /* Procura em TODAS, não só nas de hoje: o item de desfecho esquecido
     * aponta para uma reserva de outro dia, e buscá-la na lista do dia faria o
     * clique não fazer nada — silenciosamente. */
    const alvo = todas.find((b) => b.id === intent.bookingId);
    if (!alvo) return;

    if (intent.kind === "responderEncaixe") return atendimento.responderEncaixe(alvo, intent.aprovar);
    if (intent.kind === "corrigirPagamento") return atendimento.abrirCorrecao(alvo);
    if (intent.kind === "marcarFalta") return atendimento.abrirFalta(alvo);

    /* 🔒 R1 · o modal de conclusão NUNCA reabre sobre um atendimento concluído.
     *
     * Era aqui o vazamento, e este `if` é o elo que o fecha. O card crítico
     * apontava para cá, o modal de conclusão gravava `bookings.paymentMethod`,
     * o card sumia porque `!b.paymentMethod` virava falso — e o `PaymentDoc`,
     * de onde sai todo o dinheiro das telas, ficava com método nulo e taxa zero
     * para sempre.
     *
     * A razão de manter a guarda mesmo depois de o card passar a declarar
     * `corrigirPagamento` é mais forte que o vazamento: reabrir `completed` é a
     * MESMA superfície por onde o "Veio depois" opera (`no_show` → `completed`
     * rematerializa o pagamento com `set` sem merge e relê policies e staff de
     * hoje). As duas operações não podem compartilhar caminho, e um avaliador
     * novo que declare `fecharAtendimento` sobre um concluído não deve
     * conseguir reabrir aquela porta por engano.
     *
     * Concluído vai para a correção, que é a porta certa para os dois casos. */
    atendimento.abrirConcluir(alvo);
  }

  return (
    /* Uma coluna só, em todo tamanho (02/10). A coluna lateral de 360px do
     * "Precisa de você" espremia a agenda mesmo em tela larga e cortava a
     * coluna "Editar cobrança" (pedido do dono). Os avisos viram uma faixa de
     * cartões ACIMA da agenda, e a tabela fica com a largura inteira. */
    <div className="grid grid-cols-1 gap-5 pt-1 md:gap-8 md:pt-2">
      {/* Topo da tela (02/10): data + agora/próximo + uma régua de números.
          Mesmos números de antes (agendados, ocupação, horários livres,
          previsão e recebido), cada um com a sua fonte — e a previsão segue
          sem barra contra o recebido (F5/F6, ver ResumoDoDiaTopo). */}
      <ResumoDoDiaTopo
        dataLonga={new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
        resumo={resumoDoDia({
          reservas: bookings,
          agora,
          toleranciaMin: toleranciaAtrasoMin,
          nomeDoServico: (ids) => getServicesByIds(ids).map((s) => s.name).join(" + ") || "Atendimento",
        })}
        ocupacaoPct={ocupacaoPct}
        horariosLivres={horariosLivres}
        previsao={previsaoHoje}
        recebido={recebidoReal}
        fatiasDoRecebido={recebidoPorForma(caixaHoje)}
        agendaIlegivel={agendaIlegivel}
        pagamentosIlegiveis={pagamentosIlegiveis}
        temRelogio={agora !== null}
        nomeDoBarbeiro={(id) => equipe.find((b) => b.id === id)?.name ?? null}
        linhasPorBarbeiro={porBarbeiro(bookings)}
        amanha={resumoDeAmanha({
          reservas: todas.filter((b) => b.date === somarDias(hoje, 1)),
          nomeDoServico: (ids) => getServicesByIds(ids).map((s) => s.name).join(" + ") || "Atendimento",
        })}
        /* Mesma troca de dia das setas da agenda, e rola até ela. */
        aoVerAmanha={() => {
          setSentidoDoDia("depois");
          setDiaEscolhido(somarDias(hoje, 1));
          document.getElementById("agenda-do-dia")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
        /* Os MESMOS fluxos da linha da agenda: o modal de pagamento e o de
           falta — nenhuma regra nova aqui. */
        aoConcluir={(id) => {
          const b = todas.find((x) => x.id === id);
          if (b) atendimento.abrirConcluir(b);
        }}
        aoMarcarFalta={(id) => {
          const b = todas.find((x) => x.id === id);
          if (b) atendimento.abrirFalta(b);
        }}
      />

      {(acoesVisiveis.length > 0 || atendimento.temAviso) && (
        <section >
        {atendimento.avisos}
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Precisa de você
          </h2>
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3 xl:grid-cols-3">
            {acoesVisiveis.map((item) => (
              <ItemDeAcao key={item.id} item={item} onExecutar={executarIntencao} />
            ))}
            {/* "as próximas" era plural fixo num número que começa em 1.
                A cauda passa a ser invariável ("o resto"), e só a contagem
                concorda — ver `lib/plural.ts`. */}
            {acoesOcultas.length > 0 && (
              <p className="px-1 text-xs text-ink-muted">
                E mais {contar(acoesOcultas.length, "pendência", "pendências")} na
                fila — resolva as de cima para ver o resto.
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
      <section id="agenda-do-dia" className="scroll-mt-4">
        {/* D13 · o botão de marcar mora AQUI, na agenda do dia.
         *
         * É onde o dono está quando alguém chega no balcão ou liga — e era
         * exatamente o lugar onde ele procurou e não achou. Nenhuma das 8 telas
         * do painel criava reserva: o produto tinha um caminho só, o app do
         * cliente autenticado. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Agenda
          </h2>
          {/* No celular quem marca é o "+" da barra; o mesmo botão aqui era
              a segunda porta para a mesma ação, lado a lado na tela. */}
          <Button
            variant="secondary"
            onClick={() => setBalcaoAberto(true)}
            className="hidden min-h-9 px-3 text-xs md:inline-flex"
          >
            <CalendarPlus size={14} />
            Marcar atendimento
          </Button>
        </div>
        <SeletorDeDia
          dia={dia}
          hoje={hoje}
          total={status === "pronto" ? reservasDaAgenda.length : null}
          aoMudar={(d) => {
            if (d === dia) return;
            setSentidoDoDia(d > dia ? "depois" : "antes");
            setDiaEscolhido(d === hoje ? null : d);
          }}
        />
        <FiltroDeBarbeiro equipe={equipe} valor={filtro} aoMudar={setFiltro} className="mt-2" />
        {status === "pronto" && reservasDaAgenda.length > 0 && bookingsDoDia.length === 0 && (
          <p className="mt-2 text-sm text-ink-muted">
            Nenhum horário de {equipe.find((b) => b.id === filtro)?.name ?? "este barbeiro"} neste dia.
          </p>
        )}
        {/* `key` no dia: a lista de cada dia é outra, e remontar é o que faz a
            entrada tocar de novo. Os dados de todos os dias já estão na
            memória (`useBookings`), então não há carregamento no meio. */}
        <div
          key={dia}
          className={sentidoDoDia ? `dia-entra-${sentidoDoDia}` : undefined}
        >
        {status === "carregando" && <LoadingRows rows={3} oQue="sua agenda" />}
        {status === "erro" && <ErroAoCarregar oQue="sua agenda" erro={erroDaAgenda} />}
        {status === "pronto" && reservasDaAgenda.length === 0 && (
          <EmptyState
            icon={CalendarCheck}
            title={
              ehHoje
                ? "Nenhum horário marcado para hoje"
                : `Nenhum horário em ${formatarDiaCurto(dia)}`
            }
            description={
              dia < hoje
                ? "Nada ficou registrado neste dia."
                : "Marque quem chegou no balcão ou compartilhe seu link para receber agendamentos pelo app."
            }
            actionLabel="Marcar atendimento"
            onAction={() => setBalcaoAberto(true)}
          />
        )}
        {/* Ordenado por HORA.
         *
         * A lista vinha na ordem da coleção — que é por data decrescente, e
         * dentro do mesmo dia, arbitrária. Na tela isso aparecia como
         * "09:00, 10:00, 12:00, 11:00": a agenda do dia fora de ordem, que é
         * justamente a informação que o dono lê primeiro de manhã. */}
        {bookingsDoDia.length > 0 && (() => {
          const linhas = bookingsDoDia.map((booking) => {
            /* Leitura guardada: um status fora da união derrubava a tela
             * Hoje INTEIRA — `undefined.tone`, e o dono ficava sem a
             * agenda do dia por causa de uma linha. Ver `metaDoStatus`. */
            const statusMeta = metaDoStatus(booking.status);
            const liquidacao = liquidacaoDoAtendimento(booking);
            const bookingServices = getServicesByIds(booking.serviceIds);
            const emAberto =
              booking.status === "confirmed" ||
              booking.status === "confirmed_by_client";
            /* A falta não é beco sem saída: cliente que aparece 40 min
             * depois volta a ser atendimento pelo mesmo caminho. Sem
             * isso, um toque errado no "Não veio" viraria receita perdida
             * no relatório, e a única correção seria mexer no banco. */
            /* Concluir é dizer que o corte ACONTECEU — num dia que ainda não
             * chegou, isso seria o sistema afirmando o que não houve. */
            const podeConcluir =
              (emAberto || booking.status === "no_show") && booking.date <= hoje;
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

            return {
              booking, statusMeta, liquidacao, bookingServices, emAberto,
              podeConcluir, atrasado, atrasoMin, digitos,
            };
          });
          type Linha = (typeof linhas)[number];

          const telefone = ({ digitos }: Linha) => (
            <>
              {digitos ? (
                /* Toque no telefone abre a conversa. É o que o dono faz
                 * hoje quando o cliente atrasa — e fazia saindo do app. */
                <a
                  href={`https://wa.me/${digitos}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="alvo-toque text-ink-muted underline-offset-2 transition-colors hover:text-gold-strong hover:underline"
                >
                  {formatPhonePtBR(digitos)}
                </a>
              ) : (
                <span className="text-ink-muted">—</span>
              )}
            </>
          );
          /* D2 · diz como o atendimento foi LIQUIDADO, não só que meio de
           * pagamento tem gravado. O corte coberto pelo plano não tem
           * pagamento — e exibia "A pagar no salão" depois de concluído, que
           * é o produto mandando cobrar de novo o que a mensalidade pagou. */
          const pagamento = ({ liquidacao, booking, emAberto }: Linha) =>
            emAberto && !liquidacao.coberto && mensalistas.has(booking.clientId) ? (
              <>
                <span className="text-ink">Mensalista</span>
                <span className="block text-[11px]">entra no plano, se tiver cota</span>
              </>
            ) : (
            <>
              {liquidacao.coberto ? (
                <span className="text-ink">{liquidacao.label}</span>
              ) : (
                liquidacao.label
              )}
              {/* Na tabela, só a cota ("1 de 4 no mês"): o nome do plano
                  inteiro quebrava em quatro linhas (03/10). Ele fica no
                  título, ao passar o mouse. */}
              {liquidacao.detalhe && (
                <span className="block truncate text-[11px]" title={liquidacao.detalhe}>
                  {liquidacao.detalheCurto ?? liquidacao.detalhe}
                </span>
              )}
            </>
            );
          const acoes = ({ booking, statusMeta, liquidacao, emAberto, podeConcluir, atrasado }: Linha) => (
            <div className="flex flex-wrap items-center gap-x-1 gap-y-2 md:flex-nowrap">
              {/* Concluído é o estado BOM do dia, e era um cinza igual ao de
                  qualquer outro — o olho não separava o feito do pendente
                  (pedido do dono, 30/09). Verde só aqui; falta e cancelado
                  seguem com a etiqueta de sempre. */}
              {booking.status === "completed" ? (
                <span className="mr-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                  <Check size={13} strokeWidth={2.5} /> Concluído
                </span>
              ) : (
                !emAberto && <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
              )}
              {podeConcluir && (
                <button
                  onClick={() => {
                    atendimento.abrirConcluir(booking);
                  }}
                  className="alvo-toque flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ink-muted transition-colorshover:border-success hover:text-success"
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
                    atendimento.abrirFalta(booking);
                  }}
                  className="alvo-toque flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ink-muted transition-colorshover:border-danger hover:text-danger"
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
                    atendimento.abrirCancelar(booking);
                  }}
                  className="alvo-toque flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ink-muted transition-colorshover:border-danger hover:text-danger"
                >
                  <CalendarX size={14} /> Cancelar
                </button>
              )}
              {emAberto && (
                <button
                  onClick={() => atendimento.abrirRemarcar(booking)}
                  className="alvo-toque flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-ink-muted transition-colorshover:border-gold hover:text-gold-strong"
                >
                  <CalendarClock size={14} /> Remarcar
                </button>
              )}
              {/* R1 · A PORTA da correção de pagamento.
                  Ela fica na linha do atendimento concluído, e não
                  atrás do card crítico, porque o card só enxerga o
                  caso 1 — o atendimento que terminou sem método.
                  O caso 2 (o dono marcou Pix e o cliente pagou em
                  dinheiro) não aciona alerta nenhum: com o método
                  preenchido, `!b.paymentMethod` é falso e nenhuma
                  tela do produto o detecta. Sem esta linha, metade
                  da matriz não teria por onde ser alcançada.

                  Não aparece no coberto pelo plano: ali não existe
                  `PaymentDoc` — a mensalidade já é a receita
                  daquele corte —, e o servidor recusa. Oferecer o
                  botão para depois recusar seria a interface
                  prometendo o que o sistema não faz. */}
              {booking.status === "completed" && (booking.edicoesDeCobranca?.length ?? 0) > 0 && (
                <span
                  title="Cobrança editada"
                  aria-label="Cobrança editada"
                  className="flex h-6 shrink-0 items-center gap-1 rounded-md bg-surface-raised px-1.5 text-[11px] text-ink-muted"
                >
                  <PencilLine size={12} /> editada
                </span>
              )}
              {booking.status === "completed" && !liquidacao.coberto && !liquidacao.cortesia && (
                <button
                  onClick={() => atendimento.abrirCorrecao(booking)}
                  title="Editar serviços, desconto ou forma de pagamento"
                  className={ACAO_DISCRETA}
                >
                  <CreditCard size={13} /> Editar
                </button>
              )}
              {/* D22 · e este é o "outro caminho" que o comentário
                  acima mencionava e que não existia.
                  Devolver dinheiro de atendimento REALIZADO é
                  estorno, não cancelamento: o serviço aconteceu, e
                  o registro dele fica. */}
              {booking.status === "completed" && !liquidacao.cortesia && (
                <button
                  onClick={() => atendimento.abrirEstorno(booking)}
                  title="Devolver dinheiro deste atendimento"
                  className={ACAO_DISCRETA}
                >
                  <RotateCcw size={13} /> Devolver
                </button>
              )}
            </div>
          );

          return (
            <>
              {/* Celular: um cartão por atendimento, com as ações À VISTA.
                  A tabela de 720px cortava em "SERVIÇ…" e deixava Concluir e
                  Cancelar fora da tela, atrás de uma rolagem lateral que nada
                  indicava — na tela que o dono usa em pé, com o celular na mão
                  (rodada E2E de 23/09). */}
              <div className="flex flex-col gap-2 md:hidden">
                {linhas.map((l) => (
                  <Card
                    key={l.booking.id}
                    className={cn(
                      "flex flex-col gap-2 p-4",
                      l.atrasado && "border-danger/40 bg-danger/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg text-gold-strong">
                          {l.booking.time}
                        </p>
                        {l.atrasado && (
                          <p className="text-xs font-medium text-danger">
                            Em aberto há {l.atrasoMin} min — atendeu ou não veio?
                          </p>
                        )}
                        <p className="truncate text-sm font-medium text-ink">{l.booking.clientName}</p>
                        <p className="truncate text-xs text-ink-muted">
                          {variosBarbeiros && (
                            <span className="font-medium text-ink">{nomeDoBarbeiro(l.booking)} · </span>
                          )}
                          {l.bookingServices.map((x) => x.name).join(" + ")}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-ink">{formatBRL(l.booking.value)}</p>
                        <div className="text-xs text-ink-muted">{pagamento(l)}</div>
                      </div>
                    </div>
                    <div className="text-xs">{telefone(l)}</div>
                    {acoes(l)}
                  </Card>
                ))}
              </div>

              <Card className="table-scroll hidden overflow-x-auto p-0 md:block">
                <table className={cn("w-full table-fixed text-[13px]", variosBarbeiros ? "min-w-[1030px]" : "min-w-[920px]")}>
                  {/* Larguras FIXAS (02/10): a tabela se ajustava ao conteúdo
                      de cada dia e as colunas pulavam ao trocar de data. */}
                  <colgroup>
                    <col className="w-[72px]" />
                    <col className="w-[21%]" />
                    {variosBarbeiros && <col className="w-[110px]" />}
                    <col className="w-[128px]" />
                    <col className="w-[19%]" />
                    <col className="w-[16%]" />
                    <col className="w-[96px]" />
                    <col className="w-[300px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-ink-muted">
                      <th className="px-3 py-2.5 font-medium md:pl-5">Hora</th>
                      <th className="px-3 py-2.5 font-medium">Cliente</th>
                      {variosBarbeiros && <th className="px-3 py-2.5 font-medium">Barbeiro</th>}
                      <th className="px-3 py-2.5 font-medium">Telefone</th>
                      <th className="px-3 py-2.5 font-medium">Serviço</th>
                      <th className="px-3 py-2.5 font-medium">Pagamento</th>
                      <th className="px-3 py-2.5 text-right font-medium">Valor</th>
                      <th className="px-3 py-2.5 font-medium md:pr-5">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l) => (
                      <tr
                        key={l.booking.id}
                        className={cn(
                          "border-b border-border/60 transition-colors last:border-0",
                          l.atrasado ? "bg-danger/5 hover:bg-danger/10" : "hover:bg-surface-raised/60"
                        )}
                      >
                        <td className="whitespace-nowrap px-3 py-2.5 font-display tabular-nums text-gold-strong md:pl-5">
                          {l.booking.time}
                          {l.atrasado && (
                            <span className="block font-sans text-[11px] text-danger">
                              {l.atrasoMin} min atrasado
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-ink">
                          {/* Etiquetas SEMPRE ao lado do nome (02/10): antes
                              quebravam para baixo quando o nome era longo. */}
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="min-w-0 truncate" title={l.booking.clientName}>
                              {l.booking.clientName}
                            </span>
                            {l.booking.isFitIn && <EtiquetaEncaixe className="shrink-0" />}
                            {mensalistas.has(l.booking.clientId) && <EtiquetaMensalista className="shrink-0" />}
                          </div>
                        </td>
                        {variosBarbeiros && (
                          <td className="truncate px-3 py-2.5 text-ink" title={nomeDoBarbeiro(l.booking)}>
                            {nomeDoBarbeiro(l.booking)}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-2.5">{telefone(l)}</td>
                        <td className="px-3 py-2.5 text-ink-muted">
                          {l.bookingServices.map((x) => x.name).join(" + ")}
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">{pagamento(l)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-ink">
                          {formatBRL(l.booking.value)}
                        </td>
                        <td className="px-3 py-2.5 md:pr-5">{acoes(l)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          );
        })()}
        </div>
      </section>

      {!agendaIlegivel && (
      <section id="caixa-de-hoje" className="scroll-mt-4">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
          Caixa de hoje
        </h2>
        <Card className="flex flex-col divide-y divide-border p-0 md:flex-row md:divide-x md:divide-y-0">
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <Landmark size={16} className="shrink-0 text-gold-strong" />
            <span className="flex-1 text-sm text-ink-muted">Pix</span>
            <span className="font-display font-semibold text-ink">
              {formatBRL(caixaHoje.pix)}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <CreditCard size={16} className="shrink-0 text-gold-strong" />
            <span className="flex-1 text-sm text-ink-muted">Cartão</span>
            <span className="font-display font-semibold text-ink">
              {formatBRL(caixaHoje.cartao)}
            </span>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
            <Wallet size={16} className="shrink-0 text-gold-strong" />
            <span className="flex-1 text-sm text-ink-muted">Dinheiro</span>
            <span className="font-display font-semibold text-ink">
              {formatBRL(caixaHoje.dinheiro)}
            </span>
          </div>
          {/* D31 · a quarta coluna, que existia no motor e em tela nenhuma.
           *
           * `caixaDoDia` devolve `naoInformado` desde `843b84c`, e nenhuma tela
           * o consumia: o bloco continuava com três colunas enquanto o TOTAL
           * conta todas as reservas recebidas. Um atendimento concluído sem
           * meio de pagamento informado — estado que o servidor grava de
           * propósito, com `paymentMethod: null` — entrava na conta e em coluna
           * nenhuma. O dono somava as três na mão, não chegava no total, e a
           * diferença não tinha onde ser explicada.
           *
           * Só aparece quando existe: uma coluna eternamente em R$ 0,00
           * ensinaria que falta informar meio de pagamento em todo atendimento,
           * que é o oposto do caso normal. */}
          {caixaHoje.naoInformado > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 md:flex-1 md:p-5">
              <HelpCircle size={16} className="shrink-0 text-ink-muted" />
              <span className="flex-1 text-sm text-ink-muted">
                Sem forma informada
              </span>
              <span className="font-display font-semibold text-ink">
                {formatBRL(caixaHoje.naoInformado)}
              </span>
            </div>
          )}
        </Card>
        {caixaHoje.naoInformado > 0 && (
          <p className="mt-1.5 text-xs text-ink-muted">
            Entrou no total, mas não dá para conferir contra a gaveta enquanto
            não souber como foi pago.
          </p>
        )}
      </section>
      )}

      {/* D13 · o caminho que faltava.
          A reserva criada aqui aparece na agenda acima assim que o servidor
          confirma — o listener do Firestore é a mesma fonte da tabela, então não
          há recarregar nem estado paralelo que possa divergir. */}
      <MarcarNoBalcao open={balcaoAberto} onClose={() => setBalcaoAberto(false)} />

      {atendimento.modais}
    </div>
  );
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
        ? "text-gold-strong"
        : "text-ink-muted";

  const cabecalho = (
    <>
      <p className="text-sm text-ink">{item.title}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{item.reason}</p>
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
        <p className="mt-1.5 text-xs font-medium text-gold-strong">
          {item.actionLabel}
        </p>
      </div>
      <ChevronRight size={16} className="mt-0.5 shrink-0 text-ink-muted" />
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

/** "qui., 25/09" — a data curta que cabe no botão e na mensagem ao cliente. */
function formatarDiaCurto(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * Anda a agenda um dia por vez, ou salta para qualquer data pelo calendário
 * do próprio aparelho. "Hoje" volta com um toque — é o dia que o dono mais
 * olha, e ele não deve precisar achar a data de hoje no calendário.
 */
function SeletorDeDia({
  dia,
  hoje,
  total,
  aoMudar,
}: {
  dia: string;
  hoje: string;
  total: number | null;
  aoMudar: (dia: string) => void;
}) {
  const nome =
    dia === hoje
      ? "Hoje"
      : dia === somarDias(hoje, 1)
        ? "Amanhã"
        : dia === somarDias(hoje, -1)
          ? "Ontem"
          : null;
  const botao =
    "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-ink-muted transition-colors hover:border-gold hover:text-gold-strong";
  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={() => aoMudar(somarDias(dia, -1))}
        aria-label="Dia anterior"
        className={botao}
      >
        <ChevronLeft size={18} />
      </button>
      {/* O input de data cobre o rótulo inteiro, invisível: o toque abre o
          calendário nativo — no celular é a roda de datas que o dono já conhece. */}
      <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm text-ink md:flex-none md:min-w-56">
        <span className="truncate font-medium">{nome ?? formatarDiaCurto(dia)}</span>
        {nome && <span className="text-ink-muted">{formatarDiaCurto(dia)}</span>}
        {total !== null && (
          <span className="hidden text-xs text-ink-muted sm:inline">
            · {contar(total, "horário", "horários")}
          </span>
        )}
        <input
          type="date"
          value={dia}
          onChange={(e) => e.target.value && aoMudar(e.target.value)}
          aria-label="Escolher o dia da agenda"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button
        type="button"
        onClick={() => aoMudar(somarDias(dia, 1))}
        aria-label="Próximo dia"
        className={botao}
      >
        <ChevronRight size={18} />
      </button>
      {dia !== hoje && (
        <button
          type="button"
          onClick={() => aoMudar(hoje)}
          className="flex h-10 shrink-0 cursor-pointer items-center rounded-xl bg-gold/15 px-3 text-sm font-medium text-gold-strong"
        >
          Hoje
        </button>
      )}
    </div>
  );
}

/* Ação de atendimento JÁ concluído: rara, e por isso quieta. Com borda e o
 * mesmo peso de "Concluir", "Corrigir pagamento" e "Devolver" empilhavam em
 * duas linhas e disputavam o olho com o status (30/09). */
const ACAO_DISCRETA =
  "inline-flex min-h-9 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink";
