"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PassoHorarios } from "@/components/comecar/passo-horarios";
import { ExcecoesDeAgenda } from "@/components/excecoes-de-agenda";
import { useTenant } from "@/lib/tenant-context";
import { patchTenant } from "@/lib/db/repository";
import { useServices, useStaff, useSubscribers } from "@/lib/db/use-shop-data";
import { useShopCollection } from "@/lib/db/use-collection";
import { aplicarCombos } from "@/lib/combos";
import { impactoDaJornada } from "@/lib/impacto-da-jornada";
import { capacidadeDaData, type EntradaDeJornada } from "@/lib/jornada";
import { toISODate } from "@/lib/format";
import { contar, plural } from "@/lib/plural";
import type { BookingDoc } from "@/lib/domain";

/**
 * A jornada da barbearia — quando ela abre, e de quanto em quanto tempo.
 *
 * ## Por que esta tela nasce agora
 *
 * O modelo (`TenantSchedule`) existia desde a fundação, o onboarding tinha o
 * passo `"horarios"` e o componente estava pronto — mas **nenhuma tela do
 * painel escrevia `schedule`**. Depois que o dono concluía o onboarding, a
 * jornada virava imutável: toda barbearia ficava presa em seg–sáb, 09:00–19:00,
 * almoço 12:00–14:00 e horários de 30 em 30.
 *
 * Encontrado no E2E de 20/08, e é 🔴 de operação: uma barbearia que abre às 10h,
 * fecha às 20h ou folga na segunda **oferece ao cliente horários que não
 * atende**. E a ocupação passa a ser calculada sobre uma capacidade que não é a
 * dela.
 *
 * ## Por que reaproveita o componente do onboarding
 *
 * É a mesma pergunta, feita duas vezes na vida da barbearia. Duplicar a tela
 * criaria duas fontes para a mesma regra — o defeito que este repositório mais
 * corrigiu. Só o rótulo do botão muda: lá o dono avança, aqui ele salva e fica.
 */
