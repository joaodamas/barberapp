import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A regra da janela vive em dois lugares: `functions/src/janela.ts` (que o
 * servidor aplica) e `web/src/lib/janela.ts` (que decide quais dias a tela
 * oferece). Se um lado muda e o outro não, a tela oferece dia que o servidor
 * recusa — ou esconde dia que ele aceitaria. Os testes dos dois lados cobrem os
 * mesmos casos, mas só pegam a divergência se alguém lembrar de escrever o caso
 * nos dois. Este compara o código: qualquer diferença na regra quebra aqui.
 */
function regra(caminho: string): string {
  const fonte = readFileSync(caminho, "utf8");
  const inicio = fonte.indexOf("export type JanelaDaAgenda");
  const fim = fonte.indexOf("\n}\n", fonte.indexOf("export function limiteDoCliente"));
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return fonte.slice(inicio, fim);
}

describe("janela de agenda: servidor e tela com a mesma regra", () => {
  it("limiteDoCliente é idêntico nos dois lados", () => {
    const servidor = regra(join(__dirname, "..", "janela.ts"));
    const tela = regra(join(__dirname, "..", "..", "..", "web", "src", "lib", "janela.ts"));
    expect(tela).toBe(servidor);
  });
});
