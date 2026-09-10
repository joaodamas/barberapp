"use client";

import { useState } from "react";
import { CalendarOff, Clock, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { useShopCollection } from "@/lib/db/use-collection";
import { patchTenant } from "@/lib/db/repository";
import { montarExcecao, podarExcecoes, type ExcecaoDeAgenda } from "@/lib/jornada";
import { formatDatePtBR, toISODate } from "@/lib/format";
import { OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import { contar } from "@/lib/plural";

/**
 * Dias fechados e horários especiais — a segunda metade do pedido do dono.
 *
 * > *"Mas se eu quiser travar um dia específico?"*
 *
 * O horário por dia da semana resolve o compromisso que se repete; isto
 * resolve o feriado, a viagem e o imprevisto — o que acontece uma vez e não
 * volta. São perguntas diferentes e por isso campos diferentes; a régua que
 * decide qual vence está em `lib/jornada.ts`, e não aqui.
 *
 * ## Fechar um dia NÃO cancela o que já está marcado
 *
 * É a decisão mais importante desta tela, e ela é deliberada. Cancelar em lote
 * moveria dinheiro (política de devolução), dispararia aviso a cada cliente e
 * seria irreversível — tudo isso escondido atrás de um clique cujo rótulo diz
 * apenas "fechar o dia". O que a tela faz é **mostrar o que existe** antes de
 * gravar, e nomear o que continua de pé. O dono decide o que fazer com cada
 * horário, um a um, na agenda.
 *
 * Silenciar isso seria pior que o problema: o cliente chegaria na porta
 * fechada com a reserva confirmada no celular.
 */
export function ExcecoesDeAgenda() {
  const tenant = useTenant();
  const hoje = toISODate(new Date());

  const [data, setData] = useState("");
  const [fecha, setFecha] = useState(true);
  const [opensAt, setOpensAt] = useState(tenant.schedule.opensAt);
  const [closesAt, setClosesAt] = useState(tenant.schedule.closesAt);
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Só consulta depois que há data escolhida: sem `enabled`, a tela abriria uma
   * assinatura da coleção inteira de reservas para não usar nenhuma. */
  const { items: reservasDoDia } = useShopCollection<Omit<BookingDoc, "id">>("bookings", {
    equals: data ? { date: data } : undefined,
    enabled: !!data,
  });

  const marcadas = data
    ? reservasDoDia.filter((b) => OCCUPIES_SLOT.includes(b.status)).length
    : 0;

  const excecoes = podarExcecoes(tenant.schedule.exceptions, hoje);
  const jaExiste = excecoes.some((e) => e.date === data);

  async function gravar(lista: ExcecaoDeAgenda[]) {
    setSalvando(true);
    setErro(null);
    try {
      /* Caminho pontilhado, como o resto do painel: gravar `schedule` inteiro
       * daqui apagaria `perDay` e a grade. */
      await patchTenant(tenant.id, { "schedule.exceptions": podarExcecoes(lista, hoje) });
      return true;
    } catch (e) {
      console.error("[horarios] falha ao salvar exceção", e);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function adicionar() {
    if (!data) return;
    /* `montarExcecao` e não um literal: `stripUndefined` do repositório é raso
     * e não entra em array, então um `note: undefined` aqui chegaria inteiro ao
     * Firestore — que recusa a escrita. O caso quebrado seria o mais comum de
     * todos: fechar um dia sem digitar motivo. */
    const nova = montarExcecao({
      date: data,
      fechado: fecha,
      opensAt,
      closesAt,
      nota,
    });

    /* A nova entra por último: `podarExcecoes` mantém a última de cada data, e
     * é assim que editar um dia já cadastrado sobrescreve em vez de duplicar. */
    const ok = await gravar([...excecoes, nova]);
    if (ok) {
      setData("");
      setNota("");
      setFecha(true);
    }
  }

  async function remover(date: string) {
    await gravar(excecoes.filter((e) => e.date !== date));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="excecao-data" className="text-sm font-medium text-ink">
              Que dia?
            </label>
            <input
              id="excecao-data"
              type="date"
              value={data}
              min={hoje}
              onChange={(e) => setData(e.target.value)}
              className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink"
            />
            {jaExiste && (
              <p className="text-xs text-ink-muted">
                Este dia já tem uma regra. Salvar substitui a que está lá.
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-ink">O que acontece nesse dia</legend>
            <div className="flex flex-col gap-2 pt-1">
              <Opcao
                nome="excecao-tipo"
                marcado={fecha}
                onChange={() => setFecha(true)}
                titulo="Não abro"
                ajuda="O dia some do app do cliente."
              />
              <Opcao
                nome="excecao-tipo"
                marcado={!fecha}
                onChange={() => setFecha(false)}
                titulo="Abro em horário diferente"
                ajuda="Vale só nesse dia; a semana continua como está."
              />
            </div>
          </fieldset>

          {!fecha && (
            <div className="grid grid-cols-2 gap-3">
              <Hora id="exc-abre" label="Abre" value={opensAt} onChange={setOpensAt} />
              <Hora id="exc-fecha" label="Fecha" value={closesAt} onChange={setClosesAt} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="excecao-nota" className="text-sm font-medium text-ink">
              Motivo <span className="font-normal text-ink-muted">(opcional)</span>
            </label>
            <input
              id="excecao-nota"
              type="text"
              value={nota}
              maxLength={60}
              placeholder="Feriado, compromisso, viagem…"
              onChange={(e) => setNota(e.target.value)}
              className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink placeholder:text-ink-muted/70"
            />
            <p className="text-xs text-ink-muted">
              Aparece só para você — o cliente vê apenas que não há horário.
            </p>
          </div>

          {/* O aviso vem ANTES de gravar, e nomeia o número. "Pode haver
              reservas" não faz ninguém conferir; "3 horários marcados" faz. */}
          {data && marcadas > 0 && (
            <p className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-ink">
              Já há {contar(marcadas, "horário marcado", "horários marcados")} nesse dia.
              Mudar o expediente <strong>não cancela</strong> nenhum deles — quem já marcou
              continua com o horário de pé. Cancele na agenda o que não vai atender.
            </p>
          )}

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <div>
            <Button onClick={() => void adicionar()} disabled={!data || salvando}>
              {salvando ? "Salvando…" : "Salvar este dia"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Dias já cadastrados
          </p>

          {excecoes.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-ink-muted">
              Nenhum por enquanto. O expediente segue a grade da semana todos os dias.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {excecoes.map((e) => (
                <li
                  key={e.date}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface-raised/60 px-4 py-3"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 text-ink-muted" aria-hidden>
                      {e.closed ? <CalendarOff size={16} /> : <Clock size={16} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{formatDatePtBR(e.date)}</p>
                      <p className="text-xs text-ink-muted">
                        {e.closed
                          ? "Fechado o dia todo"
                          : `Abre ${e.opensAt ?? tenant.schedule.opensAt}–${e.closesAt ?? tenant.schedule.closesAt}`}
                        {e.note ? ` · ${e.note}` : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void remover(e.date)}
                    disabled={salvando}
                    aria-label={`Remover a regra de ${formatDatePtBR(e.date)}`}
                    className="alvo-toque shrink-0 rounded-lg p-1.5 text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
                  >
                    {salvando ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 size={16} aria-hidden />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-ink-muted">
            Dias que já passaram saem da lista sozinhos depois de três meses.
          </p>
        </div>
      </div>
    </div>
  );
}

function Opcao({
  nome,
  marcado,
  onChange,
  titulo,
  ajuda,
}: {
  nome: string;
  marcado: boolean;
  onChange: () => void;
  titulo: string;
  ajuda: string;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors " +
        (marcado ? "border-gold bg-gold/10" : "border-border hover:border-gold/60")
      }
    >
      <input
        type="radio"
        name={nome}
        checked={marcado}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 accent-gold"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{titulo}</span>
        <span className="text-xs text-ink-muted">{ajuda}</span>
      </span>
    </label>
  );
}

function Hora({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ink"
      />
    </div>
  );
}
