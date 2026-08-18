"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { rotuloDoMes } from "@/lib/db/use-financeiro";
import { useTenant } from "@/lib/tenant-context";
import { useClients, usePlans, useSubscriptionInvoices } from "@/lib/db/use-shop-data";
import { filtrarClientes } from "@/lib/clientes-busca";
import { mascararWhatsapp } from "@/lib/whatsapp-numero";
import { estagioDaFatura, resumoDasFaturas } from "@/lib/mensalidade";
import { EstornarValor } from "@/components/estornar-valor";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import type { PaymentMethod } from "@/lib/types";
import type { Doc } from "@/lib/db/repository";
import type { ClientDoc, SubscriptionInvoiceDoc } from "@/lib/domain";

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

export function GerirMensalistas({ competencia }: { competencia: string }) {
  const tenant = useTenant();
  const { items: clientes } = useClients();
  const { items: planos } = usePlans();
  const { items: faturas, status } = useSubscriptionInvoices();

  const hoje = toISODate(new Date());

  const [contratando, setContratando] = useState(false);
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

  const planosAtivos = useMemo(() => planos.filter((p) => p.active !== false), [planos]);
  const encontrados = useMemo(() => filtrarClientes(clientes, busca, 6), [clientes, busca]);
  const resumo = useMemo(
    () => resumoDasFaturas(faturas, competencia, hoje),
    [faturas, competencia, hoje]
  );
  const doMes = useMemo(
    () => faturas.filter((f) => f.competencia === competencia),
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
      setErro((err as { message?: string })?.message ?? "Não foi possível contratar agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function gerarFaturas() {
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("gerarFaturasDoMes", { barbershopId: tenant.id, competencia });
    } catch (err) {
      setErro((err as { message?: string })?.message ?? "Não foi possível emitir agora.");
    }
  }

  async function receber(metodo: PaymentMethod) {
    if (!aReceber) return;
    setRecebendo(true);
    setErroDoRecebimento(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("registrarPagamentoDeMensalidade", {
        barbershopId: tenant.id,
        invoiceId: aReceber.id,
        paymentMethod: metodo,
      });
      setAReceber(null);
    } catch (err) {
      setErroDoRecebimento(
        (err as { message?: string })?.message ?? "Não foi possível registrar agora."
      );
    } finally {
      setRecebendo(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Faturado × recebido, separados ---- */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:gap-4">
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Faturado</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {formatBRL(resumo.faturado)}
          </p>
          <p className="text-[11px] text-ivory-muted">
            {contar(resumo.quantidade, "mensalidade", "mensalidades")} em{" "}
            {rotuloDoMes(competencia)}
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Recebido</p>
          <p className="font-display text-lg font-semibold text-success md:text-2xl">
            {formatBRL(resumo.recebido)}
          </p>
          {/* A frase que separa o contratado do realizado, sem exigir que o
              dono conheça a modelagem. */}
          <p className="text-[11px] text-ivory-muted">
            {contar(resumo.pagas, "confirmada", "confirmadas")} — o resto ainda é
            cobrança
          </p>
        </Card>
        <Card className="flex flex-col gap-1 p-3 md:p-5">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Em aberto</p>
          <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
            {formatBRL(resumo.emAberto)}
          </p>
          <p className="text-[11px] text-ivory-muted">
            {resumo.quantidade - resumo.pagas} a receber
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setContratando(true)}>
          <UserPlus size={16} />
          Novo mensalista
        </Button>
        <Button variant="secondary" onClick={gerarFaturas}>
          Emitir mensalidades de {rotuloDoMes(competencia)}
        </Button>
      </div>

      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}

      {/* ---- As faturas da competência ---- */}
      <Card className="overflow-hidden p-0">
        {status === "pronto" && doMes.length === 0 ? (
          /* Estado vazio diz QUAL período está sendo visto — a lição de P1-1.
             "Nenhuma mensalidade ainda" seria falso: pode haver de outro mês. */
          <div className="p-6 text-center">
            <p className="text-sm text-ivory">
              Nenhuma mensalidade em {rotuloDoMes(competencia)}
            </p>
            {/* Dizia o que é e de qual mês, e parava aí. Faltava a outra
                metade: o botão que resolve está logo acima e o vazio não o
                mencionava. */}
            <p className="mt-1 text-xs text-ivory-muted">
              Toque em &quot;Emitir mensalidades de {rotuloDoMes(competencia)}&quot;
              para gerar a cobrança de cada mensalista ativo.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-raised text-[11px] uppercase tracking-wide text-ivory-muted">
                <tr>
                  <th className="px-4 py-2 text-left md:px-6">Cliente</th>
                  <th className="px-4 py-2 text-left">Plano</th>
                  <th className="px-4 py-2 text-left">Vence</th>
                  <th className="px-4 py-2 text-left">Situação</th>
                  <th className="px-4 py-2 text-right md:px-6">Valor</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {doMes.map((f) => {
                  const estagio = estagioDaFatura(f, hoje);
                  const nome =
                    clientes.find((c) => c.id === f.clientId)?.name ?? "Cliente";
                  return (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-ivory md:px-6">{nome}</td>
                      <td className="px-4 py-3 text-ivory-muted">{f.planName}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ivory-muted">
                        {formatDatePtBR(f.dueDate)}
                      </td>
                      <td className="px-4 py-3">
                        {f.status === "paga" ? (
                          <Pill tone="success">
                            Paga
                            {f.paymentMethod ? ` · ${paymentMethodLabel[f.paymentMethod]}` : ""}
                          </Pill>
                        ) : f.status === "cancelada" ? (
                          <Pill tone="neutral">Cancelada</Pill>
                        ) : estagio ? (
                          <Pill tone={estagio.startsWith("D+") ? "danger" : "gold"}>
                            {estagio}
                          </Pill>
                        ) : (
                          <Pill tone="neutral">Em aberto</Pill>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-ivory md:px-6">
                        {formatBRL(f.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {f.status === "aberta" && (
                          <Button
                            variant="secondary"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => {
                              setAReceber(f);
                              setErroDoRecebimento(null);
                            }}
                          >
                            Registrar pagamento
                          </Button>
                        )}
                        {/* D22 · mensalidade paga por engano, ou cliente que
                            cancelou no meio do mês. Antes o único caminho era
                            editar o banco à mão. */}
                        {f.status === "paga" && (
                          <Button
                            variant="ghost"
                            className="min-h-9 px-3 text-xs"
                            onClick={() => setAEstornar(f)}
                          >
                            Devolver
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ---- Contratar ---- */}
      <Modal
        open={contratando}
        onClose={() => setContratando(false)}
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
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Cliente</p>
            {cliente ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/60 bg-gold/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ivory">{cliente.name}</p>
                  <p className="text-[11px] text-ivory-muted">
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
                  <Search size={14} className="text-ivory-muted" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou WhatsApp"
                    className="min-h-11 flex-1 bg-transparent text-sm text-ivory placeholder:text-ivory-muted"
                  />
                </div>
                {encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCliente(c)}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-gold/60"
                  >
                    <span className="text-sm text-ivory">{c.name}</span>
                    <span className="text-[11px] text-ivory-muted">
                      {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "—"}
                    </span>
                  </button>
                ))}
                {clientes.length === 0 && (
                  <p className="text-xs text-ivory-muted">
                    Nenhum cliente cadastrado. Um cadastro nasce quando você marca um
                    atendimento.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Plano</p>
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
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  <span className="block">{p.name}</span>
                  <span className="block text-[11px] text-ivory-muted">
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
              <p className="text-xs text-ivory-muted">
                Nenhum plano ativo — sem plano não há o que contratar. Fale com
                quem cuida da sua conta na plataforma para cadastrar os seus.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
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
              className="min-h-11 w-24 rounded-xl border border-border bg-surface px-3 text-sm text-ivory"
            />
            {/* Dizer o que acontece no caso estranho, antes que ele aconteça. */}
            {diaVencimento > 28 && (
              <p className="text-[11px] text-ivory-muted">
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
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <Button
                key={m}
                variant="secondary"
                disabled={recebendo}
                onClick={() => receber(m)}
                className="min-h-12"
              >
                {paymentMethodLabel[m]}
              </Button>
            ))}
          </div>
          {erroDoRecebimento && (
            <p role="alert" className="text-xs text-danger">
              {erroDoRecebimento}
            </p>
          )}
          <p className="text-[11px] text-ivory-muted">
            O meio de pagamento fica gravado na mensalidade e não é alterado depois.
          </p>
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
