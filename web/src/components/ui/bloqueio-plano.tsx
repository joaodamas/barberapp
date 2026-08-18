"use client";

import { Lock, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";
import { hasPlatformContact, platformWhatsappUrl } from "@/lib/platform";
import { useAcesso, useTenant } from "@/lib/tenant-context";

/**
 * Porta de um recurso que depende do plano.
 *
 * O bloqueio VENDE em vez de só negar: quem chega numa tela fechada já quis
 * usá-la, e é o melhor momento que existe para explicar o que ela faz. Muro
 * cinza escrito "indisponível" desperdiça exatamente essa intenção.
 *
 * Duas situações diferentes, dois textos diferentes:
 * — trial vencido ou barbearia suspensa: o problema é a conta, não o plano;
 * — plano inferior: o recurso existe e está a um clique de distância.
 *
 * O botão cai no WhatsApp comercial, e não numa tela de planos: não existe
 * checkout de assinatura ainda, e a contratação é humana. Apontava para
 * `/painel/plano`, que nunca foi criada — o convite mais importante do produto
 * levava a um 404. (`/planos` é outra coisa: são os planos que a BARBEARIA
 * vende aos clientes dela.) Sem número configurado o botão não aparece: um
 * "Escolher um plano" que não abre nada é pior do que não existir.
 */
export function BloqueioPlano({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  const acesso = useAcesso();
  const tenant = useTenant();
  const daConta = acesso.motivo !== null;

  return (
    <EstadoCentral
      icon={daConta ? Lock : TrendingUp}
      titulo={
        daConta
          ? acesso.motivo === "trial_vencido"
            ? "Seu teste terminou"
            : "Sua conta está suspensa"
          : titulo
      }
      descricao={
        daConta
          ? "Nada foi apagado — sua agenda, seus clientes e seu financeiro continuam salvos, e seus clientes continuam agendando pelo link. Escolhendo um plano, tudo volta na hora."
          : descricao
      }
      acao={
        hasPlatformContact() ? (
          <a
            href={platformWhatsappUrl(
              daConta
                ? `Olá! Sou dono da ${tenant.brand.name} e quero contratar um plano para voltar a editar.`
                : `Olá! Sou dono da ${tenant.brand.name} e quero saber do plano que abre "${titulo}".`
            )}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button>{daConta ? "Escolher um plano" : "Ver planos"}</Button>
          </a>
        ) : undefined
      }
    />
  );
}

/**
 * Barra fixa de modo leitura.
 *
 * Fica no layout do painel, acima de tudo: sem ela o dono descobre que está em
 * leitura ao tentar salvar, e falha na hora de salvar é a pior hora de
 * descobrir qualquer coisa.
 */
export function AvisoModoLeitura() {
  const acesso = useAcesso();
  const tenant = useTenant();
  if (acesso.podeEditar) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-xs text-ivory md:text-sm"
    >
      <span>
        {acesso.motivo === "trial_vencido"
          ? "Seu teste de 7 dias terminou."
          : "Sua conta está suspensa."}{" "}
        Você continua vendo tudo, mas não consegue alterar. Seus clientes seguem
        agendando normalmente.
      </span>
      {hasPlatformContact() && (
        <a
          href={platformWhatsappUrl(
            `Olá! Sou dono da ${tenant.brand.name} e quero contratar um plano para voltar a editar.`
          )}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-gold-light underline underline-offset-2"
        >
          Escolher um plano
        </a>
      )}
    </div>
  );
}
