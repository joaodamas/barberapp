"use client";

import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLoyalty } from "@/lib/db/use-shop-data";
import { useTenant } from "@/lib/tenant-context";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";

/**
 * Carimbos do cliente e o resgate — registrado por quem ENTREGA a recompensa.
 *
 * O resgate era um botão no app do cliente: zerava o saldo dele e nada chegava
 * ao dono, que cobrava o corte inteiro. Um resgate que só um dos lados enxerga
 * não aconteceu (rodada E2E de 23/09). Aqui é o balcão que registra, no
 * momento em que dá o corte — e funciona também para o cliente de balcão, que
 * não tem conta e antes nunca conseguia resgatar.
 */
export function FidelidadeNaFicha({ clientId }: { clientId: string }) {
  const tenant = useTenant();
  const fidelidade = useLoyalty(clientId);
  const [registrando, setRegistrando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!fidelidade.ativo) return null;

  async function registrar() {
    setRegistrando(true);
    setErro(null);
    const r = await soAvisaSeGravou({
      gravar: async () => {
        const { callFunction } = await import("@/lib/firebase");
        await callFunction("redeemLoyaltyReward", { barbershopId: tenant.id, clientId });
      },
      /* O saldo novo chega pelo listener; fechar a confirmação é o aviso. */
      avisar: () => setConfirmando(false),
    });
    setRegistrando(false);
    if (!r.ok) setErro(r.erro);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-muted">
          <Gift size={12} className="text-gold-strong" /> Fidelidade
        </p>
        <p className="text-sm text-ink">
          {fidelidade.stamps} de {fidelidade.goal} carimbos
        </p>
      </div>

      {fidelidade.podeResgatar &&
        (confirmando ? (
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs text-ink">
              Registrar que o cliente recebeu <strong>{fidelidade.reward}</strong> agora? Os{" "}
              {fidelidade.goal} carimbos saem do saldo.
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={registrando}>
                Voltar
              </Button>
              <Button onClick={registrar} disabled={registrando}>
                {registrando ? <Loader2 size={14} className="animate-spin" /> : null}
                Confirmar resgate
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" className="mt-2 w-full" onClick={() => setConfirmando(true)}>
            Registrar resgate · {fidelidade.reward}
          </Button>
        ))}

      {erro && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
