import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A escuta que falhou não pode receber carona.
 *
 * `subscribeToCollection` compartilha um listener por (barbearia, coleção,
 * filtros) e o segura por 30 s depois que o último assinante sai. Quando o
 * `onSnapshot` dava erro, a entrada ficava no mapa: o Firestore já tinha
 * encerrado o listener, e quem chegasse nesse meio-tempo entrava de carona
 * numa escuta que nunca mais entregaria nada — "carregando" para sempre, sem
 * erro na tela.
 *
 * O Firestore aqui é simulado: cada `onSnapshot` fica registrado com seus
 * dois callbacks, e o teste decide quando entregar dado ou erro.
 */

type Escuta = {
  dados: (snap: { docs: { id: string; data: () => object }[] }) => void;
  erro: (e: Error) => void;
  parada: boolean;
};

const escutas: Escuta[] = [];

vi.mock("@/lib/firebase", () => ({ getDb: async () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  doc: () => ({ id: "novo" }),
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  onSnapshot: (_q: unknown, dados: Escuta["dados"], erro: Escuta["erro"]) => {
    const escuta: Escuta = { dados, erro, parada: false };
    escutas.push(escuta);
    return () => {
      escuta.parada = true;
    };
  },
}));

const { subscribeToCollection } = await import("@/lib/db/repository");

/** Deixa o `getDb().then(...)` rodar. */
const assentar = () => new Promise((r) => setTimeout(r, 0));

const snap = (...ids: string[]) => ({ docs: ids.map((id) => ({ id, data: () => ({ nome: id }) })) });

let barbearia = 0;
let id: string;

beforeEach(() => {
  escutas.length = 0;
  // Cada teste numa barbearia própria: o mapa de assinaturas é do módulo.
  id = `casa-${++barbearia}`;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("escuta compartilhada", () => {
  it("quem chega depois de um dado recebe o último na hora (a carona que vale)", async () => {
    const primeiro = vi.fn();
    subscribeToCollection(id, "services", { onData: primeiro });
    await assentar();
    escutas[0].dados(snap("a"));

    const segundo = vi.fn();
    subscribeToCollection(id, "services", { onData: segundo });
    await assentar();

    expect(escutas).toHaveLength(1);
    expect(segundo).toHaveBeenCalledWith([{ id: "a", nome: "a" }]);
  });

  it("depois de um erro, quem chega abre uma escuta nova em vez de esperar na morta", async () => {
    const erroDoPrimeiro = vi.fn();
    const sair = subscribeToCollection(id, "services", { onData: vi.fn(), onError: erroDoPrimeiro });
    await assentar();
    escutas[0].erro(new Error("permission-denied"));
    expect(erroDoPrimeiro).toHaveBeenCalledTimes(1);
    sair();

    // Dentro dos 30 s de folga — exatamente a janela em que a carona acontecia.
    const dadosDoSegundo = vi.fn();
    subscribeToCollection(id, "services", { onData: dadosDoSegundo });
    await assentar();

    expect(escutas).toHaveLength(2);
    escutas[1].dados(snap("b"));
    expect(dadosDoSegundo).toHaveBeenCalledWith([{ id: "b", nome: "b" }]);
  });

  it("o erro chega a todos que estavam ouvindo", async () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeToCollection(id, "staff", { onData: vi.fn(), onError: a });
    subscribeToCollection(id, "staff", { onData: vi.fn(), onError: b });
    await assentar();
    escutas[0].erro(new Error("unavailable"));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("a folga de quem saiu da escuta morta não derruba a escuta nova", async () => {
    vi.useFakeTimers();
    const sair = subscribeToCollection(id, "services", { onData: vi.fn(), onError: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    escutas[0].erro(new Error("unavailable"));
    sair();

    const dados = vi.fn();
    subscribeToCollection(id, "services", { onData: dados });
    await vi.advanceTimersByTimeAsync(0);
    expect(escutas).toHaveLength(2);

    // Passa a folga de 30 s da primeira: a segunda continua de pé.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(escutas[1].parada).toBe(false);
    escutas[1].dados(snap("c"));
    expect(dados).toHaveBeenCalledWith([{ id: "c", nome: "c" }]);
  });

  it("sem ninguém ouvindo, a escuta sã é cancelada depois da folga", async () => {
    vi.useFakeTimers();
    const sair = subscribeToCollection(id, "services", { onData: vi.fn() });
    await vi.advanceTimersByTimeAsync(0);
    sair();
    await vi.advanceTimersByTimeAsync(31_000);
    expect(escutas[0].parada).toBe(true);
  });
});
