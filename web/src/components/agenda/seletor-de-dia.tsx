"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { contar } from "@/lib/plural";
import { toISODate } from "@/lib/format";

function somarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** "qui., 25/09" — a data curta que cabe no botão. */
function dataCurta(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Anda a agenda um dia por vez, ou salta para qualquer data pelo calendário
 * do próprio aparelho. Compartilhado pela Agenda e pelo Hoje.
 *
 * Largura FIXA em todos os estados: o botão "Hoje" fica sempre no lugar (esmaecido
 * quando já é hoje) e o rótulo do meio tem largura própria. Antes o "Hoje"
 * aparecia só em outros dias e empurrava o que vinha ao lado — o filtro de
 * barbeiro mudava de posição debaixo do cursor.
 */
export function SeletorDeDia({
  dia,
  hoje,
  total,
  aoMudar,
}: {
  dia: string;
  hoje: string;
  total: number | null;
  aoMudar: (dia: string) => void;
}) {
  const nome =
    dia === hoje
      ? "Hoje"
      : dia === somarDias(hoje, 1)
        ? "Amanhã"
        : dia === somarDias(hoje, -1)
          ? "Ontem"
          : null;
  const botao =
    "flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-controle border border-border bg-surface text-ink-muted transition-colors duration-150 hover:border-gold hover:text-gold-strong";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
      <button type="button" onClick={() => aoMudar(somarDias(dia, -1))} aria-label="Dia anterior" className={botao}>
        <ChevronLeft size={18} />
      </button>
      {/* O input de data cobre o rótulo inteiro, invisível: o toque abre o
          calendário nativo — no celular é a roda de datas que o dono já conhece. */}
      <label className="relative flex h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-controle border border-border bg-surface px-2 text-sm text-ink sm:w-[16rem] sm:flex-none">
        <span className="truncate font-medium">{nome ?? dataCurta(dia)}</span>
        {nome && <span className="text-ink-muted">{dataCurta(dia)}</span>}
        {total !== null && (
          <span className="hidden truncate text-xs text-ink-muted sm:inline">
            · {contar(total, "horário", "horários")}
          </span>
        )}
        <input
          type="date"
          value={dia}
          onChange={(e) => e.target.value && aoMudar(e.target.value)}
          aria-label="Escolher o dia da agenda"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button type="button" onClick={() => aoMudar(somarDias(dia, 1))} aria-label="Próximo dia" className={botao}>
        <ChevronRight size={18} />
      </button>
      <button
        type="button"
        onClick={() => aoMudar(hoje)}
        disabled={dia === hoje}
        className="flex h-10 w-14 shrink-0 items-center justify-center rounded-controle bg-gold/15 text-sm font-medium text-gold-strong transition-opacity duration-150 enabled:cursor-pointer disabled:opacity-40"
      >
        Hoje
      </button>
    </div>
  );
}
