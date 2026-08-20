"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PassoHorarios } from "@/components/comecar/passo-horarios";
import { useTenant } from "@/lib/tenant-context";
import { patchTenant } from "@/lib/db/repository";
import { capacidadeDiaria } from "@/lib/analytics";
import { contar } from "@/lib/plural";

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

  const horariosPorDia = capacidadeDiaria(tenant.schedule);
  const diasAbertos = tenant.schedule.weekdays.length;

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
        <p className="text-sm text-ivory-muted">Quando você abre</p>
        <h1 className="font-display text-3xl text-ivory md:text-4xl">Horários</h1>
        <p className="max-w-2xl text-sm text-ivory-muted">
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
          onSubmit={salvar}
          saving={salvando}
          rotuloAcao="Salvar horários"
        />

        {erro && <p className="text-sm text-danger">{erro}</p>}
        {salvo && !erro && (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check className="size-4" aria-hidden />
            Salvo. A agenda e o app do cliente já seguem esta grade.
          </p>
        )}
        {salvando && (
          <p className="flex items-center gap-2 text-sm text-ivory-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Salvando…
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ivory">O que está valendo agora</p>
        <p className="text-sm text-ivory-muted">
          {contar(diasAbertos, "dia", "dias")} por semana ·{" "}
          {tenant.schedule.opensAt}–{tenant.schedule.closesAt} ·{" "}
          {tenant.schedule.slotMinutes} min por horário ·{" "}
          <span className="text-ivory">{horariosPorDia}</span> horários por
          barbeiro, por dia.
        </p>
        <p className="text-xs text-ivory-muted">
          Serviço mais curto que o intervalo continua ocupando o horário inteiro:
          um corte de 15 min numa grade de 30 gasta meia hora de cadeira.
        </p>
      </Card>
    </div>
  );
}
