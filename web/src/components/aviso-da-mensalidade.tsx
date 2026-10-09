"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useMinhasAssinaturas, useMinhasFaturas } from "@/lib/db/use-shop-data";
import {
  avisoDoCliente,
  COMO_PAGAR,
  faturaRelevante,
  hojeNoFuso,
  mensagemParaABarbearia,
  type TomDoAviso,
} from "@/lib/aviso-da-mensalidade";
import { cn } from "@/lib/cn";

const TOM: Record<TomDoAviso, { caixa: string; icone: string }> = {
  neutro: { caixa: "border-border bg-surface-raised", icone: "text-gold-strong" },
  atencao: { caixa: "border-gold bg-surface-raised", icone: "text-gold-strong" },
  alerta: { caixa: "border-danger bg-surface-raised", icone: "text-danger" },
};

/**
 * O vencimento da mensalidade, no app de quem paga.
 *
 * Só aparece para quem tem assinatura ativa ou suspensa. Não mostra nada
 * enquanto lê (sem piscar) nem quando a leitura falha: afirmar dívida sem ter
 * lido a fatura seria pior que calar. Nada aqui promete aviso automático — o
 * produto não manda mensagem sozinho; o botão leva ao WhatsApp da barbearia.
 */
export function AvisoDaMensalidade({ className }: { className?: string }) {
  const tenant = useTenant();
  const { user } = useAuth();
  const assinaturas = useMinhasAssinaturas(user?.uid);
  const faturas = useMinhasFaturas(user?.uid);

  if (assinaturas.status !== "pronto" || faturas.status !== "pronto") return null;
  const assinatura = assinaturas.items.find((a) => a.status === "ativo" || a.status === "suspenso");
  if (!assinatura) return null;

  const hoje = hojeNoFuso(tenant.locale.timeZone);
  const minhas = faturas.items.filter((f) => f.subscriptionId === assinatura.id);
  const fatura = faturaRelevante(minhas, hoje);
  const aviso = avisoDoCliente(fatura, assinatura, hoje);

  if (aviso.tipo === "nenhum") return null;

  if (aviso.tipo === "em-dia") {
    return <p className={cn("text-xs text-ink-muted", className)}>{aviso.texto}</p>;
  }

  const tom = TOM[aviso.tom];
  const whatsapp = tenant.contact.whatsapp;
  const Icone = aviso.tom === "alerta" ? AlertTriangle : CalendarClock;
  return (
    <div
      role={aviso.tom === "alerta" ? "alert" : "status"}
      className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3", tom.caixa, className)}
    >
      <div className="flex items-start gap-3">
        <Icone size={18} className={cn("mt-0.5 shrink-0", tom.icone)} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink">{aviso.texto}</p>
          {aviso.comoPagar && (
            <p className="text-xs text-ink-muted">
              <span className="font-medium text-ink">Como pagar:</span> {COMO_PAGAR}
            </p>
          )}
        </div>
      </div>
      {aviso.chamarBarbearia && fatura && whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(mensagemParaABarbearia(fatura))}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" className="w-full">
            Falar com a barbearia no WhatsApp
          </Button>
        </a>
      )}
    </div>
  );
}
