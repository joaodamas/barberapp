import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { NAO_APURADO } from "@/lib/apuracao";
import { contar, plural } from "@/lib/plural";
import {
  textoDeAtraso,
  textoDeContagem,
  textoDeLivres,
  type AtendimentoEmFoco,
  type FatiaDoRecebido,
  type LinhaDoBarbeiro,
  type ResumoDeAmanha,
  type ResumoDoDia,
} from "@/lib/resumo-do-dia";

/**
 * O topo da tela Hoje.
 *
 * Os números do dia são UMA faixa, e não quatro cartões iguais: quatro caixas
 * com o mesmo peso diziam "tudo aqui importa igual", e o olho não sabia por
 * onde começar. Na faixa, o recebido abre (é a pergunta de quem acabou de
 * chegar), com as formas em texto pequeno logo abaixo, e as divisórias finas
 * separam sem emoldurar.
 *
 * Abaixo, "Agora": quem está na cadeira, quem atrasou, ou o próximo. O atraso
 * era um cartão rosa grande que gritava mais que o resto da tela — agora é uma
 * faixa compacta com um ponto vermelho, e o que ela pede (concluir ou "não
 * veio") está na mesma linha. Os mesmos números e as mesmas ações de antes;
 * mudou o peso de cada um.
 *
 * Previsão e recebido continuam SEM barra entre eles (F5/F6): o recebido é
 * caixa de todas as origens, a previsão é serviço da agenda.
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
  emEnvio,
  temRelogio,
  linhasPorBarbeiro,
  amanha,
  aoVerAmanha,
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
  /** Reservas com conclusão/falta esperando o prazo do "Desfazer": id → texto. */
  emEnvio?: ReadonlyMap<string, string>;
  /** No servidor não há relógio: o bloco "Agora" espera o primeiro tique. */
  temRelogio: boolean;
  linhasPorBarbeiro: LinhaDoBarbeiro[];
  amanha: ResumoDeAmanha;
  aoVerAmanha: () => void;
}) {
  const formas = fatiasDoRecebido.filter((f) => f.valor > 0);
  const pctFeitos = resumo.total > 0 ? Math.min(100, (resumo.feitos / resumo.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-[12.5px] font-medium text-gold-strong">Hoje</p>
        <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink first-letter:uppercase md:text-[28px]">
          {dataLonga}
        </h1>
      </div>

      <section
        aria-label="Números do dia"
        className="grid grid-cols-2 rounded-superficie border border-border bg-surface md:grid-cols-4"
      >
        <Numero
          rotulo="Recebido"
          titulo="Atendimento, venda e mensalidade"
          className="border-b border-r border-border md:border-b-0"
        >
          <Valor className="text-success">{pagamentosIlegiveis ? NAO_APURADO : formatBRL(recebido)}</Valor>
          <Legenda>
            {pagamentosIlegiveis
              ? "pagamentos indisponíveis"
              : formas.length > 0
                ? formas.map((f) => `${f.forma} ${formatBRL(f.valor)}`).join(" · ")
                : "atendimento, venda e mensalidade"}
          </Legenda>
        </Numero>

        <Numero rotulo="Atendimentos" className="border-b border-border md:border-b-0 md:border-r">
          <Valor>
            {agendaIlegivel ? NAO_APURADO : `${resumo.feitos}/${resumo.total}`}
          </Valor>
          {!agendaIlegivel && resumo.total > 0 && (
            <div
              role="progressbar"
              aria-label="Atendimentos feitos"
              aria-valuemin={0}
              aria-valuemax={resumo.total}
              aria-valuenow={resumo.feitos}
              className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-raised"
            >
              <div
                className="h-full rounded-full bg-ink-muted transition-[width] duration-200"
                style={{ width: `${pctFeitos}%` }}
              />
            </div>
          )}
          {!agendaIlegivel && (
            <Legenda>
              {resumo.total === 0
                ? "nenhum marcado"
                : `${contar(resumo.pelaFrente, "pela frente", "pela frente")}${
                    resumo.faltas > 0 ? ` · ${contar(resumo.faltas, "falta", "faltas")}` : ""
                  }`}
            </Legenda>
          )}
        </Numero>

        <Numero rotulo="Previsto" titulo="Serviços agendados para hoje, já sem faltas e cancelamentos" className="border-r border-border">
          <Valor>{agendaIlegivel ? NAO_APURADO : formatBRL(previsao)}</Valor>
          <Legenda>serviços do dia, sem faltas</Legenda>
        </Numero>

        <Numero rotulo="Ocupação">
          <Valor>{agendaIlegivel ? NAO_APURADO : formatPctPtBR(ocupacaoPct, 0)}</Valor>
          {!agendaIlegivel && (
            <Legenda destaque={horariosLivres <= 0 && ocupacaoPct >= 100}>
              {textoDeLivres(horariosLivres, ocupacaoPct)}
            </Legenda>
          )}
        </Numero>
      </section>

      {!agendaIlegivel && temRelogio && (
        <Agora
          resumo={resumo}
          nomeDoBarbeiro={nomeDoBarbeiro}
          aoConcluir={aoConcluir}
          aoMarcarFalta={aoMarcarFalta}
          emEnvio={emEnvio}
          linhasPorBarbeiro={linhasPorBarbeiro}
          amanha={amanha}
          aoVerAmanha={aoVerAmanha}
        />
      )}
    </div>
  );
}

function Agora({
  resumo,
  nomeDoBarbeiro,
  aoConcluir,
  aoMarcarFalta,
  emEnvio,
  linhasPorBarbeiro,
  amanha,
  aoVerAmanha,
}: {
  resumo: ResumoDoDia;
  nomeDoBarbeiro: (staffId: string | null) => string | null;
  aoConcluir: (bookingId: string) => void;
  aoMarcarFalta: (bookingId: string) => void;
  emEnvio?: ReadonlyMap<string, string>;
  linhasPorBarbeiro: LinhaDoBarbeiro[];
  amanha: ResumoDeAmanha;
  aoVerAmanha: () => void;
}) {
  const { atrasado, naCadeira, proximo, proximos } = resumo;
  const naCadeiraAgora = naCadeira[0] ?? null;
  const comBarbeiro = (a: AtendimentoEmFoco) => {
    const n = nomeDoBarbeiro(a.staffId);
    return n ? ` · com ${n}` : "";
  };
  /* A lista curta é o que vem depois do foco. */
  const focoId = atrasado?.id ?? naCadeiraAgora?.id ?? proximo?.id;
  const depois = proximos.filter((p) => p.id !== focoId).slice(0, 3);

  /* O dia acabou (nada na cadeira, atrasado ou pela frente) ou não há
   * "Depois" para mostrar: o espaço vai para o que vem amanhã (02/10). */
  const encerrado = !atrasado && !naCadeiraAgora && !proximo;
  const mostrarAmanha = encerrado || depois.length === 0;
  const mostrarPorBarbeiro = linhasPorBarbeiro.length > 1;

  let faixa: React.ReactNode;
  if (atrasado) {
    const texto = emEnvio?.get(atrasado.id);
    faixa = (
      <Faixa
        ponto="bg-danger"
        rotulo={textoDeAtraso(atrasado.minutos)}
        tomDoRotulo="text-danger"
        nome={atrasado.cliente}
        linha={`${atrasado.hora} · ${atrasado.servico}${comBarbeiro(atrasado)}`}
        acoes={
          texto ? (
            <span className="linha-muda text-[13px] text-ink-muted">{texto}</span>
          ) : (
            <>
              <Button size="sm" onClick={() => aoConcluir(atrasado.id)}>
                Concluir
              </Button>
              <Button size="sm" variant="secondary" onClick={() => aoMarcarFalta(atrasado.id)}>
                Não veio
              </Button>
            </>
          )
        }
      />
    );
  } else if (naCadeiraAgora) {
    const pct = Math.min(100, Math.max(0, (naCadeiraAgora.minutos / naCadeiraAgora.duracaoMin) * 100));
    const texto = emEnvio?.get(naCadeiraAgora.id);
    faixa = (
      <Faixa
        ponto="bg-gold-strong"
        rotulo={`Na cadeira · há ${naCadeiraAgora.minutos} min`}
        nome={naCadeiraAgora.cliente}
        linha={`${naCadeiraAgora.servico}${comBarbeiro(naCadeiraAgora)}${
          naCadeira.length > 1 ? ` · e mais ${contar(naCadeira.length - 1, "em andamento", "em andamento")}` : ""
        }`}
        progresso={pct}
        acoes={
          texto ? (
            <span className="linha-muda text-[13px] text-ink-muted">{texto}</span>
          ) : (
            <Button size="sm" onClick={() => aoConcluir(naCadeiraAgora.id)}>
              Concluir
            </Button>
          )
        }
      />
    );
  } else if (proximo) {
    faixa = (
      <Faixa
        ponto="bg-ink-muted"
        rotulo={`Próximo · ${textoDeContagem(proximo.minutos)}`}
        nome={proximo.cliente}
        linha={`${proximo.hora} · ${proximo.servico}${comBarbeiro(proximo)}`}
        acoes={<LinkDaFaixa href="#agenda-do-dia">Ver na agenda</LinkDaFaixa>}
      />
    );
  } else {
    faixa = (
      <Faixa
        ponto="bg-ink-muted"
        rotulo={resumo.total > 0 ? "Dia encerrado" : "Agenda de hoje"}
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
        acoes={resumo.total > 0 ? <LinkDaFaixa href="#caixa-de-hoje">Ver o fechamento</LinkDaFaixa> : undefined}
      />
    );
  }

  return (
    <section aria-label="Agora" className="rounded-superficie border border-border bg-surface">
      {faixa}
      {depois.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <TituloDoBloco>Depois</TituloDoBloco>
          <ul className="divide-y divide-border/70">
            {depois.map((p) => (
              <li key={p.id} className="flex items-baseline gap-3 py-1.5 text-[14px]">
                <span className="w-12 shrink-0 font-medium tabular-nums text-ink">{p.hora}</span>
                <span className="min-w-0 flex-1 truncate text-ink">
                  {p.cliente} <span className="text-ink-muted">· {p.servico}</span>
                </span>
                <span className="shrink-0 text-[12.5px] tabular-nums text-ink-muted">{textoDeContagem(p.minutos)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mostrarPorBarbeiro && (
        <div className="border-t border-border px-4 py-3">
          <TituloDoBloco>Por barbeiro</TituloDoBloco>
          <ul className="divide-y divide-border/70">
            {linhasPorBarbeiro.map((l) => (
              <li
                key={l.staffId ?? "sem-barbeiro"}
                className="grid grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] items-baseline gap-2 py-1.5 text-[14px]"
              >
                <span className="min-w-0 truncate text-ink">{nomeDoBarbeiro(l.staffId) ?? "Sem barbeiro"}</span>
                <span className="text-right text-[12.5px] tabular-nums text-ink-muted">
                  <span className="font-medium text-ink">{l.feitos}</span> {plural(l.feitos, "feito", "feitos")}
                </span>
                <span className="text-right text-[12.5px] tabular-nums text-ink-muted">
                  <span className="font-medium text-ink">{l.pelaFrente}</span> pela frente
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {mostrarAmanha && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <TituloDoBloco>
              Amanhã{amanha.total > 0 ? ` · ${contar(amanha.total, "marcado", "marcados")}` : ""}
            </TituloDoBloco>
            <button
              type="button"
              onClick={aoVerAmanha}
              className="alvo-toque text-[13px] font-medium text-gold-strong transition-colors duration-150 hover:underline"
            >
              Ver amanhã
            </button>
          </div>
          {amanha.total === 0 ? (
            <p className="py-1.5 text-[14px] text-ink-muted">Nada marcado amanhã ainda.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {amanha.primeiros.map((p) => (
                <li key={p.id} className="flex items-baseline gap-3 py-1.5 text-[14px]">
                  <span className="w-12 shrink-0 font-medium tabular-nums text-ink">{p.hora}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {p.cliente} <span className="text-ink-muted">· {p.servico}</span>
                  </span>
                </li>
              ))}
              {amanha.total > amanha.primeiros.length && (
                <li className="py-1.5 pl-[3.75rem] text-[12.5px] text-ink-muted">
                  e mais {contar(amanha.total - amanha.primeiros.length, "horário", "horários")}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** A linha de foco: ponto, o que é, quem, e a ação — tudo na mesma faixa. */
function Faixa({
  ponto,
  rotulo,
  tomDoRotulo = "text-ink-muted",
  nome,
  linha,
  progresso,
  acoes,
}: {
  ponto: string;
  rotulo: string;
  tomDoRotulo?: string;
  nome: string;
  linha: string;
  /** 0–100: quanto do atendimento em curso já passou. */
  progresso?: number;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className={cn("flex items-center gap-2 text-[13px] font-medium", tomDoRotulo)}>
          <i aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", ponto)} />
          {rotulo}
        </p>
        <p className="mt-0.5 truncate text-[15px] font-semibold text-ink">
          {nome} <span className="font-normal text-ink-muted">· {linha}</span>
        </p>
        {progresso !== undefined && (
          <div
            role="progressbar"
            aria-label="Tempo do atendimento"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progresso)}
            className="mt-2 h-1 max-w-xs overflow-hidden rounded-full bg-surface-raised"
          >
            <div className="h-full rounded-full bg-gold-strong" style={{ width: `${progresso}%` }} />
          </div>
        )}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}

function LinkDaFaixa({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="alvo-toque rounded-controle px-1 text-[13px] font-medium text-gold-strong transition-colors duration-150 hover:underline"
    >
      {children}
    </a>
  );
}

function TituloDoBloco({ children }: { children: React.ReactNode }) {
  return <p className="mb-0.5 text-[12.5px] font-medium text-ink-muted">{children}</p>;
}

function Numero({
  rotulo,
  titulo,
  className,
  children,
}: {
  rotulo: string;
  titulo?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col px-4 py-3.5", className)} title={titulo}>
      <p className="text-[12.5px] font-medium text-ink-muted">{rotulo}</p>
      {children}
    </div>
  );
}

function Valor({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("mt-0.5 text-[22px] font-semibold leading-tight tracking-[-0.01em] tabular-nums text-ink", className)}>
      {children}
    </p>
  );
}

function Legenda({ children, destaque }: { children: React.ReactNode; destaque?: boolean }) {
  return (
    <p className={cn("mt-1 text-[12.5px] leading-snug", destaque ? "font-medium text-gold-strong" : "text-ink-muted")}>
      {children}
    </p>
  );
}
