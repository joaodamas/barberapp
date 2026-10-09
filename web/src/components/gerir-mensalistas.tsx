"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EditorDePlanos } from "@/components/editor-de-planos";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { LoadingRows } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { rotuloDoMes } from "@/lib/db/use-financeiro";
import { useTenant } from "@/lib/tenant-context";
import {
  combineStatus,
  useClients,
  usePlans,
  useRefunds,
  useSubscriptionInvoices,
} from "@/lib/db/use-shop-data";
import { filtrarClientes } from "@/lib/clientes-busca";
import { mascararWhatsapp } from "@/lib/whatsapp-numero";
import {
  abertasDeMesesAnteriores,
  devolvidoPorFatura,
  mesVizinho,
  resumoDasFaturas,
  situacaoDaFatura,
} from "@/lib/mensalidade";
import { EstornarValor } from "@/components/estornar-valor";
import { paymentMethodLabel } from "@/lib/payment-method";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
import type { Doc } from "@/lib/db/repository";
import type { ClientDoc, SubscriptionInvoiceDoc } from "@/lib/domain";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";

/**
 * G2 — contratar mensalista e receber a mensalidade.
 *
 * ## A separação que a tela precisa mostrar
 *
 * ```
 * Contratado  →  Faturado  →  Recebido
 *  (MRR)         (cobrança)   (o único com lastro)
 * ```
 *
 * Somar os três num número só foi exatamente o erro dos R$ 248: o produto
 * afirmava um recebimento cuja evidência era uma caixinha marcada como
 * `ativo`. Aqui cada um tem lugar e nome próprios, e a interface não pede que
 * o dono conheça a modelagem para entender a diferença.
 *
 * ## O que esta tela NÃO decide
 *
 * Se a mensalidade recebida entra na receita realizada é decisão do modelo, na
 * Rodada 3. `analytics.ts` não foi tocado.
 */

