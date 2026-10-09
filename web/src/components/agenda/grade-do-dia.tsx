"use client";

import { jornadaDoDia, paraHora, paraMinutos, type EntradaDeJornada } from "@/lib/jornada";
import { OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { NivelDoEncaixe } from "@/lib/encaixe";
import { EtiquetaMensalista } from "@/components/agenda/etiqueta-mensalista";
import { EtiquetaEncaixe } from "@/components/agenda/etiqueta-encaixe";

/**
 * O dia inteiro em grade — pedido do dono (28/09): ver de relance o que está
 * livre, o que está ocupado e onde cada pedido de encaixe cairia, lado a lado.
 *
 * Linhas = horários da jornada (a grade da barbearia). Cada atendimento ocupa
 * as linhas do SEU tempo (um combo de 90 min ocupa três linhas de 30). Encaixe
 * aprovado que sobrepõe outro atendimento vai para uma segunda faixa, lado a
 * lado — é exatamente o aperto que ele representa. Pedidos ainda sem resposta
 * ficam na coluna da direita, na altura do horário pedido, com a sugestão.
 *
 * A grade só MOSTRA. Tocar num atendimento ou pedido seleciona, e as ações
 * aparecem logo abaixo (a tela reaproveita os cartões da lista).
 */

type Faixa = { booking: Doc<BookingDoc>; inicio: number; fim: number; faixa: number };

const ESTILO_DO_NIVEL: Record<NivelDoEncaixe, { rotulo: string; classe: string }> = {
  vagou: { rotulo: "Pode aprovar", classe: "border-success/50 bg-success/10 text-success" },
  cabe: { rotulo: "Dá para encaixar", classe: "border-success/50 bg-success/10 text-success" },
  apertado: { rotulo: "Apertado", classe: "border-gold/60 bg-gold/10 text-gold-strong" },
  "nao-recomendado": { rotulo: "Não recomendado", classe: "border-danger/50 bg-danger/10 text-danger" },
};

export function GradeDoDia({
  dia,
  reservas,
  pedidos,
  schedule,
  selecionadoId,
  aoSelecionar,
  aoMarcarLivre,
  podeEditar,
  mensalistas,
}: {
  /** Clientes com plano ativo (`useMensalistasAtivos`). */
  mensalistas?: Set<string>;
  dia: string;
  reservas: Doc<BookingDoc>[];
  pedidos: Array<{ booking: Doc<BookingDoc>; nivel: NivelDoEncaixe }>;
  schedule: EntradaDeJornada | null | undefined;
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
  aoMarcarLivre: () => void;
  podeEditar: boolean;
}) {
  const grade = Number(schedule?.slotMinutes) || 30;
  const jornada = jornadaDoDia({
    schedule,
    weekday: new Date(`${dia}T12:00:00`).getDay(),
    date: dia,
  });

  /* O começo e o fim da grade: a jornada do dia, esticada se houver
   * atendimento fora dela (o balcão pode lançar depois do expediente). */
  const ocupantes = reservas.filter((b) => OCCUPIES_SLOT.includes(b.status));
  const janelaDe = (b: Doc<BookingDoc>) => {
    const ini = paraMinutos(b.time) ?? 0;
    return [ini, ini + (Number(b.durationMin) || grade)] as const;
  };
  let abre = jornada.aberto ? paraMinutos(jornada.opensAt) ?? 540 : 540;
  let fecha = jornada.aberto ? paraMinutos(jornada.closesAt) ?? 1140 : 1140;
  for (const b of [...ocupantes, ...pedidos.map((p) => p.booking)]) {
    const [i, f] = janelaDe(b);
    abre = Math.min(abre, i - (i % grade));
    fecha = Math.max(fecha, f);
  }
  const linhas: number[] = [];
  for (let t = abre; t < fecha; t += grade) linhas.push(t);
  const linhaDe = (min: number) => Math.floor((min - abre) / grade) + 1;
  const pausas = jornada.aberto
    ? jornada.breaks.map((p) => [paraMinutos(p.from) ?? 0, paraMinutos(p.to) ?? 0] as const)
    : [];

  /* Faixas: a primeira que não colide. Encaixe aprovado por cima de outro
   * atendimento abre a segunda faixa. */
  const faixas: Faixa[] = [];
  for (const b of [...ocupantes].sort((x, y) => x.time.localeCompare(y.time))) {
    const [inicio, fim] = janelaDe(b);
    let faixa = 0;
    while (faixas.some((f) => f.faixa === faixa && f.inicio < fim && inicio < f.fim)) faixa++;
    faixas.push({ booking: b, inicio, fim, faixa });
  }
  const nFaixas = Math.max(1, ...faixas.map((f) => f.faixa + 1));
  const ocupado = (t: number) =>
    faixas.some((f) => f.inicio < t + grade && t < f.fim) ||
    pausas.some(([de, ate]) => de < t + grade && t < ate);
  const temPedidos = pedidos.length > 0;

  if (!jornada.aberto && ocupantes.length === 0 && !temPedidos) return null;

  const colunas = `3rem repeat(${nFaixas}, minmax(0, 1fr))${temPedidos ? " minmax(0, 0.9fr)" : ""}`;

  return (
    <div className="rounded-2xl border border-border bg-surface p-2">
      {temPedidos && (
        <div className="mb-1 grid gap-1 text-[11px] uppercase tracking-wide text-ink-muted" style={{ gridTemplateColumns: colunas }}>
          <span />
          <span style={{ gridColumn: `2 / span ${nFaixas}` }}>Agenda</span>
          <span>Pedidos de encaixe</span>
        </div>
      )}
      <div
        className="grid gap-x-1"
        style={{ gridTemplateColumns: colunas, gridTemplateRows: `repeat(${linhas.length}, minmax(2.75rem, auto))` }}
      >
        {linhas.map((t, i) => (
          <div
            key={`h${t}`}
            className="border-t border-border/60 pr-1 pt-0.5 text-right text-[11px] tabular-nums text-ink-muted"
            style={{ gridColumn: 1, gridRow: i + 1 }}
          >
            {paraHora(t)}
          </div>
        ))}

        {/* Livre e intervalo, só onde nenhuma faixa ocupa. */}
        {linhas.map((t, i) => {
          const pausa = pausas.some(([de, ate]) => de <= t && t < ate);
          /* Atendimento lançado dentro do intervalo (o balcão pode): o cartão
           * dele é o que importa ali — o rótulo "Intervalo" ficava por baixo. */
          const temAtendimento = faixas.some((f) => f.inicio < t + grade && t < f.fim);
          if (pausa && temAtendimento) return null;
          if (pausa) {
            return (
              <div
                key={`p${t}`}
                className="my-0.5 flex items-center rounded-lg bg-surface-raised px-2 text-[11px] text-ink-muted"
                style={{ gridColumn: `2 / span ${nFaixas}`, gridRow: i + 1 }}
              >
                Intervalo
              </div>
            );
          }
          if (ocupado(t)) return null;
          return podeEditar ? (
            <button
              key={`l${t}`}
              type="button"
              onClick={aoMarcarLivre}
              className="my-0.5 flex items-center rounded-lg border border-dashed border-border px-2 text-left text-[11px] text-ink-muted transition-colors hover:border-gold hover:text-gold-strong"
              style={{ gridColumn: `2 / span ${nFaixas}`, gridRow: i + 1 }}
            >
              Livre · marcar
            </button>
          ) : (
            <div
              key={`l${t}`}
              className="my-0.5 flex items-center rounded-lg border border-dashed border-border px-2 text-[11px] text-ink-muted"
              style={{ gridColumn: `2 / span ${nFaixas}`, gridRow: i + 1 }}
            >
              Livre
            </div>
          );
        })}

        {faixas.map(({ booking: b, inicio, fim, faixa }) => {
          const falta = b.status === "no_show";
          const feito = b.status === "completed";
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => aoSelecionar(b.id)}
              aria-pressed={selecionadoId === b.id}
              className={
                "my-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-lg border px-2 py-1 text-left transition-colors " +
                (selecionadoId === b.id ? "ring-2 ring-gold " : "") +
                (falta
                  ? "border-danger/40 bg-danger/5 text-ink-muted"
                  : feito
                    ? "border-success/40 bg-success/5 text-ink"
                    : b.isFitIn
                      ? "border-encaixe/50 border-l-4 border-l-encaixe bg-encaixe/5 text-ink"
                      : "border-gold/40 bg-gold/5 text-ink")
              }
              style={{ gridColumn: 2 + faixa, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
            >
              <span className="flex w-full min-w-0 items-center gap-1.5 text-xs font-semibold">
                <span className="truncate">
                  {paraHora(inicio)}–{paraHora(fim)} · {b.clientName}
                </span>
                {b.isFitIn && <EtiquetaEncaixe />}
                {mensalistas?.has(b.clientId) && <EtiquetaMensalista />}
              </span>
              <span className="w-full truncate text-[11px] text-ink-muted">
                {((b as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço"}
                {b.horarioFixoId ? " · horário fixo" : ""}
                {feito ? " · concluído" : falta ? " · não veio" : ""}
              </span>
            </button>
          );
        })}

        {pedidos.map(({ booking: b, nivel }) => {
          const [inicio, fim] = janelaDe(b);
          const estilo = ESTILO_DO_NIVEL[nivel];
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => aoSelecionar(b.id)}
              aria-pressed={selecionadoId === b.id}
              className={
                "my-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-lg border border-dashed px-2 py-1 text-left " +
                (selecionadoId === b.id ? "ring-2 ring-gold " : "") +
                estilo.classe
              }
              style={{ gridColumn: 2 + nFaixas, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
            >
              <span className="w-full truncate text-xs font-semibold text-ink">
                {paraHora(inicio)}–{paraHora(fim)} · {b.clientName}
              </span>
              <span className="text-[11px] font-medium">{estilo.rotulo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
