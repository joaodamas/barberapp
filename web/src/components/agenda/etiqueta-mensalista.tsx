"use client";

import { useMemo } from "react";
import { useSubscribers } from "@/lib/db/use-shop-data";

/**
 * Quem é mensalista, na agenda (pedido do dono, 30/09).
 *
 * Conta o CLIENTE com plano ativo, e não só o horário do fixo: o corte marcado
 * à mão nesta semana também é de mensalista, e é aí que o dono mais precisa
 * saber — no fechamento, para não cobrar o que o plano cobre.
 *
 * Uma leitura só, na página: cada linha da agenda abrindo a própria seria uma
 * escuta por horário.
 */
export function useMensalistasAtivos(): Set<string> {
  const { items } = useSubscribers();
  return useMemo(
    () => new Set(items.filter((a) => a.status === "ativo").map((a) => a.clientId)),
    [items]
  );
}

export function EtiquetaMensalista({ className = "" }: { className?: string }) {
  return (
    <span
      className={
        "inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide " +
        "bg-gold/15 text-gold-strong " +
        className
      }
    >
      Mensalista
    </span>
  );
}
