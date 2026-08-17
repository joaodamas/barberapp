import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { gravarComTravaDeHorario } from "../booking";
import { janelasOcupadas, seSobrepoem } from "../agenda";

/**
 * Concorrência real, contra o emulador do Firestore.
 *
 * Os testes de `agenda.test.ts` provam a CONTA de sobreposição. Eles não provam
 * o que acontece quando dois clientes tocam "confirmar" no mesmo segundo — e é
 * justamente aí que uma agenda falha, porque a decisão certa tomada sobre uma
 * leitura velha grava duas reservas na mesma cadeira.
 *
 * A transação existe no código desde o começo e **nunca tinha sido exercida sob
 * concorrência**: dentro do `onCall` ela exigia emulador, autenticação e
 * reserva semeada. É a mesma classe de defeito do `sw.js` — código correto que
 * nunca executa é indistinguível de código ausente.
 *
 * Exige o emulador:  npm run test:concorrencia
 */

const PROJETO = "concorrencia-agenda";
const SHOP = "barbearia-teste";
const DATA = "2026-09-15";
const GRADE = 30;

let app: App;
let db: Firestore;

/** Um pedido de reserva completo, com o mínimo que a trava precisa. */
function pedido(over: Partial<Parameters<typeof gravarComTravaDeHorario>[0]> = {}) {
  const time = over.time ?? "15:00";
  const duracao = over.duracaoDaReserva ?? 60;
  return {
    db,
    shopRef: db.doc(`barbershops/${SHOP}`),
    clientId: over.clientId ?? `cliente-${Math.random().toString(36).slice(2)}`,
    staffId: over.staffId ?? "barbeiro-1",
    date: over.date ?? DATA,
    time,
    duracaoDaReserva: duracao,
    slotMinutes: GRADE,
    maxAtivas: over.maxAtivas ?? 3,
    hojeNaBarbearia: over.hojeNaBarbearia ?? "2026-09-01",
    documento: {
      clientId: over.clientId ?? "cliente",
      staffId: over.staffId ?? "barbeiro-1",
      date: over.date ?? DATA,
      time,
      durationMin: duracao,
      status: "confirmed",
      value: 90,
      ...((over.documento as object) ?? {}),
    },
  } as Parameters<typeof gravarComTravaDeHorario>[0];
}

/** Quantas das promessas gravaram, e quantas foram recusadas. */
async function correr(pedidos: Array<ReturnType<typeof pedido>>) {
  const r = await Promise.allSettled(pedidos.map((p) => gravarComTravaDeHorario(p)));
  return {
    gravadas: r.filter((x) => x.status === "fulfilled").length,
    recusadas: r.filter((x) => x.status === "rejected").length,
    erros: r.flatMap((x) => (x.status === "rejected" ? [String(x.reason?.message ?? x.reason)] : [])),
  };
}

async function reservasNoBanco() {
  const snap = await db.collection(`barbershops/${SHOP}/bookings`).get();
  return snap.docs.map((d) => d.data());
}

beforeAll(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      "Este teste exige o emulador. Rode: npm run test:concorrencia"
    );
  }
  app = initializeApp({ projectId: PROJETO }, `concorrencia-${Date.now()}`);
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  // Cada caso começa com a agenda limpa — senão o segundo teste já nasce com o
  // horário tomado pelo primeiro, e passaria pelo motivo errado.
  const snap = await db.collection(`barbershops/${SHOP}/bookings`).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
});

