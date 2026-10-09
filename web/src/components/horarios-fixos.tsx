"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { SemanasDoMensalista, ValorDoMensal } from "@/components/mensalista-acoes";
import { useTenant } from "@/lib/tenant-context";
import { useServices, useStaff, useSubscribers } from "@/lib/db/use-shop-data";
import { useShopCollection } from "@/lib/db/use-collection";
import { aplicarCombos } from "@/lib/combos";
import { contarLiberaveis, horasDoFixo, inicioDoFixo } from "@/lib/horas-do-fixo";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import type { Doc } from "@/lib/db/repository";
import type { BookingDoc, ConflitoHorarioFixoDoc, HorarioFixo, SubscriberDoc } from "@/lib/domain";

/**
 * Horário fixo dos mensalistas (29/09).
 *
 * Pedido do dono: "mensalistas precisam ficar fixos". Até aqui cada semana era
 * marcada à mão, e a vaga de sexta às 17h ficava livre para qualquer avulso na
 * semana seguinte. Aqui o dono diz o dia e a hora de cada um; o servidor guarda
 * as próximas 8 semanas e completa todo dia (`functions/src/horario-fixo.ts`).
 *
 * A confirmação mostra ANTES o que vai ser reservado e o que não cabe — o dono
 * não descobre o conflito na sexta, com o cliente na porta.
 */

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Ocorrencia = { data: string; resultado: string; motivo?: string; liberou?: number };

/** Uma data qualquer (a próxima) que cai no dia da semana — só para a conta da jornada. */
function proximaData(diaDaSemana: number, hoje = new Date()): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  while (d.getDay() !== diaDaSemana) d.setDate(d.getDate() + 1);
  return toISODate(d);
}

