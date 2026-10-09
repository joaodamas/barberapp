"use client";

import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  PARCELAS_MAX,
  PARCELAS_MIN,
  parcelasValidas,
  planejarParcelas,
  previaDoParcelamento,
} from "@/lib/parcelamento";

export type TipoDeLancamento = "unica" | "recorrente" | "parcelada";
export type ModoDoValor = "total" | "parcela";

const TIPOS: Array<{ valor: TipoDeLancamento; rotulo: string; dica: string }> = [
  { valor: "unica", rotulo: "Única", dica: "uma vez só" },
  { valor: "recorrente", rotulo: "Recorrente", dica: "todo mês, sem fim" },
  { valor: "parcelada", rotulo: "Parcelada", dica: "N vezes, com fim" },
];

/** O rótulo do campo de valor muda com o que o dono está informando. */
export function rotuloDoValor(tipo: TipoDeLancamento, modo: ModoDoValor): string {
  if (tipo !== "parcelada") return "Valor (R$) *";
  return modo === "total" ? "Valor total (R$) *" : "Valor de cada parcela (R$) *";
}

/**
 * Única · Recorrente · Parcelada — uma escolha só.
 *
 * Eram duas ideias diferentes que o formulário tratava como uma caixa
 * "recorrente": recorrente repete todo mês SEM FIM; parcelada é N vezes COM
 * FIM. A dica de cada opção diz isso, e as duas não se combinam.
 */
export function ParcelamentoCampos({
  tipo,
  onTipo,
  permiteRecorrente,
  permiteParcelada = true,
  bloqueado,
  parcelas,
  onParcelas,
  modo,
  onModo,
  valor,
  primeira,
}: {
  tipo: TipoDeLancamento;
  onTipo: (t: TipoDeLancamento) => void;
  permiteRecorrente: boolean;
  /** Editando um lançamento que não é parcela, não há como "virar" parcelado. */
  permiteParcelada?: boolean;
  /** Editando um lançamento existente, o tipo não muda. */
  bloqueado?: boolean;
  parcelas: string;
  onParcelas: (v: string) => void;
  modo: ModoDoValor;
  onModo: (m: ModoDoValor) => void;
  /** O valor já lido do campo (ou `null` se vazio/ilegível). */
  valor: number | null;
  primeira: string;
}) {
  const opcoes = TIPOS.filter(
    (t) => (permiteRecorrente || t.valor !== "recorrente") && (permiteParcelada || t.valor !== "parcelada")
  );
  const n = Number(parcelas);
  const previa =
    tipo === "parcelada" && valor !== null && valor > 0 && parcelasValidas(n) && primeira
      ? previaDoParcelamento(planejarParcelas({ modo, valor, n, primeira }), formatBRL)
      : null;

  return (
    <div className="flex flex-col gap-3 md:col-span-2">
      <div role="radiogroup" aria-label="Tipo de lançamento" className="flex flex-wrap gap-2">
        {opcoes.map((t) => (
          <button
            key={t.valor}
            type="button"
            role="radio"
            aria-checked={tipo === t.valor}
            disabled={bloqueado}
            onClick={() => onTipo(t.valor)}
            className={cn(
              "flex min-h-11 flex-col items-start rounded-controle border px-3 py-1.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
              tipo === t.valor
                ? "border-gold bg-gold/10 text-ink"
                : "border-border bg-surface-raised text-ink-muted hover:border-gold/60"
            )}
          >
            <span className="text-sm font-medium">{t.rotulo}</span>
            <span className="text-[11px] text-ink-muted">{t.dica}</span>
          </button>
        ))}
      </div>

      {tipo === "parcelada" && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Número de parcelas ({PARCELAS_MIN} a {PARCELAS_MAX}) *
            <input
              type="number"
              inputMode="numeric"
              min={PARCELAS_MIN}
              max={PARCELAS_MAX}
              step={1}
              value={parcelas}
              onChange={(e) => onParcelas(e.target.value)}
              className="rounded-controle border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            O valor que vou informar é
            <select
              value={modo}
              onChange={(e) => onModo(e.target.value as ModoDoValor)}
              className="rounded-controle border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            >
              <option value="total">o total (divido em parcelas)</option>
              <option value="parcela">o de cada parcela</option>
            </select>
          </label>
          <p role="status" className="text-xs text-ink-muted md:col-span-2">
            {previa ??
              "Informe o valor e o número de parcelas para ver a prévia. A primeira parcela vence na data escolhida; as outras, no mesmo dia dos meses seguintes."}
          </p>
        </div>
      )}
    </div>
  );
}
