import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  garantirReservasDoFixo,
  idDaOcorrencia,
  liberarOcorrenciasFuturas,
  versaoDoHorario,
  type HorarioFixo,
} from "../horario-fixo";

/**
 * Horário fixo contra o emulador (07/10).
 *
 * `horario-fixo.test.ts` prova as regras puras. O que só aqui se prova é a
 * sequência inteira — liberar e reservar de novo —, que foi onde o defeito
 * morava: cada metade estava certa sozinha, e juntas deixavam o mensalista
 * sem NENHUMA semana depois de mudar o horário.
 *
 * Exige o emulador:  npm run test:emulador
 */

const PROJETO = "suites-emulador";
const SHOP = "barbearia-fixo";

let app: App;
let db: Firestore;

const shopRef = () => db.doc(`barbershops/${SHOP}`);

/** `YYYY-MM-DD` no fuso local — o script roda com TZ=America/Sao_Paulo. */
function dataLocal(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

/** Âncora dois dias à frente: todas as datas do fixo estão no futuro. */
function ancora(): { inicio: string; diaDaSemana: number } {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return { inicio: dataLocal(d), diaDaSemana: d.getDay() };
}

function horario(over: Partial<HorarioFixo> = {}): HorarioFixo {
  return { ...ancora(), hora: "15:00", staffId: "barbeiro-a", serviceIds: ["corte"], frequencia: "semanal", ...over };
}

const ASSINATURA = "assinatura-1";
const CLIENTE = "cliente-1";

/** Soma dias a uma data `YYYY-MM-DD`, sem depender do fuso da máquina. */
function maisDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

function garantir(
  h: HorarioFixo,
  subscriptionId = ASSINATURA,
  opcoes: { simular?: boolean; substituir?: boolean } = {}
) {
  return garantirReservasDoFixo({
    ...opcoes,
    db,
    shopRef: shopRef(),
    shop: {
      schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], opensAt: "08:00", closesAt: "20:00", slotMinutes: 30 },
      timeZone: "America/Sao_Paulo",
    },
    subscriptionId,
    assinatura: { status: "ativo", clientId: CLIENTE, clientName: "Cliente Teste", horarioFixo: h },
  });
}

function liberar(motivo: string, subscriptionId = ASSINATURA, preservarRemarcadas = false) {
  return liberarOcorrenciasFuturas({
    preservarRemarcadas,
    db,
    shopRef: shopRef(),
    subscriptionId,
    hoje: dataLocal(new Date()),
    timeZone: "America/Sao_Paulo",
    motivo,
  });
}

