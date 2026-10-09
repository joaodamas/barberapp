/**
 * Ajustar o estoque — o lado da tela.
 *
 * ⚠️ PAR com `functions/src/ajuste-de-estoque.ts`. A tela antecipa o saldo que o
 * servidor vai gravar; quem decide, dentro da transação, é o servidor. Os
 * motivos e os rótulos precisam ser os mesmos nos dois lados.
 */

export type MotivoDeAjuste = "perda" | "uso_interno" | "vencido" | "contagem" | "outro";

export const MOTIVOS_DE_SAIDA: Array<{ id: MotivoDeAjuste; rotulo: string }> = [
  { id: "perda", rotulo: "Perda/quebra" },
  { id: "uso_interno", rotulo: "Uso interno (na barbearia)" },
  { id: "vencido", rotulo: "Vencido" },
  { id: "contagem", rotulo: "Contagem (diferença de inventário)" },
  { id: "outro", rotulo: "Outro" },
];

export function rotuloDoMotivo(motivo: string | null | undefined, texto?: string | null): string {
  if (motivo === "outro") return texto ? `Outro: ${texto}` : "Outro";
  return MOTIVOS_DE_SAIDA.find((m) => m.id === motivo)?.rotulo ?? "Ajuste";
}

export type PreviaDoAjuste =
  | { ok: true; delta: number; estoqueDepois: number }
  | { ok: false; erro: string | null };

/**
 * O saldo que o pedido produz, ou por que ainda não dá para confirmar.
 *
 * `erro: null` = campo ainda vazio (o botão fica desabilitado, sem gritar).
 */
export function previaDoAjuste(params: {
  estoqueAtual: number;
  modo: "contagem" | "saida";
  /** O texto cru do campo de quantidade. */
  quantidade: string;
}): PreviaDoAjuste {
  const atual = Math.max(Number(params.estoqueAtual) || 0, 0);
  const texto = params.quantidade.trim();
  if (texto === "") return { ok: false, erro: null };
  if (!/^\d+$/.test(texto)) return { ok: false, erro: "Use só números inteiros." };
  const n = Number(texto);

  if (params.modo === "contagem") {
    if (n === atual) return { ok: false, erro: "O estoque já está com essa quantidade." };
    return { ok: true, delta: n - atual, estoqueDepois: n };
  }

  if (n <= 0) return { ok: false, erro: "Informe quantas unidades saíram." };
  if (n > atual) return { ok: false, erro: `Só há ${atual} un. no estoque.` };
  return { ok: true, delta: -n, estoqueDepois: atual - n };
}