export function HorariosFixos() {
  const tenant = useTenant();
  const { items: assinaturas } = useSubscribers();
  const { items: servicos } = useServices();
  const { items: equipe } = useStaff();
  const { items: conflitos } = useShopCollection<ConflitoHorarioFixoDoc>("conflitosHorarioFixo", {
    orderByField: "date",
  });

  const ativas = useMemo(() => assinaturas.filter((a) => a.status === "ativo"), [assinaturas]);
  const barbeiros = useMemo(() => equipe.filter((s) => s.active !== false), [equipe]);
  const servicosVisiveis = useMemo(() => servicos.filter((s) => s.active !== false), [servicos]);

  const [editando, setEditando] = useState<Doc<SubscriberDoc> | null>(null);
  const [dia, setDia] = useState(5);
  const [hora, setHora] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [frequencia, setFrequencia] = useState<"semanal" | "quinzenal">("semanal");
  const [previa, setPrevia] = useState<Ocorrencia[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [noValor, setNoValor] = useState<Doc<SubscriberDoc> | null>(null);
  const [nasSemanas, setNasSemanas] = useState<Doc<SubscriberDoc> | null>(null);
  const [tirando, setTirando] = useState(false);

  /* "Semana sem reserva" é aviso de semana que ainda vem: a de ontem não tem
   * mais o que resolver, e sem este corte o aviso nunca saía da tela (09/10). */
  const hoje = toISODate(new Date());
  const conflitosAbertos = useMemo(() => conflitos.filter((c) => c.date >= hoje), [conflitos, hoje]);

  /* O que a remoção vai liberar, contado só com o modal de confirmação aberto. */
  const { items: doFixo, status: statusDoFixo } = useShopCollection<BookingDoc>("bookings", {
    equals: { horarioFixoId: editando?.id },
    enabled: tirando && !!editando,
  });
  const aLiberar = useMemo(() => contarLiberaveis(doFixo), [doFixo]);

  /* Só o que o servidor aceita: a jornada do BARBEIRO escolhido, a duração dos
   * serviços (combos incluídos) e o dia da semana sem as exceções de uma data. */
  const duracao = useMemo(
    () => aplicarCombos(serviceIds, servicos.map((s) => ({ ...s, id: s.id }))).duracao,
    [serviceIds, servicos]
  );
  const horas = useMemo(
    () =>
      horasDoFixo({
        schedule: tenant.schedule,
        barbeiro: barbeiros.find((b) => b.id === staffId),
        weekday: dia,
        date: proximaData(dia),
        duracao,
      }),
    [dia, tenant.schedule, barbeiros, staffId, duracao]
  );

  function abrir(a: Doc<SubscriberDoc>) {
    const h = a.horarioFixo;
    setEditando(a);
    setDia(h?.diaDaSemana ?? 5);
    setHora(h?.hora ?? "");
    setStaffId(h?.staffId ?? barbeiros[0]?.id ?? "");
    setServiceIds(h?.serviceIds ?? (servicosVisiveis[0] ? [servicosVisiveis[0].id] : []));
    setFrequencia(h?.frequencia ?? "semanal");
    setPrevia(null);
    setErro(null);
  }

  function montar(): HorarioFixo {
    /* Editar mantém a âncora gravada (09/10): refazê-la a cada salvamento
     * trocava a fase da quinzena e o cliente vinha duas vezes no mesmo mês.
     * Só um fixo novo, ou outro dia da semana, ganha âncora nova — e ela começa
     * no primeiro instante futuro, não no horário de hoje que já passou. */
    const gravado = editando?.horarioFixo;
    const inicio =
      gravado && gravado.diaDaSemana === dia && gravado.inicio
        ? gravado.inicio
        : inicioDoFixo({ diaDaSemana: dia, hora });
    return { diaDaSemana: dia, hora, staffId, serviceIds, frequencia, inicio };
  }

  async function chamar(horarioFixo: HorarioFixo | null, simular: boolean) {
    if (!editando) return null;
    const { callFunction } = await import("@/lib/firebase");
    return callFunction<
      { barbershopId: string; subscriptionId: string; horarioFixo: HorarioFixo | null; simular?: boolean },
      { ocorrencias: Ocorrencia[]; liberadas?: number }
    >("definirHorarioFixo", {
      barbershopId: tenant.id,
      subscriptionId: editando.id,
      horarioFixo,
      simular,
    });
  }

  async function verPrevia() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await chamar(montar(), true);
      setPrevia(r?.ocorrencias ?? []);
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível conferir as datas."));
    } finally {
      setSalvando(false);
    }
  }

  async function confirmar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await chamar(montar(), false);
      /* Reativada é semana reservada de novo: para quem lê, é o mesmo que criada. */
      const criadas =
        r?.ocorrencias.filter((o) => o.resultado === "criada" || o.resultado === "reativada").length ?? 0;
      const falhas = r?.ocorrencias.filter((o) => o.resultado === "conflito").length ?? 0;
      setAviso(
        `${editando?.name}: horário fixo salvo. ${contar(criadas, "semana reservada", "semanas reservadas")}` +
          (falhas ? `, ${contar(falhas, "com conflito", "com conflito")} para resolver.` : ".")
      );
      setEditando(null);
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível salvar."));
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await chamar(null, false);
      setAviso(
        `${editando?.name}: horário fixo removido. ${contar(r?.liberadas ?? 0, "horário liberado", "horários liberados")}.`
      );
      setTirando(false);
      setEditando(null);
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível remover."));
    } finally {
      setSalvando(false);
    }
  }

  /* A hora escolhida tem de existir na lista de agora: trocar barbeiro ou
   * serviço pode tirá-la (almoço, fim do expediente). */
  const podeSalvar = !!hora && horas.includes(hora) && !!staffId && serviceIds.length > 0;

  return (
    <Card className="flex flex-col gap-3 md:p-6">
      <div className="flex items-center gap-2">
        <CalendarClock size={18} className="text-gold-strong" />
        <h2 className="text-sm font-semibold text-ink">Horário fixo dos mensalistas</h2>
      </div>
      <p className="text-xs text-ink-muted">
        Defina o dia e a hora de cada mensalista. As próximas 8 semanas ficam reservadas para ele, e o
        sistema completa sozinho toda madrugada. Em &quot;Semanas&quot; você remarca ou pula uma semana sem mexer nas
        outras.
      </p>

      {aviso && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          {aviso}
        </p>
      )}

      {conflitosAbertos.length > 0 && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
          <p className="text-xs font-semibold text-danger">
            {contar(conflitosAbertos.length, "semana sem reserva", "semanas sem reserva")} — resolva na agenda
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-ink">
            {conflitosAbertos.slice(0, 6).map((c) => (
              <li key={c.id}>
                {c.clientName} · {formatDatePtBR(c.date)} às {c.time} — {c.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-border/60">
        {ativas.map((a) => {
          const h = a.horarioFixo;
          return (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{a.name}</p>
                <p className="text-xs text-ink-muted">
                  {a.planName} ·{" "}
                  <button
                    type="button"
                    onClick={() => setNoValor(a)}
                    className="underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    {formatBRL(Number(a.price) || 0)}/mês · editar
                  </button>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {h ? (
                  <Pill tone="gold">
                    {DIAS_CURTOS[h.diaDaSemana]} {h.hora}
                    {h.frequencia === "quinzenal" ? " · 15 dias" : ""}
                  </Pill>
                ) : (
                  <Pill tone="neutral">Sem horário fixo</Pill>
                )}
                {h && (
                  <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setNasSemanas(a)}>
                    Semanas
                  </Button>
                )}
                <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => abrir(a)}>
                  {h ? "Alterar" : "Definir"}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {noValor && <ValorDoMensal assinatura={noValor} onClose={() => setNoValor(null)} />}
      {nasSemanas && <SemanasDoMensalista assinatura={nasSemanas} onClose={() => setNasSemanas(null)} />}

      <Modal
        open={!!editando}
        onClose={() => setEditando(null)}
        title="Horário fixo"
        description={editando ? `${editando.name} · ${editando.planName}` : undefined}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Dia da semana
            <select
              id="hf-dia"
              value={dia}
              onChange={(e) => {
                setDia(Number(e.target.value));
                setHora("");
                setPrevia(null);
              }}
              className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink"
            >
              {DIAS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1 text-xs text-ink-muted">
            Horário
            {horas.length === 0 ? (
              <p className="text-danger">A barbearia não abre neste dia.</p>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {horas.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setHora(h);
                      setPrevia(null);
                    }}
                    className={
                      "min-h-10 rounded-lg border text-sm tabular-nums " +
                      (hora === h ? "border-gold bg-gold text-ink" : "border-border text-ink hover:border-gold/50")
                    }
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>

          {barbeiros.length > 1 && (
            <label className="flex flex-col gap-1 text-xs text-ink-muted">
              Barbeiro
              <select
                id="hf-barbeiro"
                value={staffId}
                onChange={(e) => {
                  setStaffId(e.target.value);
                  setPrevia(null);
                }}
                className="min-h-11 rounded-lg border border-border bg-surface px-3 text-sm text-ink"
              >
                {barbeiros.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-col gap-1 text-xs text-ink-muted">
            Serviço
            <div className="flex flex-wrap gap-1.5">
              {servicosVisiveis.map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setServiceIds((atual) => (on ? atual.filter((x) => x !== s.id) : [...atual, s.id]));
                      setPrevia(null);
                    }}
                    className={
                      "min-h-9 rounded-full border px-3 text-xs " +
                      (on ? "border-gold bg-gold/15 text-gold-strong" : "border-border text-ink")
                    }
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-1 self-start rounded-xl border border-border bg-surface p-1">
            {(["semanal", "quinzenal"] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={frequencia === f}
                onClick={() => {
                  setFrequencia(f);
                  setPrevia(null);
                }}
                className={
                  "min-h-9 rounded-lg px-3 text-xs font-medium " +
                  (frequencia === f ? "bg-gold text-ink" : "text-ink-muted")
                }
              >
                {f === "semanal" ? "Toda semana" : "A cada 15 dias"}
              </button>
            ))}
          </div>

          {previa && (
            <div className="rounded-lg border border-border bg-surface-raised p-3">
              <p className="text-xs font-semibold text-ink">Próximas datas</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                {previa.map((o) => (
                  <li key={o.data} className={o.resultado === "conflito" ? "text-danger" : "text-ink"}>
                    {formatDatePtBR(o.data)} às {hora} —{" "}
                    {o.resultado === "criada" || o.resultado === "reativada"
                      ? o.liberou
                        ? "será reservado, no lugar do horário de antes"
                        : "será reservado"
                      : o.resultado === "ja-existe"
                        ? "já reservado"
                        : o.resultado === "desmarcada"
                          ? "semana desmarcada, não volta sozinha"
                          : o.resultado === "cliente-ja-marcado"
                            ? "cliente já tem horário neste dia"
                            : o.motivo ?? "não cabe"}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            {editando?.horarioFixo ? (
              <Button variant="ghost" onClick={() => setTirando(true)} disabled={salvando}>
                Tirar horário fixo
              </Button>
            ) : (
              <span />
            )}
            {previa ? (
              <Button onClick={confirmar} disabled={!podeSalvar || salvando}>
                {salvando ? "Salvando…" : "Confirmar horário fixo"}
              </Button>
            ) : (
              <Button onClick={verPrevia} disabled={!podeSalvar || salvando}>
                {salvando ? "Conferindo…" : "Ver próximas datas"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={tirando && !!editando}
        onClose={() => !salvando && setTirando(false)}
        title="Tirar horário fixo?"
        description={editando ? `${editando.name} · ${editando.planName}` : undefined}
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink">
            {statusDoFixo === "carregando"
              ? "Conferindo os horários…"
              : statusDoFixo === "erro"
                ? "Não deu para conferir quantos horários serão liberados."
                : aLiberar > 0
                ? `${contar(aLiberar, "horário será liberado", "horários serão liberados")} na agenda.`
                : "Nenhum horário em aberto será liberado."}
          </p>
          <p className="text-xs text-ink-muted">
            As semanas já feitas, as canceladas e as que o cliente remarcou ficam como estão. Isto não é um
            cancelamento: não entra nos números do mês.
          </p>
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setTirando(false)} disabled={salvando}>
              Voltar
            </Button>
            <Button onClick={remover} disabled={salvando || statusDoFixo === "carregando"}>
              {salvando ? "Liberando…" : "Tirar horário fixo"}
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
