"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useServices } from "@/lib/db/use-shop-data";
import { mensagemDoErro } from "@/lib/direitos-do-titular";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { aplicarCombos } from "@/lib/combos";

/**
 * "+ Adicionar serviço" no fechamento (pedido do dono, 01/10): o cliente
 * marcou corte e saiu com corte e barba. Quem soma é o servidor
 * (`adicionarServicosAoAtendimento`), com o preço do catálogo; a tela só
 * escolhe e mostra o total novo antes da forma de pagamento.
 */
export function AdicionarServico({
  barbershopId,
  bookingId,
  servicosAtuais,
  idsAtuais = [],
  valorAtual = 0,
  aoAdicionar,
}: {
  barbershopId: string;
  bookingId: string;
  servicosAtuais: string[];
  /** Ids atuais do atendimento — para mostrar o combo ANTES de somar. */
  idsAtuais?: string[];
  /** Valor atual, para dizer quanto muda. */
  valorAtual?: number;
  aoAdicionar: (novo: { value: number; serviceNames: string[]; serviceIds: string[] }) => void;
}) {
  useTenant();
  const { items: servicos } = useServices();
  const ativos = useMemo(() => servicos.filter((s) => s.active !== false), [servicos]);
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Mesma conta do servidor: com combo, Corte + Barba vira "Corte + barba". */
  const previa = aplicarCombos([...idsAtuais, ...escolhidos], servicos.map((s) => ({ ...s, id: s.id })));
  const extra = previa.valor - valorAtual;

  async function adicionar() {
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        { barbershopId: string; bookingId: string; serviceIds: string[] },
        { value: number; serviceNames: string[]; serviceIds: string[]; combos?: string[] }
      >("adicionarServicosAoAtendimento", { barbershopId, bookingId, serviceIds: escolhidos });
      aoAdicionar(r);
      setEscolhidos([]);
      setAberto(false);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (!aberto) {
    return (
      <div className="mb-4 -mt-2 flex flex-col gap-1">
        {servicosAtuais.length > 0 && (
          <p className="text-xs text-ink-muted">{servicosAtuais.join(" + ")}</p>
        )}
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="alvo-toque inline-flex cursor-pointer items-center gap-1 self-start text-sm font-medium text-gold-strong underline-offset-4 hover:underline"
        >
          <Plus size={14} /> Adicionar serviço
        </button>
      </div>
    );
  }

  return (
    <div className="mb-5 flex flex-col gap-3 rounded-xl border border-border bg-surface-raised px-3 py-3">
      <p className="text-xs text-ink-muted">O que mais ele fez? Toque para somar ao atendimento.</p>
      <div className="flex flex-wrap gap-1.5">
        {ativos.map((s) => {
          const vezes = escolhidos.filter((x) => x === s.id).length;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={vezes > 0}
              onClick={() => setEscolhidos((atual) => [...atual, s.id])}
              className={
                "min-h-9 rounded-full border px-3 text-xs " +
                (vezes > 0 ? "border-gold bg-gold/15 text-gold-strong" : "border-border text-ink")
              }
            >
              {s.name} · {formatBRL(Number(s.price) || 0)}
              {vezes > 1 ? ` ×${vezes}` : ""}
            </button>
          );
        })}
      </div>
      {escolhidos.length > 0 && (
        <p className="text-sm text-ink">
          Fica {formatBRL(previa.valor)} ({extra >= 0 ? "+" : "−"} {formatBRL(Math.abs(extra))})
          {previa.combos.length > 0 && <span className="text-ink-muted"> · combo {previa.combos.join(" + ")}</span>}{" "}
          <button
            type="button"
            onClick={() => setEscolhidos([])}
            className="ml-2 cursor-pointer text-xs text-ink-muted underline underline-offset-2"
          >
            limpar
          </button>
        </p>
      )}
      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={escolhidos.length === 0 || salvando} onClick={() => void adicionar()}>
          {salvando ? "Somando…" : "Somar ao atendimento"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={salvando}
          onClick={() => {
            setAberto(false);
            setEscolhidos([]);
          }}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
