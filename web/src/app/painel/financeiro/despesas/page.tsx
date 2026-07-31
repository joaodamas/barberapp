"use client";

import { useMemo, useState } from "react";
import { CheckSquare, DollarSign, Pencil, Plus, Repeat, Tag, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR } from "@/lib/format";
import {
  expenseCategories,
  monthExpenses,
  type ExpensePaymentMethod,
} from "@/lib/mock-data";

type Expense = (typeof monthExpenses)[number];

const PAYMENT_METHODS: ExpensePaymentMethod[] = ["Pix", "Boleto", "Cartão", "Transferência"];

const emptyForm = {
  description: "",
  category: expenseCategories[0],
  supplier: "",
  value: "",
  date: "2026-07-31",
  payment: "Pix" as ExpensePaymentMethod,
  recurring: false,
  observations: "",
};

export default function DespesasPage() {
  const [expenses, setExpenses] = useState<Expense[]>(monthExpenses);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const total = expenses.reduce((s, e) => s + e.value, 0);
  const recurringTotal = expenses
    .filter((e) => e.recurring)
    .reduce((s, e) => s + e.value, 0);

  const topCategory = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const e of expenses) {
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.value);
    }
    let best = { category: "—", value: 0 };
    for (const [category, value] of byCategory) {
      if (value > best.value) best = { category, value };
    }
    return best;
  }, [expenses]);

  function openModal() {
    setForm(emptyForm);
    setModalOpen(true);
  }

  function saveExpense() {
    const value = Number(form.value);
    if (!form.description || !value) return;
    setExpenses((prev) => [
      {
        id: `exp_${Date.now()}`,
        category: form.category,
        description: form.description,
        supplier: form.supplier || "—",
        value,
        date: form.date,
        payment: form.payment,
        recurring: form.recurring,
      },
      ...prev,
    ]);
    setModalOpen(false);
  }

  function removeExpense(id: string) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">
            {expenses.length} lançamento(s) cadastrado(s)
          </p>
          <h1 className="text-xl text-ivory md:text-3xl md:tracking-tight">Despesas</h1>
        </div>
        <Button onClick={openModal}>
          <Plus size={16} />
          Nova Despesa
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <CheckSquare size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Lançamentos</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{expenses.length}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">no mês atual</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-danger" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Total no mês</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(total)}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">julho de 2026</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Repeat size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Recorrentes</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(recurringTotal)}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">por mês</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Tag size={12} className="text-gold-light" />
            <p className="text-[10px] uppercase tracking-wide text-ivory-muted md:text-xs">Maior categoria</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-xl">{topCategory.category}</p>
          <p className="text-[10px] text-ivory-muted md:text-xs">{formatBRL(topCategory.value)} no mês</p>
        </Card>
      </div>

      <Card className="overflow-x-auto p-0 md:p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
              <th className="px-4 py-3 font-medium md:px-6">Data</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 font-medium">Categoria</th>
              <th className="px-4 py-3 font-medium">Pagamento</th>
              <th className="px-4 py-3 text-right font-medium">Valor</th>
              <th className="px-4 py-3 md:px-6" />
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr
                key={e.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-3 text-ivory-muted md:px-6">
                  {formatDatePtBR(e.date).split(",")[0]}
                </td>
                <td className="px-4 py-3 text-ivory">
                  {e.description}
                  {e.recurring && (
                    <Pill tone="gold" className="ml-2">
                      <Repeat size={10} /> mensal
                    </Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-ivory-muted">{e.supplier}</td>
                <td className="px-4 py-3 text-gold-light">{e.category}</td>
                <td className="px-4 py-3 text-ivory-muted">{e.payment}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ivory">
                  {formatBRL(e.value)}
                </td>
                <td className="px-4 py-3 md:px-6">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      aria-label="Editar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-ivory-muted/70 transition-colors hover:bg-surface-raised hover:text-ivory"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Excluir"
                      onClick={() => removeExpense(e.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-ivory-muted/70 transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <Card
            className="w-full max-w-xl md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ivory">Nova Despesa</h2>
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
                Descrição *
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Ex: Aluguel do salão, conta de energia"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Categoria *
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                >
                  {expenseCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Fornecedor / Beneficiário
                <input
                  value={form.supplier}
                  onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                  placeholder="Ex: Imobiliária, concessionária"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Valor (R$) *
                <input
                  type="number"
                  value={form.value}
                  onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                  placeholder="0"
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Data
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Forma de pagamento
                <select
                  value={form.payment}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, payment: e.target.value as ExpensePaymentMethod }))
                  }
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-ivory md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.recurring}
                  onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-gold"
                />
                Recorrente (repete todo mês)
              </label>

              <label className="flex flex-col gap-1 text-xs text-ivory-muted md:col-span-2">
                Observações
                <textarea
                  value={form.observations}
                  onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
                  placeholder="Notas internas sobre este lançamento (opcional)"
                  rows={2}
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={saveExpense}>Salvar</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
