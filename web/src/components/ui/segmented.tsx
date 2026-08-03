"use client";

/**
 * Seletor de opções lado a lado.
 *
 * `role="tablist"` e não um `<select>`: são poucas opções, todas visíveis, e o
 * dono compara horizontes tocando de uma para outra. Um select esconde as
 * alternativas atrás de um toque e transforma comparação em navegação.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 rounded-xl border border-border bg-surface p-1"
    >
      {options.map((o) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={ativo}
            onClick={() => onChange(o.value)}
            className={
              // min-h-11: alvo de toque de 44px, o dono usa isso em pé no salão.
              "min-h-11 flex-1 cursor-pointer rounded-lg px-3 text-sm font-medium transition-colors " +
              (ativo
                ? "bg-gold text-ivory"
                : "text-ivory-muted hover:bg-surface-raised hover:text-ivory")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
