import { contraste, hexParaRgb, tonsDaMarca } from "@/lib/tons-da-marca";

/**
 * O que o dono pode mudar na tela "Sua marca" — nome, nome curto e cor — e a
 * conferência de cada um, sem navegador.
 *
 * Os limites daqui são os mesmos da regra do Firestore (`marcaDoDonoValida`
 * em `firestore.rules`). Mudou um, muda o outro: a regra é quem protege, isto
 * é quem explica ao dono antes de ele tentar.
 */

export const NOME_MINIMO = 2;
export const NOME_MAXIMO = 60;
/** O nome debaixo do ícone na tela inicial. `shortNameFrom` corta em 14. */
export const NOME_CURTO_MAXIMO = 14;

/**
 * Cores prontas. Cada uma passa nas DUAS conferências que a tela mostra:
 * ≥ 4,5:1 com o texto escuro dos botões (nunca aciona o ajuste automático) e
 * ≥ 3:1 sobre o fundo branco (não some em borda e ícone). É uma faixa
 * estreita de luminosidade — por isso não são as seis do cadastro
 * (`passo-barbearia.tsx`), das quais só o Dourado passa na primeira; as
 * outras cinco são clareadas por `tonsDaMarca` quando escolhidas lá.
 */
export const CORES_PRONTAS = [
  { hex: "#b8863a", nome: "Dourado" },
  { hex: "#c0703a", nome: "Cobre" },
  { hex: "#a3845a", nome: "Areia" },
  { hex: "#c46a6a", nome: "Terracota" },
  { hex: "#c27089", nome: "Vinho" },
  { hex: "#8f7fb8", nome: "Lavanda" },
  { hex: "#5b8cc4", nome: "Azul" },
  { hex: "#4f9a78", nome: "Verde" },
  { hex: "#8a8e78", nome: "Oliva" },
  { hex: "#7d8fa3", nome: "Aço" },
] as const;

const INK = "#0f172a";
const FUNDO = "#ffffff";

/** "#ABC", "abc", " #aabbcc " → "#aabbcc"; qualquer outra coisa → `null`. */
export function normalizarHex(entrada: string): string | null {
  const t = entrada.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) return `#${[...t].map((c) => c + c).join("")}`.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(t)) return `#${t}`.toLowerCase();
  return null;
}

export function problemaNoNome(nome: string): string | null {
  const t = nome.trim();
  if (t.length < NOME_MINIMO) return "Escreva o nome da barbearia.";
  if (t.length > NOME_MAXIMO) return `Use até ${NOME_MAXIMO} letras no nome.`;
  return null;
}

export function problemaNoNomeCurto(curto: string): string | null {
  const t = curto.trim();
  if (t.length < 1) return "Escreva o nome que aparece debaixo do ícone.";
  if (t.length > NOME_CURTO_MAXIMO) {
    return `Use até ${NOME_CURTO_MAXIMO} letras — mais que isso o celular corta com reticências.`;
  }
  return null;
}

export type AvaliacaoDaCor = {
  /** A cor que o BOTÃO vai ter de fato (pode ter sido clareada). */
  corDoBotao: string;
  /** Contraste do texto escuro sobre o botão — sempre ≥ 4,5 depois do ajuste. */
  contrasteDoBotao: number;
  /** A cor escolhida era escura demais para o texto do botão e foi clareada. */
  botaoAjustado: boolean;
  /** Contraste da cor escolhida sobre o fundo branco do app. */
  contrasteNoFundo: number;
  /**
   * Abaixo de 3:1 a cor some sobre o branco (WCAG 1.4.11 — componentes e
   * gráficos). O texto em destaque usa um tom escurecido automaticamente, mas
   * bordas, ícones e o círculo das iniciais ficam apagados.
   */
  fracaNoFundo: boolean;
};

/**
 * A conferência de contraste que a tela mostra.
 *
 * Não BLOQUEIA nenhuma cor: `tonsDaMarca` já protege o que é texto (clareia o
 * botão, escurece o texto de destaque). O que sobra é avisar o dono do que
 * vai acontecer, com o número — ele decide se o tom mais claro ainda é a
 * marca dele.
 */
export function avaliarCor(hex: string): AvaliacaoDaCor | null {
  const rgb = hexParaRgb(hex);
  if (!rgb) return null;
  const corDoBotao = tonsDaMarca(hex)["--color-gold"] ?? hex.toLowerCase();
  const ink = hexParaRgb(INK)!;
  const fundo = hexParaRgb(FUNDO)!;
  const contrasteNoFundo = contraste(rgb, fundo);
  return {
    corDoBotao,
    contrasteDoBotao: contraste(hexParaRgb(corDoBotao)!, ink),
    botaoAjustado: corDoBotao.toLowerCase() !== hex.toLowerCase(),
    contrasteNoFundo,
    fracaNoFundo: contrasteNoFundo < 3,
  };
}

/** 4.536… → "4,5:1" — como o WCAG escreve, com vírgula. */
export function formatarContraste(valor: number): string {
  return `${(Math.floor(valor * 10) / 10).toFixed(1).replace(".", ",")}:1`;
}
