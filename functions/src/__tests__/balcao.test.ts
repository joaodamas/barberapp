import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarComTravaDeHorario, validarPedido } from "../booking";

/**
 * D13 — a reserva que nasce no balcão.
 *
 * O produto tinha um único caminho de criação: o app do cliente autenticado.
 * Quem liga e quem entra pela porta — a maior parte dos horários de uma
 * barbearia — não tinha como ser marcado.
 *
 * Este arquivo prova que o caminho novo **não afrouxou nada** do que o Gate A
 * fechou. A validação é a MESMA função dos dois lados (`validarPedido`), e a
 * gravação passa pela MESMA transação (`gravarComTravaDeHorario`) — o que se
 * testa aqui é justamente que a diferença deliberada é só uma: a antecedência
 * mínima, que tem destinatário.
 *
 * Exige o emulador:  npm run test:balcao
 */

const PROJETO = "balcao-d13";
const SHOP = "barbearia-teste";
const AMANHA = proximoDiaUtil();

let app: App;
let db: Firestore;

/** Um dia futuro que cai em dia de semana aberto (seg–sáb). */
function proximoDiaUtil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Um dia PASSADO que a barbearia abre.
 *
 * Recuar um dia fixo não serve: quando ontem cai num domingo, quem barra é a
 * checagem de jornada e o teste passaria a medir outra coisa — verde pelo
 * motivo errado, que é a pior forma de verde.
 */
