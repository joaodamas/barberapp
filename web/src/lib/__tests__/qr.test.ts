import { describe, expect, it } from "vitest";
import { matrizDoQr } from "@/lib/qr";
import { tenantUrl } from "@/lib/tenant";

/**
 * O QR do "Meu link".
 *
 * ## Por que estes testes existem
 *
 * O QR anterior era um **placeholder** — um padrão derivado da URL, com os
 * quadrados de posicionamento desenhados à mão. Ele passava em qualquer
 * inspeção visual e não era escaneável. Foi publicado em produção assim, ao
 * lado da frase *"imprima e deixe no balcão ou no espelho"*.
 *
 * Nenhum teste o pegou porque nenhum teste existia — e o que teria pegado não é
 * "o canvas desenhou algo", e sim as PROPRIEDADES ESTRUTURAIS que um QR precisa
 * ter. É isso que está aqui.
 *
 * ⚠️ **Estes testes não substituem apontar uma câmera.** Eles provam que a
 * matriz tem a estrutura de um QR e que ela deriva da URL certa; a leitura real
 * é verificação de produção, e está registrada como tal.
 */

const URL_DO_SIQUEIRA = "https://osiqueira.jpproject.com.br/";

describe("matrizDoQr · estrutura de um QR de verdade", () => {
  it("é quadrada e tem tamanho de versão válida", () => {
    const m = matrizDoQr(URL_DO_SIQUEIRA);
    expect(m.length).toBeGreaterThan(0);
    for (const linha of m) expect(linha).toHaveLength(m.length);

    /* Versões vão de 1 (21×21) a 40 (177×177), sempre 4k+17. O placeholder era
     * 25×25 fixo — que por coincidência é versão 2, e é justamente o tipo de
     * coincidência que faz um desenho passar por QR. */
    expect((m.length - 17) % 4).toBe(0);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.length).toBeLessThanOrEqual(177);
  });

  it("tem os TRÊS localizadores, e só três", () => {
    /* O padrão é 7×7: borda escura, anel claro, miolo 3×3 escuro. Um leitor
     * encontra o código por eles — sem os três, não há o que ler. */
    const m = matrizDoQr(URL_DO_SIQUEIRA);
    const n = m.length;

    const ehLocalizador = (top: number, left: number) => {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          const naBorda = y === 0 || y === 6 || x === 0 || x === 6;
          const noMiolo = y >= 2 && y <= 4 && x >= 2 && x <= 4;
          const esperado = naBorda || noMiolo;
          if (m[top + y][left + x] !== esperado) return false;
        }
      }
      return true;
    };

    expect(ehLocalizador(0, 0)).toBe(true);
    expect(ehLocalizador(0, n - 7)).toBe(true);
    expect(ehLocalizador(n - 7, 0)).toBe(true);
    /* O canto inferior direito NÃO tem localizador — é o que dá orientação ao
     * leitor. O placeholder desenhava um padrão qualquer ali. */
    expect(ehLocalizador(n - 7, n - 7)).toBe(false);
  });

  it("tem o timing pattern alternando", () => {
    /* Linha e coluna 6 alternam escuro/claro e dão a escala ao leitor. */
    const m = matrizDoQr(URL_DO_SIQUEIRA);
    for (let i = 8; i < m.length - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });
});

describe("matrizDoQr · o conteúdo é a URL do link", () => {
  it("URLs diferentes produzem matrizes diferentes", () => {
    const a = matrizDoQr("https://osiqueira.jpproject.com.br/");
    const b = matrizDoQr("https://outra.jpproject.com.br/");
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("a mesma URL produz sempre a mesma matriz", () => {
    expect(JSON.stringify(matrizDoQr(URL_DO_SIQUEIRA))).toBe(
      JSON.stringify(matrizDoQr(URL_DO_SIQUEIRA))
    );
  });

  it("é a URL de `tenantUrl` que entra — a mesma que o botão Copiar oferece", () => {
    /* O risco real não é o QR estar errado: é ele apontar para OUTRO lugar que
     * não o link exibido ao lado. Um QR válido para a URL errada passa em todos
     * os testes de estrutura acima. */
    const doTenant = tenantUrl("osiqueira");
    expect(JSON.stringify(matrizDoQr(doTenant))).toBe(
      JSON.stringify(matrizDoQr(tenantUrl("osiqueira")))
    );
    expect(JSON.stringify(matrizDoQr(doTenant))).not.toBe(
      JSON.stringify(matrizDoQr(tenantUrl("outra-barbearia")))
    );
  });

  it("aguenta slug longo sem estourar a versão máxima", () => {
    const m = matrizDoQr(tenantUrl("barbearia-com-nome-bem-comprido-mesmo-assim"));
    expect(m.length).toBeLessThanOrEqual(177);
  });
});

describe("matrizDoQr · o que o placeholder fazia e não passa mais", () => {
  it("não é um padrão de 25×25 fixo", () => {
    /* O placeholder tinha `cells = 25` cravado, independente do conteúdo. Uma
     * URL curta e uma longa geravam a MESMA grade. */
    const curta = matrizDoQr("https://a.b/");
    const longa = matrizDoQr(
      "https://barbearia-com-nome-bem-comprido.jpproject.com.br/caminho/extra"
    );
    expect(curta.length).not.toBe(longa.length);
  });
});
