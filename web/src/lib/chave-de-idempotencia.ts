/**
 * Uma chave única por tentativa de operação — a que impede a venda dobrada.
 *
 * ## Por que não `crypto.randomUUID()`
 *
 * Ela só existe em **contexto seguro**. Chrome considera seguro apenas HTTPS e
 * o literal `localhost` — e o produto é multi-tenant por subdomínio, então a
 * barbearia é servida em `osiqueira.lvh.me`, que **não** é seguro em HTTP.
 *
 * O resultado não era uma chave ausente: era `crypto.randomUUID is not a
 * function` na montagem do componente, derrubando a tela inteira da Loja.
 * Typecheck passa (a tipagem do DOM declara o método), lint passa, build passa,
 * e a suíte não abre navegador nenhum. Só apareceu ao carregar a página.
 *
 * `crypto.getRandomValues` **não** tem essa restrição e é o que sustenta a
 * geração aqui. O último recurso com `Math.random` existe para ambientes sem
 * `crypto` algum: uma chave fraca ainda protege contra o toque duplo, que é o
 * caso real — ela não é segredo, é identificador de tentativa.
 */

const HEX = "0123456789abcdef";

export function chaveDeIdempotencia(): string {
  const bytes = new Uint8Array(16);

  const c = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let saida = "";
  for (const b of bytes) {
    saida += HEX[b >> 4] + HEX[b & 15];
  }
  return saida;
}
