"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { LoadingRows } from "@/components/ui/empty-state";
import { useCadeira } from "@/components/barbeiro/area-do-barbeiro";
import { useComissaoDoBarbeiro } from "@/lib/db/use-shop-data";
import { extratoDaComissao, intervaloDoMes } from "@/lib/barbeiro";
import { rotuloDoMes } from "@/lib/db/use-financeiro";
import { mesVizinho } from "@/lib/mensalidade";
import { formatBRL, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";

/** O que a linha é, na língua do barbeiro. Caixinha tem rótulo próprio: não é comissão. */
function rotuloDaLinha(l: { origin: string; commissionAmount: number; commissionBase: number }): string {
  if (l.origin === "caixinha") {
    /* Ajuste de taxa (correção do meio de pagamento): base zero, valor diferente de zero. */
    if (l.commissionBase === 0) return "Caixinha · ajuste da taxa";
    return l.commissionAmount < 0 ? "Estorno de caixinha" : "Caixinha";
  }
  if (l.commissionAmount < 0) return "Estorno";
  return l.origin === "produto" ? "Venda de produto" : "Atendimento";
}

/**
 * A comissão do barbeiro no mês (05/10) — o extrato dele, linha a linha.
 *
 * Lê `commissions` com o `staffId` dele: as regras não deixam ver a de mais
 * ninguém. Estorno aparece como linha negativa, porque o servidor não apaga o
 * passado.
 */
export default function ComissaoDoBarbeiroPage() {
  const { staffId } = useCadeira();
  const mesAtual = toISODate(new Date()).slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const { de, ate } = intervaloDoMes(mes);
  const { items, status, error } = useComissaoDoBarbeiro(staffId, de, ate);
  const extrato = useMemo(() => extratoDaComissao(items), [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1">
        <Button variant="ghost" aria-label="Mês anterior" className="min-h-11 px-2" onClick={() => setMes((m) => mesVizinho(m, -1))}>
          <ChevronLeft size={18} />
        </Button>
        <p className="min-w-40 text-center text-base font-semibold capitalize text-ink">
          {rotuloDoMes(mes)}
          {mes === mesAtual && <span className="ml-1 text-xs font-normal text-ink-muted">(este mês)</span>}
        </p>
        <Button variant="ghost" aria-label="Próximo mês" className="min-h-11 px-2" onClick={() => setMes((m) => mesVizinho(m, 1))}>
          <ChevronRight size={18} />
        </Button>
      </div>

      {status === "carregando" && <LoadingRows rows={3} oQue="sua comissão" />}
      {status === "erro" && <ErroAoCarregar oQue="sua comissão" erro={error} />}

      {status === "pronto" && (
        <>
          <Card className="flex flex-col gap-1 p-5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">A receber no mês</p>
            <p className="font-display text-3xl font-semibold tabular-nums text-success">{formatBRL(extrato.total)}</p>
            <p className="text-xs text-ink-muted">
              {contar(extrato.atendimentos, "atendimento", "atendimentos")}
              {extrato.vendas > 0 ? ` · ${contar(extrato.vendas, "venda", "vendas")}` : ""} · sobre{" "}
              {formatBRL(extrato.base)}
            </p>
            {extrato.caixinha !== 0 && (
              <p className="text-xs text-ink-muted">
                Inclui {formatBRL(extrato.caixinha)} de caixinha (já sem a taxa da maquininha).
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-muted">
              É o que foi apurado nos atendimentos fechados. O acerto (quando e como recebe) é combinado com o dono.
            </p>
          </Card>

          {extrato.linhas.length === 0 ? (
            <Card className="p-6 text-center text-sm text-ink-muted">Nenhuma comissão neste mês ainda.</Card>
          ) : (
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-border/60">
                {extrato.linhas.map((l) => (
                  <li key={l.id} className="grid grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-sm">
                    <span className="tabular-nums text-ink-muted">{l.date.slice(8, 10)}/{l.date.slice(5, 7)}</span>
                    <span className="min-w-0 truncate text-ink">
                      {rotuloDaLinha(l)}
                      <span className="text-ink-muted">
                        {l.origin === "caixinha"
                          ? l.commissionBase === 0
                            ? ""
                            : ` · ${formatBRL(Math.abs(l.commissionBase))}${l.feeAmount ? ` − taxa ${formatBRL(Math.abs(l.feeAmount))}` : ""}`
                          : ` · ${l.commissionPct}% de ${formatBRL(l.commissionBase)}`}
                      </span>
                    </span>
                    <span className={`tabular-nums ${l.commissionAmount < 0 ? "text-danger" : "text-ink"}`}>
                      {formatBRL(l.commissionAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
