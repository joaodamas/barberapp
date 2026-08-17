"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL, safeDiv } from "@/lib/format";
import { usePlans } from "@/lib/db/use-shop-data";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { useTenant } from "@/lib/tenant-context";

/**
 * Planos de mensalista — VITRINE, não checkout.
 *
 * Até 17/08 esta tela tinha um fluxo completo de assinatura: escolher plano,
 * escolher entre cartão recorrente e Pix, "Confirmar assinatura", e um diálogo
 * de sucesso dizendo *"Plano ativado! Seu plano já está valendo. Enviamos a
 * confirmação no seu WhatsApp."*
 *
 * Nada disso acontecia. O estado vivia num `useState` de contexto: não gravava
 * no Firestore, não chamava função nenhuma, não cobrava, e sumia ao recarregar
 * a página. O dono abria `/painel/mensal`, lia `subscriptions` e não via
 * ninguém — o cliente saía acreditando que era mensalista e que tinha sido
 * cobrado, e os dois só descobriam na cadeira.
 *
 * Era o defeito mais grave do produto, porque a afirmação ia para um TERCEIRO,
 * que nunca contratou nada com a plataforma.
 *
 * Enquanto não existir cobrança de verdade, a contratação passa pela barbearia
 * — que é como ela já acontece hoje, por WhatsApp. A tela mostra os planos e
 * abre a conversa; quem confirma é quem recebe o dinheiro.
 */
export default function PlanosPage() {
  const { items: plans, status } = usePlans();
  const tenant = useTenant();

  const ativos = plans.filter((p) => p.active !== false);
  const whatsapp = tenant.contact.whatsapp;

  /** A conversa já começa dizendo o que a pessoa quer. */
  function conversaSobre(nome: string, preco: number) {
    const texto = `Olá! Quero assinar o plano ${nome} (${formatBRL(preco)}/mês) na ${tenant.brand.name}. Como faço?`;
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}`;
  }

  return (
    <div className="flex flex-col gap-5 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Mensalistas</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Planos</h1>
      </div>

      {status === "carregando" && <LoadingRows rows={3} />}

      {status === "pronto" && ativos.length === 0 && (
        <EmptyState
          icon={Sparkles}
          title="Nenhum plano disponível ainda"
          description="A barbearia ainda não criou planos de mensalista. Você pode agendar normalmente no avulso."
          actionLabel="Agendar horário"
          actionHref="/agendar"
        />
      )}

      {ativos.length > 0 && (
        <>
          <div className="flex flex-col gap-3 pb-4 md:grid md:grid-cols-3 md:gap-5 md:pb-0">
            {ativos.map((plan) => {
              const visitasParaCompensar = Math.max(
                1,
                Math.ceil(safeDiv(plan.price, plan.priceAvulso, 1))
              );
              const economia = Math.round(
                (1 - safeDiv(plan.price, plan.priceAvulso, 1)) * 100
              );

              return (
                <Card
                  key={plan.id}
                  className={
                    "flex flex-col gap-3 md:gap-4 md:p-6 " +
                    (plan.highlight
                      ? "border-gold/50 bg-gradient-to-br from-surface to-surface-raised md:shadow-[var(--shadow-gold)]"
                      : "")
                  }
                >
                  {plan.highlight && (
                    <Pill tone="gold" className="w-fit">
                      <Sparkles size={12} /> Mais popular
                    </Pill>
                  )}

                  <div>
                    <p className="text-ivory md:text-lg">{plan.name}</p>
                    <p className="text-xs text-ivory-muted md:text-sm">
                      {plan.description}
                    </p>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl font-semibold text-gold-light md:text-4xl">
                      {formatBRL(plan.price)}
                    </span>
                    <span className="text-xs text-ivory-muted md:text-sm">/mês</span>
                  </div>

                  <p className="text-xs text-ivory-muted md:text-sm">
                    {plan.unlimited ? (
                      <>
                        A partir da {visitasParaCompensar}ª visita no mês o plano
                        já compensa (avulso: {formatBRL(plan.priceAvulso)}/corte)
                      </>
                    ) : (
                      <>
                        <span className="line-through">
                          {formatBRL(plan.priceAvulso)}
                        </span>{" "}
                        no avulso · economize {economia}%
                      </>
                    )}
                  </p>

                  {/* Sem número configurado o botão não aparece: um "Assinar"
                      que não abre nada é pior do que não existir — e foi
                      exatamente o que esta tela fazia antes, com um checkout
                      que confirmava sem cobrar. */}
                  {whatsapp ? (
                    <a
                      href={conversaSobre(plan.name, plan.price)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="md:mt-2"
                    >
                      <Button
                        variant={plan.highlight ? "primary" : "secondary"}
                        className="w-full"
                      >
                        <MessageCircle size={16} />
                        Falar com a barbearia
                      </Button>
                    </a>
                  ) : (
                    <p className="text-xs text-ivory-muted md:mt-2">
                      Fale com a {tenant.brand.name} no balcão para assinar.
                    </p>
                  )}
                </Card>
              );
            })}
          </div>

          {/* O texto diz o que de fato acontece. O anterior prometia "cobrança
              automática todo mês" e "lembrete no WhatsApp antes do vencimento",
              e não havia cobrança nem lembrete. */}
          <Card className="flex flex-col gap-2 text-sm text-ivory-muted md:max-w-2xl md:p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
              Como funciona
            </p>
            <p>
              A assinatura é combinada direto com a {tenant.brand.name} — pelo
              WhatsApp ou no balcão. Ela confirma o pagamento e ativa seu plano.
            </p>
            <p>
              Enquanto isso, você continua agendando normalmente e pagando por
              atendimento.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
