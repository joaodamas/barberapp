"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatDateShortPtBR } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { formasDoTenant } from "@/lib/formas-de-pagamento";
import { paymentMethodLabel } from "@/lib/payment-method";
import { plural } from "@/lib/plural";
import type { VendaEstornavel } from "@/lib/estornos";
import type { PaymentMethod } from "@/lib/types";

/** O que o Vender precisa para refazer a venda certa. */
export type CorrecaoDeVenda = {
  /** Muda a cada correção: remonta o Vender com a venda nova preenchida. */
  nonce: number;
  linhas: Array<{ productId: string; quantity: number; unitPrice: number }>;
  formaId: string | null;
  paymentMethod: string | null;
  clientId: string | null;
  staffId: string | null;
  /** Quanto já foi devolvido ao cliente nesta correção. */
  valorDevolvido: number;
  /**
   * A devolução aconteceu e a venda certa NÃO: o dono fechou o modal depois de
   * devolver (ou a segunda devolução falhou). O Vender abre direto no aviso.
   */
  desistiu?: boolean;
};

export const MOTIVO_DE_CORRECAO = "Correção de venda";

/**
 * Corrigir uma venda — valor, quantidade ou produto errado — num fluxo só.
 *
 * Três passos, sempre nesta ordem:
 *
 * 1. **A venda original**, na tela, para o dono conferir o que está corrigindo;
 * 2. **A devolução do que precisa sair** (total ou parcial). É a MESMA
 *    devolução da lista (`registrarEstorno`): o dinheiro volta, as unidades
 *    voltam ao estoque e a comissão dessa parte sai do acerto. O motivo já vem
 *    "Correção de venda";
 * 3. **A venda certa**: o Vender abre preenchido com o que foi devolvido e a
 *    forma original, para o dono ajustar e confirmar.
 *
 * ## O passo que não é atômico, e a tela diz
 *
 * Devolução e venda nova são dois registros. Se o dono desistir no passo 3, a
 * devolução FICA — o dinheiro e o estoque já voltaram. O Vender avisa isso e
 * oferece "Registrar a venda certa agora"; nada é desfeito em silêncio.
 *
 * Monte com `key={venda.movementId}`.
 */
