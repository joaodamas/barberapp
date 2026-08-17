import { afterEach, describe, expect, it, vi } from "vitest";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";

/**
 * A chave que impede a venda dobrada.
 *
 * Escrito depois de a tela **quebrar inteira** com
 * `crypto.randomUUID is not a function`. Ela só existe em contexto seguro, e o
 * produto é multi-tenant por subdomínio: `osiqueira.lvh.me` em HTTP não é
 * seguro para o Chrome. Typecheck, lint e build passaram — o erro apareceu ao
 * carregar a página.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chave de idempotência", () => {
  it("tem formato estável e utilizável como id de documento", () => {
    /* Vira `venda_{chave}` no Firestore. Um "/" criaria uma subcoleção em vez
     * de um movimento, e o Firestore aceitaria sem reclamar. */
    const k = chaveDeIdempotencia();
    expect(k).toMatch(/^[0-9a-f]{32}$/);
  });

  it("não repete", () => {
    const chaves = new Set(Array.from({ length: 500 }, () => chaveDeIdempotencia()));
    expect(chaves.size).toBe(500);
  });

  it("funciona SEM `crypto.randomUUID` — o caso que derrubou a tela", () => {
    /* Contexto não seguro: `getRandomValues` existe, `randomUUID` não. */
    vi.stubGlobal("crypto", {
      getRandomValues: (a: Uint8Array) => {
        for (let i = 0; i < a.length; i++) a[i] = i;
        return a;
      },
    });
    expect(chaveDeIdempotencia()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("funciona sem `crypto` nenhum", () => {
    /* Último recurso. A chave não é segredo — é identificador de tentativa, e
     * o que ela protege é o toque duplo no botão. Uma chave fraca ainda faz
     * isso; uma exceção derruba a tela. */
    vi.stubGlobal("crypto", undefined);
    expect(chaveDeIdempotencia()).toMatch(/^[0-9a-f]{32}$/);
  });
});
