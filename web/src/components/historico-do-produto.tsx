"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatDateShortPtBR } from "@/lib/format";
import { useInventoryMovements } from "@/lib/db/use-shop-data";
import { historicoDoProduto } from "@/lib/produtos";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";

/**
 * Tudo o que mexeu no saldo de um produto: entradas, vendas, devoluções e
 * ajustes (com o motivo). É onde o dono confere "por que sumiram 2 unidades".
 */
export function HistoricoDoProduto({
  produto,
  aoFechar,
}: {
  produto: Doc<ProductDoc>;
  aoFechar: () => void;
}) {
  const { items: movimentos } = useInventoryMovements();
  const linhas = useMemo(
    () => historicoDoProduto(movimentos, produto.id).slice(0, 60),
    [movimentos, produto.id]
  );

  return (
    <Modal
      open
      onClose={aoFechar}
      title="Histórico do produto"
      description={`${produto.name} · ${Number(produto.stock) || 0} un. agora`}
      footer={
        <Button variant="secondary" onClick={aoFechar} className="w-full">
          Fechar
        </Button>
      }
    >
      {linhas.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum movimento registrado para este produto.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">
                  {l.titulo}
                  {l.detalhe && <span className="text-ink-muted"> · {l.detalhe}</span>}
                </p>
                <p className="text-[11px] tabular-nums text-ink-muted">
                  {l.date ? formatDateShortPtBR(l.date) : "—"}
                </p>
              </div>
              <span
                className={
                  "shrink-0 text-sm font-medium tabular-nums " +
                  (l.delta < 0 ? "text-danger" : "text-success")
                }
              >
                {l.delta > 0 ? "+" : ""}
                {l.delta} un.
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
