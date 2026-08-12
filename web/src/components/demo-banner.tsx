import { AlertTriangle } from "lucide-react";

/**
 * Aviso do que ainda NÃO é salvo.
 *
 * Nasceu quando nada persistia e o app já estava publicado num domínio real:
 * a interface afirmava "Reserva confirmada!" e o cliente acreditava ter
 * horário marcado. A reserva passou a gravar de verdade (`createBooking`), e
 * manter o texto antigo — "os dados são fictícios e nada é salvo" — virou o
 * problema oposto: alarme falso, que faz o cliente duvidar de um agendamento
 * que existe.
 *
 * O aviso agora nomeia só o que de fato não persiste:
 *
 * - assinatura de plano (`subscription-context` é `useState` em memória)
 * - edição de perfil (`perfil/page.tsx` faz `setSaved(true)` e nada mais)
 *
 * Quando essas duas entrarem, apague este componente e o `<DemoBanner />` dos
 * dois layouts. Enquanto existirem, o padrão é AVISAR: desligar exige
 * `NEXT_PUBLIC_DEMO_MODE=false` explícito, porque a condição anterior
 * (`=== "true"`) dependia de uma variável que não estava no `.env.local` da
 * produção — e o componente que existia para impedir o app de enganar cliente
 * ficava invisível justamente lá.
 */
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "false") return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-[11px] text-ivory md:text-xs"
    >
      <AlertTriangle size={13} className="shrink-0 text-gold-light" aria-hidden />
      <span>
        <strong className="font-semibold">Em construção.</strong> Agendamento e
        cancelamento já valem de verdade. Assinar plano e editar o perfil ainda
        não são salvos — recarregar a página desfaz.
      </span>
    </div>
  );
}
