"use client";

import { useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatDatePtBR } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useCashEntries, useStaff } from "@/lib/db/use-shop-data";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import {
  EXPLICACAO_DO_TIPO,
  lancamentosDoPeriodo,
  resumoDoCaixa,
  ROTULO_DO_TIPO,
} from "@/lib/livro-caixa";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import type { PaymentMethod } from "@/lib/types";
import type { CashEntryDoc } from "@/lib/domain";

/**
 * Livro caixa — D25.
 *
 * ## O que esta tela existe para registrar
 *
 * Só o dinheiro que se move **sem outro fato por trás**. Atendimento, venda e
 * mensalidade já geram pagamento; compra gera movimento de estoque; despesa
 * tem documento próprio. Nenhum deles aparece aqui, e não é omissão: registrar
 * de novo faria o Fluxo de Caixa somar o mesmo dinheiro duas vezes.
 *
 * A tela diz isso em voz alta, porque um dono olhando "movimentos de caixa"
 * espera ver as vendas do dia — e não vendo, concluiria que o sistema perdeu
 * alguma coisa.
 *
 * ## O dono escolhe o TIPO, nunca o sinal
 *
 * Sangria sai, aporte entra, e isso é decidido pelo servidor a partir do tipo.
 * Deixar a direção livre permitiria gravar uma sangria que soma no caixa — um
 * toque errado viraria dinheiro inventado que nenhuma conferência acharia.
 *
 * Só o ajuste pergunta a direção, porque recontagem acha sobra ou falta.
 *
 * ## O que esta tela NÃO faz
 *
 * Não calcula Fluxo de Caixa. Ela mostra o saldo dos lançamentos
 * independentes, e diz que é isso que está mostrando. Juntar estes com os
 * fatos derivados é a Rodada 3.2 — e antecipar aqui seria escrever a fórmula
 * antes da decisão.
 */

const TIPOS: CashEntryDoc["kind"][] = [
  "sangria",
  "troco_inicial",
  "aporte",
  "pagamento_comissao",
  "ajuste",
];

