"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { lerPercentual } from "@/lib/reais";
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
  const [erroNova, setErroNova] = useState<string | null>(null);

  const nativos = new Set(FORMAS_NATIVAS.map((f) => f.id));

  function alterar(id: string, campo: Partial<FormaDePagamento>) {
    onChange(formas.map((f) => (f.id === id ? { ...f, ...campo } : f)));
  }

  function adicionar() {
    const label = novoLabel.trim();
    if (!label) return;
    /* Taxa em branco é 0%; ilegível ou acima de 100 NÃO entra como 0% em silêncio. */
    const taxa = novaTaxa.trim() === "" ? 0 : lerPercentual(novaTaxa);
    if (taxa === null) {
      setErroNova("Taxa inválida. Use um percentual de 0 a 100, com até 2 casas (ex.: 3,49).");
      return;
    }
    setErroNova(null);
    onChange([
      ...formas,
      {
        id: idDaForma(label, formas.map((f) => f.id)),
        label,
        base: novaBase,
        feePct: taxa,
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
              className="grid gap-2 rounded-xl border border-border/70 p-3 md:grid-cols-[minmax(0,1fr)_128px_196px_148px] md:items-start md:gap-3"
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

              <div className="flex min-h-11 items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`Taxa de ${forma.label}`}
                  /* Não controlado: o texto só vira número ao sair do campo
                     (digitar "3," não pode ser reescrito a cada tecla). */
                  key={`${forma.id}:${forma.feePct}`}
                  defaultValue={String(forma.feePct).replace(".", ",")}
                  onBlur={(e) => {
                    const taxa = lerPercentual(e.target.value);
                    if (taxa === null) {
                      e.target.value = String(forma.feePct).replace(".", ",");
                      return;
                    }
                    alterar(forma.id, { feePct: taxa });
                  }}
                  className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm tabular-nums text-ink"
                />
                <span className="text-sm text-ink-muted">%</span>
              </div>

              <p className="flex min-h-11 items-center gap-1 px-2 text-xs tabular-nums text-ink-muted md:justify-end md:whitespace-nowrap">
                {formatBRL(EXEMPLO)} viram{" "}
                <span className="text-ink">{formatBRL(liquido)}</span>
              </p>

              <div className="flex min-h-11 items-center justify-end gap-3">
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={forma.active}
                    onChange={(e) => alterar(forma.id, { active: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-gold"
                  />
                  No balcão
                </label>
                {/* As nativas não se excluem, mas guardam o lugar da lixeira:
                    sem isso, as linhas das formas criadas pelo dono andavam
                    para o lado e a coluna ficava torta (02/10). */}
                {nativa ? (
                  <span aria-hidden className="inline-block h-8 w-8" />
                ) : (
                  <button
                    type="button"
                    aria-label={`Excluir ${forma.label}`}
                    onClick={() => onChange(formas.filter((f) => f.id !== forma.id))}
                    className="alvo-toque inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:text-danger"
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
              type="text"
              inputMode="decimal"
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
        {erroNova && (
          <p role="alert" className="text-xs text-danger">
            {erroNova}
          </p>
        )}
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
