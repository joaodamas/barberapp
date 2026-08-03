"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { subscribeToCollection, putDoc, removeDoc } from "@/lib/db/repository";
import type { Tenant } from "@/lib/tenant";

type Servico = { id: string; name: string; durationMin: number; price: number };

/**
 * Partir de uma tabela vazia com "Adicionar serviço" gera abandono. O cadastro
 * já semeia quatro linhas com preço zerado — vira uma tarefa de 90 segundos.
 */
export function PassoServicos({
  tenant,
  onSubmit,
  saving,
}: {
  tenant: Tenant;
  onSubmit: (data?: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(
    () =>
      subscribeToCollection<Omit<Servico, "id">>(tenant.id, "services", {
        onData: (items) => {
          setServicos(items as Servico[]);
          setCarregando(false);
        },
        onError: () => setCarregando(false),
      }),
    [tenant.id]
  );

  const validos = servicos.filter((s) => s.name.trim() && s.durationMin > 0 && s.price > 0);

  function atualizar(id: string, campo: keyof Servico, valor: string) {
    setServicos((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, [campo]: campo === "name" ? valor : Math.max(0, Number(valor) || 0) }
          : s
      )
    );
  }

  async function salvarLinha(servico: Servico) {
    if (!servico.name.trim()) return;
    await putDoc(tenant.id, "services", servico.id, {
      name: servico.name.trim(),
      durationMin: servico.durationMin,
      price: servico.price,
      active: true,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden gap-3 px-1 text-xs uppercase tracking-wide text-ivory-muted md:grid md:grid-cols-[1fr_110px_120px_44px]">
        <span>Serviço</span>
        <span>Duração</span>
        <span>Preço</span>
        <span />
      </div>

      {carregando && (
        <div className="h-11 animate-pulse rounded-xl bg-surface-raised" />
      )}

      {servicos.map((s) => (
        <div key={s.id} className="grid gap-2 md:grid-cols-[1fr_110px_120px_44px] md:items-center">
          <input
            aria-label="Nome do serviço"
            value={s.name}
            onChange={(e) => atualizar(s.id, "name", e.target.value)}
            onBlur={() => salvarLinha(s)}
            placeholder="Corte"
            className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
          />
          <div className="flex items-center gap-2">
            <input
              aria-label="Duração em minutos"
              type="number"
              min={5}
              step={5}
              value={s.durationMin}
              onChange={(e) => atualizar(s.id, "durationMin", e.target.value)}
              onBlur={() => salvarLinha(s)}
              className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
            />
            <span className="text-xs text-ivory-muted md:hidden">min</span>
          </div>
          <input
            aria-label="Preço"
            type="number"
            min={0}
            step="0.01"
            value={s.price || ""}
            onChange={(e) => atualizar(s.id, "price", e.target.value)}
            onBlur={() => salvarLinha(s)}
            placeholder="0,00"
            className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
          />
          <button
            type="button"
            aria-label={`Remover ${s.name}`}
            onClick={() => removeDoc(tenant.id, "services", s.id)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ivory-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() =>
          putDoc(tenant.id, "services", `serv_${Date.now()}`, {
            name: "",
            durationMin: 30,
            price: 0,
            active: true,
          })
        }
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ivory-muted transition-colors hover:border-gold/50 hover:text-ivory"
      >
        <Plus size={16} /> Adicionar serviço
      </button>

      <div className="rounded-xl border border-border bg-surface-raised/60 p-4 text-xs text-ivory-muted">
        <p className="mb-1 font-medium text-ivory">Como preencher</p>
        <p>
          <strong className="text-ivory">Nome:</strong> como você chama no dia a dia. &quot;Corte +
          barba&quot; funciona melhor que &quot;Combo Premium&quot;.
        </p>
        <p>
          <strong className="text-ivory">Duração:</strong> quanto tempo você realmente leva,
          incluindo a conversa. A agenda usa isso para não marcar dois clientes em cima.
        </p>
      </div>

      <Button
        onClick={() => onSubmit()}
        disabled={validos.length === 0 || saving}
        title={validos.length === 0 ? "Preencha ao menos um serviço com preço" : undefined}
      >
        {saving
          ? "Salvando…"
          : validos.length === 0
            ? "Preencha ao menos um serviço"
            : `Continuar com ${validos.length} serviço(s) · ${formatBRL(
                validos.reduce((s, x) => s + x.price, 0) / validos.length
              )} em média`}
      </Button>
    </div>
  );
}
