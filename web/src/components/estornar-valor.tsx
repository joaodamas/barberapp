"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useRefunds } from "@/lib/db/use-shop-data";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { estornadoDe } from "@/lib/estornos";
import type { RefundDoc } from "@/lib/domain";

/**
 * Devolver dinheiro de um atendimento ou de uma mensalidade — D22.
 *
 * Separado de `desfazer-venda.tsx` porque a unidade de decisão é outra: aqui o
 * dono escolhe um VALOR, na venda ele escolhe QUANTIDADE e o valor deriva dela.
 * Unificar os dois num componente só exigiria um modo condicional que
 * atrapalharia os dois casos.
 *
 * ## Por que o serviço não mexe na comissão
 *
 * O atendimento aconteceu e o barbeiro trabalhou. Devolver ao cliente é decisão
 * comercial da barbearia e não desfaz o serviço prestado — ao contrário do
 * produto, que volta para a prateleira. Quem quiser descontar do barbeiro faz
 * isso no acerto, como decisão consciente, e não por efeito colateral de um
 * botão. A tela diz isso em vez de deixar o dono descobrir depois.
 *
 * ## Por que a fatura continua "paga"
 *
 * Ela FOI paga. Reabri-la apagaria a informação de que houve pagamento, e é
 * exatamente o tipo de correção-por-apagamento que esta rodada recusa.
 */

export function EstornarValor(params: {
  aberto: boolean;
  aoFechar: () => void;
  origem: Extract<RefundDoc["origin"], "servico" | "mensalidade">;
  /** `bookingId` ou `invoiceId`, conforme a origem. */
  refId: string;
  /** O que está sendo devolvido, em uma linha. */
  descricao: string;
  /** Bruto do pagamento original. */
  valorPago: number;
  aoEstornar?: (valor: number) => void;
}) {
  const tenant = useTenant();
  const { items: refunds } = useRefunds();

  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Nasce na MONTAGEM, e o pai monta este componente condicionalmente — então
   * cada abertura ganha uma chave nova. Reaproveitar a chave faria o segundo
   * estorno cair no caminho de idempotência do servidor: ele devolveria o
   * registro anterior e a tela diria "pronto" sem nada ter acontecido. */
  const [chave] = useState(chaveDeIdempotencia);

  const jaEstornado = useMemo(
    () => estornadoDe(refunds, params.origem, params.refId),
    [refunds, params.origem, params.refId]
  );
  const resta = Math.round((params.valorPago - jaEstornado) * 100) / 100;

  /* `null` = ainda não mexeu, e o campo mostra o saldo. DERIVADO em vez de
   * sincronizado por efeito: um `useEffect` que chama `setValor` dispara render
   * em cascata e, pior, sobrescreveria o que o dono digitou no instante em que
   * `refunds` terminasse de carregar. */
  const [valorDigitado, setValorDigitado] = useState<string | null>(null);
  const valor = valorDigitado ?? String(resta);

  const pedido = Math.round((Number(valor.replace(",", ".")) || 0) * 100) / 100;
  const podeConfirmar = pedido > 0 && pedido <= resta && motivo.trim().length >= 3;

  async function confirmar() {
    if (!podeConfirmar) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<Record<string, unknown>, { valor: number }>(
        "registrarEstorno",
        {
          barbershopId: tenant.id,
          origem: params.origem,
          ...(params.origem === "servico"
            ? { bookingId: params.refId }
            : { invoiceId: params.refId }),
          amount: pedido,
          reason: motivo.trim(),
          idempotencyKey: chave,
        }
      );
      params.aoEstornar?.(r.valor);
      params.aoFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui registrar a devolução.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={params.aberto}
      onClose={params.aoFechar}
      title="Devolver valor"
      description={params.descricao}
      footer={
        <>
          <Button variant="ghost" onClick={params.aoFechar}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar || salvando}>
            {salvando ? "Registrando…" : `Devolver ${formatBRL(pedido)}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {jaEstornado > 0 && (
          <p className="text-xs text-gold-light">
            {formatBRL(jaEstornado)} já foram devolvidos. Restam {formatBRL(resta)}.
          </p>
        )}

        <label className="flex flex-col gap-1 text-xs text-ivory-muted">
          Quanto devolver
          <input
            type="number"
            min={0}
            max={resta}
            step="0.01"
            value={valor}
            onChange={(e) => setValorDigitado(e.target.value)}
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
          />
        </label>
        {pedido > resta && (
          <p className="text-xs text-danger">
            O máximo que ainda pode ser devolvido é {formatBRL(resta)}.
          </p>
        )}

        <label className="flex flex-col gap-1 text-xs text-ivory-muted">
          Por que está devolvendo *
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={
              params.origem === "servico"
                ? "Ex.: cliente não gostou do corte"
                : "Ex.: cancelou no meio do mês"
            }
            className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
          />
        </label>

        <div className="rounded-xl border border-border bg-surface-raised/60 p-3 text-xs text-ivory-muted">
          <p className="mb-1 font-semibold text-ivory">O que vai ser registrado</p>
          <p>· Devolução de {formatBRL(pedido)} ao cliente</p>
          {params.origem === "servico" ? (
            <p>· A comissão do barbeiro NÃO muda — o atendimento aconteceu</p>
          ) : (
            <p>· A fatura continua marcada como paga — ela foi paga</p>
          )}
          <p className="mt-1.5">
            O pagamento original continua no histórico — o estorno é um registro
            novo, não um apagamento.
          </p>
        </div>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
