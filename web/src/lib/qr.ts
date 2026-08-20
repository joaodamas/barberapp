import qrcode from "qrcode-generator";

/**
 * O QR do link da barbearia — de verdade, desta vez.
 *
 * ## O que havia antes
 *
 * Um desenho **determinístico derivado da URL**: quadrados de posicionamento nos
 * cantos e um padrão pseudoaleatório no meio. Parecia um QR e não era. O
 * comentário do componente admitia — *"placeholder determinístico até a
 * biblioteca de QR entrar"* — mas a tela ao lado dizia *"imprima e deixe no
 * balcão ou no espelho"*.
 *
 * É pior que não ter QR nenhum: o cliente aponta a câmera, nada acontece, e
 * quem parece quebrado é a barbearia — não o software. E contraria a régua da
 * casa: **nada de controle decorativo**.
 *
 * ## Por que `qrcode-generator` e não `qrcode`
 *
 * `qrcode` arrasta `pngjs`, `dijkstrajs` e **`yargs`** — um parser de argumentos
 * de linha de comando, que não tem função nenhuma no navegador.
 * `qrcode-generator` tem **zero dependências**, gera a matriz e deixa o desenho
 * com quem chama. Vale lembrar por que isso importa aqui: foi uma dependência
 * de terceiro em tempo de build (`next/font/google`) que já derrubou uma
 * publicação real deste produto.
 *
 * Geração 100% local: nenhuma chamada de rede, nenhum serviço externo. O QR
 * funciona com a barbearia offline.
 *
 * ## Nível de correção de erro
 *
 * `M` (~15%), e não `L`. Este QR é feito para ser **impresso e colado no
 * espelho** — vai pegar respingo, marca de dedo e desgaste. `L` economiza
 * módulos num código que já é curto; `M` compra tolerância onde ela é usada.
 */
export function matrizDoQr(valor: string): boolean[][] {
  /* `0` = a menor versão que couber o conteúdo. Fixar a versão limitaria o
   * tamanho da URL, e o slug da barbearia entra nela. */
  const qr = qrcode(0, "M");
  qr.addData(valor);
  qr.make();

  const modulos = qr.getModuleCount();
  const matriz: boolean[][] = [];
  for (let linha = 0; linha < modulos; linha++) {
    const atual: boolean[] = [];
    for (let coluna = 0; coluna < modulos; coluna++) {
      atual.push(qr.isDark(linha, coluna));
    }
    matriz.push(atual);
  }
  return matriz;
}
