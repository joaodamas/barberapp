import { AlertTriangle } from "lucide-react";

/**
 * Aviso de ambiente de demonstração.
 *
 * Enquanto nada persiste, a interface afirma "Reserva confirmada!", "Salvo!" e
 * "Plano ativado!" — e o app está publicado num domínio real. Um cliente que
 * agendasse acreditaria ter horário marcado. O aviso sai quando a persistência
 * entrar: basta apagar este componente e o `<DemoBanner />` dos dois layouts.
 */
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-gold/30 bg-gold/10 px-4 py-2 text-center text-[11px] text-ivory md:text-xs"
    >
      <AlertTriangle size={13} className="shrink-0 text-gold-light" aria-hidden />
      <span>
        <strong className="font-semibold">Ambiente de demonstração.</strong> Os dados
        são fictícios e nada é salvo — recarregar a página desfaz tudo.
      </span>
    </div>
  );
}