export default function HorariosPage() {
  const tenant = useTenant();
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = toISODate(new Date());

  /* Quem já marcou, para avisar ANTES de salvar uma jornada que os deixa fora
   * do expediente (09/10) — o mesmo padrão das exceções de agenda. Só as datas
   * de hoje em diante: o passado não tem o que avisar. */
  const { items: futuras } = useShopCollection<BookingDoc>("bookings", {
    range: { field: "date", from: hoje },
  });
  const { items: mensalistas } = useSubscribers();
  const { items: servicos } = useServices();
  const { items: equipe } = useStaff();
  const [pendente, setPendente] = useState<{
    dados: Record<string, unknown>;
    reservas: number;
    fixos: number;
  } | null>(null);

  /** A jornada como ficaria depois de gravar `dados` (caminhos pontilhados). */
  function jornadaComo(dados: Record<string, unknown>): EntradaDeJornada {
    const atual = tenant.schedule;
    return {
      weekdays: (dados["schedule.weekdays"] as number[] | undefined) ?? atual.weekdays,
      opensAt: (dados["schedule.opensAt"] as string | undefined) ?? atual.opensAt,
      closesAt: (dados["schedule.closesAt"] as string | undefined) ?? atual.closesAt,
      slotMinutes: (dados["schedule.slotMinutes"] as number | undefined) ?? atual.slotMinutes,
      breaks: (dados["schedule.breaks"] as EntradaDeJornada["breaks"] | undefined) ?? atual.breaks,
      perDay: (dados["schedule.perDay"] as EntradaDeJornada["perDay"] | undefined) ?? atual.perDay,
      exceptions: atual.exceptions,
    };
  }

  function pedirParaSalvar(dados: Record<string, unknown>) {
    const comJornadaPropria = new Set(equipe.filter((s) => s.schedule).map((s) => s.id));
    const { reservas, fixos } = impactoDaJornada({
      antes: tenant.schedule,
      depois: jornadaComo(dados),
      hoje,
      temJornadaPropria: (id) => !!id && comJornadaPropria.has(id),
      reservas: futuras,
      fixos: mensalistas
        .filter((m) => m.status === "ativo" && m.horarioFixo)
        .map((m) => ({
          staffId: m.horarioFixo!.staffId,
          diaDaSemana: m.horarioFixo!.diaDaSemana,
          hora: m.horarioFixo!.hora,
          duracao: aplicarCombos(m.horarioFixo!.serviceIds, servicos.map((s) => ({ ...s, id: s.id }))).duracao,
        })),
    });
    if (reservas + fixos > 0) {
      setPendente({ dados, reservas, fixos });
      return;
    }
    void salvar(dados);
  }

  const horariosDeHoje = capacidadeDaData({
    schedule: tenant.schedule,
    weekday: new Date().getDay(),
    date: hoje,
  });
  const diasAbertos = tenant.schedule.weekdays.length;
  const diasComHorarioProprio = Object.keys(tenant.schedule.perDay ?? {}).filter((d) =>
    tenant.schedule.weekdays.includes(Number(d))
  ).length;

  async function salvar(dados: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      /* Caminhos pontilhados, como o resto do painel: o componente já os emite
       * assim. Gravar `schedule` inteiro daqui apagaria qualquer campo que ele
       * não exiba — hoje não há nenhum, e é justamente por isso que não vale
       * criar o precedente. */
      await patchTenant(tenant.id, dados);
      setSalvo(true);
    } catch (e) {
      console.error("[horarios] falha ao salvar a jornada", e);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">Quando você abre</p>
        <h1 className="font-display text-3xl text-ink md:text-4xl">Horários</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          É esta grade que o cliente vê no app. Horário que não está aqui não
          aparece para ele — e não entra na conta de ocupação do dia.
        </p>
      </header>

      <Card className="flex flex-col gap-6">
        {/* `key` amarrada à fonte: o formulário guarda o estado em `useState`, e
            sem isto ele continuaria exibindo a jornada do primeiro render
            depois que o snapshot ao vivo chegasse — o mesmo defeito que
            `configuracoes/page.tsx` documenta e resolve com rascunho nulo. */}
        <PassoHorarios
          key={JSON.stringify(tenant.schedule)}
          tenant={tenant}
          onSubmit={pedirParaSalvar}
          saving={salvando}
          rotuloAcao="Salvar horários"
        />

        <Modal
          open={!!pendente}
          onClose={() => setPendente(null)}
          title="Isto deixa gente fora do expediente"
        >
          {pendente && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                Com esta jornada,{" "}
                {[
                  pendente.reservas > 0 && contar(pendente.reservas, "horário já marcado", "horários já marcados"),
                  pendente.fixos > 0 && contar(pendente.fixos, "horário fixo", "horários fixos"),
                ]
                  .filter(Boolean)
                  .join(" e ")}{" "}
                {pendente.reservas + pendente.fixos === 1 ? "fica" : "ficam"} fora do expediente.
              </p>
              <p className="text-xs text-ink-muted">
                Mudar a jornada <strong>não cancela</strong> nem remarca ninguém: quem já marcou continua com o
                horário de pé. Ajuste na agenda o que você não vai atender.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setPendente(null)}>
                  Voltar
                </Button>
                <Button
                  onClick={() => {
                    const dados = pendente.dados;
                    setPendente(null);
                    void salvar(dados);
                  }}
                >
                  Salvar mesmo assim
                </Button>
              </div>
            </div>
          )}
        </Modal>

        {erro && <p className="text-sm text-danger">{erro}</p>}
        {salvo && !erro && (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check className="size-4" aria-hidden />
            Salvo. A agenda e o app do cliente já seguem esta grade.
          </p>
        )}
        {salvando && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Salvando…
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h2 className="font-display text-xl text-ink">Dias fechados e horários especiais</h2>
          <p className="max-w-2xl text-sm text-ink-muted">
            Um dia só, sem mexer na semana: feriado, viagem, o compromisso que
            apareceu. Se o horário diferente se repete toda semana, use{" "}
            <em>&ldquo;algum dia fecha em horário diferente?&rdquo;</em> ali em cima.
          </p>
        </header>
        <ExcecoesDeAgenda />
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">O que está valendo agora</p>
        <p className="text-sm text-ink-muted">
          {contar(diasAbertos, "dia", "dias")} por semana ·{" "}
          {tenant.schedule.slotMinutes} min por horário ·{" "}
          <span className="text-ink">{horariosDeHoje}</span>{" "}
          {plural(horariosDeHoje, "horário", "horários")} por barbeiro <strong>hoje</strong>.
          {diasComHorarioProprio > 0 && (
            <>
              {" "}
              {contar(diasComHorarioProprio, "dia tem", "dias têm")} horário próprio.
            </>
          )}
        </p>
        <p className="text-xs text-ink-muted">
          Serviço mais curto que o intervalo continua ocupando o horário inteiro:
          um corte de 15 min numa grade de 30 gasta meia hora de cadeira.
        </p>
      </Card>
    </div>
  );
}
