"use client";

import { Card } from "@/components/ui/card";
import { PassoCompartilhar } from "@/components/comecar/passo-compartilhar";
import { useTenant } from "@/lib/tenant-context";

/**
 * O link da barbearia — onde o dono vem buscar quando precisa divulgar.
 *
 * ## Por que esta tela nasce
 *
 * O material de divulgação existia inteiro — link, mensagem pronta, botão de
 * WhatsApp e QR para imprimir — **e só no onboarding**. Depois de concluído, o
 * dono não tinha onde reencontrá-lo.
 *
 * O produto ainda piorava a situação: o estado vazio da agenda diz *"compartilhe
 * seu link para receber agendamentos pelo app"* — **manda compartilhar e não dá
 * o link**. Instrução sem caminho é pior que silêncio, porque ensina o dono a
 * procurar uma coisa que não existe.
 *
 * É a mesma classe do que aconteceu com `/painel/horarios`: um passo do
 * onboarding que morria depois dele. E aqui o custo é maior — o próprio
 * componente registra que *"quem não compartilha o link não recebe agendamento,
 * não vê valor e cancela"*.
 *
 * Reaproveita o componente em vez de duplicar: é o mesmo material, e duas fontes
 * significariam duas mensagens diferentes indo para os clientes da barbearia.
 */
export default function MeuLinkPage() {
  const tenant = useTenant();

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ivory-muted">Divulgação</p>
        <h1 className="font-display text-3xl text-ivory md:text-4xl">Meu link</h1>
        <p className="max-w-2xl text-sm text-ivory-muted">
          É por aqui que seu cliente marca sozinho, vê os horários livres e
          escolhe o que der certo — sem te chamar no WhatsApp para perguntar.
        </p>
      </header>

      <Card>
        <PassoCompartilhar tenant={tenant} />
      </Card>
    </div>
  );
}
