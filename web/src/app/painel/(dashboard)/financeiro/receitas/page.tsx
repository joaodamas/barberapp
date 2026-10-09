"use client";

import { useMemo, useState } from "react";
import { DollarSign, Pencil, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { Voltar } from "@/components/ui/voltar";
import { BloqueioPlano } from "@/components/ui/bloqueio-plano";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { ParcelamentoCampos, rotuloDoValor, type ModoDoValor, type TipoDeLancamento } from "@/components/parcelamento-campos";
import { GrupoDeParcelas } from "@/components/grupo-de-parcelas";
import { formatBRL, formatDateShortPtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { NAO_APURADO } from "@/lib/apuracao";
import { mesPeriodo } from "@/lib/analytics";
import { dentroDoPeriodo } from "@/lib/analytics-periodo";
import { mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
import { expensePaymentMethods, incomeCategories, type ExpensePaymentMethod } from "@/lib/business-rules";
import type { OtherIncomeDoc } from "@/lib/domain";
import { useAcesso, useTenant } from "@/lib/tenant-context";
import { useShopCollection } from "@/lib/db/use-collection";
import { gravarEmLote, gravarNovo, novoIdDe, patchDoc, removeDoc } from "@/lib/db/repository";
import { esperarServidorOuSeguir } from "@/lib/db/sem-esperar-servidor";
import { lerReais, reaisParaCampo, VALOR_ILEGIVEL } from "@/lib/reais";
import {
  aVencer,
  descricaoDaParcela,
  idDaParcela,
  parcelasValidas,
  planejarParcelas,
  PARCELAS_MAX,
  PARCELAS_MIN,
  parcelasComCentavo,
} from "@/lib/parcelamento";

type Receita = OtherIncomeDoc & { id: string };

const CAMPO = "rounded-controle border border-border bg-surface-raised px-3 py-2 text-sm text-ink";

const formVazio = {
  description: "",
  category: incomeCategories[0],
  payer: "",
  value: "",
  date: hoje(),
  payment: "Pix" as ExpensePaymentMethod,
  tipo: "unica" as TipoDeLancamento,
  parcelas: "3",
  modo: "total" as ModoDoValor,
  observations: "",
};

/**
 * Outras receitas — dinheiro que entra e não é atendimento, venda de produto
 * nem mensalidade: venda de equipamento, aluguel de cadeira, parceria.
 *
 * Mesmo desenho da tela de Despesas, e a mesma dívida (D24): o dono grava
 * direto, sem congelamento. Entra no resultado do mês na linha "Outras
 * receitas", FORA da receita bruta (ver `docs/CONTRATO-DO-DRE.md`).
 */
export default function ReceitasPage() {
  const { id: barbershopId } = useTenant();
  const { items, status, error } = useShopCollection<OtherIncomeDoc>("otherIncomes", {
    orderByField: "date",
    direction: "desc",
  });
  const naoApurado = status === "erro";

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(formVazio);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Receita | null>(null);
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /* Mantido entre tentativas: salvar de novo sobrescreve o mesmo grupo. */
  const [idDoRascunho, setIdDoRascunho] = useState<string | null>(null);
  const [assinaturaDoRascunho, setAssinaturaDoRascunho] = useState<string | null>(null);
  const [sincronia, setSincronia] = useState<{ tipo: "pendente" | "recusada"; texto: string } | null>(null);

  const mes = mesAtual();
  const hojeISO = hoje();
  const doMes = useMemo(
    () => items.filter((i) => dentroDoPeriodo(i.date, mesPeriodo(mes))),
    [items, mes]
  );
  const total = doMes.reduce((s, i) => s + (Number(i.value) || 0), 0);

  const acesso = useAcesso();
  if (!acesso.features.advancedFinance) {
    return (
      <BloqueioPlano
        titulo="Outras receitas"
        descricao="Lance venda de equipamento, aluguel de cadeira e parcerias — inclusive parceladas — e veja no resultado do mês."
      />
    );
  }

  function abrirNova() {
    setEditingId(null);
    setIdDoRascunho(null);
    setForm({ ...formVazio, date: hoje() });
    setFormError(null);
    setModalOpen(true);
  }

  function abrirEdicao(r: Receita) {
    setEditingId(r.id);
    setForm({
      description: r.description,
      category: r.category,
      payer: r.payer === "—" ? "" : r.payer,
      value: reaisParaCampo(r.value),
      date: r.date,
      payment: r.payment,
      tipo: r.parcela ? "parcelada" : "unica",
      parcelas: String(r.parcela?.total ?? 3),
      modo: "total",
      observations: r.observations ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function salvar() {
    const value = lerReais(form.value);
    if (!form.description.trim()) return setFormError("Informe a descrição do lançamento.");
    if (value === null && form.value.trim() !== "") return setFormError(VALOR_ILEGIVEL);
    if (value === null || value <= 0) return setFormError("Informe um valor maior que zero.");
    if (!form.date) return setFormError("Informe a data.");
    const parcelado = !editingId && form.tipo === "parcelada";
    const n = Number(form.parcelas);
    if (parcelado && !parcelasValidas(n)) {
      return setFormError(`O número de parcelas vai de ${PARCELAS_MIN} a ${PARCELAS_MAX}.`);
    }
    const plano = parcelado
      ? planejarParcelas({ modo: form.modo, valor: value, n, primeira: form.date })
      : null;
    if (plano && !parcelasComCentavo(plano)) {
      return setFormError("Cada parcela precisa ser de pelo menos R$ 0,01. Aumente o valor ou diminua as parcelas.");
    }
    setFormError(null);
    /* Tipo ou nº de parcelas diferente da tentativa anterior = outro lançamento. */
    const assinatura = `${form.tipo}:${parcelado ? n : 0}`;
    const rascunho = idDoRascunho !== null && assinatura === assinaturaDoRascunho ? idDoRascunho : null;

    const campos = {
      category: form.category,
      description: form.description.trim(),
      payer: form.payer.trim() || "—",
      value,
      date: form.date,
      payment: form.payment,
      observations: form.observations.trim() || undefined,
    };

    setSaving(true);
    try {
      let noServidor: Promise<unknown>;
      if (plano) {
        const grupoId = rascunho ?? (await novoIdDe(barbershopId, "otherIncomes"));
        setIdDoRascunho(grupoId);
        setAssinaturaDoRascunho(assinatura);
        noServidor = (
          await gravarEmLote(
            barbershopId,
            "otherIncomes",
            plano.valores.map((v, i) => ({
              tipo: "gravar" as const,
              id: idDaParcela(grupoId, i + 1),
              dados: {
                ...campos,
                value: v,
                date: plano.datas[i],
                description: descricaoDaParcela(campos.description, i + 1, n),
                parcela: { numero: i + 1, total: n, grupoId },
              },
            }))
          )
        ).noServidor;
      } else if (editingId) {
        noServidor = patchDoc(barbershopId, "otherIncomes", editingId, campos);
      } else {
        const id = rascunho ?? (await novoIdDe(barbershopId, "otherIncomes"));
        setIdDoRascunho(id);
        setAssinaturaDoRascunho(assinatura);
        noServidor = (await gravarNovo(barbershopId, "otherIncomes", id, campos)).noServidor;
      }
      const situacao = await esperarServidorOuSeguir(noServidor);
      setModalOpen(false);
      if (situacao === "pendente") {
        const descricao = campos.description;
        setSincronia({
          tipo: "pendente",
          texto: `"${descricao}" está guardada neste aparelho e vai sincronizar quando a conexão voltar.`,
        });
        noServidor.then(
          () => setSincronia((atual) => (atual?.tipo === "pendente" ? null : atual)),
          (e) => {
            console.error("[receitas] servidor recusou depois", e);
            setSincronia({
              tipo: "recusada",
              texto: `"${descricao}" não foi aceita pelo servidor e não foi salva. Lance de novo.`,
            });
          }
        );
      } else {
        setSincronia(null);
      }
    } catch (e) {
      console.error("[receitas] falha ao salvar", e);
      setFormError("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  async function excluir() {
    if (!pendingDelete) return;
    try {
      await removeDoc(barbershopId, "otherIncomes", pendingDelete.id);
    } catch (e) {
      console.error("[receitas] falha ao excluir", e);
    } finally {
      setPendingDelete(null);
    }
  }

  const parcelaEmEdicao = editingId ? (items.find((i) => i.id === editingId)?.parcela ?? null) : null;

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <Voltar />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted md:text-base">
            {naoApurado
              ? `Receitas de ${rotuloDoMes(mes)} não apuradas`
              : `${contar(doMes.length, "lançamento", "lançamentos")} em ${rotuloDoMes(mes)}`}
          </p>
          <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink md:text-[28px]">
            Outras receitas
          </h1>
          <p className="mt-1 text-xs text-ink-muted md:text-sm">
            Venda de equipamento, aluguel de cadeira, parcerias. Atendimento, venda de produto e
            mensalidade já entram sozinhos — não lance aqui.
          </p>
        </div>
        <Button onClick={abrirNova}>
          <Plus size={16} />
          Nova receita
        </Button>
      </div>

      {sincronia && (
        <Card
          role={sincronia.tipo === "recusada" ? "alert" : "status"}
          className={
            "flex items-start justify-between gap-3 p-3 text-sm md:p-4 " +
            (sincronia.tipo === "recusada" ? "border-danger/50 text-danger" : "border-gold/50 text-ink")
          }
        >
          <p>{sincronia.texto}</p>
          <button type="button" onClick={() => setSincronia(null)} className="shrink-0 text-xs text-ink-muted underline">
            Fechar
          </button>
        </Card>
      )}

      <Card className="flex flex-col gap-1 p-3 md:p-5">
        <div className="flex items-center gap-1.5">
          <DollarSign size={12} className="text-success" />
          <p className="text-[12.5px] font-medium text-ink-muted">Recebido e a receber em {rotuloDoMes(mes)}</p>
        </div>
        <p className="font-display text-lg font-semibold text-ink md:text-2xl">
          {naoApurado ? NAO_APURADO : formatBRL(total)}
        </p>
        <p className="text-[11px] text-ink-muted md:text-xs">
          Cada parcela conta no mês do seu vencimento.
        </p>
      </Card>

      <div className="flex flex-col gap-2">
        {status === "carregando" && <div className="h-16 animate-pulse rounded-superficie bg-surface-raised" />}
        {naoApurado && <ErroAoCarregar oQue="as receitas avulsas" erro={error} />}
        {status === "pronto" && doMes.length === 0 && (
          <Card className="p-4 text-center text-sm text-ink-muted">
            Nenhuma receita avulsa em {rotuloDoMes(mes)}. Use &quot;Nova receita&quot; para registrar
            uma venda de equipamento, um aluguel de cadeira ou uma parceria.
          </Card>
        )}
        {doMes.map((r) => (
          <Card key={r.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {r.description}
                {r.parcela && aVencer(r.date, hojeISO) && (
                  <Pill tone="gold" className="ml-2">a vencer</Pill>
                )}
                {r.parcela && (
                  <button
                    type="button"
                    onClick={() => setGrupoAberto(r.parcela!.grupoId)}
                    className="ml-2 min-h-11 text-xs text-gold-strong underline underline-offset-2 md:min-h-0"
                  >
                    ver parcelas
                  </button>
                )}
              </p>
              <p className="text-xs text-ink-muted">
                {formatDateShortPtBR(r.date)} · <span className="text-gold-strong">{r.category}</span> · {r.payment}
                {r.payer && r.payer !== "—" ? ` · ${r.payer}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="whitespace-nowrap text-sm font-medium text-ink">{formatBRL(r.value)}</span>
              <div className="flex items-center">
                <button
                  aria-label="Editar"
                  onClick={() => abrirEdicao(r)}
                  className="flex h-11 w-11 items-center justify-center rounded-controle text-ink-muted/70 transition-colors hover:bg-surface-raised hover:text-ink md:h-8 md:w-8"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label="Excluir"
                  onClick={() => setPendingDelete(r)}
                  className="flex h-11 w-11 items-center justify-center rounded-controle text-ink-muted/70 transition-colors hover:bg-danger/10 hover:text-danger md:h-8 md:w-8"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Editar receita" : "Nova receita"}
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ParcelamentoCampos
            tipo={form.tipo}
            onTipo={(tipo) => setForm((f) => ({ ...f, tipo }))}
            permiteRecorrente={false}
            permiteParcelada={!editingId}
            parcelaExistente={parcelaEmEdicao}
            parcelas={form.parcelas}
            onParcelas={(parcelas) => setForm((f) => ({ ...f, parcelas }))}
            modo={form.modo}
            onModo={(modo) => setForm((f) => ({ ...f, modo }))}
            valor={lerReais(form.value)}
            primeira={form.date}
          />

          <label className="flex flex-col gap-1 text-xs text-ink-muted md:col-span-2">
            Descrição *
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Venda da cadeira antiga, aluguel da cadeira 3"
              className={CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Categoria *
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={CAMPO}
            >
              {incomeCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Quem pagou
            <input
              value={form.payer}
              onChange={(e) => setForm((f) => ({ ...f, payer: e.target.value }))}
              placeholder="Ex: nome do comprador ou do parceiro"
              className={CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            {rotuloDoValor(form.tipo, form.modo, Boolean(parcelaEmEdicao))}
            <input
              type="text"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="0"
              className={CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            {parcelaEmEdicao ? "Data desta parcela" : form.tipo === "parcelada" ? "Data da primeira parcela" : "Data"}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className={CAMPO}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Forma de recebimento
            <select
              value={form.payment}
              onChange={(e) => setForm((f) => ({ ...f, payment: e.target.value as ExpensePaymentMethod }))}
              className={CAMPO}
            >
              {expensePaymentMethods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-muted md:col-span-2">
            Observações
            <textarea
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              rows={2}
              className={CAMPO}
            />
          </label>
          {formError && (
            <p role="alert" className="text-xs text-danger md:col-span-2">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      <GrupoDeParcelas
        grupoId={grupoAberto}
        onClose={() => setGrupoAberto(null)}
        barbershopId={barbershopId}
        colecao="otherIncomes"
        itens={items}
        categorias={incomeCategories}
        hoje={hojeISO}
        substantivo="receita"
        onAviso={setSincronia}
      />

      <Modal
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Excluir receita"
        description={pendingDelete?.description}
        className="max-w-md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Manter
            </Button>
            <Button className="bg-danger text-white hover:bg-danger/90" onClick={excluir}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          {pendingDelete
            ? `${formatBRL(pendingDelete.value)} · ${pendingDelete.category} · ${formatDateShortPtBR(pendingDelete.date)}`
            : ""}
          . Esta ação não pode ser desfeita e altera o resultado do mês.
          {pendingDelete?.parcela &&
            ` É a parcela ${pendingDelete.parcela.numero}/${pendingDelete.parcela.total}: só ela será excluída. Para excluir as próximas ou todas, use "ver parcelas".`}
        </p>
      </Modal>
    </div>
  );
}

function hoje() {
  return toISODate(new Date());
}
