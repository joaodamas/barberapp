import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { diaDaSemanaNoFuso, instanteNoFuso, localeDoDocumento } from "./locale";
import { janelaLivre, janelasOcupadas, paraHora, paraMinutos } from "./agenda";

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
};

export const availableSlots = onCall<{
  barbershopId: string;
  date: string;
  staffId?: string;
  durationMin?: number;
}>(async (request) => {
  const { barbershopId, date } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
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

  const barbeiro = request.data?.staffId
    ? equipe.docs.find((d) => d.id === request.data!.staffId)
    : equipe.docs[0];
  if (!barbeiro) throw new HttpsError("failed-precondition", "Esse barbeiro não está disponível.");

  /* Jornada do barbeiro quando ele tem uma; senão a da loja. */
  const daLoja: Jornada = shop.schedule ?? {};
  const dele: Jornada = barbeiro.get("schedule") ?? {};
  const jornada: Required<Jornada> = {
    weekdays: dele.weekdays ?? policies.openWeekdays ?? daLoja.weekdays ?? [1, 2, 3, 4, 5, 6],
    opensAt: dele.opensAt ?? daLoja.opensAt ?? "09:00",
    closesAt: dele.closesAt ?? daLoja.closesAt ?? "19:00",
    breaks: dele.breaks ?? daLoja.breaks ?? [],
    slotMinutes: dele.slotMinutes ?? daLoja.slotMinutes ?? 30,
  };

  if (!jornada.weekdays.includes(diaDaSemanaNoFuso(date, locale.timeZone))) {
    return { slots: [], staffId: barbeiro.id, fechado: true };
  }

  const duracao = Math.max(Number(request.data?.durationMin) || jornada.slotMinutes, 5);
  const minutosMinimos: number = policies.booking?.minAdvanceMinutes ?? 60;

  /* Ocupação DESTE barbeiro. A query traz o dia inteiro e o filtro por barbeiro
   * é em memória — três igualdades exigiriam índice composto, e índice faltando
   * derruba a tela em produção.
   *
   * A ocupação é por JANELA, não por instante. Enquanto era um `Set` de
   * horários de início, um atendimento das 15:00 às 16:00 marcava só "15:00" e
   * as 15:30 continuavam sendo oferecidas — dois clientes na mesma cadeira,
   * pelo caminho normal do produto. Ver `agenda.ts`. */
  const reservas = await shopRef.collection("bookings").where("date", "==", date).get();
  const ocupadas = janelasOcupadas(
    reservas.docs
      .filter((d) => d.get("staffId") === barbeiro.id && OCUPAM_SLOT.includes(d.get("status")))
      .map((d) => ({ time: String(d.get("time")), durationMin: d.get("durationMin") })),
    jornada.slotMinutes
  );

  const abre = paraMinutos(jornada.opensAt);
  const fecha = paraMinutos(jornada.closesAt);
  const intervalos = jornada.breaks.map((b) => [paraMinutos(b.from), paraMinutos(b.to)]);

  const livres: string[] = [];
  for (let t = abre; t + duracao <= fecha; t += jornada.slotMinutes) {
    const hora = paraHora(t);
    /* O atendimento INTEIRO precisa estar livre, e não só o minuto em que ele
     * começa: um corte de 30 min às 15:30 não cabe se o combo das 15:00 vai
     * até as 16:00. */
    if (!janelaLivre({ inicio: t, fim: t + duracao }, ocupadas)) continue;

    /* O atendimento inteiro precisa caber: um combo de 60 min não pode começar
     * 30 min antes do almoço nem 30 min antes de fechar. */
    const invadeIntervalo = intervalos.some(([de, ate]) => t < ate && t + duracao > de);
    if (invadeIntervalo) continue;

    if (instanteNoFuso(date, hora, locale.timeZone).getTime() - Date.now() < minutosMinimos * 60_000) {
      continue;
    }
    livres.push(hora);
  }

  return { slots: livres, staffId: barbeiro.id };
});
