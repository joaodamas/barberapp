"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { PassoBarbearia } from "@/components/comecar/passo-barbearia";
import { PassoServicos } from "@/components/comecar/passo-servicos";
import { PassoHorarios } from "@/components/comecar/passo-horarios";
import { PassoCompartilhar } from "@/components/comecar/passo-compartilhar";
import { ONBOARDING_STEPS, nextOnboardingStep, type OnboardingStep } from "@/lib/tenant";

/**
 * Onboarding guiado.
 *
 * Quatro passos, e só quatro: são os que impedem a primeira reserva de
 * acontecer. Despesas, planos, produtos e políticas são pedidos dentro da
 * própria tela, quando o dono chegar lá — quem precisa lançar o aluguel antes
 * de conseguir receber um agendamento fecha a aba.
 *
 * Cada passo salva ao avançar: fechar o navegador e voltar retoma de onde
 * parou.
 */
const PASSOS: Record<OnboardingStep, { titulo: string; porque: string }> = {
  barbearia: {
    titulo: "Sua barbearia",
    porque: "É o que seus clientes veem quando abrem o link.",
  },
  servicos: {
    titulo: "Seus serviços",
    porque:
      "Sem isso o cliente não tem o que agendar. Comece com os 3 ou 4 mais pedidos — dá pra completar depois.",
  },
  horarios: {
    titulo: "Seus horários",
    porque: "É a partir daqui que a agenda monta os horários que o cliente pode escolher.",
  },
  compartilhar: {
    titulo: "Compartilhe seu link",
    porque: "Pronto. Agora é só mandar para seus clientes.",
  },
};

export default function ComecarPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const tenant = useTenant();

  const [step, setStep] = useState<OnboardingStep>(
    () => nextOnboardingStep(tenant.onboarding) ?? "barbearia"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const indice = ONBOARDING_STEPS.indexOf(step);
  const meta = PASSOS[step];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-8 w-8 animate-spin text-gold-light" />
      </div>
    );
  }

  if (!user) {
    router.replace("/login");
    return null;
  }

  async function concluirPasso(dados?: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("completeOnboardingStep", {
        barbershopId: tenant.id,
        step,
        data: dados,
      });

      if (indice === ONBOARDING_STEPS.length - 1) {
        // Recarrega para o servidor reler o tenant já configurado.
        window.location.href = "/painel";
        return;
      }
      setStep(ONBOARDING_STEPS[indice + 1]);
    } catch (err) {
      console.error("[onboarding]", err);
      setError("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 py-8 md:py-14">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <Image src={tenant.brand.logo} alt="" width={44} height={44} priority />
          <p className="text-xs uppercase tracking-wider text-ivory-muted">
            Passo {indice + 1} de {ONBOARDING_STEPS.length}
          </p>
          <h1 className="text-2xl text-ivory md:text-3xl">{meta.titulo}</h1>
          <p className="max-w-md text-sm text-ivory-muted">{meta.porque}</p>
        </header>

        <div className="flex gap-1.5" role="progressbar" aria-valuenow={indice + 1} aria-valuemin={1} aria-valuemax={4}>
          {ONBOARDING_STEPS.map((s, i) => (
            <span
              key={s}
              className={
                "h-1 flex-1 rounded-full " + (i <= indice ? "bg-gold" : "bg-surface-raised")
              }
            />
          ))}
        </div>

        <Card className="flex flex-col gap-5 md:p-7">
          {step === "barbearia" && <PassoBarbearia tenant={tenant} onSubmit={concluirPasso} saving={saving} />}
          {step === "servicos" && <PassoServicos tenant={tenant} onSubmit={concluirPasso} saving={saving} />}
          {step === "horarios" && <PassoHorarios tenant={tenant} onSubmit={concluirPasso} saving={saving} />}
          {step === "compartilhar" && <PassoCompartilhar tenant={tenant} onSubmit={concluirPasso} saving={saving} />}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Card>

        {indice > 0 && (
          <Button
            variant="ghost"
            className="self-center"
            onClick={() => setStep(ONBOARDING_STEPS[indice - 1])}
            disabled={saving}
          >
            Voltar
          </Button>
        )}

        <p className="text-center text-xs text-ivory-muted">
          <Check size={12} className="mr-1 inline text-success" />
          Salvamos a cada passo. Pode fechar e voltar depois.
        </p>
      </div>
    </div>
  );
}
