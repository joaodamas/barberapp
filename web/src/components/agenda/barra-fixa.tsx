import { cn } from "@/lib/cn";

/**
 * A barra de ferramentas que fica colada no topo da área que rola (o <main> do
 * painel no desktop; a janela no celular).
 *
 * Por que fixa: o conteúdo acima dos controles muda de altura com dado ao vivo
 * (pedidos de encaixe, avisos, carregando), e o filtro de barbeiro se mexia
 * debaixo do cursor — o clique caía no chip vizinho. Colada no topo, a barra não
 * depende do que existe acima dela. O fundo é opaco e as margens negativas
 * compensam o respiro do <main> para o conteúdo não aparecer pelas laterais.
 */
export function BarraFixa({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-4 border-b border-border bg-canvas px-4 py-2 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14 xl:-mx-16 xl:px-16",
        className
      )}
    >
      {children}
    </div>
  );
}
