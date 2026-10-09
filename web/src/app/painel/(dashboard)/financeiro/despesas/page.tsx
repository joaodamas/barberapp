"use client";

import { useMemo, useState } from "react";
import { CheckSquare, DollarSign, Pencil, Plus, Repeat, Tag, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatDateShortPtBR } from "@/lib/format";
import { contar } from "@/lib/plural";
import { NAO_APURADO } from "@/lib/apuracao";
import { ErroAoCarregar, LinhaDeErro } from "@/components/ui/erro-ao-carregar";
import { mesPeriodo, recorrentesRepetidasPorCategoria, resumoDeDespesas } from "@/lib/analytics";
import { mesAtual, rotuloDoMes } from "@/lib/db/use-financeiro";
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
import { gravarNovo, novoIdDe, patchDoc, removeDoc } from "@/lib/db/repository";
import { esperarServidorOuSeguir } from "@/lib/db/sem-esperar-servidor";
import { lerReais, reaisParaCampo, VALOR_ILEGIVEL } from "@/lib/reais";
import { Voltar } from "@/components/ui/voltar";
import { BloqueioPlano } from "@/components/ui/bloqueio-plano";
import { useAcesso } from "@/lib/tenant-context";

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
  const { items: expenses, status, error } = useShopCollection<Omit<Expense, "id">>("expenses", {
    orderByField: "date",
    direction: "desc",
  });

  /* D3 · sem leitura não há agregado.
   *
   * A tela mostrava, AO REDOR da mensagem de erro: cabeçalho "0 lançamentos",
   * KPIs `0`, `R$ 0,00`, `R$ 0,00`, `—` e rodapé `TOTAL DO MÊS R$ 0,00`. O
   * teste decisivo é que o estado vazio e o estado de erro produziam os
   * QUATRO números idênticos — nenhum deles distinguia "não há despesa" de
   * "não consegui ler as despesas", que são as duas conclusões opostas que o
   * dono pode tirar desta tela.
   *
   * O D27 tinha acrescentado a mensagem ao corpo da tabela e parado aí. Ela
   * ficou cercada pelos agregados, que continuaram afirmando zero em corpo
   * maior — foi a correção reforçando o defeito, porque quem lê "0 lançamentos"
   * no cabeçalho não procura explicação dentro da tabela. */
  const naoApurado = status === "erro";

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  /** Exclusão pedia confirmação em Reservas mas apagava lançamento num clique. */
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  const [saving, setSaving] = useState(false);
  /* Id da despesa nova, escolhido na primeira tentativa e mantido nas
   * seguintes: salvar duas vezes (rede lenta, offline) sobrescreve o mesmo
   * lançamento em vez de criar outro. Zera ao abrir o diálogo de novo. */
  const [idDoRascunho, setIdDoRascunho] = useState<string | null>(null);
  /* O que a tela diz depois que o diálogo fecha sem o servidor ter
   * confirmado. "Salvo" seria mentira; silêncio esconderia uma gravação que
   * ainda pode ser recusada. */
  const [sincronia, setSincronia] = useState<
    { tipo: "pendente" | "recusada"; texto: string } | null
  >(null);

  /* Os KPIs diziam "no mês" e somavam o HISTÓRICO INTEIRO — o erro crescia a
   * cada mês de uso, e no terceiro mostrava o triplo do que o dono gastou. Um
   * dos rótulos trazia "julho de 2026" cravado no código.
   *
   * O recorte agora é o mês exibido, e o rótulo diz qual é. */
  const mes = mesAtual();
  const resumo = useMemo(() => resumoDeDespesas(expenses, mesPeriodo(mes)), [expenses, mes]);
  /* Recorrente "repete todo mês" sozinha. Duas vigentes na mesma categoria
   * pode ser luz + água — ou o aluguel relançado, somando em dobro no custo
   * fixo. A tela não adivinha: avisa (08/10). */
  const repetidas = useMemo(
    () => recorrentesRepetidasPorCategoria(expenses, mesPeriodo(mes).fim),
    [expenses, mes]
  );
  const total = resumo.total;
  const recurringTotal = resumo.recorrentes;
  const topCategory = { category: resumo.maiorCategoria.categoria, value: resumo.maiorCategoria.valor };

  // A ordenação vem do Firestore (`orderBy date desc`); a lista já vem recortada
  // pelo mês, para a tabela não repetir o filtro dos KPIs.
  const sorted = resumo.itens;

  function openModal() {
    setEditingId(null);
    setIdDoRascunho(null);
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
      value: reaisParaCampo(expense.value),
      date: expense.date,
      payment: expense.payment,
      recurring: expense.recurring,
      observations: expense.observations ?? "",
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function saveExpense() {
    /* `Number("1.500")` é 1,5: o aluguel de R$ 1.500 entrava como R$ 1,50. */
    const value = lerReais(form.value);

    /* Antes o clique simplesmente não fazia nada: sem mensagem, com o botão
     * habilitado. E valor negativo passava. */
    if (!form.description.trim()) {
      setFormError("Informe a descrição do lançamento.");
      return;
    }
    if (value === null && form.value.trim() !== "") {
      setFormError(VALOR_ILEGIVEL);
      return;
    }
    if (value === null || value <= 0) {
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
      let noServidor: Promise<unknown>;
      if (editingId) {
        noServidor = patchDoc(barbershopId, "expenses", editingId, fields);
      } else {
        const id = idDoRascunho ?? (await novoIdDe(barbershopId, "expenses"));
        setIdDoRascunho(id);
        noServidor = (await gravarNovo(barbershopId, "expenses", id, fields)).noServidor;
      }
      /* Offline, o servidor não responde nunca — e esperar por ele deixava o
       * diálogo preso em "Salvando…". A gravação já está guardada neste
       * aparelho; fecha e diz que falta sincronizar. */
      const situacao = await esperarServidorOuSeguir(noServidor);
      setModalOpen(false);
      if (situacao === "pendente") {
        const descricao = fields.description;
        setSincronia({
          tipo: "pendente",
          texto: `"${descricao}" está guardada neste aparelho e vai sincronizar quando a conexão voltar.`,
        });
        noServidor.then(
          () => setSincronia((atual) => (atual?.tipo === "pendente" ? null : atual)),
          (error) => {
            console.error("[despesas] servidor recusou depois", error);
            setSincronia({
              tipo: "recusada",
              texto: `"${descricao}" não foi aceita pelo servidor e não foi salva. Lance de novo.`,
            });
          }
        );
      } else {
        setSincronia(null);
      }
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

  /* O financeiro avançado é o que separa o plano Gestão dos outros.
   * A saída fica DEPOIS dos hooks: React não aceita hook condicional, e
   * a tela precisa dos mesmos dados para o caso liberado. */
  const acesso = useAcesso();
  if (!acesso.features.advancedFinance) {
    /* Dizia "Controle de despesas". O menu, o `h1` e o atalho do Resumo dizem
       "Despesas": quem tem o plano vê um nome e quem não tem vê outro — e é
       justamente quem não tem que está tentando descobrir o que é a tela. */
    return <BloqueioPlano titulo="Despesas" descricao="Lance aluguel, luz, produtos e pró-labore uma vez e veja o lucro de verdade nas outras telas." />;
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <Voltar />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted md:text-base">
            {naoApurado
              ? `Lançamentos de ${rotuloDoMes(mes)} não apurados`
              : `${contar(resumo.lancamentos, "lançamento", "lançamentos")} em ${rotuloDoMes(mes)}`}
          </p>
          <h1 className="text-xl text-ink md:text-3xl md:tracking-tight">Despesas</h1>
        </div>
        {/* Caixa alta no meio da frase é convenção de inglês. O resto do painel
            escreve "Marcar atendimento", "Adicionar produto", "Lançar
            despesas" — este botão e o título do diálogo eram a exceção. */}
        <Button onClick={openModal}>
          <Plus size={16} />
          Nova despesa
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
          <button
            type="button"
            onClick={() => setSincronia(null)}
            className="shrink-0 text-xs text-ink-muted underline"
          >
            Fechar
          </button>
        </Card>
      )}

      {/* Com a leitura falhando, os quatro cartões dizem que não sabem — e a
          legenda de cada um diz por quê. É a diferença que a tela não tinha:
          "R$ 0,00 em agosto" e "não consegui ler agosto" ocupavam os mesmos
          pixels. */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <CheckSquare size={12} className="text-gold-strong" />
            <p className="text-[11px] uppercase tracking-wide text-ink-muted md:text-xs">Lançamentos</p>
          </div>
          <p className="font-display text-lg font-semibold text-ink md:text-2xl">
            {naoApurado ? NAO_APURADO : resumo.lancamentos}
          </p>
          {/* A legenda continua sendo o RECORTE — "em Agosto de 2026" é
              verdade com ou sem leitura. O motivo aparece uma vez só, na linha
              da tabela: repeti-lo nos quatro cartões transformaria a
              explicação em ruído e empurraria a tabela para fora da tela. */}
          <p className="text-[11px] text-ink-muted md:text-xs">em {rotuloDoMes(mes)}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <DollarSign size={12} className="text-danger" />
            <p className="text-[11px] uppercase tracking-wide text-ink-muted md:text-xs">Total no mês</p>
          </div>
          <p className="font-display text-lg font-semibold text-ink md:text-2xl">
            {naoApurado ? NAO_APURADO : formatBRL(total)}
          </p>
          <p className="text-[11px] text-ink-muted md:text-xs">{rotuloDoMes(mes)}</p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Repeat size={12} className="text-gold-strong" />
            <p className="text-[11px] uppercase tracking-wide text-ink-muted md:text-xs">Recorrentes</p>
          </div>
          <p className="font-display text-lg font-semibold text-ink md:text-2xl">
            {naoApurado ? NAO_APURADO : formatBRL(recurringTotal)}
          </p>
          <p className="text-[11px] text-ink-muted md:text-xs">
            {naoApurado ? `em ${rotuloDoMes(mes)}` : "por mês"}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:gap-1.5 md:p-5">
          <div className="flex items-center gap-1.5">
            <Tag size={12} className="text-gold-strong" />
            <p className="text-[11px] uppercase tracking-wide text-ink-muted md:text-xs">Maior categoria</p>
          </div>
          {/* O `—` deste cartão era o mais enganoso dos quatro: ele já é o
              placeholder de "não houve categoria", então erro e vazio ficavam
              literalmente indistinguíveis, sem nem a diferença entre 0 e nada. */}
          <p className="font-display text-lg font-semibold text-ink md:text-xl">
            {naoApurado ? NAO_APURADO : topCategory.category}
          </p>
          <p className="text-[11px] text-ink-muted md:text-xs">
            {naoApurado
              ? `em ${rotuloDoMes(mes)}`
              : `${formatBRL(topCategory.value)} em ${rotuloDoMes(mes)}`}
          </p>
        </Card>
      </div>

      {!naoApurado && repetidas.length > 0 && (
        <Card role="status" className="flex flex-col gap-1 border-gold/50 bg-gold/5">
          {repetidas.map((g) => (
            <div key={g.categoria} className="flex flex-col gap-1">
              <p className="text-sm text-ink">
                <strong>{g.categoria}</strong>: {contar(g.itens.length, "recorrente", "recorrentes")} valendo
                em {rotuloDoMes(mes)}
              </p>
              {/* A recorrente antiga foi lançada em outro mês e não está na
                  tabela abaixo: o botão é o caminho até ela. */}
              {g.itens.map((e) => (
                <p key={e.id} className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  {e.description} · {formatBRL(e.value)} · desde {formatDateShortPtBR(e.date)}
                  <button
                    type="button"
                    onClick={() => openEditModal(e)}
                    className="cursor-pointer text-gold-strong underline underline-offset-2"
                  >
                    Editar
                  </button>
                </p>
              ))}
            </div>
          ))}
          <p className="text-xs text-ink-muted">
            Recorrente se repete sozinha todo mês, a partir da data do lançamento. Se uma delas
            foi relançada, desmarque o &quot;recorrente&quot; dela — senão o custo fixo soma as
            duas. Se são contas diferentes (luz e água, por exemplo), está certo.
          </p>
        </Card>
      )}

      {/* Recorrente lançada em mês anterior vale neste mês (é o que o cartão
          "Recorrentes" e o custo fixo do DRE contam) mas não está na tabela,
          que lista o que foi LANÇADO no mês. Sem esta linha o dono via o
          cartão com valor e a lista sem a conta, e lançava de novo. */}
      {!naoApurado && resumo.recorrentesDeAntes.length > 0 && (
        <Card className="flex flex-col gap-2 p-3 md:p-4">
          <p className="text-xs uppercase tracking-wide text-ink-muted">
            Recorrentes de meses anteriores · valem em {rotuloDoMes(mes)}
          </p>
          {resumo.recorrentesDeAntes.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 text-ink">
                {e.description}
                <span className="block text-xs text-ink-muted">desde {formatDateShortPtBR(e.date)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-medium text-ink">{formatBRL(e.value)}</span>
                <button
                  type="button"
                  aria-label={`Editar ${e.description}`}
                  onClick={() => openEditModal(e)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted/70 transition-colors hover:bg-surface-raised hover:text-ink md:h-8 md:w-8"
                >
                  <Pencil size={13} />
                </button>
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* Abaixo de md a tabela de 7 colunas obrigava a rolar de lado: vira
          lista de cartões, como o Hoje faz. */}
      <div className="flex flex-col gap-2 md:hidden">
        {status === "carregando" && <div className="h-16 animate-pulse rounded-xl bg-surface-raised" />}
        {naoApurado && <ErroAoCarregar oQue="os lançamentos" erro={error} />}
        {status === "pronto" && sorted.length === 0 && (
          <Card className="p-4 text-center text-sm text-ink-muted">
            Nenhuma despesa lançada em {rotuloDoMes(mes)}. Use &quot;Nova despesa&quot; para registrar
            aluguel, luz e fornecedores.
          </Card>
        )}
        {sorted.map((e) => (
          <Card key={e.id} className="flex items-start justify-between gap-3 p-3">
            <div className="min-w-0">
              <p className="text-sm text-ink">
                {e.description}
                {e.recurring && (
                  <Pill tone="gold" className="ml-2">
                    <Repeat size={10} /> mensal
                  </Pill>
                )}
              </p>
              <p className="text-xs text-ink-muted">
                {formatDateShortPtBR(e.date)} · <span className="text-gold-strong">{e.category}</span> · {e.payment}
                {e.supplier && e.supplier !== "—" ? ` · ${e.supplier}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end">
              <span className="whitespace-nowrap text-sm font-medium text-ink">{formatBRL(e.value)}</span>
              <div className="flex items-center">
                <button
                  aria-label="Editar"
                  onClick={() => openEditModal(e)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted/70 transition-colors hover:bg-surface-raised hover:text-ink"
                >
                  <Pencil size={13} />
                </button>
                <button
                  aria-label="Excluir"
                  onClick={() => setPendingDelete(e)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted/70 transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </Card>
        ))}
        <div className="flex items-center justify-between px-1 pt-1 text-xs uppercase tracking-wide text-ink-muted">
          <span>Total do mês</span>
          <span className="font-display text-sm font-semibold normal-case text-ink">
            {naoApurado ? NAO_APURADO : formatBRL(total)}
          </span>
        </div>
      </div>

      <Card className="table-scroll hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
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
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted md:px-6">
                  <span className="inline-block h-4 w-40 animate-pulse rounded bg-surface-raised" />
                </td>
              </tr>
            )}
            {/* O texto estava escrito à mão aqui, com o "ou" que o
                `erro-de-leitura.ts` existe para eliminar: permissão e conexão
                pedem ações diferentes, e esta era a última tela do financeiro
                ainda perguntando isso ao dono. `LinhaDeErro` recebe o erro cru
                e resolve — inclusive escondendo "Tentar de novo" quando
                recarregar não pode funcionar. */}
            {naoApurado && <LinhaDeErro oQue="os lançamentos" erro={error} colSpan={7} />}
            {status === "pronto" && sorted.length === 0 && (
              <tr>
                {/* "ainda" valia quando a lista era o histórico inteiro. Com o
                    recorte por mês, um mês vazio não significa que nunca houve
                    despesa — e o dono precisa saber que está olhando um recorte,
                    ou vai lançar de novo o que já lançou.
                    Faltava a outra metade do contrato de estado vazio: o que
                    FAZER para sair dele. O botão existe no topo da tela; o vazio
                    é que não o mencionava. */}
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-muted md:px-6">
                  Nenhuma despesa lançada em {rotuloDoMes(mes)}. Use &quot;Nova
                  despesa&quot; para registrar aluguel, luz e fornecedores — é o
                  que falta para o resultado do mês ser verdade.
                </td>
              </tr>
            )}
            {sorted.map((e) => (
              <tr
                key={e.id}
                className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
              >
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted md:px-6">
                  {formatDateShortPtBR(e.date)}
                </td>
                <td className="px-4 py-3 text-ink">
                  {e.description}
                  {e.recurring && (
                    <Pill tone="gold" className="ml-2">
                      <Repeat size={10} /> mensal
                    </Pill>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">{e.supplier}</td>
                <td className="px-4 py-3 text-gold-strong">{e.category}</td>
                <td className="px-4 py-3 text-ink-muted">{e.payment}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-ink">
                  {formatBRL(e.value)}
                </td>
                <td className="px-4 py-3 md:px-6">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      aria-label="Editar"
                      onClick={() => openEditModal(e)}
                      className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg text-ink-muted/70 transition-colors hover:bg-surface-raised hover:text-ink"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      aria-label="Excluir"
                      onClick={() => setPendingDelete(e)}
                      className="flex h-11 w-11 items-center justify-center md:h-8 md:w-8 rounded-lg text-ink-muted/70 transition-colors hover:bg-danger/10 hover:text-danger"
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
              <td className="px-4 py-3 text-xs uppercase tracking-wide text-ink-muted md:px-6" colSpan={5}>
                Total do mês
              </td>
              {/* O rodapé era o quinto zero da tela e o mais autoritário
                  deles: "TOTAL DO MÊS R$ 0,00" fecha a tabela como se a soma
                  tivesse sido conferida linha a linha. */}
              <td className="whitespace-nowrap px-4 py-3 text-right font-display font-semibold text-ink">
                {naoApurado ? NAO_APURADO : formatBRL(total)}
              </td>
              <td className="md:px-6" />
            </tr>
          </tfoot>
        </table>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Editar despesa" : "Nova despesa"}
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
          <label className="flex flex-col gap-1 text-xs text-ink-muted md:col-span-2">
            Descrição *
            <input
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Ex: Aluguel do salão, conta de energia"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Categoria *
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            >
              {expenseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Fornecedor / Beneficiário
            <input
              value={form.supplier}
              onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
              placeholder="Ex: Imobiliária, concessionária"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Valor (R$) *
            {/* Texto, não `number`: o campo numérico do navegador não aceita
                "1.500,50", e o que ele entrega para "1.500" depende do
                aparelho. Quem lê é `lerReais`. */}
            <input
              type="text"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Data
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Forma de pagamento
            <select
              value={form.payment}
              onChange={(e) =>
                setForm((f) => ({ ...f, payment: e.target.value as ExpensePaymentMethod }))
              }
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-ink md:col-span-2">
            <input
              type="checkbox"
              checked={form.recurring}
              onChange={(e) => setForm((f) => ({ ...f, recurring: e.target.checked }))}
              className="h-4 w-4 rounded border-border accent-gold"
            />
            Recorrente (repete todo mês — entra como custo fixo no resultado)
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted md:col-span-2">
            Observações
            <textarea
              value={form.observations}
              onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))}
              placeholder="Notas internas sobre este lançamento (opcional)"
              rows={2}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
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
        <p className="text-sm text-ink-muted">
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
