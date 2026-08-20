import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * UX-07 · a concordância não volta a morar na linha.
 *
 * ## Por que um teste de FONTE, e não mais um teste de valor
 *
 * `plural.ts` já existia — com a regra escrita, com `contarDeTotal` criada
 * *nominalmente* para o caso "X de Y", e com `plural.test.ts` provando os dois.
 * Mesmo assim o produto entregou **"1 de 3 devolvida"** em `estornos.ts` e
 * **"1 un. já voltaram"** em `desfazer-venda.tsx`, escritos DEPOIS dele, dentro
 * do arquivo da mesma equipe que escreveu a regra.
 *
 * O `estornos.test.ts` não só deixou passar: ele **afirmava** a frase errada,
 * verde, com o nome "conta o parcial com o total". Dois testes do mesmo repo se
 * contradiziam — é o item *"teste que contradiz o contrato"* da §16.
 *
 * Um teste de valor prova a frase que alguém lembrou de testar. O que faltava
 * era impedir a FORMA que produz frases erradas — o ternário inline —, do mesmo
 * jeito que `densidade.test.ts` varre a fonte atrás de número repetido e
 * `sem-falso-zero.test.ts` atrás do zero inventado.
 *
 * ## O que este arquivo NÃO faz
 *
 * Ele não julga se a palavra escolhida é bonita, nem se o par singular/plural
 * está correto — `plural.ts` não deduz, e este teste também não. Ele trava
 * apenas a desistência: o ternário na linha e o `(s)`.
 */

const SRC = new URL("../../", import.meta.url);

/** Todo `.ts`/`.tsx` de produção — testes e a própria regra ficam de fora. */
function fontesDeProducao(): string[] {
  const raiz = fileURLToPath(SRC);
  const achados: string[] = [];

  const andar = (dir: string) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const caminho = `${dir}/${item.name}`;
      if (item.isDirectory()) {
        if (item.name === "__tests__" || item.name === "node_modules") continue;
        andar(caminho);
        continue;
      }
      if (!/\.tsx?$/.test(item.name)) continue;
      // `plural.ts` É a regra: o ternário mora nele de propósito.
      if (item.name === "plural.ts") continue;
      achados.push(caminho);
    }
  };

  andar(raiz);
  return achados;
}

/**
 * Comentário que CITA o anti-padrão não é o anti-padrão.
 *
 * Sem isto o teste se autossabota: cada correção foi documentada com um
 * comentário que mostra a expressão que saiu — e reprovaria exatamente os
 * arquivos que acabou de aprovar. Mesma armadilha, e mesma saída, de
 * `densidade.test.ts`.
 */
function semComentarios(fonte: string) {
  return fonte.replace(/\{?\s*\/\*[\s\S]*?\*\/\s*\}?/g, "").replace(/\/\/.*$/gm, "");
}