async function ativasDoCliente(): Promise<Array<Record<string, unknown> & { id: string }>> {
  const s = await shopRef().collection("bookings").where("clientId", "==", CLIENTE).get();
  return s.docs
    .map((d) => ({ ...d.data(), id: d.id }) as Record<string, unknown> & { id: string })
    .filter((b) => ["confirmed", "confirmed_by_client"].includes(String(b.status)));
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:emulador");
  }
  app = initializeApp({ projectId: PROJETO }, `fixo-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["bookings", "clients", "staff", "services", "conflitos_horario_fixo"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
  await shopRef().set({
    schedule: { weekdays: [0, 1, 2, 3, 4, 5, 6], opensAt: "08:00", closesAt: "20:00", slotMinutes: 30 },
    timeZone: "America/Sao_Paulo",
  });
  await db.doc(`barbershops/${SHOP}/staff/barbeiro-a`).set({ name: "Barbeiro A", active: true });
  await db.doc(`barbershops/${SHOP}/staff/barbeiro-b`).set({ name: "Barbeiro B", active: true });
  await db.doc(`barbershops/${SHOP}/services/corte`).set({ name: "Corte", price: 50, durationMin: 30, active: true });
});

describe("mudar o horário fixo", () => {
  it("o horário novo ganha as 8 semanas, mesmo com as antigas liberadas no mesmo dia", async () => {
    const r1 = await garantir(horario());
    expect(r1.filter((x) => x.resultado === "criada")).toHaveLength(8);

    expect(await liberar("Horário fixo alterado")).toBe(8);
    const r2 = await garantir(horario({ hora: "16:00" }));
    expect(r2.filter((x) => x.resultado === "criada")).toHaveLength(8);

    const ativas = await ativasDoCliente();
    expect(ativas).toHaveLength(8);
    expect(ativas.every((b) => b.time === "16:00")).toBe(true);
  });

  it("dado antigo, sem o marcador, também não bloqueia", async () => {
    await garantir(horario());
    await liberar("Horário fixo alterado");
    /* Como estava gravado em produção antes do marcador. */
    const liberadas = await shopRef().collection("bookings").where("horarioFixoId", "==", ASSINATURA).get();
    await Promise.all(liberadas.docs.map((d) => d.ref.update({ liberadaPeloFixo: null })));

    const r = await garantir(horario({ staffId: "barbeiro-b" }));
    expect(r.filter((x) => x.resultado === "criada")).toHaveLength(8);
  });

  it("a semana que o cliente cancelou continua desmarcada no horário novo", async () => {
    const h = horario();
    await garantir(h);
    const primeira = idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio);
    await shopRef().collection("bookings").doc(primeira).update({ status: "cancelled_by_client" });

    await liberar("Horário fixo alterado");
    const r = await garantir(horario({ hora: "16:00" }));
    expect(r.find((x) => x.data === h.inicio)?.resultado).toBe("cliente-ja-marcado");
    expect(r.filter((x) => x.resultado === "criada")).toHaveLength(7);
  });
});

describe("tirar e recolocar o mesmo fixo", () => {
  it("as ocorrências liberadas voltam a valer, confirmadas e sem o cancelamento", async () => {
    const h = horario();
    await garantir(h);
    await liberar("Horário fixo removido");

    const r = await garantir(h);
    expect(r.filter((x) => x.resultado === "reativada")).toHaveLength(8);
    const ativas = await ativasDoCliente();
    expect(ativas).toHaveLength(8);
    expect(ativas.every((b) => b.cancelReason === undefined && b.liberadaPeloFixo === undefined)).toBe(true);

    /* Rodar de novo não mexe em nada. */
    const r2 = await garantir(h);
    expect(r2.every((x) => x.resultado === "ja-existe")).toBe(true);
  });

  it("vaga tomada por um avulso nesse meio-tempo vira conflito, não reserva por cima", async () => {
    const h = horario();
    await garantir(h);
    await liberar("Horário fixo removido");
    await shopRef().collection("bookings").doc("avulso").set({
      clientId: "outro-cliente",
      staffId: "barbeiro-a",
      date: h.inicio,
      time: "15:00",
      durationMin: 30,
      status: "confirmed",
    });

    const r = await garantir(h);
    expect(r.find((x) => x.data === h.inicio)?.resultado).toBe("conflito");
    expect(r.filter((x) => x.resultado === "reativada")).toHaveLength(7);
    const primeira = await shopRef()
      .collection("bookings")
      .doc(idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio))
      .get();
    expect(primeira.get("status")).toBe("cancelled_by_shop");
  });

  it("semana cancelada pelo cliente não é reativada", async () => {
    const h = horario();
    await garantir(h);
    const primeira = idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio);
    await shopRef().collection("bookings").doc(primeira).update({ status: "cancelled_by_client" });

    const r = await garantir(h);
    expect(r.find((x) => x.data === h.inicio)?.resultado).toBe("desmarcada");
  });
});

describe("trocar o horário sem perder a semana (09/10)", () => {
  it("onde o novo não cabe a antiga fica; onde cabe, é trocada na mesma gravação", async () => {
    const h = horario();
    await garantir(h);
    await db.doc(`barbershops/${SHOP}/services/longo`).set({ name: "Longo", price: 80, durationMin: 60, active: true });
    /* Outro cliente às 15:30: o corte de 30 min das 15:00 cabe, o de 60 não. */
    await shopRef().collection("bookings").doc("outro").set({
      clientId: "outro-cliente",
      staffId: "barbeiro-a",
      date: h.inicio,
      time: "15:30",
      durationMin: 30,
      status: "confirmed",
    });
    const novo = horario({ serviceIds: ["longo"] });

    /* Sem tratar a versão antiga como liberada, a prévia via as 8 semanas
     * presas ao horário antigo. */
    const cega = await garantir(novo, ASSINATURA, { simular: true });
    expect(cega.every((x) => x.resultado === "conflito")).toBe(true);

    const previa = await garantir(novo, ASSINATURA, { simular: true, substituir: true });
    expect(previa.find((x) => x.data === h.inicio)?.resultado).toBe("conflito");
    expect(previa.filter((x) => x.resultado === "criada")).toHaveLength(7);

    const r = await garantir(novo, ASSINATURA, { substituir: true });
    expect(r.find((x) => x.data === h.inicio)?.resultado).toBe("conflito");
    expect(r.filter((x) => x.resultado === "criada")).toHaveLength(7);

    const antigaDoConflito = await shopRef()
      .collection("bookings")
      .doc(idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio))
      .get();
    expect(antigaDoConflito.get("status")).toBe("confirmed");
    const antigaTrocada = await shopRef()
      .collection("bookings")
      .doc(idDaOcorrencia(ASSINATURA, versaoDoHorario(h), maisDias(h.inicio, 7)))
      .get();
    expect(antigaTrocada.get("status")).toBe("cancelled_by_shop");
    expect(antigaTrocada.get("liberadaPeloFixo")).toBe(true);

    const ativas = await ativasDoCliente();
    expect(ativas).toHaveLength(8);
    expect(ativas.filter((b) => b.durationMin === 60)).toHaveLength(7);
  });

  it("a semana que o cliente remarcou não é liberada, e a data de origem não vira fixo novo", async () => {
    const h = horario();
    await garantir(h);
    const id = idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio);
    await shopRef()
      .collection("bookings")
      .doc(id)
      .update({ date: maisDias(h.inicio, 3), rescheduledFrom: { date: h.inicio, time: "15:00" } });

    expect(await liberar("Horário fixo alterado", ASSINATURA, true)).toBe(7);
    const r = await garantir(horario({ hora: "16:00" }));
    expect(r.find((x) => x.data === h.inicio)?.resultado).toBe("cliente-ja-marcado");
    expect(r.filter((x) => x.resultado === "criada")).toHaveLength(7);
    expect((await shopRef().collection("bookings").doc(id).get()).get("status")).toBe("confirmed");
  });

  it("plano encerrado libera tudo, inclusive a semana remarcada", async () => {
    const h = horario();
    await garantir(h);
    const id = idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio);
    await shopRef()
      .collection("bookings")
      .doc(id)
      .update({ date: maisDias(h.inicio, 3), rescheduledFrom: { date: h.inicio, time: "15:00" } });
    expect(await liberar("Plano de mensalista encerrado")).toBe(8);
  });

  it("a rotina sem substituir não apaga o conflito de uma semana que ficou no horário antigo", async () => {
    const h = horario();
    await garantir(h);
    await db.doc(`barbershops/${SHOP}/services/longo`).set({ name: "Longo", price: 80, durationMin: 60, active: true });
    await shopRef().collection("bookings").doc("outro").set({
      clientId: "outro-cliente",
      staffId: "barbeiro-a",
      date: h.inicio,
      time: "15:30",
      durationMin: 30,
      status: "confirmed",
    });
    const novo = horario({ serviceIds: ["longo"] });
    await garantir(novo, ASSINATURA, { substituir: true });
    const conflito = shopRef()
      .collection("conflitos_horario_fixo")
      .doc(idDaOcorrencia(ASSINATURA, versaoDoHorario(novo), h.inicio));
    expect((await conflito.get()).exists).toBe(true);

    /* A rotina da madrugada (sem substituir) segue vendo conflito. */
    const noite = await garantir(novo);
    expect(noite.find((x) => x.data === h.inicio)?.resultado).toBe("conflito");
    expect((await conflito.get()).exists).toBe(true);

    /* Saiu o que atrapalhava: "tentar de novo" troca a antiga pela nova. */
    await shopRef().collection("bookings").doc("outro").update({ status: "cancelled_by_client" });
    const de_novo = await garantir(novo, ASSINATURA, { substituir: true });
    expect(de_novo.find((x) => x.data === h.inicio)?.resultado).toBe("criada");
    expect((await conflito.get()).exists).toBe(false);
  });

  it("o aviso de semana sem reserva some quando o cliente resolve a data por outro caminho", async () => {
    const h = horario();
    const bookings = shopRef().collection("bookings");
    await bookings.doc("avulso").set({
      clientId: "outro-cliente",
      staffId: "barbeiro-a",
      date: h.inicio,
      time: "15:00",
      durationMin: 30,
      status: "confirmed",
    });
    await garantir(h);
    const conflito = shopRef()
      .collection("conflitos_horario_fixo")
      .doc(idDaOcorrencia(ASSINATURA, versaoDoHorario(h), h.inicio));
    expect((await conflito.get()).exists).toBe(true);

    await bookings.doc("a-mao").set({
      clientId: CLIENTE,
      staffId: "barbeiro-a",
      date: h.inicio,
      time: "17:00",
      durationMin: 30,
      status: "confirmed",
    });
    await garantir(h);
    expect((await conflito.get()).exists).toBe(false);
  });
});

describe("plano encerrado e plano novo", () => {
  it("a assinatura nova do mesmo cliente ganha as semanas", async () => {
    await garantir(horario(), "plano-antigo");
    await liberar("Plano de mensalista encerrado", "plano-antigo");

    const r = await garantir(horario(), "plano-novo");
    expect(r.filter((x) => x.resultado === "criada")).toHaveLength(8);
  });
});