export function LivroCaixa({ competencia }: { competencia?: string }) {
  const tenant = useTenant();
  const { items: entradas, status, error } = useCashEntries();
  const { items: equipe } = useStaff();

  const [aberto, setAberto] = useState(false);
  const [tipo, setTipo] = useState<CashEntryDoc["kind"]>("sangria");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [metodo, setMetodo] = useState<PaymentMethod>("cash");
  const [direcao, setDirecao] = useState<"entrada" | "saida">("saida");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const resumo = useMemo(() => resumoDoCaixa(entradas, competencia), [entradas, competencia]);
  const lista = useMemo(
    () => lancamentosDoPeriodo(entradas, competencia, 12),
    [entradas, competencia]
  );
  const ativos = useMemo(() => equipe.filter((b) => b.active !== false), [equipe]);

  const numero = Math.round((Number(valor.replace(",", ".")) || 0) * 100) / 100;
  const podeConfirmar =
    numero > 0 &&
    motivo.trim().length >= 3 &&
    (tipo !== "pagamento_comissao" || staffId !== null);

  function abrir() {
    setAberto(true);
    setTipo("sangria");
    setValor("");
    setMotivo("");
    setMetodo("cash");
    setDirecao("saida");
    setStaffId(null);
    setErro(null);
    setChave(chaveDeIdempotencia());
  }

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("registrarMovimentoDeCaixa", {
        barbershopId: tenant.id,
        kind: tipo,
        amount: numero,
        /* Só viaja no ajuste. Nos outros o servidor ignora e decide pelo tipo —
         * mandar mesmo assim daria a impressão de que a tela escolhe. */
        ...(tipo === "ajuste" ? { direction: direcao } : {}),
        reason: motivo.trim(),
        paymentMethod: metodo,
        staffId: tipo === "pagamento_comissao" ? staffId : null,
        idempotencyKey: chave,
      });
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui registrar o movimento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
          <Wallet size={12} /> Livro caixa
        </h2>
        <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={abrir}>
          Registrar movimento
        </Button>
      </div>

      {/* A frase que impede a conclusão errada. Sem ela, o dono olha uma lista
          sem as vendas do dia e acha que o sistema perdeu alguma coisa. */}
      <p className="text-[11px] text-ivory-muted md:text-xs">
        Só o dinheiro que se move sem outro registro por trás — sangria, troco,
        aporte, acerto de comissão e ajuste. Atendimentos, vendas e mensalidades
        já entram pelo próprio pagamento e não são lançados aqui.
      </p>

      {status === "erro" && <ErroAoCarregar oQue="os movimentos de caixa" erro={error} />}

      <div className="grid grid-cols-3 gap-2">
        <Card className="flex flex-col gap-0.5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Entrou</p>
          <p className="font-display text-base font-semibold text-success md:text-xl">
            {formatBRL(resumo.entradas)}
          </p>
        </Card>
        <Card className="flex flex-col gap-0.5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Saiu</p>
          <p className="font-display text-base font-semibold text-danger md:text-xl">
            {formatBRL(resumo.saidas)}
          </p>
        </Card>
        <Card className="flex flex-col gap-0.5 p-3">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Saldo</p>
          <p className="font-display text-base font-semibold text-ivory md:text-xl">
            {formatBRL(resumo.saldo)}
          </p>
          {/* Diz de que saldo se trata. "Saldo" sozinho seria lido como saldo do
              caixa inteiro, que esta tela não calcula. */}
          <p className="text-[10px] text-ivory-muted">destes lançamentos</p>
        </Card>
      </div>

      {lista.length > 0 && (
        <Card className="flex flex-col divide-y divide-border p-0">
          {lista.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
              {e.direction === "entrada" ? (
                <ArrowDownLeft size={16} className="shrink-0 text-success" />
              ) : (
                <ArrowUpRight size={16} className="shrink-0 text-danger" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ivory">
                  {ROTULO_DO_TIPO[e.kind]}
                  <span className="text-ivory-muted"> · {e.reason}</span>
                </p>
                <p className="truncate text-[11px] text-ivory-muted">
                  {formatDatePtBR(e.date)}
                  {e.paymentMethod && ` · ${paymentMethodLabel[e.paymentMethod]}`}
                  {e.staffId &&
                    ` · ${equipe.find((b) => b.id === e.staffId)?.name ?? "profissional"}`}
                </p>
              </div>
              <span
                className={
                  "shrink-0 font-display text-sm font-semibold " +
                  (e.direction === "entrada" ? "text-success" : "text-danger")
                }
              >
                {e.direction === "entrada" ? "+" : "−"} {formatBRL(Math.abs(e.amount))}
              </span>
            </div>
          ))}
        </Card>
      )}

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Registrar movimento de caixa"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar || salvando}>
              {salvando ? "Registrando…" : "Registrar"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">O que foi</p>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={tipo === t}
                  onClick={() => setTipo(t)}
                  className={
                    "min-h-11 rounded-xl border px-3 text-sm transition-colors " +
                    (tipo === t
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  {ROTULO_DO_TIPO[t]}
                </button>
              ))}
            </div>
            {/* Explica o tipo escolhido. "Sangria" é vocabulário de quem já
                trabalha com caixa; quem está começando não sabe. */}
            <p className="text-[11px] text-ivory-muted">{EXPLICACAO_DO_TIPO[tipo]}</p>
          </div>

          {/* Só o ajuste pergunta a direção — nos outros ela vem do tipo. */}
          {tipo === "ajuste" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
                Sobrou ou faltou
              </p>
              <div className="flex gap-1.5">
                {(["entrada", "saida"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direcao === d}
                    onClick={() => setDirecao(d)}
                    className={
                      "min-h-11 flex-1 rounded-xl border px-3 text-sm transition-colors " +
                      (direcao === d
                        ? "border-gold bg-gold/10 text-ivory"
                        : "border-border text-ivory-muted hover:border-gold/60")
                    }
                  >
                    {d === "entrada" ? "Sobrou na gaveta" : "Faltou na gaveta"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tipo === "pagamento_comissao" && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Para quem *</p>
              <div className="flex flex-wrap gap-1.5">
                {ativos.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={staffId === b.id}
                    onClick={() => setStaffId(staffId === b.id ? null : b.id)}
                    className={
                      "min-h-11 rounded-xl border px-3 text-sm transition-colors " +
                      (staffId === b.id
                        ? "border-gold bg-gold/10 text-ivory"
                        : "border-border text-ivory-muted hover:border-gold/60")
                    }
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              {/* Saída de caixa sem beneficiário seria dinheiro pago a ninguém. */}
              {!staffId && (
                <p className="text-[11px] text-ivory-muted">
                  Diga de quem é o acerto para registrar o pagamento.
                </p>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Quanto
            <input
              type="number"
              min={0}
              step="0.01"
              value={valor}
              placeholder="0,00"
              onChange={(e) => setValor(e.target.value)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Como</p>
            <div className="grid grid-cols-4 gap-1.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => setMetodo(m)}
                  className={
                    "min-h-11 rounded-xl border px-2 text-xs transition-colors " +
                    (metodo === m
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  {paymentMethodLabel[m]}
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Por quê *
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: depósito no banco"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>

          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
        </div>
      </Modal>
    </section>
  );
}
