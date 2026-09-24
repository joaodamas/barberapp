/**
 * Resposta imediata ao toque no app do cliente — ver o mesmo arquivo no painel.
 * Sem ele, trocar de aba esperava o servidor sem sinal nenhum.
 */
export default function CarregandoCliente() {
  return (
    <div className="flex flex-col gap-4 pt-1" role="status" aria-busy="true" aria-label="Carregando">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-raised" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-raised" />
      ))}
    </div>
  );
}
