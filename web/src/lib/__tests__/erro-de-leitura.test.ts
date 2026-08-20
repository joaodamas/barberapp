import { describe, expect, it } from "vitest";
import { explicarFalha, motivoDaFalha, textoDaFalha } from "@/lib/erro-de-leitura";

/**
 * A régua destes testes não é a taxonomia do Firestore — é a **ação do dono**.
 *
 * Cada caso pergunta: depois de ler isto, ele clica em "Tentar de novo" e
 * resolve, ou clica e continua sem acesso? Um código novo só precisa de teste
 * novo quando muda essa resposta.
 */
describe("motivoDaFalha", () => {
  it("permissão negada não é falta de conexão", () => {
    expect(motivoDaFalha({ code: "permission-denied" })).toBe("permissao");
    expect(motivoDaFalha({ code: "unauthenticated" })).toBe("permissao");
  });

  it("indisponibilidade e timeout são conexão", () => {
    expect(motivoDaFalha({ code: "unavailable" })).toBe("conexao");
    expect(motivoDaFalha({ code: "deadline-exceeded" })).toBe("conexao");
    expect(motivoDaFalha({ code: "cancelled" })).toBe("conexao");
    expect(motivoDaFalha({ code: "internal" })).toBe("conexao");
    expect(motivoDaFalha({ code: "resource-exhausted" })).toBe("conexao");
    expect(motivoDaFalha({ code: "aborted" })).toBe("conexao");
  });

  it("aceita o código prefixado pelo serviço, que é como o SDK entrega em alguns caminhos", () => {
    expect(motivoDaFalha({ code: "firestore/permission-denied" })).toBe("permissao");
    expect(motivoDaFalha({ code: "firestore/unavailable" })).toBe("conexao");
    expect(motivoDaFalha({ code: "auth/network-request-failed" })).toBe("conexao");
  });

  it("índice faltando NÃO é conexão — é defeito nosso, e o botão do dono não resolve", () => {
    /* `failed-precondition` no Firestore quase sempre é índice composto
     * ausente. Classificá-lo como transitório faria a tela pedir que o dono
     * recarregasse para sempre um erro que só um deploy conserta. */
    expect(motivoDaFalha({ code: "failed-precondition" })).toBe("desconhecido");
  });

  it("não lança para nada que não pareça um erro do SDK", () => {
    expect(motivoDaFalha(null)).toBe("desconhecido");
    expect(motivoDaFalha(undefined)).toBe("desconhecido");
    expect(motivoDaFalha("permission-denied")).toBe("desconhecido");
    expect(motivoDaFalha(new Error("boom"))).toBe("desconhecido");
    expect(motivoDaFalha({ code: 42 })).toBe("desconhecido");
    expect(motivoDaFalha({})).toBe("desconhecido");
  });
});

describe("textoDaFalha", () => {
  it("permissão NÃO oferece tentar de novo — o botão não pode funcionar", () => {
    const t = textoDaFalha("permissao");
    expect(t.temRetry).toBe(false);
    expect(t.explicacao).toContain("Recarregar não resolve");
  });

  it("conexão oferece tentar de novo e afirma que nada se perdeu", () => {
    const t = textoDaFalha("conexao");
    expect(t.temRetry).toBe(true);
    expect(t.explicacao).toContain("Nada foi perdido");
  });

  it("desconhecido preserva exatamente o texto que já existia", () => {
    /* O texto antigo era honesto — dizia as duas causas prováveis. Ele continua
     * sendo a resposta certa quando de fato não dá para saber qual foi. */
    expect(textoDaFalha("desconhecido").explicacao).toBe(
      "Pode ser a conexão ou uma permissão que mudou. Nada foi perdido."
    );
    expect(textoDaFalha("desconhecido").temRetry).toBe(true);
  });

  it("nenhum texto promete que o dado voltou — só que não se perdeu", () => {
    /* A régua do produto: não afirmar o que não aconteceu. "Nada foi perdido"
     * é sobre o dado gravado, não sobre a leitura ter dado certo. */
    for (const m of ["permissao", "conexao", "desconhecido"] as const) {
      expect(textoDaFalha(m).explicacao).not.toMatch(/carregad|atualizad|resolvid/i);
    }
  });
});

describe("explicarFalha · o caminho que a tela usa", () => {
  it("erro cru de permissão vira texto sem retry, em uma chamada", () => {
    expect(explicarFalha({ code: "permission-denied" })).toEqual({
      explicacao:
        "Seu acesso a esta informação mudou. Recarregar não resolve — " +
        "entre de novo ou peça para quem administra a barbearia liberar.",
      temRetry: false,
    });
  });

  it("sem erro nenhum, degrada para o texto genérico em vez de quebrar", () => {
    /* Tela antiga que ainda não passa `erro` continua funcionando igual. É o
     * que permite ligar isto sem tocar nas telas que outra equipe está
     * reescrevendo. */
    expect(explicarFalha(undefined).temRetry).toBe(true);
  });
});
