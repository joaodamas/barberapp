import { AlertCircle, Check, Clock, Scissors } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { NAO_APURADO } from "@/lib/apuracao";
import { contar } from "@/lib/plural";
import {
  textoDeAtraso,
  textoDeContagem,
  textoDeLivres,
  type AtendimentoEmFoco,
  type FatiaDoRecebido,
  type ResumoDoDia,
} from "@/lib/resumo-do-dia";

/**
 * O topo da tela Hoje — "cockpit" (02/10, escolha do dono entre três opções).
 *
 * À esquerda, o que pede ação AGORA: quem está na cadeira (com o botão que
 * conclui pelo mesmo fluxo da agenda), quem atrasou, ou o próximo. À direita,
 * os números do dia em 2×2, cada um com a legenda da população que conta.
 *
 * Previsão e recebido continuam SEM barra entre eles (F5/F6): o recebido é
 * caixa de todas as origens, a previsão é serviço da agenda. As mini barras do
 * recebido comparam formas de pagamento entre si — a mesma população.
 */
export function ResumoDoDiaTopo({
  dataLonga,
  resumo,
  ocupacaoPct,
  horariosLivres,
  previsao,
  recebido,
  fatiasDoRecebido,
  agendaIlegivel,
  pagamentosIlegiveis,
  nomeDoBarbeiro,
  aoConcluir,
  aoMarcarFalta,
  temRelogio,
}: {
  dataLonga: string;
  resumo: ResumoDoDia;
  ocupacaoPct: number;
  horariosLivres: number;
  previsao: number;
  recebido: number;
  fatiasDoRecebido: FatiaDoRecebido[];
  agendaIlegivel: boolean;
  pagamentosIlegiveis: boolean;
  nomeDoBarbeiro: (staffId: string | null) => string | null;
  aoConcluir: (bookingId: string) => void;
  aoMarcarFalta: (bookingId: string) => void;
  /** No servidor não há relógio: o cartão "Agora" espera o primeiro tique. */
  temRelogio: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-strong">Hoje</p>
        <h1 className="text-xl font-semibold text-ink first-letter:uppercase md:text-3xl md:tracking-tight">
          {dataLonga}
        </h1>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-start">
        {!agendaIlegivel && temRelogio && (
          <CartaoAgora
            resumo={resumo}
            nomeDoBarbeiro={nomeDoBarbeiro}
            aoConcluir={aoConcluir}
            aoMarcarFalta={aoMarcarFalta}
          />
        )}

        <section aria-label="Números do dia" className="grid grid-cols-2 gap-3">
          <Bloco>
            <Rotulo>Atendimentos</Rotulo>
            <Valor>{agendaIlegivel ? NAO_APURADO : String(resumo.total)}</Valor>
            {!agendaIlegivel && resumo.segmentos.length > 0 && (
              <div
                role="img"
                aria-label={`${contar(resumo.feitos, "feito", "feitos")}, ${resumo.pelaFrente} pela frente`}
                className="mt-2 flex gap-0.5"
              >
                {resumo.segmentos.map((s) => (
                  <i
                    key={s.id}
                    className={cn(
                      "h-1.5 flex-1 rounded-sm",
                      s.estado === "feito" ? "bg-gold" : s.estado === "falta" ? "bg-danger/40" : "bg-surface-raised"
                    )}
                  />
                ))}
              </div>
            )}
            {!agendaIlegivel && (
              <Legenda>
                {resumo.total === 0
                  ? "nenhum marcado"
                  : `${contar(resumo.feitos, "feito", "feitos")} · ${resumo.pelaFrente} pela frente`}
              </Legenda>
            )}
          </Bloco>

          <Bloco className="flex-row items-center gap-3">
            {!agendaIlegivel && <Anel pct={ocupacaoPct} />}
            <div className="min-w-0">
              <Rotulo>Ocupação</Rotulo>
              <Valor>{agendaIlegivel ? NAO_APURADO : formatPctPtBR(ocupacaoPct, 0)}</Valor>
              {!agendaIlegivel && (
                <Legenda destaque={horariosLivres <= 0 && ocupacaoPct >= 100}>
                  {textoDeLivres(horariosLivres, ocupacaoPct)}
                </Legenda>
              )}
            </div>
          </Bloco>

          <Bloco>
            <Rotulo>Previsão do dia</Rotulo>
            <Valor>{agendaIlegivel ? NAO_APURADO : formatBRL(previsao)}</Valor>
            <Legenda>serviços agendados para hoje, já sem faltas e cancelamentos</Legenda>
          </Bloco>

          <Bloco>
            <Rotulo>Recebido hoje</Rotulo>
            <Valor className="text-success">{pagamentosIlegiveis ? NAO_APURADO : formatBRL(recebido)}</Valor>
            {!pagamentosIlegiveis && recebido > 0 && <BarrasDoRecebido fatias={fatiasDoRecebido} />}
            <Legenda>atendimento, venda e mensalidade</Legenda>
          </Bloco>
        </section>
      </div>
    </div>
  );
}