export function GerirMensalistas({ competencia: mesCorrente }: { competencia: string }) {
  const tenant = useTenant();
  /* A competência VISTA (02/10): antes era sempre o mês corrente, e a dívida
   * de setembro sumia quando virava outubro. */
  const [competencia, setCompetencia] = useState(mesCorrente);
  const [emitindo, setEmitindo] = useState(false);
  const formasDeCobranca = formasAtivas(tenant.policies);
  const lidoClientes = useClients();
  const lidoPlanos = usePlans();
  const lidoFaturas = useSubscriptionInvoices();
  /* Fatura devolvida não conta como recebida (08/10). */
  const lidoRefunds = useRefunds();
  const { items: clientes } = lidoClientes;
  const { items: planos } = lidoPlanos;
  const { items: faturas } = lidoFaturas;
  const { items: refunds } = lidoRefunds;
  /* Faturado, recebido e em aberto saem das quatro leituras juntas: se UMA
   * falha, o total é parcial — e "Recebido R$ 0,00" com a tabela vazia dizia ao
   * dono que ninguém pagou. Antes dos totais, o estado da leitura. */
  const status = combineStatus(lidoClientes, lidoPlanos, lidoFaturas, lidoRefunds);
  const erroDaLeitura = [lidoFaturas, lidoRefunds, lidoClientes, lidoPlanos].find(
    (l) => l.status === "erro"
  )?.error;
  const devolvidas = useMemo(() => devolvidoPorFatura(refunds), [refunds]);

  const hoje = toISODate(new Date());

  const [contratando, setContratando] = useState(false);
  const [editandoPlanos, setEditandoPlanos] = useState(false);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<Doc<ClientDoc> | null>(null);
  const [planoId, setPlanoId] = useState<string | null>(null);
  const [diaVencimento, setDiaVencimento] = useState(5);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [aReceber, setAReceber] = useState<Doc<SubscriptionInvoiceDoc> | null>(null);
  const [recebendo, setRecebendo] = useState(false);
  const [erroDoRecebimento, setErroDoRecebimento] = useState<string | null>(null);
  const [aEstornar, setAEstornar] = useState<Doc<SubscriptionInvoiceDoc> | null>(null);
  const [dataDoPagamento, setDataDoPagamento] = useState("");
  const [aDispensar, setADispensar] = useState<Doc<SubscriptionInvoiceDoc> | null>(null);
  const [dispensando, setDispensando] = useState(false);
  const [erroDaDispensa, setErroDaDispensa] = useState<string | null>(null);

  const planosAtivos = useMemo(() => planos.filter((p) => p.active !== false), [planos]);
  const encontrados = useMemo(() => filtrarClientes(clientes, busca, 6), [clientes, busca]);
  const resumo = useMemo(
    () => resumoDasFaturas(faturas, competencia, hoje, refunds),
    [faturas, competencia, hoje, refunds]
  );
  const doMes = useMemo(
    () => faturas.filter((f) => f.competencia === competencia),
    [faturas, competencia]
  );
  const anteriores = useMemo(
    () => abertasDeMesesAnteriores(faturas, competencia),
    [faturas, competencia]
  );

  const podeContratar = !!cliente && !!planoId;

  async function contratar() {
    if (!podeContratar || !cliente || !planoId) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("criarMensalista", {
        barbershopId: tenant.id,
        clientId: cliente.id,
        planId: planoId,
        billingDay: diaVencimento,
      });
      setContratando(false);
      setCliente(null);
      setPlanoId(null);
      setBusca("");
    } catch (err) {
      setErro(mensagemDaFuncao(err, "Não foi possível contratar agora."));
    } finally {
      setSalvando(false);
    }
  }

  async function gerarFaturas() {
    setErro(null);
    setEmitindo(true);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("gerarFaturasDoMes", { barbershopId: tenant.id, competencia });
    } catch (err) {
      setErro(mensagemDaFuncao(err, "Não foi possível emitir agora."));
    } finally {
      setEmitindo(false);
    }
  }

  async function receber(forma: FormaDePagamento) {
    const metodo = forma.base;
    if (!aReceber) return;
    setRecebendo(true);
    setErroDoRecebimento(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("registrarPagamentoDeMensalidade", {
        barbershopId: tenant.id,
        invoiceId: aReceber.id,
        paymentMethod: metodo,
        paymentFormId: forma.id,
        paidAt: dataDoPagamento || hoje,
      });
      setAReceber(null);
    } catch (err) {
      setErroDoRecebimento(
        mensagemDaFuncao(err, "Não foi possível registrar agora.")
      );
    } finally {
      setRecebendo(false);
    }
  }

  function linhaDaFatura(f: Doc<SubscriptionInvoiceDoc>, mostrarMes: boolean) {
    const situacao = situacaoDaFatura(f, hoje, devolvidas.get(f.id) ?? 0);
    const nome = clientes.find((c) => c.id === f.clientId)?.name ?? "Cliente";
    return (
      <tr key={f.id} className="border-b border-border/60 align-middle last:border-0">
        <td className="px-4 py-3 md:pl-6">
          <p className="truncate font-medium text-ink" title={nome}>{nome}</p>
        </td>
        <td className="px-4 py-3">
          <p className="truncate text-ink-muted" title={f.planName}>{f.planName}</p>
          {mostrarMes && (
            <p className="text-[11px] capitalize text-ink-muted">ref. {rotuloDoMes(f.competencia)}</p>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
          {dataCurta(f.dueDate)}
        </td>
        <td className="px-4 py-3">
          <Pill tone={situacao.tom}>{situacao.texto}</Pill>
          {f.status === "paga" && (
            <p className="mt-1 text-[11px] text-ink-muted">
              {f.paymentMethod ? paymentMethodLabel[f.paymentMethod] : "—"}
              {f.paidAt ? ` · ${dataCurta(f.paidAt)}` : ""}
            </p>
          )}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-ink">
          {formatBRL(f.amount)}
        </td>
        <td className="px-4 py-3 md:pr-6">
          <div className="flex items-center justify-end gap-1">
            {f.status === "aberta" && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-ink-muted"
                  onClick={() => {
                    setADispensar(f);
                    setErroDaDispensa(null);
                  }}
                >
                  Não cobrar
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setAReceber(f);
                    setDataDoPagamento(hoje);
                    setErroDoRecebimento(null);
                  }}
                >
                  Registrar pagamento
                </Button>
              </>
            )}
            {/* D22 · mensalidade paga por engano, ou cliente que
                cancelou no meio do mês. Antes o único caminho era
                editar o banco à mão. */}
            {f.status === "paga" && (
              <Button variant="ghost" size="sm" onClick={() => setAEstornar(f)}>
                Devolver
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  /* Celular: um cartão por mensalidade, com "Receber" À VISTA. A tabela de
   * 880px escondia as ações atrás de uma rolagem lateral que nada indicava —
   * mesmo padrão do Hoje (`painel/(dashboard)/page.tsx`). */
  function cartaoDaFatura(f: Doc<SubscriptionInvoiceDoc>, mostrarMes: boolean) {
    const situacao = situacaoDaFatura(f, hoje, devolvidas.get(f.id) ?? 0);
    const nome = clientes.find((c) => c.id === f.clientId)?.name ?? "Cliente";
    return (
      <Card key={f.id} className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{nome}</p>
            <p className="truncate text-xs text-ink-muted">{f.planName}</p>
            {mostrarMes && (
              <p className="text-[11px] capitalize text-ink-muted">ref. {rotuloDoMes(f.competencia)}</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-ink">{formatBRL(f.amount)}</p>
            <p className="text-xs text-ink-muted">vence {dataCurta(f.dueDate)}</p>
          </div>
        </div>
        <div>
          <Pill tone={situacao.tom}>{situacao.texto}</Pill>
          {f.status === "paga" && (
            <p className="mt-1 text-[11px] text-ink-muted">
              {f.paymentMethod ? paymentMethodLabel[f.paymentMethod] : "—"}
              {f.paidAt ? ` · ${dataCurta(f.paidAt)}` : ""}
            </p>
          )}
        </div>
        {f.status === "aberta" && (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => {
                setAReceber(f);
                setDataDoPagamento(hoje);
                setErroDoRecebimento(null);
              }}
            >
              Receber
            </Button>
            <Button
              variant="ghost"
              className="text-ink-muted"
              onClick={() => {
                setADispensar(f);
                setErroDaDispensa(null);
              }}
            >
              Não cobrar
            </Button>
          </div>
        )}
        {f.status === "paga" && (
          <div className="flex">
            <Button variant="ghost" size="sm" className="px-0" onClick={() => setAEstornar(f)}>
              Devolver
            </Button>
          </div>
        )}
      </Card>
    );
  }

  /* As DUAS tabelas (meses anteriores e o mês) usam as mesmas colunas, de
   * largura fixa: antes cada uma media o próprio conteúdo, e as colunas
   * pulavam de lugar de uma para a outra e de um mês para o outro (02/10). */
  function tabela(linhas: Doc<SubscriptionInvoiceDoc>[], mostrarMes: boolean) {
    return (
      <>
      <div className="flex flex-col gap-2 p-3 md:hidden">
        {linhas.map((f) => cartaoDaFatura(f, mostrarMes))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px] table-fixed text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col />
            <col className="w-[88px]" />
            <col className="w-[170px]" />
            <col className="w-[112px]" />
            <col className="w-[270px]" />
          </colgroup>
          <thead className="bg-surface-raised text-[11px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-4 py-2 text-left font-medium md:pl-6">Cliente</th>
              <th className="px-4 py-2 text-left font-medium">Plano</th>
              <th className="px-4 py-2 text-left font-medium">Vence</th>
              <th className="px-4 py-2 text-left font-medium">Situação</th>
              <th className="px-4 py-2 text-right font-medium">Valor</th>
              <th className="px-4 py-2 md:pr-6">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>{linhas.map((f) => linhaDaFatura(f, mostrarMes))}</tbody>
        </table>
      </div>
      </>
    );
  }

  async function dispensar() {
    if (!aDispensar) return;
    setDispensando(true);
    setErroDaDispensa(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("dispensarMensalidade", {
        barbershopId: tenant.id,
        invoiceId: aDispensar.id,
        motivo: "Não cobrar",
      });
      setADispensar(null);
    } catch (err) {
      setErroDaDispensa(mensagemDaFuncao(err, "Não foi possível agora."));
    } finally {
      setDispensando(false);
    }
  }

  if (status === "erro") {
    return (
      <ErroAoCarregar
        oQue="as mensalidades"
        erro={erroDaLeitura}
        onTentarDeNovo={() => window.location.reload()}
      />
    );
  }
  if (status === "carregando") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando as mensalidades">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-4">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-surface-raised md:h-28" />
          ))}
        </div>
        <LoadingRows rows={4} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Faturado × recebido, separados ---- */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Faturado</p>
          <p className="font-display text-lg font-semibold text-ink md:text-2xl">
            {formatBRL(resumo.faturado)}
          </p>
          <p className="text-[11px] text-ink-muted">
            {contar(resumo.quantidade, "mensalidade", "mensalidades")} em{" "}
            {rotuloDoMes(competencia)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Recebido</p>
          <p className="font-display text-lg font-semibold text-success md:text-2xl">
            {formatBRL(resumo.recebido)}
          </p>
          {/* A frase que separa o contratado do realizado, sem exigir que o
              dono conheça a modelagem. */}
          <p className="text-[11px] text-ink-muted">
            {contar(resumo.pagas, "confirmada", "confirmadas")} — o resto ainda é
            cobrança
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">Em aberto</p>
          <p className="font-display text-lg font-semibold text-ink md:text-2xl">
            {formatBRL(resumo.emAberto)}
          </p>
          <p className="text-[11px] text-ink-muted">
            {resumo.quantidade - resumo.pagas} a receber
          </p>
        </Card>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" aria-label="Mês anterior" className="px-2" onClick={() => setCompetencia((c) => mesVizinho(c, -1))}>
          <ChevronLeft size={16} />
        </Button>
        <p className="min-w-36 text-center text-sm font-medium capitalize text-ink">
          {rotuloDoMes(competencia)}
          {competencia === mesCorrente && <span className="ml-1 text-xs font-normal text-ink-muted">(este mês)</span>}
        </p>
        <Button variant="ghost" size="sm" aria-label="Próximo mês" className="px-2" onClick={() => setCompetencia((c) => mesVizinho(c, 1))}>
          <ChevronRight size={16} />
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setContratando(true)}>
          <UserPlus size={16} />
          Novo mensalista
        </Button>
        {/* Sem plano no catálogo não há o que contratar, e até 20/08 o produto
            mandava o dono "falar com quem cuida da sua conta na plataforma"
            para cadastrar um. A porta fica ao lado da contratação porque é aqui
            que a falta aparece. */}
        <Button variant="secondary" onClick={() => setEditandoPlanos(true)}>
          Planos
        </Button>
        <Button variant="secondary" onClick={gerarFaturas} disabled={emitindo}>
          {emitindo ? "Emitindo…" : `Emitir mensalidades de ${rotuloDoMes(competencia)}`}
        </Button>
      </div>

      {/* ---- Em aberto de meses anteriores (02/10) ---- */}
      {anteriores.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border/60 px-4 py-3 md:px-6">
            <p className="text-sm font-medium text-ink">Em aberto de meses anteriores</p>
            <p className="text-xs text-ink-muted">
              {contar(anteriores.length, "mensalidade", "mensalidades")} antes de {rotuloDoMes(competencia)} ·{" "}
              <b className="font-semibold text-ink">{formatBRL(anteriores.reduce((t, f) => t + f.amount, 0))}</b>
            </p>
            <p className="mt-1 text-[11px] text-ink-muted">
              Já recebeu antes de usar o Topete? Registre com a data em que pagou. Não era devida? Use Não cobrar.
            </p>
          </div>
          {tabela(anteriores, true)}
        </Card>
      )}

      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}

      {/* ---- As faturas da competência ---- */}
      <Card className="overflow-hidden p-0">
        {doMes.length === 0 ? (
          /* Estado vazio diz QUAL período está sendo visto — a lição de P1-1.
             "Nenhuma mensalidade ainda" seria falso: pode haver de outro mês. */
          <div className="p-6 text-center">
            <p className="text-sm text-ink">
              Nenhuma mensalidade em {rotuloDoMes(competencia)}
            </p>
            {/* Dizia o que é e de qual mês, e parava aí. Faltava a outra
                metade: o botão que resolve está logo acima e o vazio não o
                mencionava. */}
            <p className="mt-1 text-xs text-ink-muted">
              Emita para gerar a cobrança de cada mensalista ativo.
            </p>
            <Button className="mt-3" onClick={gerarFaturas} disabled={emitindo}>
              {emitindo ? "Emitindo…" : `Emitir mensalidades de ${rotuloDoMes(competencia)}`}
            </Button>
          </div>
        ) : (
          tabela(doMes, false)
        )}
      </Card>

      <EditorDePlanos open={editandoPlanos} onClose={() => setEditandoPlanos(false)} />

      {/* ---- Contratar ---- */}
      <Modal
        open={contratando}
        onClose={() => setContratando(false)}
        protegerFechamento={!!cliente || planoId !== null || busca.trim() !== ""}
        title="Novo mensalista"
        description="O cliente precisa estar cadastrado"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setContratando(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={contratar} disabled={!podeContratar || salvando} className="flex-1">
              {salvando ? "Contratando…" : "Contratar"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">Cliente</p>
            {cliente ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/60 bg-gold/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{cliente.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {cliente.whatsapp ? mascararWhatsapp(cliente.whatsapp) : "sem WhatsApp"}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setCliente(null)}>
                  Trocar
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                  <Search size={14} className="text-ink-muted" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou WhatsApp"
                    aria-label="Buscar cliente por nome ou WhatsApp"
                    className="min-h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>
                {encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCliente(c)}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-gold/60"
                  >
                    <span className="text-sm text-ink">{c.name}</span>
                    <span className="text-[11px] text-ink-muted">
                      {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "—"}
                    </span>
                  </button>
                ))}
                {clientes.length === 0 && (
                  <p className="text-xs text-ink-muted">
                    Nenhum cliente cadastrado. Um cadastro nasce quando você marca um
                    atendimento.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">Plano</p>
            <div className="flex flex-wrap gap-2">
              {planosAtivos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={planoId === p.id}
                  onClick={() => setPlanoId(p.id)}
                  className={
                    "rounded-xl border px-3 py-2 text-left text-xs transition-colors " +
                    (planoId === p.id
                      ? "border-gold bg-gold/10 text-ink"
                      : "border-border text-ink-muted hover:border-gold/60")
                  }
                >
                  <span className="block">{p.name}</span>
                  <span className="block text-[11px] text-ink-muted">
                    {formatBRL(p.price)}/mês
                  </span>
                </button>
              ))}
            </div>
            {/* Mandava "cadastrar em Serviços". A tela de Serviços edita o
                CARDÁPIO (`services`) e não tem editor de plano: `plans` não é
                escrita por nenhuma tela do painel. O dono ia até lá, não
                achava, e ficava sem saber se o erro era dele.
                Ver o STOP em `docs/VOCABULARIO.md`. */}
            {planosAtivos.length === 0 && (
              <p className="text-xs text-ink-muted">
                Nenhum plano ativo — sem plano não há o que contratar. Fale com
                quem cuida da sua conta na plataforma para cadastrar os seus.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">
              Vence todo dia
            </p>
            <input
              type="number"
              min={1}
              max={31}
              value={diaVencimento}
              onChange={(e) =>
                setDiaVencimento(Math.min(Math.max(Number(e.target.value) || 1, 1), 31))
              }
              className="min-h-11 w-24 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
            {/* Dizer o que acontece no caso estranho, antes que ele aconteça. */}
            {diaVencimento > 28 && (
              <p className="text-[11px] text-ink-muted">
                Em fevereiro, cobra no último dia do mês.
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* ---- Receber ---- */}
      <Modal
        open={!!aReceber}
        onClose={() => setAReceber(null)}
        title="Como o cliente pagou?"
        description={
          aReceber
            ? `${formatBRL(aReceber.amount)} · ${aReceber.planName} · vence ${formatDatePtBR(aReceber.dueDate)}`
            : undefined
        }
      >
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="text-sm text-ink">Pago em</span>
            <input
              type="date"
              value={dataDoPagamento}
              max={hoje}
              min={diasAntes(hoje, 120)}
              onChange={(e) => setDataDoPagamento(e.target.value)}
              className="min-h-9 rounded-lg bg-transparent text-right text-sm tabular-nums text-ink"
            />
          </label>
          {dataDoPagamento && dataDoPagamento < hoje && (
            <p className="text-[11px] text-ink-muted">
              Entra no caixa de {dataCurta(dataDoPagamento)}, não no de hoje.
            </p>
          )}
          <div className={formasDeCobranca.length > 4 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
            {formasDeCobranca.map((f) => (
              <Button
                key={f.id}
                variant="secondary"
                disabled={recebendo}
                onClick={() => receber(f)}
                className="min-h-12 px-2 text-center leading-tight"
              >
                {f.label}
              </Button>
            ))}
          </div>
          {erroDoRecebimento && (
            <p role="alert" className="text-xs text-danger">
              {erroDoRecebimento}
            </p>
          )}
          <p className="text-[11px] text-ink-muted">
            O meio de pagamento fica gravado na mensalidade e não é alterado depois.
          </p>
        </div>
      </Modal>

      {/* ---- Não cobrar (02/10) ---- */}
      <Modal
        open={!!aDispensar}
        onClose={() => setADispensar(null)}
        title="Não cobrar esta mensalidade?"
        description={
          aDispensar
            ? `${clientes.find((c) => c.id === aDispensar.clientId)?.name ?? "Cliente"} · ${aDispensar.planName} · ref. ${rotuloDoMes(aDispensar.competencia)} · ${formatBRL(aDispensar.amount)}`
            : undefined
        }
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setADispensar(null)} className="flex-1">
              Voltar
            </Button>
            <Button onClick={dispensar} disabled={dispensando} className="flex-1">
              {dispensando ? "Salvando…" : "Não cobrar"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 text-sm text-ink-muted">
          <p>Ela sai do em aberto e do faturado do mês. Nenhum dinheiro é lançado.</p>
          <p className="text-[11px]">
            Se o cliente pagou (mesmo antes de usar o Topete), use Registrar pagamento com a data em que pagou — assim o caixa daquele dia fica certo.
          </p>
          {erroDaDispensa && (
            <p role="alert" className="text-xs text-danger">
              {erroDaDispensa}
            </p>
          )}
        </div>
      </Modal>

      {/* ---- Devolver — D22 ---- */}
      {aEstornar && (
        <EstornarValor
          aberto
          aoFechar={() => setAEstornar(null)}
          origem="mensalidade"
          refId={aEstornar.id}
          descricao={`${formatBRL(aEstornar.amount)} · ${aEstornar.planName} · paga em ${
            aEstornar.paidAt ? formatDatePtBR(aEstornar.paidAt) : "—"
          }`}
          valorPago={aEstornar.amount}
        />
      )}
    </div>
  );
}

/** `AAAA-MM-DD` → "05/09". */
function dataCurta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function diasAntes(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) - dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
