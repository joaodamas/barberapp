/**
 * O logo nos tamanhos em que ele realmente aparece, nos temas claro e escuro:
 *
 * - topo do painel: 38 px, ao lado do nome (`painel-sidebar-nav.tsx`);
 * - ícone do celular: 60 px, cantos arredondados, logo a 72% sobre o fundo
 *   escolhido (mesma geometria do `icon-192.png`);
 * - favicon: 32 px, sem fundo.
 *
 * É o teste que a prévia grande não faz: um logo que "parece bom" a 240 px
 * pode virar uma tarja ilegível a 38. As cores dos temas são fixas aqui — a
 * tela de marca mostra os dois ao mesmo tempo, independente do tema atual.
 */
const TEMAS = [
  { id: "claro", nome: "Tema claro", fundo: "#ffffff", tinta: "#0f172a", suave: "#64748b", borda: "#e2e8f0" },
  { id: "escuro", nome: "Tema escuro", fundo: "#0f172a", tinta: "#ffffff", suave: "#94a3b8", borda: "#1e293b" },
] as const;

export function PreviaEmTamanhoReal({
  logo,
  nomeCurto,
  rotulo,
  fundoDoIcone,
}: {
  logo: string;
  nomeCurto: string;
  rotulo: string;
  /** Fundo do ícone do celular; `null` é o monograma, que já é cheio. */
  fundoDoIcone: string | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TEMAS.map((t) => (
        <figure key={t.id} className="flex min-w-0 flex-col gap-2">
          <div
            className="flex flex-col gap-4 rounded-2xl border p-4"
            style={{ backgroundColor: t.fundo, borderColor: t.borda }}
          >
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="" width={38} height={38} className="h-[38px] w-[38px] shrink-0 rounded-lg object-contain" />
              <div className="min-w-0 leading-tight">
                <p className="truncate font-display text-base uppercase tracking-wider" style={{ color: t.tinta }}>
                  {nomeCurto || "—"}
                </p>
                <p className="truncate text-[11px] uppercase tracking-wide" style={{ color: t.suave }}>
                  {rotulo}
                </p>
              </div>
            </div>

            <div className="flex items-end gap-5">
              <div className="flex flex-col items-center gap-1">
                <div
                  className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-[22%] border"
                  style={{ backgroundColor: fundoDoIcone ?? "transparent", borderColor: t.borda }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logo}
                    alt=""
                    className={fundoDoIcone ? "h-[72%] w-[72%] object-contain" : "h-full w-full object-contain"}
                  />
                </div>
                <span className="text-[10px]" style={{ color: t.suave }}>
                  Celular
                </span>
              </div>
              <div className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo} alt="" width={32} height={32} className="h-8 w-8 object-contain" />
                <span className="text-[10px]" style={{ color: t.suave }}>
                  Aba (32 px)
                </span>
              </div>
            </div>
          </div>
          <figcaption className="text-xs text-ink-muted">{t.nome}</figcaption>
        </figure>
      ))}
    </div>
  );
}
