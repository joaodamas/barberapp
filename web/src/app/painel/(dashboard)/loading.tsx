/**
 * O que aparece NO INSTANTE do toque, enquanto a tela nova chega.
 *
 * Não havia `loading.tsx` no app: toda troca de tela do painel esperava o
 * servidor responder — 0,3 a 0,8s num celular intermediário, e 4 a 8s quando
 * o servidor estava frio — sem nenhum sinal de que algo acontecia (medido em
 * 24/09). O dono tocava de novo, ou achava que travou. Este esqueleto é
 * pré-carregado junto com o link, então aparece na hora.
 */
export default function CarregandoPainel() {
  return (
    <div className="flex flex-col gap-5 pt-1 md:gap-8 md:pt-2" role="status" aria-busy="true" aria-label="Carregando">
      <div className="flex flex-col gap-2">
        <div className="h-4 w-24 animate-pulse rounded bg-surface-raised" />
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-raised md:h-10" />
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-raised" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-raised" />
        ))}
      </div>
    </div>
  );
}
