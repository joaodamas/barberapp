import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Volta para a tela de cima.
 *
 * As telas de Financeiro são as únicas com um nível de profundidade, e não
 * tinham saída própria: no desktop dependiam do submenu da lateral, e no
 * celular a barra de baixo não tem submenu — o caminho de volta era o botão do
 * navegador, que num app instalado na tela inicial simplesmente não existe.
 *
 * Um link explícito resolve os dois casos e não depende de histórico: quem
 * chegou aqui por link direto também consegue sair.
 */
export function Voltar({
  href = "/painel/financeiro",
  label = "Financeiro",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex min-h-11 items-center gap-1 text-sm text-ivory-muted transition-colors hover:text-ivory"
    >
      <ChevronLeft size={16} />
      {label}
    </Link>
  );
}