function diaPassadoAberto(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  while (d.getDay() === 0) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

const shopRef = () => db.doc(`barbershops/${SHOP}`);

async function lerLoja() {
  const snap = await shopRef().get();
  return snap.data() ?? {};
}

const LOCALE = { timeZone: "America/Sao_Paulo" };

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error("Este teste exige o emulador. Rode: npm run test:balcao");
  }
  app = initializeApp({ projectId: PROJETO }, `balcao-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  for (const col of ["bookings", "clients", "staff", "services"]) {
    const snap = await db.collection(`barbershops/${SHOP}/${col}`).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }

  await shopRef().set({
    schedule: { weekdays: [1, 2, 3, 4, 5, 6], slotMinutes: 30 },
    policies: { booking: { minAdvanceMinutes: 60, maxActivePerClient: 3 } },
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
  });

  await db.doc(`barbershops/${SHOP}/staff/rafael`).set({ name: "Rafael", active: true });
  await db.doc(`barbershops/${SHOP}/staff/leo`).set({
    name: "Leo",
    active: true,
    serviceIds: ["barba"],
  });
  await db.doc(`barbershops/${SHOP}/staff/antigo`).set({ name: "Saiu", active: false });

  await db.doc(`barbershops/${SHOP}/services/corte`).set({
    name: "Corte",
    price: 50,
    durationMin: 30,
    active: true,
  });
  await db.doc(`barbershops/${SHOP}/services/barba`).set({
    name: "Barba",
    price: 40,
    durationMin: 30,
    active: true,
  });
  await db.doc(`barbershops/${SHOP}/services/desativado`).set({
    name: "Relaxamento",
    price: 90,
    durationMin: 60,
    active: false,
  });
});

async function validar(over: Partial<Parameters<typeof validarPedido>[0]> = {}) {
  return validarPedido({
    shopRef: shopRef(),
    shop: await lerLoja(),
    locale: LOCALE,
    serviceIds: ["corte"],
    date: AMANHA,
    time: "15:00",
    /* Explícito porque a loja de teste tem DOIS barbeiros ativos, e escolher
     * deixa de ser opcional aí — que é o comportamento correto e tem teste
     * próprio logo abaixo. O caso do `undefined` sobrescreve isto pelo spread. */
    staffId: "rafael",
    exigirAntecedencia: false,
    ...over,
  } as Parameters<typeof validarPedido>[0]);
}

/* ================================================================== */
/* A validação é a MESMA dos dois lados                               */
/* ================================================================== */

describe("D13 · o balcão usa a validação do app, não uma cópia", () => {
  it("soma preço e duração do CATÁLOGO", async () => {
    /* O dono também não manda valor. Se mandasse, um erro de digitação no
     * balcão viraria receita errada no DRE — e o fato financeiro é congelado na
     * conclusão, então não haveria de onde recalcular. */
    const p = await validar({ serviceIds: ["corte", "barba"] });
    expect(p.value).toBe(90);
    expect(p.durationMin).toBe(60);
    expect(p.nomes).toEqual(["Corte", "Barba"]);
  });

  it("`durationMin` continua sendo a fonte da ocupação", async () => {
    const p = await validar({ serviceIds: ["corte", "barba"] });
    expect(p.duracaoDaReserva).toBe(60);
    expect(p.duracaoDaReserva).toBe(p.durationMin);
  });

  it("serviço sem duração cai na grade, e não em zero", async () => {
    /* Duração zero ocuparia uma janela vazia e toda reserva seguinte caberia
     * dentro dela — o defeito que o Gate A fechou. */
    await db.doc(`barbershops/${SHOP}/services/expresso`).set({
      name: "Pezinho",
      price: 20,
      active: true,
    });
    const p = await validar({ serviceIds: ["expresso"] });
    expect(p.duracaoDaReserva).toBe(30);
  });

  it("recusa serviço desativado", async () => {
    await expect(validar({ serviceIds: ["desativado"] })).rejects.toThrow(/não está disponível/);
  });

  it("recusa serviço inexistente", async () => {
    await expect(validar({ serviceIds: ["fantasma"] })).rejects.toThrow(/indisponível/);
  });

  it("recusa lista de serviços vazia", async () => {
    await expect(validar({ serviceIds: [] })).rejects.toThrow(/pelo menos um serviço/);
  });
});

/* ================================================================== */
/* Barbeiro errado não pode ser selecionado                           */
/* ================================================================== */

describe("D13 · o barbeiro", () => {
  it("recusa barbeiro inativo", async () => {
    await expect(validar({ staffId: "antigo" })).rejects.toThrow(/não está disponível/);
  });

  it("recusa barbeiro inexistente", async () => {
    await expect(validar({ staffId: "ninguem" })).rejects.toThrow(/não está disponível/);
  });

  it("recusa serviço que o barbeiro não faz", async () => {
    /* Leo só faz barba. Marcar corte com ele produziria uma reserva que ninguém
     * pode atender, e a comissão sairia no nome errado. */
    await expect(validar({ staffId: "leo", serviceIds: ["corte"] })).rejects.toThrow(
      /não faz um dos serviços/
    );
  });

  it("barbeiro sem lista faz TUDO — não é 'não faz nada'", async () => {
    const p = await validar({ staffId: "rafael", serviceIds: ["corte", "barba"] });
    expect(p.staffId).toBe("rafael");
    expect(p.staffName).toBe("Rafael");
  });

  it("com dois barbeiros, escolher é obrigatório", async () => {
    await expect(validar({ staffId: undefined })).rejects.toThrow(/Escolha com qual barbeiro/);
  });

  it("com um só, o servidor resolve", async () => {
    await db.doc(`barbershops/${SHOP}/staff/leo`).update({ active: false });
    const p = await validar({ staffId: undefined });
    expect(p.staffId).toBe("rafael");
  });
});

/* ================================================================== */
/* A ÚNICA diferença deliberada: antecedência                         */
/* ================================================================== */

describe("D13 · antecedência", () => {
  it("o balcão marca AGORA — é o caso mais comum", async () => {
    /* A pessoa já está na cadeira. Exigir 60 minutos de antecedência tornaria o
     * caminho inútil justamente onde ele mais serve. */
    const agora = new Date();
    const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(
      agora.getMinutes()
    ).padStart(2, "0")}`;

    await expect(
      validar({ date: hoje(), time: hhmm, exigirAntecedencia: false })
    ).resolves.toBeTruthy();
  });

  it("o APP continua exigindo antecedência — a regra tem destinatário", async () => {
    /* Ela existe para o cliente não marcar às 14:55 um horário de 15:00 que o
     * barbeiro não veria a tempo. No balcão, quem marca é quem vai atender.
     * Afrouxar para os dois teria sido "fazer o teste passar". */
    const agora = new Date();
    const hhmm = `${String(agora.getHours()).padStart(2, "0")}:${String(
      agora.getMinutes()
    ).padStart(2, "0")}`;

    await expect(
      validar({ date: hoje(), time: hhmm, exigirAntecedencia: true })
    ).rejects.toThrow(/antecedência/);
  });

  it("nem o balcão marca em dia que já passou", async () => {
    /* Lançar atendimento de ontem moveria receita entre competências, e o fato
     * financeiro é congelado na conclusão. Isso é decisão de modelo, e o modelo
     * não muda nesta rodada. */
    await expect(validar({ date: diaPassadoAberto() })).rejects.toThrow(/dia que já passou/);
  });

  it("dia fechado continua fechado para os dois", async () => {
    await shopRef().update({ "schedule.weekdays": [1] });
    const loja = await lerLoja();
    const domingo = (() => {
      const d = new Date(`${AMANHA}T12:00:00`);
      while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

    await expect(
      validarPedido({
        shopRef: shopRef(),
        shop: loja,
        locale: LOCALE,
        serviceIds: ["corte"],
        date: domingo,
        time: "15:00",
        staffId: "rafael",
        exigirAntecedencia: false,
      })
    ).rejects.toThrow(/não abre neste dia/);
  });
});

/* ================================================================== */
/* A reserva de balcão, ponta a ponta                                 */
/* ================================================================== */