export function CorrigirVenda({
  venda,
  irmas,
  nomeDoProduto,
  formaAtualId,
  aoFechar,
  aoDevolver,
}: {
  /** A linha em que o dono tocou. */
  venda: VendaEstornavel;
  /** Todas as linhas do carrinho (inclui a `venda`), mesmo as já devolvidas. */
  irmas: VendaEstornavel[];
  nomeDoProduto: (id: string) => string;
  formaAtualId: string | null;
  aoFechar: () => void;
  aoDevolver: (c: Omit<CorrecaoDeVenda, "nonce">) => void;
}) {
  const tenant = useTenant();
  const linhas = irmas.length > 0 ? irmas : [venda];
  const [devolver, setDevolver] = useState<Record<string, number>>(() =>
    Object.fromEntries(linhas.map((l) => [l.movementId, l.movementId === venda.movementId ? l.resta : 0]))
  );
  const [motivo, setMotivo] = useState(MOTIVO_DE_CORRECAO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave] = useState(chaveDeIdempotencia);
  const [feitos, setFeitos] = useState<Record<string, number>>({});

  const travado = Object.keys(feitos).length > 0;
  const formas = formasDoTenant(tenant.policies);
  const metodo = venda.paymentMethod as PaymentMethod | null;
  const rotuloDaForma =
    formas.find((f) => f.id === formaAtualId)?.label ?? (metodo ? paymentMethodLabel[metodo] : "forma não registrada");

  const escolhidas = linhas.filter((l) => (devolver[l.movementId] ?? 0) > 0);
  const unidades = escolhidas.reduce((s, l) => s + (devolver[l.movementId] ?? 0), 0);
  const valor = escolhidas.reduce(
    (s, l) => s + Math.round(l.unitPrice * (devolver[l.movementId] ?? 0) * 100) / 100,
    0
  );
  const podeConfirmar = escolhidas.length > 0 && motivo.trim().length >= 3 && !salvando;

  function mudar(l: VendaEstornavel, texto: string) {
    const n = Math.min(Math.max(Math.trunc(Number(texto) || 0), 0), l.resta);
    setDevolver((d) => ({ ...d, [l.movementId]: n }));
    setErro(null);
  }

  /* Fechar o modal depois de uma devolução já feita NÃO desfaz nada: o dinheiro
   * e as unidades voltaram. A tela avisa e oferece refazer a venda certa. */
  function fechar() {
    const feitas = linhas.filter((l) => feitos[l.movementId] !== undefined);
    if (feitas.length > 0) {
      aoDevolver({
        linhas: feitas.map((l) => ({
          productId: l.productId,
          quantity: feitos[l.movementId] ?? 0,
          unitPrice: l.unitPrice,
        })),
        formaId: formaAtualId,
        paymentMethod: venda.paymentMethod,
        clientId: venda.clientId,
        staffId: venda.staffId,
        valorDevolvido: feitas.reduce(
          (s, l) => s + Math.round(l.unitPrice * (feitos[l.movementId] ?? 0) * 100) / 100,
          0
        ),
        desistiu: true,
      });
    }
    aoFechar();
  }

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro(null);
    const registrados: Record<string, number> = { ...feitos };
    try {
      const { callFunction } = await import("@/lib/firebase");
      for (const l of escolhidas) {
        if (registrados[l.movementId] !== undefined) continue;
        const n = devolver[l.movementId] ?? 0;
        await callFunction<Record<string, unknown>, { valor: number }>("registrarEstorno", {
          barbershopId: tenant.id,
          origem: "produto",
          movementId: l.movementId,
          quantity: n,
          reason: motivo.trim(),
          /* A chave é da CORREÇÃO e a linha entra no id do estorno: repetir o
           * toque depois de uma falha no meio não devolve duas vezes. */
          idempotencyKey: chave,
        });
        registrados[l.movementId] = n;
      }
      aoDevolver({
        linhas: escolhidas.map((l) => ({
          productId: l.productId,
          quantity: devolver[l.movementId] ?? 0,
          unitPrice: l.unitPrice,
        })),
        formaId: formaAtualId,
        paymentMethod: venda.paymentMethod,
        clientId: venda.clientId,
        staffId: venda.staffId,
        valorDevolvido: valor,
      });
      aoFechar();
    } catch (e) {
      setFeitos(registrados);
      const jaFeitas = Object.keys(registrados).length;
      setErro(
        `${mensagemDaFuncao(e, "Não consegui registrar a devolução.")}${
          jaFeitas > 0
            ? ` ${jaFeitas} ${plural(jaFeitas, "linha já foi devolvida", "linhas já foram devolvidas")}; toque em continuar para concluir o resto.`
            : ""
        }`
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open
      onClose={fechar}
      title="Corrigir venda"
      description={`Venda de ${formatDateShortPtBR(venda.date)} · ${rotuloDaForma}`}
      footer={
        <div className="flex flex-col gap-2">
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fechar} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar} className="flex-1">
              {salvando ? "Devolvendo…" : travado ? "Continuar" : "Devolver e refazer"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            1 · A venda original
          </p>
          <ul className="flex flex-col divide-y divide-border">
            {linhas.map((l) => (
              <li key={l.movementId} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {l.quantidade}× {nomeDoProduto(l.productId)}
                  </p>
                  <p className="text-[11px] tabular-nums text-ink-muted">
                    {formatBRL(l.unitPrice)} cada · {formatBRL(l.valor)}
                    {l.devolvida > 0 &&
                      ` · ${l.devolvida} já ${plural(l.devolvida, "devolvida", "devolvidas")}`}
                  </p>
                </div>
                {l.resta > 0 ? (
                  <label className="flex shrink-0 items-center gap-2 text-xs text-ink-muted">
                    Devolver
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={l.resta}
                      disabled={travado}
                      value={devolver[l.movementId] ?? 0}
                      onChange={(e) => mudar(l, e.target.value)}
                      aria-label={`Unidades de ${nomeDoProduto(l.productId)} a devolver`}
                      className="min-h-9 w-16 rounded-lg border border-border bg-surface px-2 text-center text-sm tabular-nums text-ink"
                    />
                    <span className="tabular-nums">de {l.resta}</span>
                  </label>
                ) : (
                  <span className="shrink-0 text-[11px] text-ink-muted">Devolvida</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            2 · O que precisa sair
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-muted">Motivo da devolução</span>
            <input
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErro(null);
              }}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
          </label>
          <p className="text-xs text-ink-muted">
            {escolhidas.length === 0
              ? "Escolha quantas unidades devolver."
              : `Devolve ${formatBRL(valor)} ao cliente e ${unidades} un. ${plural(unidades, "volta", "voltam")} ao estoque. A comissão dessa parte sai do acerto do barbeiro.`}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
            3 · A venda certa
          </p>
          <p className="text-xs text-ink-muted">
            Em seguida o Vender abre já preenchido com esses itens e a forma original, para você
            ajustar e confirmar. Se desistir nessa hora, a devolução continua registrada.
          </p>
        </div>
      </div>
    </Modal>
  );
}
