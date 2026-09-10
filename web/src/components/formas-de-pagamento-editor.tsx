"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import {
  FORMAS_NATIVAS,
  idDaForma,
  type FormaDePagamento,
  type MeioDePagamento,
} from "@/lib/formas-de-pagamento";

/**
 * O dono cadastra as formas que a maquininha DELE cobra.
 *
 * > *"como também posso colocar mais taxa? Porque eu coloquei aqui a taxa de
 * > aproximação. Mas não coloquei a taxa de maquininha quando insere o cartão"*
 *
 * Antes eram quatro campos fixos, e com eles uma das duas taxas de crédito
 * estaria sempre errada — em silêncio, porque a taxa entra no DRE sem passar
 * por tela nenhuma.
 *
 * ## Por que a natureza é obrigatória e não se edita depois
 *
 * Cada forma declara de que MEIO ela é (Pix, dinheiro, débito, crédito). É
 * esse meio que continua indo para `paymentMethod`, e é dele que vivem o fluxo
 * de caixa por origem, o DRE, os estornos e o Action Center. Trocar a natureza
 * de uma forma já usada faria pagamentos passados mudarem de coluna sem que
 * nada tivesse acontecido no mundo — então o campo só aparece na criação.
 *
 * ## Por que as quatro nativas não podem ser excluídas
 *
 * Um pagamento antigo gravou `paymentMethod: "credit"` e nenhuma forma. A taxa
 * dele é resolvida pela primeira forma ativa de crédito; sem nenhuma, viraria
 * zero — o DRE afirmando que a maquininha não cobrou. Desativar é permitido e
 * suficiente: some do balcão e continua explicando o passado.
 */
export function EditorDeFormasDePagamento({
  formas,
  onChange,
}: {
  formas: FormaDePagamento[];
  onChange: (formas: FormaDePagamento[]) => void;
}) {
  const [novoLabel, setNovoLabel] = useState("");
  const [novaBase, setNovaBase] = useState<MeioDePagamento>("credit");
  const [novaTaxa, setNovaTaxa] = useState("");

  const nativos = new Set(FORMAS_NATIVAS.map((f) => f.id));

  function alterar(id: string, campo: Partial<FormaDePagamento>) {
    onChange(formas.map((f) => (f.id === id ? { ...f, ...campo } : f)));
  }

  function adicionar() {
    const label = novoLabel.trim();
    if (!label) return;
    onChange([
      ...formas,
      {
        id: idDaForma(label, formas.map((f) => f.id)),
        label,
        base: novaBase,
        feePct: paraTaxa(novaTaxa),
        active: true,
      },
    ]);
    setNovoLabel("");
    setNovaTaxa("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {formas.map((forma) => {
          const liquido = EXEMPLO - (EXEMPLO * forma.feePct) / 100;
          const nativa = nativos.has(forma.id);
          return (
            <div
              key={forma.id}
              className="grid gap-2 rounded-xl border border-border/70 p-3 md:grid-cols-[1fr_110px_auto_auto] md:items-center md:gap-3"
            >
              <div className="flex flex-col gap-1">
                <input
                  type="text"
                  aria-label={`Nome da forma ${forma.label}`}
                  value={forma.label}
                  maxLength={40}
                  onChange={(e) => alterar(forma.id, { label: e.target.value })}
                  className="min-h-11 rounded-lg border border-transparent bg-transparent px-2 text-sm text-ink hover:border-border focus:border-gold focus:outline-none"
                />
                <span className="px-2 text-xs text-ink-muted">
                  Entra como {NOME_DO_MEIO[forma.base]}
                  {nativa ? "" : " · forma sua"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="number"
                  aria-label={`Taxa de ${forma.label}`}
                  min={0}
                  max={100}
                  step="0.01"
                  value={forma.feePct}
                  onChange={(e) => alterar(forma.id, { feePct: paraTaxa(e.target.value) })}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                />
                <span className="text-sm text-ink-muted">%</span>
              </div>

              <p className="px-2 text-xs text-ink-muted md:text-right">
                {formatBRL(EXEMPLO)} viram{" "}
                <span className="text-ink">{formatBRL(liquido)}</span>
              </p>

              <div className="flex items-center justify-end gap-3">
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={forma.active}
                    onChange={(e) => alterar(forma.id, { active: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-gold"
                  />
                  No balcão
                </label>
                {!nativa && (
                  <button
                    type="button"
                    aria-label={`Excluir ${forma.label}`}
                    onClick={() => onChange(formas.filter((f) => f.id !== forma.id))}
                    className="alvo-toque rounded-lg p-1.5 text-ink-muted transition-colors hover:text-danger"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-3">
        <p className="text-sm font-medium text-ink">Adicionar forma</p>
        <div className="grid gap-2 md:grid-cols-[1fr_140px_110px_auto] md:items-end md:gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-forma" className="text-xs text-ink-muted">
              Como você chama
            </label>
            <input
              id="nova-forma"
              type="text"
              value={novoLabel}
              maxLength={40}
              placeholder="Crédito inserido, Crédito 2–6x…"
              onChange={(e) => setNovoLabel(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink placeholder:text-ink-muted/70"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-base" className="text-xs text-ink-muted">
              Entra como
            </label>
            <select
              id="nova-base"
              value={novaBase}
              onChange={(e) => setNovaBase(e.target.value as MeioDePagamento)}
              className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
            >
              {(Object.keys(NOME_DO_MEIO) as MeioDePagamento[]).map((m) => (
                <option key={m} value={m}>
                  {NOME_DO_MEIO[m]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-taxa" className="text-xs text-ink-muted">
              Taxa (%)
            </label>
            <input
              id="nova-taxa"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={novaTaxa}
              placeholder="0,00"
              onChange={(e) => setNovaTaxa(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
            />
          </div>

          <Button variant="secondary" onClick={adicionar} disabled={!novoLabel.trim()}>
            <Plus size={16} aria-hidden /> Adicionar
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          <strong className="text-ink">Entra como</strong> é o que o relatório vai
          contar: uma forma de crédito soma em cartão no fluxo de caixa, seja qual
          for o nome dela. Não dá para mudar depois — os recebimentos passados
          mudariam de coluna sozinhos.
        </p>
      </div>
    </div>
  );
}

/** Exemplo em cima de um valor redondo — porcentagem sozinha não dá noção. */
const EXEMPLO = 100;

const NOME_DO_MEIO: Record<MeioDePagamento, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
};

/** Vírgula aceita, negativo não, e o teto é 100 — acima disso é digitação. */
function paraTaxa(valor: string): number {
  const n = Number(String(valor).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, 100);
}
