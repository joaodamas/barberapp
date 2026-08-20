"use client";

import { Lock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";
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

      {/* Era a TERCEIRA cópia da mesma composição — círculo, título, descrição,
          ação — com respiro e largura próprios que ninguém decidiu. Adotada na
          integração: "não há nada aqui", "seu teste terminou" e "isso não está
          no seu plano" agora chegam com o mesmo peso visual. */}
      <EstadoCentral
        icon={Lock}
        titulo={`${titulo} não está no seu plano`}
        descricao={
          <>
            {oQueFaz}
            <span className="mt-1.5 block">{porQueVale}</span>
          </>
        }
        acao={
          hasPlatformContact() ? (
            <a href={platformWhatsappUrl(mensagem)} target="_blank" rel="noopener noreferrer">
              <Button>
                <MessageCircle size={16} />
                Falar sobre liberar
              </Button>
            </a>
          ) : (
            /* Sem número configurado o botão não aparece: um controle que não
               faz nada é pior que a ausência dele. */
            <p className="max-w-md text-xs text-ivory-muted">
              Fale com quem cuida da sua conta na plataforma para liberar.
            </p>
          )
        }
      />
    </div>
  );
}
