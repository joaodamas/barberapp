import { describe, expect, it } from "vitest";
import {
  dataDoExpurgo,
  DIAS_ATE_O_EXPURGO,
  mensagemDoErro,
  nomeDoArquivo,
} from "@/lib/direitos-do-titular";

describe("a data do expurgo que a tela promete", () => {
  it("30 dias depois do encerramento — o mesmo número da Política", () => {
    const encerrada = Date.UTC(2026, 8, 1, 12);
    expect(DIAS_ATE_O_EXPURGO).toBe(30);
    expect(dataDoExpurgo(encerrada)?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
  });

  it("sem data válida, não promete data nenhuma", () => {
    /* "Seus dados serão apagados em 31 de janeiro de 1970" seria a tela
     * afirmando algo que o servidor não vai fazer. */
    for (const v of [undefined, null, 0, -1, NaN, "1695000000000"]) {
      expect(dataDoExpurgo(v)).toBeNull();
    }
  });
});

describe("o arquivo exportado", () => {
  it("não leva o nome da pessoa no nome do arquivo", () => {
    expect(nomeDoArquivo("abc123", "2026-09-23T10:00:00.000Z")).toBe(
      "dados-do-cliente-abc123-2026-09-23.json"
    );
  });

  it("id estranho não vira caminho", () => {
    expect(nomeDoArquivo("../x/y", "2026-09-23")).toBe("dados-do-cliente-xy-2026-09-23.json");
  });
});

describe("o erro que a tela mostra", () => {
  function erro(code: string, message: string) {
    return Object.assign(new Error(message), { code });
  }

  it("a recusa do servidor chega inteira — é ela que diz o que fazer", () => {
    const e = erro(
      "functions/failed-precondition",
      "Ainda não dá para anonimizar em Alfa: há 1 horário marcado daqui para a frente — cancele antes."
    );
    expect(mensagemDoErro(e)).toMatch(/horário marcado/);
  });

  it("erro interno não vaza jargão, e não afirma o que não sabe", () => {
    /* O SDK devolve `internal` também quando a resposta se perde na volta —
     * e aí a operação terminou. "Nada foi alterado" seria um palpite. */
    const m = mensagemDoErro(erro("functions/internal", "INTERNAL"));
    expect(m).not.toMatch(/INTERNAL/);
    expect(m).not.toMatch(/Nada foi alterado/);
    expect(m).toMatch(/repetir é seguro/);
  });

  it("sem rede, NÃO afirma que nada mudou — a chamada pode ter chegado", () => {
    const m = mensagemDoErro(erro("functions/unavailable", "unavailable"));
    expect(m).toMatch(/Sem conexão/);
    expect(m).not.toMatch(/Nada foi alterado/);
    expect(m).toMatch(/repetir é seguro/);
  });

  it("operação em etapas que falhou no meio diz que pode ter ficado pela metade", () => {
    /* Anonimizar grava em lotes. "Nada foi alterado" depois de metade das
     * reservas já limpas seria a tela afirmando o que não aconteceu. */
    const m = mensagemDoErro(erro("functions/internal", "INTERNAL"), { parcial: true });
    expect(m).not.toMatch(/Nada foi alterado/);
    expect(m).toMatch(/pela metade/);
  });
});
