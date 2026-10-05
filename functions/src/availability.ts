import { HttpsError, onCall } from "firebase-functions/v2/https";
import { idSeguro, vinculosDe } from "./acesso";
import { ehMensalistaAtivo, limiteDoCliente } from "./janela";
import { getFirestore } from "firebase-admin/firestore";
import { diaDaSemanaNoFuso, hojeNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";
import { janelaLivre, janelasOcupadas, paraHora, paraMinutos } from "./agenda";
import { jornadaDoDia, type ExcecaoDeAgenda, type JornadaDoDia } from "./jornada";
import { QUALQUER_BARBEIRO, fazTodosOsServicos } from "./distribuicao";

/**
 * Horários livres de um dia.
 *
 * Existe porque o cliente NÃO PODE ver a agenda — e não deve. As regras
 * permitem a ele ler apenas as próprias reservas, o que está certo: a lista de
 * quem corta o cabelo onde e a que horas é dado de terceiro.
 *
 * A consequência, que ficou sem tratamento até aqui: a tela de agendar não
 * tinha como saber o que estava ocupado, então **oferecia todos os horários**.
 * O cliente escolhia, tocava em confirmar, e só então o servidor respondia
 * "esse horário acabou de ser reservado". Ele voltava, escolhia outro, e podia
 * levar a mesma resposta de novo.
 *
 * Aqui o servidor faz a conta e devolve SÓ os horários — nada de quem reservou,
 * nem quantos. O cliente recebe disponibilidade sem receber a agenda.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Status que tomam a cadeira. */
const OCUPAM_SLOT = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "completed",
  "no_show",
];

type Jornada = {
  weekdays?: number[];
  opensAt?: string;
  closesAt?: string;
  breaks?: Array<{ from: string; to: string }>;
  slotMinutes?: number;
  perDay?: Record<string, Partial<JornadaDoDia>>;
  exceptions?: ExcecaoDeAgenda[];
};

