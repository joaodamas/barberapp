import { describe, expect, it, vi } from "vitest";
import { criarFilaAdiada, type ResultadoDoEnvio } from "@/lib/envio-adiado";

/**
 * O "Desfazer" só é honesto se a gravação NÃO sair antes do prazo e SAIR
 * sempre que o prazo acabar ou o dono for embora. Os dois lados têm teste: o
 * primeiro impede a promessa falsa; o segundo impede a conclusão perdida.
 */

/** Relógio manual: o teste decide quando o tempo passa. */
function relogio() {
  let agora = 0;
  let proximo = 1;
  const timers = new Map<number, { quando: number; fn: () => void }>();
  return {
    agendarTimer: (fn: () => void, ms: number) => {
      const id = proximo++;
      timers.set(id, { quando: agora + ms, fn });
      return id;
    },
    cancelarTimer: (t: unknown) => void timers.delete(t as number),
    avancar(ms: number) {
      agora += ms;
      for (const [id, t] of [...timers]) {
        if (t.quando <= agora) {
          timers.delete(id);
          t.fn();
        }
      }
    },
  };
}

const ok: ResultadoDoEnvio = { ok: true };

describe("antes do prazo", () => {
  it("não grava nada", () => {
    const r = relogio();
    const enviar = vi.fn(async () => ok);
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar });

    r.avancar(4999);

    expect(enviar).not.toHaveBeenCalled();
    expect(fila.esperando()).toEqual(["a"]);
  });

  it("desfazer cancela: o servidor nunca é chamado", () => {
    const r = relogio();
    const enviar = vi.fn(async () => ok);
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar });

    expect(fila.desfazer("a")).toBe(true);
    r.avancar(10_000);

    expect(enviar).not.toHaveBeenCalled();
    expect(fila.esperando()).toEqual([]);
  });
});

describe("no prazo", () => {
  it("chama a função real, uma vez só", async () => {
    const r = relogio();
    const enviar = vi.fn(async () => ok);
    const aoTerminar = vi.fn();
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar, ...r });
    fila.agendar({ id: "a", enviar });

    r.avancar(5000);
    r.avancar(5000);
    await Promise.resolve();
    await Promise.resolve();

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(aoTerminar).toHaveBeenCalledWith("a", ok);
  });

  it("depois de enviado, desfazer diz que já não dá", () => {
    const r = relogio();
    const enviar = () => new Promise<ResultadoDoEnvio>(() => {});
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar });
    r.avancar(5000);

    expect(fila.enviando()).toEqual(["a"]);
    expect(fila.desfazer("a")).toBe(false);
  });

  it("servidor recusou: o resultado chega a quem restaura a linha", async () => {
    const r = relogio();
    const recusa: ResultadoDoEnvio = { ok: false, erro: "Sem conexão agora." };
    const aoTerminar = vi.fn();
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar, ...r });
    fila.agendar({ id: "a", enviar: async () => recusa });

    r.avancar(5000);
    await Promise.resolve();
    await Promise.resolve();

    expect(aoTerminar).toHaveBeenCalledWith("a", recusa);
    expect(fila.enviando()).toEqual([]);
  });

  it("função que lança vira erro visível, não conclusão perdida", async () => {
    const r = relogio();
    const aoTerminar = vi.fn();
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar, ...r });
    fila.agendar({
      id: "a",
      enviar: async () => {
        throw new Error("boom");
      },
    });

    r.avancar(5000);
    await Promise.resolve();
    await Promise.resolve();

    expect(aoTerminar).toHaveBeenCalledWith("a", { ok: false, erro: "boom" });
  });
});

describe("sair da página", () => {
  it("enviarTodos antecipa tudo que esperava, sem esperar o prazo", () => {
    const r = relogio();
    const a = vi.fn(async () => ok);
    const b = vi.fn(async () => ok);
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar: a });
    fila.agendar({ id: "b", enviar: b });

    fila.enviarTodos();

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(fila.esperando()).toEqual([]);
  });

  it("o timer que sobrou não envia uma segunda vez", () => {
    const r = relogio();
    const enviar = vi.fn(async () => ok);
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar });

    fila.enviarTodos();
    fila.enviarTodos();
    r.avancar(5000);

    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("enviarTodos sem nada esperando não faz nada", () => {
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...relogio() });
    expect(() => fila.enviarTodos()).not.toThrow();
  });
});

describe("mesmo atendimento duas vezes", () => {
  it("reagendar substitui o item e reinicia o prazo", () => {
    const r = relogio();
    const primeiro = vi.fn(async () => ok);
    const segundo = vi.fn(async () => ok);
    const fila = criarFilaAdiada({ esperaMs: 5000, aoTerminar: vi.fn(), ...r });
    fila.agendar({ id: "a", enviar: primeiro });
    r.avancar(3000);
    fila.agendar({ id: "a", enviar: segundo });
    r.avancar(3000);

    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).not.toHaveBeenCalled();
    r.avancar(2000);
    expect(segundo).toHaveBeenCalledTimes(1);
  });
});
