"use client";

import { useMemo, useState } from "react";
import { CheckSquare, DollarSign, Pencil, Plus, Repeat, Tag, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatDateShortPtBR } from "@/lib/format";
import {
  expenseCategories,
  expensePaymentMethods,
  type ExpensePaymentMethod,
} from "@/lib/business-rules";
import type { ExpenseDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

type Expense = Doc<ExpenseDoc>;
import { useTenant } from "@/lib/tenant-context";
import { useShopCollection } from "@/lib/db/use-collection";
import { createDoc, patchDoc, removeDoc } from "@/lib/db/repository";

const PAYMENT_METHODS = expensePaymentMethods;

const emptyForm = {
  description: "",
  category: expenseCategories[0],
  supplier: "",
  value: "",
  date: todayISO(),
  payment: "Pix" as ExpensePaymentMethod,
  recurring: false,
  observations: "",
};

export default function DespesasPage() {
  const { id: barbershopId } = useTenant();

  /* Tempo real: o painel costuma ficar aberto o expediente inteiro num tablet,
   * e um lançamento feito no celular precisa aparecer aqui sem recarregar. */
  const { items: expenses, status } = useShopCollection<Omit<Expense, "id">>("expenses", {
    orderByField: "date",
    direction: "desc",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  /** Exclusão pedia confirmação em Reservas mas apagava lançamento num clique. */
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  // A ordenação vem do Firestore (`orderBy date desc`); o sort local existia
  // porque a lista era um array fixo fora de ordem.
  const sorted = expenses;
  const [saving, setSaving] = useState(false);

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
    setEditingId(null);
    setForm({ ...emptyForm, date: todayISO() });
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(expense: Expense) {
    setEditingId(expense.id);
    setForm({
      description: expense.description,
      category: expense.category,
      supplier: expense.supplier === "—" ? "" : expense.supplier,
      value: String(expense.value),
      date: expense.date,
      payment: expense.payment,
      recurring: expense.recurring,
      observations: expense.observations ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function saveExpense() {
    const value = Number(form.value);

    /* Antes o clique simplesmente não fazia nada: sem mensagem, com o botão
     * habilitado. E valor negativo passava. */
    if (!form.description.trim()) {
      setFormError("Informe a descrição do lançamento.");
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      setFormError("Informe um valor maior que zero.");
      return;
    }
    setFormError(null);

    const fields = {
      category: form.category,
      description: form.description.trim(),
      supplier: form.supplier.trim() || "—",
      value,
      date: form.date,
      payment: form.payment,
      recurring: form.recurring,
      // O textarea era preenchido e o valor descartado no salvamento.
      observations: form.observations.trim() || undefined,
    };

    setSaving(true);
    try {
      if (editingId) {
        await patchDoc(barbershopId, "expenses", editingId, fields);
      } else {
        await createDoc(barbershopId, "expenses", fields);
      }
      setModalOpen(false);
    } catch (error) {
      console.error("[despesas] falha ao salvar", error);
      setFormError("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (!pendingDelete) return;
    try {
      await removeDoc(barbershopId, "expenses", pendingDelete.id);
    } catch (error) {
      console.error("[despesas] falha ao excluir", error);
    } finally {
      setPendingDelete(null);
    }
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
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">Lançamentos</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{expenses.length}</p>
          <p className="text-[11px] text-ivory-muted md:text-xs">no mês atual</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-danger" />
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">Total no mês</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(total)}</p>
          <p className="text-[11px] text-ivory-muted md:text-xs">julho de 2026</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Repeat size={12} className="text-gold-light" />
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">Recorrentes</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">{formatBRL(recurringTotal)}</p>
          <p className="text-[11px] text-ivory-muted md:text-xs">por mês</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Tag size={12} className="text-gold-light" />
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">Maior categoria</p>
          </div>
          <p className="font-display text-lg font-semibold text-ivory md:text-xl">{topCategory.category}</p>
          <p className="text-[11px] text-ivory-muted md:text-xs">{formatBRL(topCategory.value)} no mês</p>
        </Card>
      </div>

      <Card className="table-scroll overflow-x-auto p-0">
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
            {status === "carregando" && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ivory-muted md:px-6">
                  <span className="inline-block h-4 w-40 animate-pulse rounded bg-surface-raised" />
                </td>
              </tr>
            )}
            {status === "erro" && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-danger md:px-6">
                  Não foi possível carregar os lançamentos.
                </td>
              </tr>
            )}
            {status === "pronto" && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ivory-muted md:px-6">
                  Nenhuma despesa lançada ainda.
                </td>
              </tr>
            )}
            {sorted.map((e) => (
              <tr
                key={e.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-3 text-ivory-muted md:px-6">
                  {formatDateShortPtBR(e.date)}
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
                      onClick={() => openEditModal(e)}
                      className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg text-ivory-muted/70 transition-colors hover:bg-surface-raised hover:text-ivory"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Excluir"
                      onClick={() => setPendingDelete(e)}
                      className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg text-ivory-muted/70 transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border">
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-ivory-muted md:px-6" colSpan={5}>
                Total do mês
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right font-display font-semibold text-ivory">
                {formatBRL(total)}
              </td>
              <td className="md:px-6" />
            </tr>
          </tfoot>
        </table>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Editar Despesa" : "Nova Despesa"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveExpense} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
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
              min={0}
              step="0.01"
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
            Recorrente (repete todo mês — entra como custo fixo no DRE)
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

          {formError && (
            <p role="alert" className="text-xs text-danger md:col-span-2">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Excluir lançamento"
        description={pendingDelete?.description}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Manter
            </Button>
            <Button
              className="bg-danger text-white hover:bg-danger/90"
              onClick={confirmRemove}
            >
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ivory-muted">
          {pendingDelete
            ? `${formatBRL(pendingDelete.value)} · ${pendingDelete.category} · ${formatDateShortPtBR(pendingDelete.date)}`
            : ""}
          . Esta ação não pode ser desfeita e altera o resultado do mês.
        </p>
      </Modal>

    </div>
  );
}

/** Data de hoje em ISO. O formulário abria fixo em 2026-07-31. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