describe("D13 · a reserva de balcão", () => {
  async function marcarNoBalcao(over: { time?: string; name?: string; whatsapp?: string } = {}) {
    const p = await validar({ staffId: "rafael", time: over.time ?? "15:00" });
    let clientId = "";
    const bookingId = await gravarComTravaDeHorario({
      db,
      shopRef: shopRef(),
      clientId: "",
      staffId: p.staffId,
      date: AMANHA,
      time: over.time ?? "15:00",
      duracaoDaReserva: p.duracaoDaReserva,
      slotMinutes: p.slotMinutes,
      maxAtivas: 3,
      hojeNaBarbearia: hoje(),
      cliente: {
        barbershopId: SHOP,
        uid: null,
        name: over.name ?? "Seu Zé",
        whatsapp: over.whatsapp ?? "11977776666",
        origin: "balcao",
      },
      aoResolverCliente: (id) => {
        clientId = id;
      },
      documento: {
        clientId: "",
        staffId: p.staffId,
        staffName: p.staffName,
        clientName: over.name ?? "Seu Zé",
        clientWhatsapp: over.whatsapp ?? "11977776666",
        serviceIds: ["corte"],
        serviceNames: p.nomes,
        date: AMANHA,
        time: over.time ?? "15:00",
        durationMin: p.durationMin,
        value: p.value,
        paymentOrigin: "in_person",
        paymentMethod: null,
        status: "confirmed",
        origin: "balcao",
      },
    });
    return { bookingId, clientId };
  }

  it("nasce com uid nulo e origin balcao, dos DOIS lados", async () => {
    const { clientId } = await marcarNoBalcao();

    const cliente = await db.doc(`barbershops/${SHOP}/clients/${clientId}`).get();
    expect(cliente.get("uid")).toBeNull();
    expect(cliente.get("origin")).toBe("balcao");

    const reservas = await db.collection(`barbershops/${SHOP}/bookings`).get();
    expect(reservas.docs[0].get("origin")).toBe("balcao");
  });

  it("NÃO traz pagamento junto — o fluxo termina em reserva confirmada", async () => {
    /* Decisão de produto de 17/08: pagamento antecipado saiu. Reintroduzi-lo
     * aqui de carona traria de volta pela porta lateral o que D14 tirou. */
    await marcarNoBalcao();
    const reservas = await db.collection(`barbershops/${SHOP}/bookings`).get();
    const r = reservas.docs[0];
    expect(r.get("paymentMethod")).toBeNull();
    expect(r.get("paymentOrigin")).toBe("in_person");
    expect(r.get("status")).toBe("confirmed");
  });

  it("o `aoResolverCliente` devolve o id de dentro da transação", async () => {
    /* Sem isso o painel não sabe qual cadastro acabou de nascer, e uma segunda
     * consulta por WhatsApp traria o errado quando dois homônimos dividem
     * número. */
    const { clientId } = await marcarNoBalcao();
    expect(clientId).toBeTruthy();

    const reservas = await db.collection(`barbershops/${SHOP}/bookings`).get();
    expect(reservas.docs[0].get("clientId")).toBe(clientId);
  });

  it("cliente existente é REUSADO, não duplicado", async () => {
    const a = await marcarNoBalcao({ time: "15:00" });
    const b = await marcarNoBalcao({ time: "16:00" });

    expect(a.clientId).toBe(b.clientId);
    const cs = await db.collection(`barbershops/${SHOP}/clients`).get();
    expect(cs.size).toBe(1);
  });

  it("a MESMA janela de ocupação do Gate A continua valendo", async () => {
    /* Corte de 30 min às 15:00 ocupa até 15:30. Marcar 15:15 tem que falhar —
     * e falha pela mesma conta de `agenda.ts` que o app usa. */
    await marcarNoBalcao({ time: "15:00" });
    await expect(marcarNoBalcao({ time: "15:15", whatsapp: "11955554444" })).rejects.toThrow(
      /acabou de ser reservado/
    );
  });

  it("concorrência: dois balcões no mesmo horário, um só grava", async () => {
    const r = await Promise.allSettled([
      marcarNoBalcao({ time: "17:00", whatsapp: "11911112222" }),
      marcarNoBalcao({ time: "17:00", whatsapp: "11933334444" }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);

    const reservas = await db.collection(`barbershops/${SHOP}/bookings`).get();
    expect(reservas.docs.filter((d) => d.get("time") === "17:00")).toHaveLength(1);
  });

  it("o teto por cliente vale no balcão — sem isenção", async () => {
    /* Decisão explícita: executar com a regra atual e medir na operação, em vez
     * de abrir exceção antecipada. Se gerar fricção real, vira evidência. */
    await marcarNoBalcao({ time: "15:00" });
    await marcarNoBalcao({ time: "16:00" });
    await marcarNoBalcao({ time: "17:00" });

    await expect(marcarNoBalcao({ time: "18:00" })).rejects.toThrow(/horário\(s\) marcado\(s\)/);
  });
});
