import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { comissaoDaVenda, estornoDaComissao, idDaComissao } from "../comissoes";

/**
 * Bateria de regressão — QA-01 · a origem do fato.
 *
 * ## Por que este arquivo existe
 *
 * `financial-events.ts` carrega, em comentário, o registro de um defeito real:
 *
 * > *"G1.6 declarou `PaymentDoc.origin` e deu o campo às três origens — menos a
 * > esta, que já existia e passou despercebida. (…) Achado ao ler o documento
 * > gravado durante a verificação do estorno: `origin: undefined` num pagamento
 * > recém-materializado. **Nenhum teste apontava para lá.**"*
 *
 * Depois disso, `financial-events.test.ts` ganhou a varredura *"todo pagamento
 * nasce dizendo de onde veio"*. **A coleção `commissions` não ganhou a
 * equivalente**, e ela tem exatamente o mesmo formato de risco — com um
 * agravante: em `payments` o leitor tem rede
 * (`p.origin ?? (p.bookingId ? "servico" : undefined)`, em
 * `fontes-financeiras.ts`), e em `commissions` **não tem**.
 *
 * ## O que a ausência de `origin` custa do lado da leitura
 *
 * Os dois leitores da coleção filtram pelo campo, e um documento sem ele cai
 * fora dos dois:
 *
 * ```
 * comissoesDeServico   filtra origin === "servico"   → rederiva do cadastro de HOJE
 * comissaoDeProduto    filtra origin === "produto"   → soma zero
 * ```
 *
 * O primeiro caminho é o P1-7 de volta — mês fechado se reescreve quando o dono
 * muda o percentual de um barbeiro. O segundo é a metade oposta da régua: um
 * custo que aconteceu e o DRE não reconhece. **Nos dois o erro é silencioso.**
 *
 * A evidência do efeito está em `web/src/lib/__tests__/regressao-integracao.test.ts`
 * › "DEFEITO 2". Este arquivo cobre a outra ponta: garantir que nenhum caminho
 * de ESCRITA volte a produzir o documento sem o campo.
 */

const SRC = resolve(__dirname, "..");

/**
 * Quem ESCREVE na coleção `commissions`.
 *
 * A distinção entre ler e escrever importa, e o teste irmão em
 * `financial-events.test.ts` já tropeçou nela: `refunds.ts` abre a comissão
 * original só para copiar o percentual congelado. Aqui ele entra de verdade,
 * porque também grava a linha de reversão.
 */
function arquivosQueEscrevemComissao(): string[] {
  return readdirSync(SRC)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => {
      const t = readFileSync(resolve(SRC, f), "utf8");
      /* Os dois padrões que o repositório usa: `set(...)` com a coleção logo
       * adiante, ou uma ref nomeada que recebe `.set(`. */
      return (
        /set\([\s\S]{0,160}collection\("commissions"\)/.test(t) ||
        /comissaoRef\.set\(/.test(t)
      );
    });
}

describe("QA · toda comissão nasce dizendo de onde veio", () => {
  it("encontra os arquivos que gravam comissão", () => {
    /* Sem esta guarda, a varredura abaixo passaria sobre conjunto vazio no dia
     * em que alguém mudasse o jeito de escrever — e o teste viraria enfeite. */
    const arquivos = arquivosQueEscrevemComissao();
    expect(arquivos.length).toBeGreaterThanOrEqual(3);
    /* Os três caminhos conhecidos: conclusão de atendimento, venda de produto e
     * reversão de venda. */
    expect(arquivos).toEqual(
      expect.arrayContaining(["financial-events.ts", "inventory.ts", "refunds.ts"])
    );
  });

  it("cada um grava `origin`, direta ou indiretamente", () => {
    for (const arquivo of arquivosQueEscrevemComissao()) {
      const texto = readFileSync(resolve(SRC, arquivo), "utf8");
      /* Ou monta o documento por um dos helpers — que já gravam `origin` —, ou
       * escreve o campo à mão. Qualquer terceira forma é a que este teste
       * recusa. */
      const peloHelper = /comissaoDaVenda\(|estornoDaComissao\(/.test(texto);
      const naMao = /origin:\s*"(servico|produto)"/.test(texto);
      expect(
        peloHelper || naMao,
        `${arquivo} grava commissions sem definir origin`
      ).toBe(true);
    }
  });

  it("a conclusão de atendimento grava `origin: \"servico\"`", () => {
    /* Apontado pelo nome para não depender de a varredura continuar achando o
     * arquivo — mesma precaução do teste irmão de `payments`. */
    const texto = readFileSync(resolve(SRC, "financial-events.ts"), "utf8");
    expect(texto).toMatch(/origin:\s*"servico"/);
  });

  it("os helpers de produto SEMPRE devolvem `origin`, em qualquer entrada", () => {
    /* A varredura por texto prova que o campo é escrito; esta prova que ele é
     * escrito com VALOR — um `origin: undefined` passaria pela regex. */
    const venda = comissaoDaVenda({
      movementId: "v1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 45,
      unitCost: 18,
      quantidade: 2,
      commissionPct: 40,
      date: "2026-09-14",
    });
    expect(venda?.origin).toBe("produto");

    /* Inclusive na venda sem lucro, que é o caminho de borda: ela devolve
     * comissão ZERO e continua sendo um fato com origem. */
    const semLucro = comissaoDaVenda({
      movementId: "v2",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 10,
      unitCost: 18,
      quantidade: 1,
      commissionPct: 40,
      date: "2026-09-14",
    });
    expect(semLucro?.origin).toBe("produto");

    const volta = estornoDaComissao({
      movementId: "v1",
      chave: "k1",
      staffId: "leo",
      uid: null,
      staffName: "Léo",
      unitPrice: 45,
      unitCost: 18,
      quantidade: 1,
      commissionPct: 40,
      date: "2026-09-20",
    });
    expect(volta.origin).toBe("produto");
    /* A linha de estorno é negativa e some com a original — e precisa da origem
     * para entrar na mesma soma que ela. */
    expect(volta.commissionAmount).toBeLessThan(0);
  });
});

describe("QA · o vocabulário de origem é o mesmo na escrita e na leitura", () => {
  /* `comissoesDeServico` e `comissaoDeProduto`, no web, filtram por
   * `origin === "servico"` e `origin === "produto"`. São os ÚNICOS dois
   * valores que alguma leitura reconhece.
   *
   * Se um caminho novo gravar uma terceira origem — "mensalidade" é a
   * candidata óbvia, já que ela existe em `payments` e em `refunds` —, o
   * documento não entra em nenhuma das duas somas e o custo desaparece do DRE
   * sem erro nenhum. Este teste obriga a decisão a passar pelos dois lados. */

  it("a comissão tem exatamente DUAS origens, e são as que o DRE soma", () => {
    const texto = readFileSync(resolve(SRC, "comissoes.ts"), "utf8");
    const declaracao = texto.match(/export type OrigemDaComissao\s*=\s*([^;]+);/);

    expect(declaracao, "OrigemDaComissao deixou de ser declarada").not.toBeNull();

    const origens = [...declaracao![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    expect(origens).toEqual(["produto", "servico"]);
  });

  it("o id do documento distingue as duas origens para o mesmo sufixo", () => {
    /* Se as duas colidissem, a comissão de produto sobrescreveria a de serviço
     * do mesmo id — e a barbearia perderia uma das duas sem aviso. */
    expect(idDaComissao({ origem: "servico", refId: "x1" })).not.toBe(
      idDaComissao({ origem: "produto", refId: "x1" })
    );
  });
});
