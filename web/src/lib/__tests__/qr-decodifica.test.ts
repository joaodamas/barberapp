import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { matrizDoQr } from "@/lib/qr";
import { tenantUrl } from "@/lib/tenant";

/**
 * A prova de ida e volta: o que geramos, um leitor INDEPENDENTE consegue ler.
 *
 * ## Por que este arquivo é separado de `qr.test.ts`
 *
 * Os testes de lá provam **estrutura** — versão válida, três localizadores,
 * timing pattern. São necessários e não são suficientes: uma matriz pode ter
 * todos os marcadores no lugar e ainda assim carregar bits que nenhum leitor
 * decodifica. Foi por parecer correto que o placeholder anterior chegou a
 * produção.
 *
 * Aqui a matriz sai de `matrizDoQr` — a MESMA que a tela desenha — vira pixels
 * e é lida por `jsQR`, que não sabe nada do gerador. Se a URL volta idêntica, o
 * código carrega a informação certa de forma decodificável.
 *
 * ## ⚠️ O que este teste NÃO prova
 *
 * **Não é a câmera.** Ele lê pixels perfeitos: contraste máximo, foco absoluto,
 * sem perspectiva, sem reflexo, sem papel. Óptica é outra coisa, e continua
 * sendo verificação física — apontar um celular para a tela e para o cartaz
 * impresso, no tamanho em que ele vai ser colado.
 *
 * O estado honesto do QR é: decodificação independente ✅ · URL correta ✅ ·
 * prova física pendente.
 *
 * `jsqr` é **devDependency**: entra na suíte, nunca no bundle do cliente.
 */

const URL_DO_SIQUEIRA = "https://osiqueira.jpproject.com.br/";

/** A matriz da tela, virada em pixels do jeito que um leitor espera. */
function pixelsDoQr(url: string, escala = 8, quietZone = 4) {
  const matriz = matrizDoQr(url);
  const modulos = matriz.length;
  const lado = (modulos + quietZone * 2) * escala;
  const data = new Uint8ClampedArray(lado * lado * 4);

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const coluna = Math.floor(x / escala) - quietZone;
      const linha = Math.floor(y / escala) - quietZone;
      const dentro = linha >= 0 && coluna >= 0 && linha < modulos && coluna < modulos;
      const escuro = dentro && matriz[linha][coluna];
      const tom = escuro ? 0 : 255;
      const i = (y * lado + x) * 4;
      data[i] = tom;
      data[i + 1] = tom;
      data[i + 2] = tom;
      data[i + 3] = 255;
    }
  }
  return { data, lado };
}

describe("QR · um leitor independente decodifica o que a tela desenha", () => {
  it("o link do Siqueira volta EXATAMENTE igual", () => {
    const { data, lado } = pixelsDoQr(URL_DO_SIQUEIRA);
    const lido = jsQR(data, lado, lado);

    expect(lido).not.toBeNull();
    expect(lido?.data).toBe(URL_DO_SIQUEIRA);
  });

  it("é a URL de `tenantUrl` que sai do outro lado", () => {
    /* O risco que a estrutura não pega: um QR perfeitamente válido apontando
     * para o lugar errado. Aqui o conteúdo é conferido, não só a forma. */
    const url = tenantUrl("osiqueira");
    const { data, lado } = pixelsDoQr(url);
    expect(jsQR(data, lado, lado)?.data).toBe(url);
  });

  it("barbearias diferentes levam a endereços diferentes", () => {
    const a = pixelsDoQr(tenantUrl("osiqueira"));
    const b = pixelsDoQr(tenantUrl("outra-barbearia"));
    const lidoA = jsQR(a.data, a.lado, a.lado)?.data;
    const lidoB = jsQR(b.data, b.lado, b.lado)?.data;

    expect(lidoA).toBe(tenantUrl("osiqueira"));
    expect(lidoB).toBe(tenantUrl("outra-barbearia"));
    expect(lidoA).not.toBe(lidoB);
  });

  it("slug longo continua legível — não estoura nem embaralha", () => {
    const url = tenantUrl("barbearia-com-nome-bem-comprido-mesmo-assim");
    const { data, lado } = pixelsDoQr(url);
    expect(jsQR(data, lado, lado)?.data).toBe(url);
  });

  it("a quiet zone não muda o conteúdo lido — e é por isso que ela NÃO é testável aqui", () => {
    /* Escrevi este teste primeiro afirmando que SEM quiet zone o leitor falha.
     * Ele falhou: `jsQR` lê os dois casos. E a premissa errada era minha —
     * com pixels perfeitos a imagem termina exatamente no símbolo, então não
     * há nada em volta para confundir o leitor.
     *
     * A quiet zone existe para a leitura FÍSICA, onde o código está cercado de
     * papel impresso, moldura de espelho e reflexo. Isso é óptica, e óptica não
     * se prova com `Uint8ClampedArray`.
     *
     * O teste fica registrando o que de fato se sabe: a margem não altera o
     * conteúdo. Que ela é necessária no cartaz é decisão de desenho, justificada
     * em `lib/qr.ts`, e verificável só com câmera. */
    const com = pixelsDoQr(URL_DO_SIQUEIRA, 8, 4);
    const sem = pixelsDoQr(URL_DO_SIQUEIRA, 8, 0);
    expect(jsQR(com.data, com.lado, com.lado)?.data).toBe(URL_DO_SIQUEIRA);
    expect(jsQR(sem.data, sem.lado, sem.lado)?.data).toBe(URL_DO_SIQUEIRA);
  });
});
