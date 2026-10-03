import { AlertCircle, Clock, Scissors } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { NAO_APURADO } from "@/lib/apuracao";
import { contar } from "@/lib/plural";
import {
  textoDeAtraso,
  textoDeContagem,
  textoDeLivres,
  type ResumoDoDia,
} from "@/lib/resumo-do-dia";

/**
 * O topo da tela Hoje (02/10): data + "agora/próximo" + UMA barra de métricas.
 *
 * Antes eram cinco caixas soltas (três contadores e dois valores), com a mesma
 * importância visual e um vão sobrando à direita. Aqui o que pede ação vem
 * primeiro (quem está na cadeira, quem é o próximo, quem atrasou) e os números
 * do dia ficam numa régua só, com divisórias.
 *
 * Dinheiro: previsão e recebido ficam LADO A LADO, sem barra entre eles — o
 * recebido é caixa de todas as origens (atendimento, venda, mensalidade) e a
 * previsão é só serviço da agenda; um "% recebido" já mostrou 244% (F5/F6).
 */
export function ResumoDoDiaTopo({
  dataLonga,
  resumo,
  ocupacaoPct,
  horariosLivres,
  previsao,
  recebido,
  agendaIlegivel,
  pagamentosIlegiveis,
}: {
  dataLonga: string;
  resumo: ResumoDoDia;
  ocupacaoPct: number;
  horariosLivres: number;
  previsao: number;
  recebido: number;
  agendaIlegivel: boolean;
  pagamentosIlegiveis: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-strong">Hoje</p>
          <h1 className="text-xl font-semibold text-ink first-letter:uppercase md:text-3xl md:tracking-tight">
            {dataLonga}
          </h1>
        </div>
        {!agendaIlegivel && <AgoraProximo resumo={resumo} />}
      </div>

      <section
        aria-label="Números do dia"
        className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface lg:grid-cols-4"
      >
        <Metrica
          rotulo="Atendimentos"
          valor={agendaIlegivel ? NAO_APURADO : String(resumo.total)}
          detalhe={
            agendaIlegivel
              ? undefined
              : resumo.total === 0
                ? "nenhum marcado"
                : `${contar(resumo.feitos, "feito", "feitos")} · ${resumo.pelaFrente} pela frente`
          }
          barra={
            !agendaIlegivel && resumo.progressoPct !== null
              ? { pct: resumo.progressoPct, rotulo: "Atendimentos concluídos" }
              : undefined
          }
          className="border-b border-r border-border lg:border-b-0"
        />
        <Metrica
          rotulo="Ocupação"
          valor={agendaIlegivel ? NAO_APURADO : formatPctPtBR(ocupacaoPct, 0)}
          detalhe={agendaIlegivel ? undefined : textoDeLivres(horariosLivres, ocupacaoPct)}
          destaqueDetalhe={!agendaIlegivel && horariosLivres <= 0 && ocupacaoPct >= 100}
          barra={agendaIlegivel ? undefined : { pct: Math.min(ocupacaoPct, 100), rotulo: "Ocupação das cadeiras" }}
          className="border-b border-border lg:border-b-0 lg:border-r"
        />
        <Metrica
          rotulo="Previsão do dia"
          valor={agendaIlegivel ? NAO_APURADO : formatBRL(previsao)}
          detalhe="serviços agendados para hoje, já sem faltas e cancelamentos"
          className="border-r border-border"
        />
        <Metrica
          rotulo="Recebido hoje"
          valor={pagamentosIlegiveis ? NAO_APURADO : formatBRL(recebido)}
          detalhe="atendimento, venda e mensalidade"
          valorClassName="text-success"
        />
      </section>
    </div>
  );
}

function AgoraProximo({ resumo }: { resumo: ResumoDoDia }) {
  const { naCadeira, atrasado, proximo } = resumo;
  if (naCadeira.length === 0 && !atrasado && !proximo) {
    return (
      <p className="text-sm text-ink-muted">
        {resumo.total > 0 ? "Sem mais atendimentos por hoje." : "Nenhum atendimento marcado para hoje."}
      </p>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border bg-surface px-4 py-3 sm:flex-row sm:items-stretch sm:gap-0 sm:px-0 sm:py-0",
        /* Duas linhas (agora + próximo) pedem a largura; uma só fica do tamanho dela. */
        (atrasado || naCadeira.length > 0) && proximo && "lg:min-w-[30rem]"
      )}
    >
      {atrasado ? (
        <Linha
          rotulo={textoDeAtraso(atrasado.minutos)}
          tom="perigo"
          icone={<AlertCircle size={14} aria-hidden />}
          hora={atrasado.hora}
          texto={`${atrasado.cliente} · ${atrasado.servico}`}
        />
      ) : naCadeira.length > 0 ? (
        <Linha
          rotulo="Na cadeira agora"
          tom="marca"
          icone={<Scissors size={14} aria-hidden />}
          hora={naCadeira[0].hora}
          texto={
            naCadeira.length === 1
              ? `${naCadeira[0].cliente} · ${naCadeira[0].servico}`
              : `${naCadeira[0].cliente} e mais ${naCadeira.length - 1}`
          }
        />
      ) : null}
      {proximo && (
        <Linha
          rotulo={`Próximo · ${textoDeContagem(proximo.minutos)}`}
          tom="neutro"
          icone={<Clock size={14} aria-hidden />}
          hora={proximo.hora}
          texto={`${proximo.cliente} · ${proximo.servico}`}
          separador={Boolean(atrasado || naCadeira.length > 0)}
        />
      )}
    </div>
  );
}

function Linha({
  rotulo,
  tom,
  icone,
  hora,
  texto,
  separador,
}: {
  rotulo: string;
  tom: "perigo" | "marca" | "neutro";
  icone: React.ReactNode;
  hora: string;
  texto: string;
  separador?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-0.5 sm:px-4 sm:py-3",
        separador && "border-t border-border pt-2 sm:border-l sm:border-t-0 sm:pt-3"
      )}
    >
      <span
        className={cn(
          "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider",
          tom === "perigo" ? "text-danger" : tom === "marca" ? "text-gold-strong" : "text-ink-muted"
        )}
      >
        {icone}
        {rotulo}
      </span>
      <span className="flex min-w-0 items-baseline gap-2 text-sm text-ink">
        <b className="font-semibold tabular-nums">{hora}</b>
        <span className="truncate">{texto}</span>
      </span>
    </div>
  );
}

function Metrica({
  rotulo,
  valor,
  detalhe,
  destaqueDetalhe,
  barra,
  valorClassName,
  className,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  destaqueDetalhe?: boolean;
  barra?: { pct: number; rotulo: string };
  valorClassName?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 p-4 md:p-5", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted md:text-xs">{rotulo}</p>
      <p className={cn("font-display text-xl font-semibold tabular-nums text-ink md:text-2xl", valorClassName)}>
        {valor}
      </p>
      {barra && (
        <div
          role="progressbar"
          aria-label={barra.rotulo}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(barra.pct)}
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
        >
          <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(0, Math.min(100, barra.pct))}%` }} />
        </div>
      )}
      {detalhe && (
        <p className={cn("text-xs", destaqueDetalhe ? "font-semibold text-gold-strong" : "text-ink-muted")}>{detalhe}</p>
      )}
    </div>
  );
}