describe("dois clientes no mesmo segundo", () => {
  it("mesmo horário, mesma cadeira: só UM grava", async () => {
    const { gravadas, recusadas, erros } = await correr([
      pedido({ clientId: "joao" }),
      pedido({ clientId: "maria" }),
    ]);

    expect(gravadas).toBe(1);
    expect(recusadas).toBe(1);
    expect(erros[0]).toMatch(/acabou de ser reservado/i);
    expect(await reservasNoBanco()).toHaveLength(1);
  });

  it("dez tentativas simultâneas no mesmo horário: uma vence", async () => {
    const { gravadas } = await correr(
      Array.from({ length: 10 }, (_, i) => pedido({ clientId: `cliente-${i}` }))
    );

    expect(gravadas).toBe(1);
    expect(await reservasNoBanco()).toHaveLength(1);
  });

  it("O CASO: 15:00 por 60 min e 15:30 por 30 min disputam a mesma cadeira", async () => {
    /* É o defeito relatado. Antes da correção os dois gravavam, porque a
     * checagem era `where("time","==",time)` e "15:00" ≠ "15:30". */
    const { gravadas } = await correr([
      pedido({ clientId: "joao", time: "15:00", duracaoDaReserva: 60 }),
      pedido({ clientId: "maria", time: "15:30", duracaoDaReserva: 30 }),
    ]);

    expect(gravadas).toBe(1);
    expect(await reservasNoBanco()).toHaveLength(1);
  });

  it("seja quem for que vença, a agenda gravada nunca fica sobreposta", async () => {
    /* A invariante que de fato importa — e que "só um grava" não descreve.
     *
     * Com 10:00–11:30, 10:45–11:00 e 11:00–12:00 disputando ao mesmo tempo, há
     * mais de um desfecho CORRETO: ou vence o de 90 min sozinho, ou vencem os
     * dois curtos, que cabem lado a lado. Fixar o número de vencedores testaria
     * a ordem de chegada, que é justamente o que não se controla.
     *
     * O que não pode acontecer, em nenhum desfecho, é duas reservas dividirem
     * um minuto da mesma cadeira. */
    await correr([
      pedido({ clientId: "a", time: "10:00", duracaoDaReserva: 90 }), // 10:00–11:30
      pedido({ clientId: "b", time: "10:45", duracaoDaReserva: 15 }), // dentro de "a"
      pedido({ clientId: "c", time: "11:00", duracaoDaReserva: 60 }), // invade o fim de "a"
    ]);

    const gravadas = await reservasNoBanco();
    expect(gravadas.length).toBeGreaterThan(0);

    const janelas = janelasOcupadas(
      gravadas.map((b) => ({ time: String(b.time), durationMin: b.durationMin })),
      GRADE
    );
    for (let i = 0; i < janelas.length; i++) {
      for (let k = i + 1; k < janelas.length; k++) {
        expect(
          seSobrepoem(janelas[i], janelas[k]),
          `${gravadas[i].time} e ${gravadas[k].time} dividem a mesma cadeira`
        ).toBe(false);
      }
    }
  });

  it("cinquenta pedidos embaralhados não produzem uma única sobreposição", async () => {
    /* O caso de carga: durações e horários misturados, todos na mesma cadeira,
     * todos ao mesmo tempo. Não importa quantos vencem — importa que o que
     * ficou gravado seja uma agenda que um barbeiro consegue cumprir. */
    const horarios = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "14:00", "14:30"];
    const duracoes = [15, 30, 45, 60, 90];

    await correr(
      Array.from({ length: 50 }, (_, i) =>
        pedido({
          clientId: `cliente-${i}`,
          time: horarios[i % horarios.length],
          duracaoDaReserva: duracoes[i % duracoes.length],
        })
      )
    );

    const gravadas = await reservasNoBanco();
    const janelas = janelasOcupadas(
      gravadas.map((b) => ({ time: String(b.time), durationMin: b.durationMin })),
      GRADE
    ).sort((a, b) => a.inicio - b.inicio);

    for (let i = 1; i < janelas.length; i++) {
      expect(
        janelas[i].inicio >= janelas[i - 1].fim,
        `janela ${i} começa em ${janelas[i].inicio} e a anterior termina em ${janelas[i - 1].fim}`
      ).toBe(true);
    }
  });
});