export const availableSlots = onCall<{
  barbershopId: string;
  date: string;
  /** Um barbeiro, ou `"qualquer"` para a união dos horários da equipe (05/10). */
  staffId?: string;
  durationMin?: number;
  /**
   * Quem pergunta é o balcão — D13.
   *
   * Encontrado abrindo a tela, não lendo o código: com 15:55 no relógio, o
   * primeiro horário oferecido ao dono era 17:00. O `createBookingAtCounter`
   * aceita "agora" de propósito, mas a tela pedia os horários pela mesma porta
   * do app do cliente e recebia a lista já filtrada pela antecedência mínima —
   * o caso mais comum do balcão, a pessoa sentada na cadeira, não aparecia.
   *
   * O pedido é só um pedido: quem decide é a guarda logo abaixo, que confere o
   * vínculo de quem chamou. Um cliente mandando `paraOBalcao: true` continua
   * recebendo a lista dele.
   */
  paraOBalcao?: boolean;
  /**
   * Reserva que está sendo REMARCADA: sai da conta de ocupação, como no
   * próprio `rescheduleBooking`. Sem isto, empurrar um cliente 30 minutos não
   * aparecia como opção — a reserva bloqueava a si mesma.
   */
  ignorarReservaId?: string;
  /**
   * Serviços escolhidos — só o modo "qualquer barbeiro" usa: entra na união
   * quem faz TODOS eles (05/10).
   */
  serviceIds?: string[];
}>(async (request) => {
  const { date } = request.data ?? {};
  if (!request.data?.barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
  const barbershopId = idSeguro(request.data.barbershopId, "Barbearia");
  if (!ISO_DATE.test(date ?? "")) throw new HttpsError("invalid-argument", "Data inválida.");

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const shopSnap = await shopRef.get();
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const shop = shopSnap.data() ?? {};
  const locale = localeDoDocumento(shop);
  const policies = shop.policies ?? {};

  const equipe = await shopRef.collection("staff").where("active", "==", true).get();
  if (equipe.empty) return { slots: [], staffId: null };

  const qualquer = request.data?.staffId === QUALQUER_BARBEIRO;
  const barbeiro = qualquer
    ? null
    : request.data?.staffId
      ? equipe.docs.find((d) => d.id === request.data!.staffId)
      : equipe.docs[0];
  if (!qualquer && !barbeiro) throw new HttpsError("failed-precondition", "Esse barbeiro não está disponível.");

  /* A antecedência mínima protege o CLIENTE de marcar um horário que o barbeiro
   * não veria a tempo. Quem está no balcão é justamente quem vai atender, então
   * ela não se aplica — e a guarda é o vínculo no claim, nunca o parâmetro. */
  const papel = vinculosDe(request)?.[
    barbershopId
  ];
  const ehDaCasa = papel === "owner" || papel === "staff";

  /* Janela de agenda (28/09): o cliente só vê horário até a data liberada
   * pelo barbeiro — ou, se é mensalista, pelos dias que o plano dá. Quem é da
   * casa vê tudo. A resposta diz até quando está aberto, para a tela explicar
   * em vez de mostrar um dia vazio. */
  if (!ehDaCasa) {
    const limite = limiteDoCliente({
      hoje: hojeNoFuso(locale.timeZone),
      janela: policies.janela,
      ehMensalista: await ehMensalistaAtivo(shopRef, request.auth?.uid),
      horizontePadrao: policies.booking?.maxAdvanceDays,
    });
    if (date! > limite) {
      return { slots: [], encaixes: [], staffId: barbeiro?.id ?? null, foraDaJanela: true, abertaAte: limite };
    }
  }
  const minutosMinimos: number =
    request.data?.paraOBalcao && ehDaCasa ? 0 : (policies.booking?.minAdvanceMinutes ?? 60);

  /* O dia inteiro numa leitura só — no modo "qualquer" ela serve a todos os
   * barbeiros. A query traz o dia inteiro e o filtro por barbeiro é em
   * memória: três igualdades exigiriam índice composto, e índice faltando
   * derruba a tela em produção. */
  const reservas = await shopRef.collection("bookings").where("date", "==", date).get();

  const daLoja: Jornada = shop.schedule ?? {};

  /** Horários de UM barbeiro: livres, encaixes, ou o dia fechado para ele. */
  function horariosDe(b: FirebaseFirestore.QueryDocumentSnapshot) {
    /* Jornada do barbeiro quando ele tem uma; senão a da loja.
     *
     * A composição continua sendo campo a campo — um barbeiro que só declara
     * `weekdays` herda o horário da casa —, mas quem aplica a precedência entre
     * exceção, dia da semana e padrão é `jornadaDoDia`, e só ela. Enquanto esta
     * conta era escrita aqui, em `createBooking` e em `rescheduleBooking`, as
     * três tinham fallbacks diferentes para o mesmo campo ausente. */
    const dele: Jornada = b.get("schedule") ?? {};
    /* Grade abaixo de 5 min (ou negativa, gravada por engano) fazia o laço de
     * horários não andar — e a callable é pública (auditoria de 28/09, B9). */
    const gradeGravada = Number(dele.slotMinutes ?? daLoja.slotMinutes);
    const slotMinutes: number = Number.isFinite(gradeGravada) && gradeGravada >= 5 ? gradeGravada : 30;

    const doDia = jornadaDoDia({
      schedule: {
        weekdays: dele.weekdays ?? policies.openWeekdays ?? daLoja.weekdays,
        opensAt: dele.opensAt ?? daLoja.opensAt,
        closesAt: dele.closesAt ?? daLoja.closesAt,
        breaks: dele.breaks ?? daLoja.breaks,
        perDay: dele.perDay ?? daLoja.perDay,
        exceptions: dele.exceptions ?? daLoja.exceptions,
      },
      weekday: diaDaSemanaNoFuso(date!, locale.timeZone),
      date: date!,
    });
    if (!doDia.aberto) return { fechado: true as const, doDia, livres: [], encaixes: [] };

    const jornada = { ...doDia, slotMinutes };
    const duracao = Math.max(Number(request.data?.durationMin) || jornada.slotMinutes, 5);

    /* A ocupação é por JANELA, não por instante. Enquanto era um `Set` de
     * horários de início, um atendimento das 15:00 às 16:00 marcava só "15:00" e
     * as 15:30 continuavam sendo oferecidas — dois clientes na mesma cadeira,
     * pelo caminho normal do produto. Ver `agenda.ts`. */
    const ocupadas = janelasOcupadas(
      reservas.docs
        .filter(
          (d) =>
            d.id !== request.data?.ignorarReservaId &&
            d.get("staffId") === b.id &&
            OCUPAM_SLOT.includes(d.get("status"))
        )
        .map((d) => ({ time: String(d.get("time")), durationMin: d.get("durationMin") })),
      jornada.slotMinutes
    );

    const abre = paraMinutos(jornada.opensAt);
    const fecha = paraMinutos(jornada.closesAt);
    const intervalos = jornada.breaks.map((i) => [paraMinutos(i.from), paraMinutos(i.to)]);

    const livres: string[] = [];
    /* Encaixe: horário DENTRO do expediente que só não está livre porque outra
     * reserva o ocupa. O cliente pode pedir; quem decide se dá é o barbeiro
     * (`responderEncaixe`). Fora do expediente, no almoço ou em cima da hora
     * não entra — ali não há o que o barbeiro aprovar. */
    const encaixes: string[] = [];
    for (let t = abre; t + duracao <= fecha; t += jornada.slotMinutes) {
      const hora = paraHora(t);

      /* O atendimento inteiro precisa caber: um combo de 60 min não pode começar
       * 30 min antes do almoço nem 30 min antes de fechar. */
      const invadeIntervalo = intervalos.some(([de, ate]) => t < ate && t + duracao > de);
      if (invadeIntervalo) continue;

      if (instanteNoFuso(date!, hora, locale.timeZone).getTime() - Date.now() < minutosMinimos * 60_000) {
        continue;
      }

      /* O atendimento INTEIRO precisa estar livre, e não só o minuto em que ele
       * começa: um corte de 30 min às 15:30 não cabe se o combo das 15:00 vai
       * até as 16:00. */
      if (janelaLivre({ inicio: t, fim: t + duracao }, ocupadas)) livres.push(hora);
      else encaixes.push(hora);
    }
    return { fechado: false as const, doDia, livres, encaixes };
  }

  /* ---- "Qualquer barbeiro" (05/10) ----
   *
   * A união dos horários livres de quem faz TODOS os serviços e trabalha no
   * dia. Sem encaixe: o pedido de encaixe é para UM barbeiro aprovar, e no
   * modo "qualquer" não há a quem pedir — quem quer encaixe escolhe o barbeiro.
   * Quem atende só é decidido ao gravar (`createBooking`), com a agenda daquele
   * instante. */
  if (qualquer) {
    /* Teto igual ao do `createBooking`: a callable é pública. */
    const servicos = Array.isArray(request.data?.serviceIds)
      ? request.data!.serviceIds.slice(0, 8).map(String)
      : [];
    const aptos = equipe.docs.filter((d) => fazTodosOsServicos(d.get("serviceIds"), servicos));
    const porBarbeiro = aptos.map(horariosDe);
    const abertos = porBarbeiro.filter((h) => !h.fechado);
    if (abertos.length === 0) {
      const primeiro = porBarbeiro[0];
      return {
        slots: [],
        encaixes: [],
        staffId: QUALQUER_BARBEIRO,
        fechado: true,
        motivo: primeiro?.doDia.origem ?? null,
        nota: primeiro?.doDia.nota ?? null,
      };
    }
    const uniao = [...new Set(abertos.flatMap((h) => h.livres))].sort();
    return { slots: uniao, encaixes: [], staffId: QUALQUER_BARBEIRO };
  }

  const dele = horariosDe(barbeiro!);
  if (dele.fechado) {
    /* `motivo` viaja junto para a tela do cliente poder dizer "fechado neste
     * dia — feriado" em vez do genérico "a barbearia não abre neste dia", que
     * num sábado de exceção soaria como se ela tivesse fechado as portas. */
    return {
      slots: [],
      staffId: barbeiro!.id,
      fechado: true,
      motivo: dele.doDia.origem,
      nota: dele.doDia.nota ?? null,
    };
  }

  return { slots: dele.livres, encaixes: dele.encaixes, staffId: barbeiro!.id };
});