const BOTAO_PRINCIPAL =
  "rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface hover:bg-ink/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
const BOTAO_SECUNDARIO =
  "rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function CartaoAgora({
  resumo,
  nomeDoBarbeiro,
  aoConcluir,
  aoMarcarFalta,
}: {
  resumo: ResumoDoDia;
  nomeDoBarbeiro: (staffId: string | null) => string | null;
  aoConcluir: (bookingId: string) => void;
  aoMarcarFalta: (bookingId: string) => void;
}) {
  const { atrasado, naCadeira, proximo, proximos } = resumo;
  const naCadeiraAgora = naCadeira[0] ?? null;
  const comBarbeiro = (a: AtendimentoEmFoco) => {
    const n = nomeDoBarbeiro(a.staffId);
    return n ? ` · com ${n}` : "";
  };
  /* A lista curta ocupa o espaço que sobraria: o que vem depois do foco. */
  const focoId = atrasado?.id ?? naCadeiraAgora?.id ?? proximo?.id;
  const depois = proximos.filter((p) => p.id !== focoId).slice(0, 3);

  let cabeca: React.ReactNode;
  let acoes: React.ReactNode = null;

  if (atrasado) {
    cabeca = (
      <Foco
        rotulo={textoDeAtraso(atrasado.minutos)}
        icone={<AlertCircle size={14} aria-hidden />}
        tom="perigo"
        nome={atrasado.cliente}
        linha={`${atrasado.hora} · ${atrasado.servico}${comBarbeiro(atrasado)}`}
      />
    );
    acoes = (
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => aoConcluir(atrasado.id)} className={BOTAO_PRINCIPAL}>
          Concluir atendimento
        </button>
        <button
          type="button"
          onClick={() => aoMarcarFalta(atrasado.id)}
          className="rounded-xl border border-danger/40 bg-surface px-4 py-2.5 text-sm font-semibold text-danger hover:bg-danger/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          Não veio
        </button>
      </div>
    );
  } else if (naCadeiraAgora) {
    const pct = Math.min(100, Math.max(0, (naCadeiraAgora.minutos / naCadeiraAgora.duracaoMin) * 100));
    cabeca = (
      <>
        <Foco
          rotulo={`Na cadeira agora · há ${naCadeiraAgora.minutos} min`}
          icone={<Scissors size={14} aria-hidden />}
          tom="marca"
          nome={naCadeiraAgora.cliente}
          linha={`${naCadeiraAgora.servico}${comBarbeiro(naCadeiraAgora)}`}
        />
        <div
          role="progressbar"
          aria-label="Tempo do atendimento"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          className="h-1.5 overflow-hidden rounded-full bg-surface-raised"
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
        </div>
        {naCadeira.length > 1 && (
          <p className="text-xs text-ink-muted">
            e mais {contar(naCadeira.length - 1, "atendimento", "atendimentos")} em andamento
          </p>
        )}
      </>
    );
    acoes = (
      <button type="button" onClick={() => aoConcluir(naCadeiraAgora.id)} className={BOTAO_PRINCIPAL}>
        Concluir atendimento
      </button>
    );
  } else if (proximo) {
    cabeca = (
      <Foco
        rotulo={`Próximo · ${textoDeContagem(proximo.minutos)}`}
        icone={<Clock size={14} aria-hidden />}
        tom="neutro"
        nome={proximo.cliente}
        linha={`${proximo.hora} · ${proximo.servico}${comBarbeiro(proximo)}`}
      />
    );
    acoes = (
      <a href="#agenda-do-dia" className={BOTAO_SECUNDARIO}>
        Ver na agenda
      </a>
    );
  } else {
    cabeca = (
      <Foco
        rotulo={resumo.total > 0 ? "Dia encerrado" : "Agenda de hoje"}
        icone={<Check size={14} aria-hidden />}
        tom="neutro"
        nome={
          resumo.total > 0
            ? contar(resumo.feitos, "atendimento feito", "atendimentos feitos")
            : "Nenhum atendimento marcado"
        }
        linha={
          resumo.total > 0
            ? resumo.faltas > 0
              ? `${contar(resumo.faltas, "falta", "faltas")} · nada mais na agenda de hoje.`
              : "Nada mais na agenda de hoje."
            : "Quem marcar pelo link aparece aqui."
        }
      />
    );
    if (resumo.total > 0) {
      acoes = (
        <a href="#caixa-de-hoje" className={BOTAO_SECUNDARIO}>
          Ver o fechamento
        </a>
      );
    }
  }

  return (
    <section
      aria-label="Agora"
      /* Altura do CONTEÚDO (lg:items-start na grade): sem vão dentro do
       * cartão quando há pouco a mostrar (02/10). */
      className={cn(
        "flex flex-col gap-4 rounded-2xl border p-4 md:p-5",
        atrasado ? "border-danger/40 bg-danger/5" : "border-border bg-surface"
      )}
    >
      <div className="flex flex-col gap-3">{cabeca}</div>
      {depois.length > 0 && (
        <div>
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Depois</p>
          <ul className="divide-y divide-border/70">
            {depois.map((p) => (
              <li key={p.id} className="flex items-baseline gap-2 py-1.5 text-sm">
                <b className="w-12 shrink-0 font-semibold tabular-nums text-ink">{p.hora}</b>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {p.cliente} <span className="text-ink-muted">· {p.servico}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-ink-muted">{textoDeContagem(p.minutos)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {acoes && <div className="flex">{acoes}</div>}
    </section>
  );
}

function Foco({
  rotulo,
  icone,
  tom,
  nome,
  linha,
}: {
  rotulo: string;
  icone: React.ReactNode;
  tom: "perigo" | "marca" | "neutro";
  nome: string;
  linha: string;
}) {
  return (
    <div className="min-w-0">
      <p
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider",
          tom === "perigo" ? "text-danger" : tom === "marca" ? "text-gold-strong" : "text-ink-muted"
        )}
      >
        {icone}
        {rotulo}
      </p>
      <p className="mt-1.5 truncate font-display text-2xl font-semibold text-ink">{nome}</p>
      <p className="truncate text-sm text-ink-muted">{linha}</p>
    </div>
  );
}

function Bloco({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-2xl border border-border bg-surface p-4", className)}>
      {children}
    </div>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted md:text-xs">{children}</p>;
}

function Valor({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("font-display text-xl font-semibold tabular-nums text-ink md:text-2xl", className)}>{children}</p>
  );
}

function Legenda({ children, destaque }: { children: React.ReactNode; destaque?: boolean }) {
  return (
    <p className={cn("mt-1 text-xs", destaque ? "font-semibold text-gold-strong" : "text-ink-muted")}>{children}</p>
  );
}

function Anel({ pct }: { pct: number }) {
  const r = 22;
  const volta = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <svg
      viewBox="0 0 56 56"
      role="img"
      aria-label={`Ocupação de ${Math.round(p)}%`}
      className="h-11 w-11 shrink-0 -rotate-90 md:h-14 md:w-14"
    >
      <circle cx="28" cy="28" r={r} fill="none" strokeWidth="6" className="stroke-surface-raised" />
      <circle
        cx="28"
        cy="28"
        r={r}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="stroke-gold"
        strokeDasharray={`${(p / 100) * volta} ${volta}`}
      />
    </svg>
  );
}

function BarrasDoRecebido({ fatias }: { fatias: FatiaDoRecebido[] }) {
  const maior = Math.max(1, ...fatias.map((f) => f.valor));
  return (
    <ul aria-label="Recebido por forma de pagamento" className="mt-2 flex flex-col gap-1.5">
      {fatias.map((f) => (
        <li key={f.forma} className="text-[11px] text-ink-muted">
          <span className="flex justify-between gap-2">
            <span>{f.forma}</span>
            <span className="tabular-nums text-ink">{formatBRL(f.valor)}</span>
          </span>
          <span
            role="img"
            aria-label={`${f.forma}: ${formatBRL(f.valor)}`}
            className="mt-0.5 block h-1.5 overflow-hidden rounded-full bg-surface-raised"
          >
            <i
              className="block h-full rounded-full bg-success/70"
              style={{ width: `${(Math.max(0, f.valor) / maior) * 100}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
