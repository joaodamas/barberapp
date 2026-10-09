/**
 * Copiar para a área de transferência SEM calar quando falha.
 *
 * `navigator.clipboard.writeText` recusa em contexto sem permissão (navegador
 * de dentro de outro app, iPhone com a página fora do toque) — e quatro telas
 * engoliam o erro: o botão continuava dizendo "Copiar", o dono tocava, nada
 * acontecia e nenhuma palavra explicava. Aqui são três degraus: a API moderna,
 * o `execCommand` antigo e, por último, SELECIONAR o texto na tela para a
 * pessoa copiar com o dedo — com um aviso dizendo isso.
 */

export const AVISO_DE_COPIA_FALHOU =
  "Não consegui copiar sozinho. O texto ficou selecionado: segure nele e toque em Copiar.";

export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* cai no plano B */
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    campo.setSelectionRange(0, texto.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

/** Seleciona o conteúdo de um elemento, como se a pessoa o tivesse marcado. */
export function selecionarTexto(elemento: HTMLElement | null) {
  if (!elemento) return;
  const selecao = window.getSelection();
  if (!selecao) return;
  const faixa = document.createRange();
  faixa.selectNodeContents(elemento);
  selecao.removeAllRanges();
  selecao.addRange(faixa);
}

/**
 * Copia; se não der, seleciona o elemento que mostra o texto.
 * `true` = copiou. `false` = não copiou e o texto ficou selecionado — quem
 * chamou mostra `AVISO_DE_COPIA_FALHOU`.
 */
export async function copiarOuSelecionar(
  texto: string,
  elemento: HTMLElement | null
): Promise<boolean> {
  if (await copiarTexto(texto)) return true;
  selecionarTexto(elemento);
  return false;
}