function relativo(caminho: string) {
  return caminho
    .slice(fileURLToPath(SRC).length)
    .replace(/\\/g, "/")
    .replace(/^\//, "");
}

/**
 * Só o texto que o dono lê — literais de string e de template.
 *
 * A varredura ingênua por `(s)` acusa `salvarLinha(s)` e `setAExcluir(s)` em
 * `servicos-editor.tsx`: parâmetro de arrow function, não desistência de
 * plural. Restringir ao conteúdo dos literais separa os dois pela única coisa
 * que de fato os distingue — um é texto, o outro é código.
 *
 * Limite conhecido e aceito: texto solto em JSX (`<p>3 serviço(s)</p>`) fica de
 * fora. A microcópia deste repo mora em literal na esmagadora maioria dos
 * casos, e um teste que acusa código como se fosse frase seria desligado na
 * primeira semana — que é pior do que um que cobre menos e nunca mente.
 */
function literaisDeTexto(fonte: string): string {
  const literais =
    fonte.match(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g) ?? [];
  return literais.join("\n");
}

/** Cada fonte de produção com os comentários já removidos. */
const FONTES = fontesDeProducao().map((caminho) => ({
  arquivo: relativo(caminho),
  texto: semComentarios(readFileSync(caminho, "utf8")),
}));

function ocorrencias(padrao: RegExp) {
  return FONTES.flatMap(({ arquivo, texto }) =>
    (texto.match(padrao) ?? []).map((trecho) => `${arquivo}: ${trecho.trim()}`)
  );
}

describe("o ternário de concordância não mora na linha", () => {
  /**
   * A forma exata do Q20: `devolvida > 1 ? "s" : ""`.
   *
   * É a pior das duas porque parece inofensiva — quem escreve acha que resolveu
   * o plural, e resolveu para o substantivo errado. Sem exceção registrada: ela
   * tinha **uma** ocorrência no repo inteiro, e era o defeito.
   */
  it("ninguém emenda um 's' com ternário", () => {
    const achados = ocorrencias(/[=<>!]=?\s*1\s*\?\s*"s"\s*:\s*""|[=<>!]=?\s*1\s*\?\s*""\s*:\s*"s"/g);
    expect(
      achados,
      `sufixo de plural por ternário — use contar/contarDeTotal de lib/plural.ts:\n${achados.join("\n")}`
    ).toEqual([]);
  });

  /**
   * O par de palavras: `unidades === 1 ? "voltou" : "voltaram"`.
   *
   * A saída dessa forma pode até estar certa — a de `desfazer-venda.tsx` estava
   * — e é justamente por isso que ela sobrevive à revisão e ensina o próximo a
   * repetir. Quinze linhas abaixo dela, o mesmo arquivo escrevia "1 un. já
   * voltaram".
   */
  const RESIDUAIS_REGISTRADOS = [
    /* Fora do território do UX-07. `{totalItens === 1 ? "produto" : "produtos"}`
     * imprime a frase CERTA — o que está errado é a forma, e corrigir arquivo de
     * outro escopo é a regra 7 do protocolo. Registrado no relatório, sem dono
     * atribuído. */
    "components/vender-produto.tsx",
  ];

  /**
   * A comparação é contra **1** e os dois lados são PALAVRAS.
   *
   * Sem as duas restrições o teste vira ruído e é desligado: `>= 0 ? "success"
   * : "danger"` e `> 0 ? "bg-gold text-ivory" : "border border-border"` são
   * escolha de estado e de classe, não de concordância. O 1 é a fronteira do
   * singular, e "palavra" — só letras — exclui classe de CSS e rótulo composto.
   */
  const TERNARIO_DE_PALAVRAS =
    /[=<>!]=?\s*1\s*\?\s*"([a-zà-úA-ZÀ-Ú]*)"\s*:\s*"([a-zà-úA-ZÀ-Ú]*)"/g;

  it("ninguém escolhe entre duas palavras com ternário", () => {
    const achados = ocorrencias(TERNARIO_DE_PALAVRAS).filter(
      (a) => !RESIDUAIS_REGISTRADOS.some((r) => a.startsWith(r))
    );
    expect(
      achados,
      `concordância por ternário inline — use plural() de lib/plural.ts:\n${achados.join("\n")}`
    ).toEqual([]);
  });

  /**
   * O outro sintoma da mesma desistência, e o mais fácil de reintroduzir: o
   * produto se recusando a concordar e devolvendo a conta para quem lê.
   */
  /* Vazio de novo, e é para continuar assim.
   *
   * A única exceção registrada era `${selectedServices.length} serviço(s)` na
   * barra fixa do agendar — deixada para o dono do território, que era a N7.
   * Corrigida em 18/08 com `contar(...)`; a exceção sai junto, senão o teste
   * segue cego para o arquivo inteiro e o `(s)` volta pela próxima frase que
   * alguém escrever ali. */
  const PARENTESE_REGISTRADO: string[] = [];

  it("nenhuma tela escreve serviço(s)", () => {
    const achados = FONTES.flatMap(({ arquivo, texto }) =>
      (literaisDeTexto(texto).match(/[a-zà-ú]\((s|is|es)\)/gi) ?? []).map(
        (trecho) => `${arquivo}: ${trecho}`
      )
    ).filter((a) => !PARENTESE_REGISTRADO.some((r) => a.startsWith(r)));
    expect(
      achados,
      `o "(s)" voltou — ver o cabeçalho de lib/plural.ts:\n${achados.join("\n")}`
    ).toEqual([]);
  });
});

describe("os dois defeitos vistos na tela passam pela regra", () => {
  const fonte = (caminho: string) =>
    readFileSync(new URL(`../../${caminho}`, import.meta.url), "utf8");

  /** Q20 — a frase da situação da venda. */
  it("estornos.ts deriva a frase de contarDeTotal", () => {
    const texto = fonte("lib/estornos.ts");
    expect(texto).toContain('from "@/lib/plural"');
    expect(semComentarios(texto)).toContain("contarDeTotal(v.devolvida, v.quantidade");
  });

  /**
   * Q21 — o par que as `UI-UX-GUIDELINES` §9 usam como exemplo. O produto
   * escrevia o lado errado do próprio exemplo do próprio guia.
   */
  it("desfazer-venda.tsx concorda por plural(), nos dois verbos", () => {
    const texto = semComentarios(fonte("components/desfazer-venda.tsx"));
    expect(texto).toContain('plural(aDesfazer.devolvida, "voltou", "voltaram")');
    // "Restam 1" era o mesmo defeito no extremo oposto, e ninguém tinha visto.
    expect(texto).toContain('plural(aDesfazer.resta, "Resta", "Restam")');
    expect(texto).toContain('plural(feito.unidades, "voltou", "voltaram")');
  });

  /**
   * O adjetivo concordava em GÊNERO com o nome do produto, que o dono digita:
   * "Shampoo … vendida". Gênero de nome de produto não é dedutível, então a
   * frase foi reescrita para não depender dele — a correção aqui é a AUSÊNCIA
   * do adjetivo, e é isso que o teste guarda.
   */
  it("nenhuma frase concorda em gênero com o nome do produto", () => {
    const texto = semComentarios(fonte("components/desfazer-venda.tsx"));
    expect(texto).not.toMatch(/nomeDoProduto\([^)]*\)\}?\s*vendid[oa]/);
  });

  it("estornar-valor.tsx concorda nos dois verbos", () => {
    const texto = semComentarios(fonte("components/estornar-valor.tsx"));
    expect(texto).toContain('plural(jaEstornado, "foi devolvido", "foram devolvidos")');
    expect(texto).toContain('plural(resta, "Resta", "Restam")');
  });
});