describe("o que NÃO pode ser recusado", () => {
  it("cadeiras diferentes, mesmo horário: os dois gravam", async () => {
    /* Conflito é por cadeira. Enquanto era pela barbearia, três barbeiros às
     * 15h viravam conflito e dois terços da agenda sumiam. */
    const { gravadas } = await correr([
      pedido({ clientId: "joao", staffId: "barbeiro-1" }),
      pedido({ clientId: "maria", staffId: "barbeiro-2" }),
    ]);

    expect(gravadas).toBe(2);
    expect(await reservasNoBanco()).toHaveLength(2);
  });

  it("horários que apenas encostam: os dois gravam", async () => {
    const { gravadas } = await correr([
      pedido({ clientId: "joao", time: "10:00", duracaoDaReserva: 60 }), // 10:00–11:00
      pedido({ clientId: "maria", time: "11:00", duracaoDaReserva: 30 }), // 11:00–11:30
    ]);

    expect(gravadas).toBe(2);
  });

  it("dias diferentes não disputam nada", async () => {
    const { gravadas } = await correr([
      pedido({ clientId: "joao", date: "2026-09-15" }),
      pedido({ clientId: "maria", date: "2026-09-16" }),
    ]);

    expect(gravadas).toBe(2);
  });

});

describe("a trava enxerga o que já está gravado", () => {
  it("recusa horário tomado por uma reserva anterior", async () => {
    await gravarComTravaDeHorario(
      pedido({ clientId: "joao", time: "15:00", duracaoDaReserva: 60 })
    );

    const { gravadas, erros } = await correr([
      pedido({ clientId: "maria", time: "15:30", duracaoDaReserva: 30 }),
    ]);

    expect(gravadas).toBe(0);
    expect(erros[0]).toMatch(/acabou de ser reservado/i);
  });

  it("reserva CANCELADA libera o horário de volta", async () => {
    const id = await gravarComTravaDeHorario(pedido({ clientId: "joao", time: "15:00" }));
    await db.doc(`barbershops/${SHOP}/bookings/${id}`).update({
      status: "cancelled_by_client",
    });

    const { gravadas } = await correr([pedido({ clientId: "maria", time: "15:00" })]);

    expect(gravadas).toBe(1);
  });

  it("reserva antiga sem durationMin ocupa ao menos a grade", async () => {
    // Documento anterior ao campo `durationMin`, gravado direto.
    await db.collection(`barbershops/${SHOP}/bookings`).add({
      clientId: "antigo",
      staffId: "barbeiro-1",
      date: DATA,
      time: "15:00",
      status: "confirmed",
      value: 50,
    });

    const { gravadas } = await correr([
      pedido({ clientId: "maria", time: "15:00", duracaoDaReserva: 30 }),
    ]);

    expect(gravadas).toBe(0);
  });
});

describe("teto de reservas por cliente, sob concorrência", () => {
  it("o limite não é furado por chamadas simultâneas", async () => {
    /* Sem transação, cinco pedidos simultâneos leriam "0 ativas" ao mesmo
     * tempo e todos passariam — e uma conta só ocuparia a agenda inteira. */
    const { gravadas } = await correr(
      Array.from({ length: 5 }, (_, i) =>
        pedido({
          clientId: "insistente",
          time: ["09:00", "10:00", "11:00", "14:00", "16:00"][i],
          duracaoDaReserva: 30,
          maxAtivas: 3,
        })
      )
    );

    expect(gravadas).toBe(3);
  });

  it("reserva de data passada não conta contra o teto", async () => {
    for (const time of ["09:00", "10:00", "11:00"]) {
      await gravarComTravaDeHorario(
        pedido({
          clientId: "fiel",
          date: "2026-08-01", // antes de `hojeNaBarbearia`
          time,
          duracaoDaReserva: 30,
        })
      );
    }

    const { gravadas } = await correr([
      pedido({ clientId: "fiel", time: "17:00", duracaoDaReserva: 30 }),
    ]);

    expect(gravadas).toBe(1);
  });
});
