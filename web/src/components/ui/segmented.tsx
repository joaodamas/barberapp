"use client";

import { useRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Seletor de opções lado a lado.
 *
 * `role="tablist"` e não um `<select>`: são poucas opções, todas visíveis, e o
 * dono compara horizontes tocando de uma para outra. Um select esconde as
 * alternativas atrás de um toque e transforma comparação em navegação.
 *
 * O papel, porém, vinha sem a parte do contrato que ele assume. Quem anuncia
 * "aba" a um leitor de tela promete duas coisas: que as setas ← → trocam de
 * opção, e que o Tab entra no grupo UMA vez, não uma vez por opção. Nenhuma das
 * duas existia — as setas não faziam nada e os três horizontes da Projeção
 * ocupavam três paradas de Tab. Quem navega por teclado recebia a instrução
 * errada e ficava tentando a tecla que não funciona.
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
  const botoes = useRef<Array<HTMLButtonElement | null>>([]);

  function aoTeclar(e: React.KeyboardEvent, i: number) {
    const ultimo = options.length - 1;
    // Circular: chegar na ponta e continuar volta ao começo, como manda o
    // padrão. Parar na ponta faz o usuário achar que o controle travou.
    const destino =
      e.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1)
      : e.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? ultimo
      : null;

    if (destino === null) return;
    // Sem `preventDefault` a seta rola a página junto com a troca de opção.
    e.preventDefault();
    onChange(options[destino].value);
    botoes.current[destino]?.focus();
  }

  /* A pílula dourada é UMA só e desliza até a opção escolhida, em vez de cada
   * botão acender e apagar o próprio fundo: o movimento mostra de onde para
   * onde a escolha foi. A conta reproduz o `p-1` e o `gap-1` do contêiner —
   * cada opção tem (largura − 8px − vãos) / n, e a n-ésima começa depois de n
   * opções e n vãos. Se o espaçamento mudar, muda aqui junto. */
  const n = options.length;
  const indice = Math.max(0, options.findIndex((o) => o.value === value));
  const larguraDaOpcao = `((100% - 8px - ${n - 1} * 4px) / ${n})`;

  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative flex gap-1 rounded-xl border border-border bg-surface p-1"
    >
      <span
        aria-hidden
        className="pilula-desliza pointer-events-none absolute bottom-1 top-1 rounded-lg bg-gold"
        style={{
          width: `calc${larguraDaOpcao}`,
          left: `calc(4px + ${indice} * (${larguraDaOpcao} + 4px))`,
        }}
      />
      {options.map((o, i) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              botoes.current[i] = el;
            }}
            role="tab"
            aria-selected={ativo}
            // Tabulação móvel: o grupo inteiro é UMA parada de Tab, e o foco
            // pousa na opção que está valendo.
            tabIndex={ativo ? 0 : -1}
            onKeyDown={(e) => aoTeclar(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              // min-h-11: alvo de toque de 44px, o dono usa isso em pé no salão.
              // min-w-0 + texto menor no celular estreito: "Mensal · Trimestral ·
              // Semestral · Anual" empurrava a tela para além dos 320px.
              "relative min-h-11 min-w-0 flex-1 cursor-pointer rounded-lg px-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
              ativo
                ? "text-ink"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
