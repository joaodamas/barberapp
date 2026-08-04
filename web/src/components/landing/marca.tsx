/**
 * O símbolo, inline.
 *
 * Inline e não `<img>`: o traço usa `currentColor`, e imagem externa não herda
 * cor do texto. Assim a mesma arte serve sobre creme e sobre escuro sem um
 * segundo arquivo que alguém esquece de atualizar.
 */
export function SimboloCorteHub({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="CorteHub">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 300,150 A 106,106 0 1 0 300,362" />
        <path d="M 300,150 L 300,362" />
        <path d="M 300,256 L 412,256" />
        <path d="M 412,150 L 412,362" />
      </g>
      <circle cx="300" cy="256" r="26" fill="#d9a44f" />
    </svg>
  );
}

/** Símbolo + nome, do jeito que a marca se assina. */
export function AssinaturaCorteHub({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <SimboloCorteHub className="h-7 w-7 shrink-0" />
      <span className="font-brand text-2xl tracking-tight">CorteHub</span>
    </span>
  );
}
