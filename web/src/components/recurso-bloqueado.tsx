"use client";

import { Lock, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { hasPlatformContact, platformWhatsappUrl } from "@/lib/platform";

/**
 * Tela de recurso que o plano contratado não inclui.
 *
 * `useFeature` existia e nenhuma tela o chamava: o gate de plano era gravado no
 * documento da barbearia e nunca lido, então todo cliente enxergava o plano de
 * cima — inclusive quem pagasse o de entrada. Este componente é o outro lado
 * desse fio.
 *
 * Mostra em vez de esconder. Item some do menu não vende nada; a tela bloqueada
 * é onde o dono descobre que existe algo a mais e pede. Enquanto não há
 * checkout de assinatura, a contratação passa pelo WhatsApp comercial — e sem
 * o número configurado o botão não aparece, porque um controle que não faz
 * nada é pior que a ausência dele.
 */
export function RecursoBloqueado({
  titulo,
  oQueFaz,
  porQueVale,
}: {
  /** Nome do recurso, como o dono o chamaria. */
  titulo: string;
  /** O que a tela entrega, em uma frase concreta. */
  oQueFaz: string;
  /** O ganho, em termos de operação — não de funcionalidade. */
  porQueVale: string;
}) {
  const tenant = useTenant();

  const mensagem =
    `Olá! Sou dono da ${tenant.brand.name} e quero liberar "${titulo}" no meu plano.`;

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Plano</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">{titulo}</h1>
      </div>

      <Card className="flex flex-col items-center gap-4 py-12 text-center md:py-16">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-light">
          <Lock size={22} aria-hidden />
        </div>

        <div className="flex max-w-md flex-col gap-2">
          <p className="text-sm font-medium text-ivory md:text-base">
            {titulo} não está no seu plano
          </p>
          <p className="text-xs text-ivory-muted md:text-sm">{oQueFaz}</p>
          <p className="text-xs text-ivory-muted md:text-sm">{porQueVale}</p>
        </div>

        {hasPlatformContact() ? (
          <a href={platformWhatsappUrl(mensagem)} target="_blank" rel="noopener noreferrer">
            <Button>
              <MessageCircle size={16} />
              Falar sobre liberar
            </Button>
          </a>
        ) : (
          <p className="max-w-md text-xs text-ivory-muted">
            Fale com quem cuida da sua conta na plataforma para liberar.
          </p>
        )}
      </Card>
    </div>
  );
}