/**
 * Q15 · o vazio de Mensalistas não afirma o que não leu.
 *
 * Teste de fonte pela mesma razão de `densidade.test.ts`: a suíte roda em
 * `environment: "node"` e o repo não tem testing-library, então não há como
 * renderizar a página. O que dá para provar sem renderizar é o que importa
 * aqui — que a tela LÊ os planos antes de afirmar que não há planos.
 */
describe("Mensalistas — o vazio distingue as duas ausências", () => {
  const fonte = readFileSync(
    new URL("../../app/painel/(dashboard)/mensal/page.tsx", import.meta.url),
    "utf8"
  );
  const texto = semComentarios(fonte);

  /**
   * A régua do produto: *não afirme o que não aconteceu*. A tela dizia "seus
   * planos precisam estar cadastrados" sem nunca ter lido `plans` — não era um
   * texto infeliz, era uma afirmação sobre um fato que ela não tinha.
   */
  it("lê os planos antes de falar deles", () => {
    expect(texto).toContain("usePlans(");
  });

  /** Mesmo filtro de `GerirMensalistas`, que oferece os planos no modal acima. */
  it("guarda pela contagem de planos ativos, como o modal já fazia", () => {
    expect(texto).toContain("planosAtivos.length === 0");
  });

  /**
   * O núcleo da regressão: a frase de provisionamento não pode voltar a ser a
   * descrição fixa. Com dois planos ativos, o dono lia que não podia fazer o
   * que o botão logo acima fazia.
   */
  it("a descrição é decidida, não fixa", () => {
    expect(texto).toContain("description={");
    expect(texto).not.toMatch(/description="Mensalista/);
  });

  /**
   * E a afirmação de ausência só sai depois da leitura ter terminado. Com
   * `plans` carregando, `items` é `[]` — sem esta guarda, a tela voltaria a
   * afirmar "não há planos" durante o carregamento, que é o D27 outra vez:
   * vazio no lugar de "ainda não li".
   */
  it("não confunde carregando com não há", () => {
    expect(texto).toContain('statusDosPlanos === "pronto"');
  });
});
