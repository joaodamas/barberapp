"use client";

import { useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";
import {
  assinarConexao,
  conexaoNoServidor,
  lerConexao,
  textoDoAvisoDeConexao,
} from "@/lib/conexao";

/**
 * "Sem conexão — mostrando dados de HH:MM". Discreto: uma faixa fina no topo,
 * só enquanto o aparelho está sem rede. Ver `lib/conexao.ts`.
 */
export function AvisoDeConexao({ recuoDoTopo = true }: { recuoDoTopo?: boolean }) {
  const { online, ultimaDoServidor } = useSyncExternalStore(
    assinarConexao,
    lerConexao,
    conexaoNoServidor
  );
  if (online) return null;
  return (
    <div
      role="status"
      className={
        (recuoDoTopo ? "safe-top " : "") +
        "flex items-center justify-center gap-1.5 border-b border-border bg-surface-raised px-4 py-1.5 text-xs text-ink-muted"
      }
    >
      <WifiOff size={12} className="shrink-0" aria-hidden="true" />
      {textoDoAvisoDeConexao(ultimaDoServidor)}
    </div>
  );
}
