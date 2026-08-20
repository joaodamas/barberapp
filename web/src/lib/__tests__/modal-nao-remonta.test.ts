import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O modal não pode remontar o focus trap a cada tecla.
 *
 * ## O bug que este teste existe para impedir
 *
 * Todo campo dentro de qualquer modal aceitava **um caractere só**. Digitar
 * "Cera" no cadastro de produto deixava "C" — e o dono achava que o app estava
 * quebrado, porque estava.
 *
 * A causa não era do formulário, e sim de `ui/modal.tsx`: o `useEffect` que
 * monta o focus trap tinha `onClose` nas dependências. Todo consumidor passa
 * `onClose={() => setAlgo(false)}` — função nova a cada render —, então:
 *
 * ```
 * digita 1 letra → setState do form → re-render do pai
 *   → `onClose` muda de identidade → efeito remonta
 *   → cleanup: previouslyFocused.focus()   ← o foco SAI do modal
 *   → efeito:  dialogRef.focus()           ← foca o container, não o campo
 * ```
 *
 * O caractere entrava, o foco era arrancado, e o próximo ia para o nada.
 *
 * ## Por que teste de FONTE
 *
 * O projeto não tem `testing-library` nem ambiente de DOM, e adicionar os dois
 * para cobrir uma linha de dependências custaria mais do que resolve. O padrão
 * de asserção sobre o texto-fonte já existe aqui — `concordancia.test.ts`,
 * `regressao-origem-do-fato.test.ts` — e serve exatamente para invariante que é
 * fácil de reintroduzir sem querer.
 *
 * Um `useEffect` com dependência instável é o caso perfeito: o autoconserto do
 * ESLint (`react-hooks/exhaustive-deps`) EMPURRA para o erro, sugerindo incluir
 * `onClose`. Este teste é o contrapeso, e diz por quê.
 */

const MODAL = resolve(__dirname, "..", "..", "components", "ui", "modal.tsx");

/** O código sem comentários — senão a explicação do bug dispara o próprio teste. */
function codigoDe(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("Modal · o focus trap não remonta a cada render do pai", () => {
  const codigo = codigoDe(MODAL);

  it("o efeito do FOCUS TRAP depende só de `open`", () => {
    /* A primeira versão deste teste proibia `onClose` em qualquer efeito — e
     * quebrou assim que a ref passou a ser atualizada num efeito próprio, que
     * PRECISA de `onClose` nas dependências e é inofensivo: ele não toca em
     * foco, scroll nem listener.
     *
     * O invariante é mais estreito do que eu escrevi da primeira vez: o efeito
     * que monta o trap — o que chama `addEventListener` e mexe no foco — é que
     * não pode remontar. */
    const efeitos = codigo.split("useEffect(");
    const doTrap = efeitos.find((e) => e.includes("addEventListener"));
    expect(doTrap, "não achei o efeito do focus trap").toBeTruthy();

    const deps = doTrap!.match(/\}\s*,\s*\[([^\]]*)\]\s*\)/);
    expect(deps, "o efeito do focus trap precisa declarar dependências").toBeTruthy();
    expect(deps![1].trim()).toBe("open");
  });

  it("`onClose` é lido por ref dentro do efeito", () => {
    /* Tirar da lista de dependências sem a ref congelaria a primeira versão do
     * callback — o Escape passaria a fechar o modal errado depois de uma
     * troca de estado. A ref é o que mantém as duas coisas verdadeiras. */
    expect(codigo).toMatch(/onCloseRef\s*=\s*useRef\(onClose\)/);
    expect(codigo).toMatch(/onCloseRef\.current\s*=\s*onClose/);
    expect(codigo).toMatch(/onCloseRef\.current\(\)/);
  });

  it("o cleanup ainda devolve o foco — o conserto não pode ter tirado isso", () => {
    /* Devolver o foco ao elemento anterior é acessibilidade, e é correto: o
     * defeito era a FREQUÊNCIA com que isso acontecia, não o comportamento. */
    expect(codigo).toMatch(/previouslyFocused\?\.focus\(\)/);
  });
});

describe("nenhum outro efeito do projeto depende de callback de propriedade", () => {
  /* Varre os componentes atrás do mesmo padrão. O bug do modal passou anos sem
   * ser notado porque o sintoma — "o campo não aceita o que eu digito" — não
   * parece um problema de dependência de hook. */
  const dirs = [
    resolve(__dirname, "..", "..", "components"),
    resolve(__dirname, "..", "..", "components", "ui"),
  ];

  function arquivosTsx(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
      .map((e) => resolve(dir, e.name));
  }

  it("nenhum efeito que instala listener ou mexe no foco depende de callback", () => {
    /* A primeira versão proibia `onClose` em QUALQUER efeito, e caiu no efeito
     * que só guarda a referência numa ref — que precisa dela e é inofensivo.
     *
     * O que importa é o efeito que MEXE COM O MUNDO: listener, foco, timer.
     * Esses remontam de verdade, e remontar é o que arrancava o foco do campo. */
    const infratores: string[] = [];
    for (const dir of dirs) {
      for (const arquivo of arquivosTsx(dir)) {
        for (const efeito of codigoDe(arquivo).split("useEffect(").slice(1)) {
          const mexeNoMundo = /addEventListener|\.focus\(\)|setInterval|setTimeout/.test(efeito);
          if (!mexeNoMundo) continue;
          const deps = efeito.match(/\}\s*,\s*\[([^\]]*)\]\s*\)/);
          if (deps && /\bon[A-Z][A-Za-z]*/.test(deps[1])) {
            infratores.push(`${arquivo}: [${deps[1].trim()}]`);
          }
        }
      }
    }
    expect(infratores, infratores.join("\n")).toEqual([]);
  });
});
