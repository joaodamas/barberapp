"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
import { paymentMethodLabel } from "@/lib/payment-method";
import type { VendaEstornavel } from "@/lib/estornos";
import type { PaymentMethod } from "@/lib/types";

/**
 * Corrigir a forma de pagamento de uma venda da Loja — "foi Pix, mas era cartão".
 *
 * Troca o meio e a forma e RECALCULA a taxa (a de hoje, congelada no
 * pagamento). O valor da venda, o estoque, o custo e a comissão não mudam: o
 * que muda é por onde o dinheiro entrou e quanto a maquininha reteve. O
 * servidor guarda o antes e o depois no registro de auditoria.
 *
 * Venda com devolução registrada não pode ser corrigida — a devolução guardou o
 * meio antigo. Monte com `key={venda.movementId}`.
 */
export function CorrigirFormaDaVenda({
  venda,
  irmas,
  nomeDoProduto,
  formaAtualId,
  aoFechar,
  aoCorrigir,
}: {
  venda: VendaEstornavel;
  /** Todas as linhas da mesma venda (inclui `venda`). A forma vale para todas. */
  irmas: VendaEstornavel[];
  nomeDoProduto: string;
  /** A forma gravada no pagamento, quando houver. */
  formaAtualId: string | null;
  aoFechar: () => void;
  aoCorrigir: (texto: string) => void;
}) {
  const tenant = useTenant();
  const formas = formasAtivas(tenant.policies);
  const [escolhida, setEscolhida] = useState<FormaDePagamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const metodoAtual = venda.paymentMethod as PaymentMethod | null;
  const rotuloAtual =
    formas.find((f) => f.id === formaAtualId)?.label ??
    (metodoAtual ? paymentMethodLabel[metodoAtual] : "sem forma registrada");

  /* Mesma forma que já está gravada: nada a corrigir. */
  const igual = escolhida !== null && escolhida.id === formaAtualId;
  const linhas = irmas.length > 0 ? irmas : [venda];
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  const taxa = escolhida ? Math.round(total * escolhida.feePct) / 100 : 0;

  async function confirmar() {
    if (!escolhida || igual) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction<Record<string, unknown>, unknown>("corrigirPagamentoDeVenda", {
        barbershopId: tenant.id,
        movementIds: linhas.map((l) => l.movementId),
        paymentMethod: escolhida.base,
        paymentFormId: escolhida.id,
        idempotencyKey: chave,
      });
      aoCorrigir(`Forma de pagamento corrigida para ${escolhida.label}.`);
      aoFechar();
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não consegui corrigir a forma de pagamento."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={aoFechar}
      title="Corrigir forma de pagamento"
      description={
        linhas.length > 1
          ? `Venda com ${linhas.length} itens · ${formatBRL(total)}`
          : `${venda.quantidade}× ${nomeDoProduto} · ${formatBRL(venda.valor)}`
      }
      footer={
        <div className="flex flex-col gap-2">
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={aoFechar} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!escolhida || igual || salvando} className="flex-1">
              {salvando ? "Corrigindo…" : "Corrigir forma"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-muted">
          Registrada como <span className="text-ink">{rotuloAtual}</span>. Como o cliente pagou de
          verdade?
        </p>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {formas.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={escolhida?.id === f.id}
              onClick={() => {
                setEscolhida(f);
                setErro(null);
                setChave(chaveDeIdempotencia());
              }}
              className={
                "min-h-11 rounded-xl border px-2 text-sm transition-colors " +
                (escolhida?.id === f.id
                  ? "border-gold bg-gold/10 text-ink"
                  : "border-border text-ink-muted hover:border-gold/60")
              }
            >
              {f.label}
              {f.id === formaAtualId && <span className="block text-[11px]">atual</span>}
            </button>
          ))}
        </div>

        {linhas.length > 1 && (
          <p className="text-xs text-ink-muted">
            Esta venda tem {linhas.length} itens; a forma de todos será corrigida de uma vez.
          </p>
        )}

        {igual && <p className="text-xs text-ink-muted">Essa já é a forma registrada.</p>}

        {escolhida && !igual && (
          <p className="border-t border-border pt-3 text-xs text-ink-muted">
            A taxa passa a ser a de hoje para {escolhida.label}: {escolhida.feePct}% ={" "}
            <span className="tabular-nums text-ink">{formatBRL(taxa)}</span>, congelada neste
            pagamento. O valor da venda e o estoque não mudam. Só vale para vendas do mês
            corrente.
          </p>
        )}
      </div>
    </Modal>
  );
}
