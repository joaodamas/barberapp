"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import type { PaymentMethod } from "@/lib/types";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";

/**
 * G1.5 — a chegada da mercadoria.
 *
 * ## O buraco que isto fecha
 *
 * `kind: "compra"` aparecia em quatro lugares do produto e **os quatro eram
 * leitura**. O estoque inicial vinha do formulário de cadastro e a reposição
 * era o dono editando o número — sem custo, sem data, sem registro.
 *
 * Resultado: `cmv = movimentos.filter(kind === "compra")` somava sobre um
 * conjunto vazio, e o **CMV do DRE era zero estrutural**. O lucro da loja
 * aparecia como o faturamento inteiro, e a comissão de produto saía sobre ele.
 *
 * ## Por que o custo é digitado aqui, e não lido do cadastro
 *
 * Porque é o custo **desta** compra. O cadastro guarda o custo médio do que
 * está na prateleira, e ele passa a ser recalculado a cada entrada — a compra é
 * o fato, o cadastro é a derivada.
 */
export function EntradaDeEstoque({
  produto,
  aoFechar,
}: {
  produto: Doc<ProductDoc> | null;
  aoFechar: () => void;
}) {
  const tenant = useTenant();
  const [quantidade, setQuantidade] = useState("");
  const [custo, setCusto] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const qtd = Number(quantidade);
  const custoUnit = Number(custo.replace(",", "."));
  const valido =
    Number.isInteger(qtd) && qtd > 0 && Number.isFinite(custoUnit) && custoUnit >= 0 && !!custo;
  const total = valido ? Math.round(custoUnit * qtd * 100) / 100 : 0;

  function limpar() {
    setQuantidade("");
    setCusto("");
    setFornecedor("");
    setMetodo(null);
    setErro(null);
    setChave(chaveDeIdempotencia());
  }

  async function confirmar() {
    if (!valido || !produto) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("registrarEntradaDeEstoque", {
        barbershopId: tenant.id,
        productId: produto.id,
        quantity: qtd,
        unitCost: custoUnit,
        paymentMethod: metodo,
        supplier: fornecedor.trim() || null,
        idempotencyKey: chave,
      });
      limpar();
      aoFechar();
    } catch (err) {
      setErro((err as { message?: string })?.message ?? "Não foi possível dar entrada agora.");
    } finally {
      setSalvando(false);
    }
  }

  /* O custo médio que a entrada vai produzir, mostrado ANTES de confirmar.
   *
   * O dono precisa entender por que o custo do cadastro muda — sem isto, ele dá
   * entrada de 10 a R$ 30 e vê o custo virar R$ 24 sem explicação, o que parece
   * defeito. É a mesma conta do servidor; ela aqui só antecipa o resultado. */
  const estoqueAtual = produto?.stock ?? 0;
  const custoAtual = produto?.cost ?? 0;
  const custoDepois =
    valido && estoqueAtual + qtd > 0
      ? Math.round(((estoqueAtual * custoAtual + qtd * custoUnit) / (estoqueAtual + qtd)) * 100) /
        100
      : custoAtual;

  return (
    <Modal
      open={!!produto}
      onClose={() => {
        limpar();
        aoFechar();
      }}
      title="Dar entrada no estoque"
      description={produto?.name}
      footer={
        <div className="flex flex-col gap-2">
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                limpar();
                aoFechar();
              }}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!valido || salvando} className="flex-1">
              {salvando ? "Registrando…" : "Confirmar entrada"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">
              Quantidade
            </span>
            <input
              autoFocus
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ""))}
              placeholder="10"
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">
              Custo por unidade
            </span>
            <input
              inputMode="decimal"
              value={custo}
              onChange={(e) => setCusto(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="18,00"
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">
            Fornecedor <span className="normal-case tracking-normal">(opcional)</span>
          </span>
          <input
            value={fornecedor}
            onChange={(e) => setFornecedor(e.target.value)}
            placeholder="Distribuidora"
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-ink-muted">
            Como você pagou <span className="normal-case tracking-normal">(opcional)</span>
          </span>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={metodo === m}
                onClick={() => setMetodo(metodo === m ? null : m)}
                className={
                  "min-h-11 rounded-xl border text-sm transition-colors " +
                  (metodo === m
                    ? "border-gold bg-gold/10 text-ink"
                    : "border-border text-ink-muted hover:border-gold/60")
                }
              >
                {paymentMethodLabel[m]}
              </button>
            ))}
          </div>
        </div>

        {valido && (
          <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface-raised p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-ink-muted">Total da compra</span>
              <span className="font-display text-lg font-semibold text-ink">
                {formatBRL(total)}
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">
              Estoque: {estoqueAtual} → {estoqueAtual + qtd} un.
            </p>
            {custoDepois !== custoAtual && (
              /* Explica a mudança antes que ela pareça defeito. */
              <p className="text-[11px] text-ink-muted">
                Custo médio: {formatBRL(custoAtual)} → {formatBRL(custoDepois)} — a média
                entre o que já estava na prateleira e esta compra.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
