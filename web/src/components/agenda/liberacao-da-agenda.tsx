"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAcesso, useTenant } from "@/lib/tenant-context";
import { patchTenant } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { toISODate } from "@/lib/format";

/**
 * O barbeiro decide até quando os clientes podem marcar (pedido de 28/09).
 *
 * Avulso: agenda liberada por período — "aberta até 13/10", e um toque em
 * "Liberar os próximos 15 dias" empurra a data. Mensalista: enxerga mais à
 * frente, pelos dias que o barbeiro definir (vantagem do plano). Fechar ou
 * abrir um dia específico continua em Ajustes › Horários — o atalho fica aqui.
 *
 * A regra que usa estes campos é `limiteDoCliente` (web e servidor); o
 * servidor recusa marcar depois do limite, então o que aparece aqui é o que
 * vale de verdade.
 */
const BLOCO_DIAS = 15;
const PADRAO_MENSALISTA = 60;

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}

const dataCurta = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });

export function LiberacaoDaAgenda() {
  const tenant = useTenant();
  const { podeEditar } = useAcesso();
  const hoje = toISODate(new Date());
  const abertaAte = tenant.policies.janela?.abertaAte ?? null;
  const diasMensalista = tenant.policies.janela?.diasMensalista ?? PADRAO_MENSALISTA;
  const [rascunhoMensalista, setRascunhoMensalista] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gravar(campos: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    const r = await soAvisaSeGravou({ gravar: () => patchTenant(tenant.id, campos) });
    setSalvando(false);
    if (!r.ok) setErro(r.erro);
    return r.ok;
  }

  const base = abertaAte && abertaAte > hoje ? abertaAte : hoje;
  const proximo = somarDias(base, BLOCO_DIAS);
  const vencida = !!abertaAte && abertaAte < hoje;

  return (
    <Card className="flex flex-col gap-2 px-3 py-2">
      {/* Uma linha só (guia do dono, 09/10): o aviso não pode competir com a
          agenda. O que se usa toda quinzena fica à vista; o resto, atrás de
          "Ajustar". */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarCheck2 size={16} className="shrink-0 text-ink-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-[13px] text-ink-muted">
          {abertaAte ? (
            <>
              Avulsos marcam até{" "}
              <span className={"font-semibold " + (vencida ? "text-danger" : "text-ink")}>{dataCurta(abertaAte)}</span>
              {vencida && " — fechada até você liberar"}
            </>
          ) : (
            <>
              Avulsos marcam até <span className="font-semibold text-ink">60 dias</span> à frente · sem liberação definida
            </>
          )}
        </p>
        {podeEditar && (
          <button
            type="button"
            disabled={salvando}
            onClick={() => void gravar({ "policies.janela.abertaAte": proximo })}
            className="rounded-controle px-2 py-1 text-[13px] font-semibold text-gold-strong transition-colors hover:bg-gold/10 disabled:opacity-50"
          >
            Liberar até {dataCurta(proximo)}
          </button>
        )}
      </div>

      {podeEditar && (
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer select-none py-0.5 hover:text-ink">Ajustar</summary>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <p className="w-full text-xs text-ink-muted">
              Mensalistas marcam até {diasMensalista} dias à frente. Você e o balcão marcam em qualquer data.
            </p>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Outra data
              <input
                type="date"
                min={hoje}
                value={abertaAte ?? ""}
                disabled={salvando}
                onChange={(e) => e.target.value && void gravar({ "policies.janela.abertaAte": e.target.value })}
                className="rounded-controle border border-border px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink-muted">
              Mensalistas:
              <input
                type="number"
                min={1}
                max={365}
                value={rascunhoMensalista ?? String(diasMensalista)}
                disabled={salvando}
                onChange={(e) => setRascunhoMensalista(e.target.value)}
                onBlur={async () => {
                  const n = Math.round(Number(rascunhoMensalista));
                  if (rascunhoMensalista === null || !Number.isFinite(n) || n < 1 || n > 365 || n === diasMensalista) {
                    setRascunhoMensalista(null);
                    return;
                  }
                  if (await gravar({ "policies.janela.diasMensalista": n })) setRascunhoMensalista(null);
                }}
                className="w-16 rounded-controle border border-border px-2 py-1.5 text-sm text-ink"
              />
              dias
            </label>
            <Link href="/painel/horarios" className="text-xs text-ink-muted underline-offset-2 hover:text-ink hover:underline">
              Fechar ou abrir um dia específico →
            </Link>
          </div>
        </details>
      )}
      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
    </Card>
  );
}
