import { describe, expect, it } from "vitest";
import { emLotes, TAMANHO_DO_LOTE, totalDoFechamento } from "../telegram/gatilhos";
import {
  avisoDoToque,
  desfechoPeloStatusAtual,
  textoDaConexao,
  textoDoEncaixeRespondido,
  textoDoFechamento,
} from "../telegram/mensagens";

/**
 * Rotinas do Telegram (08/10): uma loja não pode parar as outras, o
 * fechamento conta o que o caixa conta, e o toque no botão diz o que de fato
 * aconteceu com o pedido.
 */

describe("emLotes — as rotinas das 7h e das 21h", () => {
  it("processa todos, em lotes, e um item que falha não leva os outros", async () => {
    const vistos: number[] = [];
    const itens = Array.from({ length: 25 }, (_, i) => i);
    const r = await emLotes(itens, TAMANHO_DO_LOTE, async (i) => {
      if (i === 3) throw new Error("loja com dado torto");
      vistos.push(i);
    });
    expect(r).toHaveLength(25);
    expect(r.filter((x) => x.status === "rejected")).toHaveLength(1);
    expect(vistos.sort((a, b) => a - b)).toEqual(itens.filter((i) => i !== 3));
  });

  it("nunca roda mais que um lote ao mesmo tempo", async () => {
    let emVoo = 0;
    let pico = 0;
    await emLotes(Array.from({ length: 23 }), 10, async () => {
      emVoo++;
      pico = Math.max(pico, emVoo);
      await new Promise((ok) => setTimeout(ok, 1));
      emVoo--;
    });
    expect(pico).toBeLessThanOrEqual(10);
    expect(pico).toBeGreaterThan(1);
  });

  it("lista vazia não chama nada", async () => {
    expect(await emLotes([], 10, async () => undefined)).toEqual([]);
  });
});

describe("fechamento das 21h", () => {
  it("desconta os estornos do dia do total", () => {
    expect(
      totalDoFechamento([{ grossAmount: 50 }, { grossAmount: 70.1 }, { grossAmount: "x" }], [{ grossAmount: 20.05 }])
    ).toEqual({ recebido: 100.05, estornado: 20.05, caixinha: 0 });
    expect(totalDoFechamento([{ grossAmount: 50 }], [])).toEqual({ recebido: 50, estornado: 0, caixinha: 0 });
  });

  it("o rótulo diz o critério real — data do atendimento — e o estorno descontado", () => {
    const t = textoDoFechamento({
      loja: "L",
      data: "2026-10-01",
      concluidos: 2,
      faltas: 0,
      emAberto: 0,
      recebido: 100,
      estornado: 20,
    });
    expect(t).toContain("pelos atendimentos de hoje");
    expect(t).toContain("estornos");
    expect(t).not.toContain("recebidos no balcão");
    const semEstorno = textoDoFechamento({ loja: "L", data: "2026-10-01", concluidos: 1, faltas: 0, emAberto: 0, recebido: 50 });
    expect(semEstorno).not.toContain("estornos");
  });
});

describe("toque no botão do encaixe — o porquê de não estar aberto", () => {
  it("cada status atual vira um desfecho próprio", () => {
    expect(desfechoPeloStatusAtual("confirmed")).toBe("ja_aprovado");
    expect(desfechoPeloStatusAtual("completed")).toBe("ja_aprovado");
    expect(desfechoPeloStatusAtual("cancelled_by_shop")).toBe("ja_recusado");
    expect(desfechoPeloStatusAtual("cancelled_by_client")).toBe("cancelado_pelo_cliente");
    expect(desfechoPeloStatusAtual("expired")).toBe("expired");
    expect(desfechoPeloStatusAtual(undefined)).toBe("ja_respondido");
  });

  it("o texto não diz 'respondido' quando foi o cliente que desistiu", () => {
    const r = { clientName: "Cliente Teste", date: "2026-10-03", time: "17:30", serviceNames: ["Corte"] };
    const t = textoDoEncaixeRespondido(r, "Loja", "cancelado_pelo_cliente", "Equipe");
    expect(t).toContain("desistiu");
    expect(t).not.toContain("respondido");
    expect(avisoDoToque("cancelado_pelo_cliente")).toContain("desistiu");
    expect(avisoDoToque("ja_aprovado")).toContain("aprovado");
    expect(avisoDoToque("expired")).toContain("expirou");
  });
});

describe("ligar o Telegram numa segunda barbearia", () => {
  it("a confirmação diz que a anterior foi desligada", () => {
    const t = textoDaConexao({
      contato: { nome: "Barbeiro Teste" },
      loja: "Loja Nova",
      doQue: "avisos",
      lojaDesligada: "Loja <Antiga>",
    });
    expect(t).toContain("Loja Nova");
    expect(t).toContain("desligado de lá");
    expect(t).toContain("Loja &lt;Antiga&gt;");
  });

  it("sem loja anterior, nada de aviso de desligamento", () => {
    const t = textoDaConexao({ contato: { nome: "X" }, loja: "Loja", doQue: "avisos", lojaDesligada: null });
    expect(t).not.toContain("desligado");
    expect(t).toContain("/parar");
  });
});
