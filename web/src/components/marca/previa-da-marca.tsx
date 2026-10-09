import { CLASSE_DO_LOGO_REDONDO } from "@/lib/logo-da-marca";

/**
 * Três miniaturas do que o cliente vê: o topo do app, a tela de entrar e o
 * ícone na tela inicial do celular. O logo é um círculo nas duas primeiras
 * (como no app); no ícone do celular fica quadrado, e o sistema arredonda.
 *
 * Réplicas simplificadas — mesmas proporções e textos das telas reais
 * (`(cliente)/layout.tsx`, `login/page.tsx`, os ícones de `ICONES_DO_LOGO`),
 * não as telas em si: montar o app inteiro dentro de um cartão custaria mais
 * do que ensina. A cor entra por `--color-gold` no próprio bloco, então
 * `bg-gold` aqui dentro pinta com a cor do rascunho sem mexer no resto do
 * painel.
 */
export function PreviaDaMarca({
  logo,
  nome,
  nomeCurto,
  corDoBotao,
  fundoDoIcone,
}: {
  logo: string;
  nome: string;
  nomeCurto: string;
  corDoBotao: string;
  /** Fundo do ícone quando há logo; `null` é o monograma, que já é redondo e cheio. */
  fundoDoIcone: string | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" style={{ ["--color-gold" as string]: corDoBotao }}>
      <figure className="flex min-w-0 flex-col gap-2">
        <div className="overflow-hidden rounded-2xl border border-border bg-canvas">
          <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
            {/* <img> e não next/image: a prévia é `blob:`/`data:`, que o
                otimizador não serve — e aqui não há o que otimizar. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt="" width={32} height={32} className={`h-8 w-8 ${CLASSE_DO_LOGO_REDONDO}`} />
            <span className="truncate font-display text-sm uppercase tracking-wider text-ink">
              {nomeCurto || "—"}
            </span>
          </div>
          <div className="flex flex-col gap-2 px-4 pb-4">
            <div className="h-2 w-2/3 rounded-full bg-border" />
            <div className="h-2 w-1/2 rounded-full bg-border" />
            <span className="mt-1 inline-flex w-fit rounded-xl bg-gold px-3 py-1.5 text-xs font-semibold text-ink">
              Agendar horário
            </span>
          </div>
        </div>
        <figcaption className="text-xs text-ink-muted">Topo do app</figcaption>
      </figure>

      <figure className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-canvas px-4 py-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={56} height={56} className={`h-14 w-14 ${CLASSE_DO_LOGO_REDONDO}`} />
          <p className="max-w-full truncate font-display text-base text-ink">{nome || "—"}</p>
          <p className="text-[11px] text-ink-muted">Entre com sua conta</p>
          <span className="mt-1 w-full rounded-xl bg-gold py-1.5 text-xs font-semibold text-ink">Entrar</span>
        </div>
        <figcaption className="text-xs text-ink-muted">Tela de entrar</figcaption>
      </figure>

      <figure className="flex flex-col gap-2 sm:col-span-2">
        <div className="flex items-end gap-5 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 px-5 py-5">
          <IconeDoCelular logo={logo} nome={nomeCurto} fundo={fundoDoIcone} />
          {/* Vizinhos genéricos: o ícone sozinho não mostra como ele se
              destaca — ou some — entre os outros apps. */}
          <div className="flex flex-col items-center gap-1.5 opacity-60" aria-hidden>
            <div className="h-14 w-14 rounded-[22%] bg-white/30" />
            <span className="text-[10px] text-white/80">Fotos</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 opacity-60" aria-hidden>
            <div className="h-14 w-14 rounded-[22%] bg-white/30" />
            <span className="text-[10px] text-white/80">Agenda</span>
          </div>
        </div>
        <figcaption className="text-xs text-ink-muted">Ícone na tela inicial do celular</figcaption>
      </figure>
    </div>
  );
}

/** Mesma geometria do `apple-touch-icon` de `ICONES_DO_LOGO`: logo a 76% sobre o fundo. */
function IconeDoCelular({ logo, nome, fundo }: { logo: string; nome: string; fundo: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[22%] shadow-sm"
        style={{ backgroundColor: fundo ?? "transparent" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logo}
          alt=""
          className={fundo ? "h-[76%] w-[76%] object-contain" : "h-full w-full object-contain"}
        />
      </div>
      <span className="max-w-16 truncate text-[10px] text-white">{nome}</span>
    </div>
  );
}
