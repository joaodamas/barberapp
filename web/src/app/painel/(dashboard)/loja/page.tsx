"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Package, Percent, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL } from "@/lib/format";
import { businessRates, products as initialProducts } from "@/lib/mock-data";

const emptyForm = {
  name: "",
  cost: "",
  profitPct: "30",
  stock: "",
  minStock: "5",
};

export default function LojaPage() {
  const [products, setProducts] = useState(initialProducts);
  const [simPrice, setSimPrice] = useState(45);
  const [simCost, setSimCost] = useState(18);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const lowStock = products.filter((p) => p.stock < p.minStock);

  const simCommission = useMemo(() => {
    const profit = Math.max(simPrice - simCost, 0);
    return (profit * businessRates.commissionRatePct) / 100;
  }, [simPrice, simCost]);

  const preview = useMemo(() => {
    const cost = Number(form.cost) || 0;
    const profitPct = Number(form.profitPct) || 0;
    const price = profitPct < 100 ? cost / (1 - profitPct / 100) : 0;
    const grossProfit = price - cost;
    const commission = (grossProfit * businessRates.commissionRatePct) / 100;
    const tax = (grossProfit * businessRates.taxRatePct) / 100;
    const netProfit = grossProfit - commission - tax;
    return { cost, price, grossProfit, commission, tax, netProfit };
  }, [form.cost, form.profitPct]);

  function openModal() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  function saveProduct() {
    if (!form.name || !form.cost) return;
    setProducts((prev) => [
      ...prev,
      {
        id: `prod_${Date.now()}`,
        name: form.name,
        cost: preview.cost,
        price: Math.round(preview.price * 100) / 100,
        stock: Number(form.stock) || 0,
        minStock: Number(form.minStock) || 0,
      },
    ]);
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Catálogo</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Loja</h1>
        </div>
        <Button onClick={openModal}>
          <Plus size={16} />
          Adicionar produto
        </Button>
      </div>

      {lowStock.length > 0 && (
        <Card className="flex items-start gap-3 border-danger/30 md:p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-ivory md:text-base">
              {lowStock.length} produto(s) abaixo do estoque mínimo
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              {lowStock.map((p) => p.name).join(", ")}
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <Package size={12} /> Produtos
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            {products.map((p) => {
              const belowMin = p.stock < p.minStock;
              const margin = p.price - p.cost;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0 md:pb-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory md:text-base">{p.name}</p>
                    <p className="text-xs text-ivory-muted md:text-sm">
                      Custo {formatBRL(p.cost)} · Venda {formatBRL(p.price)} ·
                      margem {formatBRL(margin)}
                    </p>
                  </div>
                  <Pill tone={belowMin ? "danger" : "neutral"}>
                    {p.stock} un.
                  </Pill>
                </div>
              );
            })}
          </Card>
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <Percent size={12} /> Simulador rápido de comissão
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            <label className="flex flex-col gap-1 text-xs text-ivory-muted md:text-sm">
              Preço de venda
              <input
                type="number"
                value={simPrice}
                onChange={(e) => setSimPrice(Number(e.target.value) || 0)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory md:py-2.5 md:text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ivory-muted md:text-sm">
              Custo do produto
              <input
                type="number"
                value={simCost}
                onChange={(e) => setSimCost(Number(e.target.value) || 0)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory md:py-2.5 md:text-base"
              />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm md:text-base">
              <span className="text-ivory-muted">
                Comissão do profissional ({businessRates.commissionRatePct}% do lucro)
              </span>
              <span className="font-display font-semibold text-gold-light md:text-lg">
                {formatBRL(simCommission)}
              </span>
            </div>
            <p className="text-xs text-ivory-muted md:text-sm">
              Rateio automático sobre o lucro da venda, não sobre o preço
              cheio.
            </p>
          </Card>
        </section>
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <Card className="w-full max-w-xl md:p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ivory">Novo Produto</h2>
              <button
                aria-label="Fechar"
                onClick={() => setModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ivory-muted transition-colors hover:bg-surface-raised hover:text-ivory"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-ivory-muted md:col-span-2">
                Nome do produto *
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Cera modeladora"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Custo unitário (R$) *
                <input
                  type="number"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="0"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Percentual de lucro (%)
                <input
                  type="number"
                  value={form.profitPct}
                  onChange={(e) => setForm((f) => ({ ...f, profitPct: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Estoque inicial (un.)
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Estoque mínimo (un.)
                <input
                  type="number"
                  value={form.minStock}
                  onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-raised/60 p-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-light">
                <Percent size={12} /> Prévia de precificação
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Row label="Custo unitário" value={formatBRL(preview.cost)} />
                <Row label="Preço de venda" value={formatBRL(preview.price)} strong />
                <Row label="Lucro bruto" value={formatBRL(preview.grossProfit)} />
                <Row
                  label={`Comissão (${businessRates.commissionRatePct}%)`}
                  value={`− ${formatBRL(preview.commission)}`}
                  tone="danger"
                />
                <Row
                  label={`Imposto (${businessRates.taxRatePct}%)`}
                  value={`− ${formatBRL(preview.tax)}`}
                  tone="danger"
                />
                <Row label="Lucro líquido" value={formatBRL(preview.netProfit)} tone="success" strong />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveProduct}>Cadastrar produto</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  strong?: boolean;
}) {
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ivory";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ivory-muted">{label}</span>
      <span className={`${strong ? "font-display font-semibold" : "font-medium"} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
