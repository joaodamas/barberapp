"use client";

import Link from "next/link";
import { Lock, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAcesso } from "@/lib/tenant-context";

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
 */
export function BloqueioPlano({
  titulo,
  descricao,
}: {
  titulo: string;
  descricao: string;
}) {
  const acesso = useAcesso();
  const daConta = acesso.motivo !== null;

  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center md:py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-light">
        {daConta ? <Lock size={22} aria-hidden /> : <TrendingUp size={22} aria-hidden />}
      </div>
      <div className="max-w-md">
        <p className="text-base font-medium text-ivory">
          {daConta
            ? acesso.motivo === "trial_vencido"
              ? "Seu teste terminou"
              : "Sua conta está suspensa"
            : titulo}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-ivory-muted">
          {daConta
            ? "Nada foi apagado — sua agenda, seus clientes e seu financeiro continuam salvos, e seus clientes continuam agendando pelo link. Escolhendo um plano, tudo volta na hora."
            : descricao}
        </p>
      </div>
      <Link href="/painel/plano">
        <Button>{daConta ? "Escolher um plano" : "Ver planos"}</Button>
      </Link>
    </Card>
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
      <Link href="/painel/plano" className="font-semibold text-gold-light underline underline-offset-2">
        Escolher um plano
      </Link>
    </div>
  );
}
