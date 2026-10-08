import { describe, expect, it } from "vitest";
import { estadoDaChave } from "@/lib/db/estado-da-chave";

/**
 * Trocar o filtro de uma assinatura não pode deixar a tela "pronta" com o
 * resultado do filtro anterior.
 *
 * O hook mantinha os itens antigos e `status: "pronto"` até a nova consulta
 * responder — a comissão do mês passado aparecia sob o título do mês novo.
 * A suíte não monta componente, então o que se testa é a decisão pura que o
 * hook devolve à tela.
 */
const guardado = (chave: string | null, status: "carregando" | "pronto" | "erro" = "pronto") => ({
  items: [{ id: "a", valor: 10 }],
  status,
  error: status === "erro" ? new Error("unavailable") : null,
  chave,
});

describe("estadoDaChave", () => {
  it("mesma chave: entrega o que está guardado", () => {
    const g = guardado('casa:bookings:{"de":"2026-09"}');
    const visto = estadoDaChave(g, 'casa:bookings:{"de":"2026-09"}');
    expect(visto.status).toBe("pronto");
    expect(visto.items).toBe(g.items);
  });

  it("chave nova: é carregando e sem os itens da anterior", () => {
    const visto = estadoDaChave(guardado('casa:bookings:{"de":"2026-09"}'), 'casa:bookings:{"de":"2026-10"}');
    expect(visto.status).toBe("carregando");
    expect(visto.items).toEqual([]);
  });

  it("erro da chave anterior também não vaza para a nova", () => {
    const visto = estadoDaChave(guardado("a", "erro"), "b");
    expect(visto.status).toBe("carregando");
    expect(visto.error).toBeNull();
  });

  it("antes da primeira resposta é carregando", () => {
    expect(estadoDaChave(guardado(null, "carregando"), "a").status).toBe("carregando");
  });

  it("a lista vazia do carregando é sempre a mesma (não refaz memo a cada render)", () => {
    const g = guardado("a");
    expect(estadoDaChave(g, "b").items).toBe(estadoDaChave(g, "c").items);
  });
});
