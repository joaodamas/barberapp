"use client";

import { paraHora, paraMinutos, type EntradaDeJornada } from "@/lib/jornada";
import { OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { NivelDoEncaixe } from "@/lib/encaixe";
import { montarGrade, type BarbeiroDaGrade, type GradeMontada } from "@/lib/grade-por-barbeiro";
import { EtiquetaMensalista } from "@/components/agenda/etiqueta-mensalista";
import { EtiquetaEncaixe } from "@/components/agenda/etiqueta-encaixe";
import { medidasDasColunas } from "@/lib/barra-da-agenda";
import { iniciaisDe } from "@/lib/monograma";

/**
 * O dia inteiro em grade — pedido do dono (28/09): ver de relance o que está
 * livre, o que está ocupado e onde cada pedido de encaixe cairia, lado a lado.
 *
 * Linhas = horários da jornada (a grade da barbearia). Cada atendimento ocupa
 * as linhas do SEU tempo (um combo de 90 min ocupa três linhas de 30).
 *
 * Uma COLUNA POR BARBEIRO (auditoria de 09/10): dois barbeiros com cliente às
 * 10h são duas cadeiras, não um encaixe. O "Livre · marcar" é de cada coluna —
 * numa barbearia de três cadeiras a vaga de um não some porque o outro está
 * ocupado. Encaixe aprovado que sobrepõe outro atendimento DO MESMO barbeiro
 * continua indo para uma segunda faixa, lado a lado — é exatamente o aperto que
 * ele representa. Pedidos ainda sem resposta ficam na coluna da direita, na
 * altura do horário pedido, com a sugestão.
 *
 * No celular colunas lado a lado não cabem: em "Todos" a grade volta a ser uma
 * coluna só, com o nome do barbeiro em cada cartão; escolhendo um barbeiro no
 * filtro, só a coluna dele. Barbearia de um barbeiro só continua como sempre.
 *
 * A conta mora em `lib/grade-por-barbeiro.ts` (com teste); aqui só se desenha.
 * A grade só MOSTRA. Tocar num atendimento ou pedido seleciona, e as ações
 * aparecem logo abaixo (a tela reaproveita os cartões da lista).
 */

const ESTILO_DO_NIVEL: Record<NivelDoEncaixe, { rotulo: string; classe: string }> = {
  vagou: { rotulo: "Pode aprovar", classe: "border-success/50 bg-success/10 text-success" },
  cabe: { rotulo: "Dá para encaixar", classe: "border-success/50 bg-success/10 text-success" },
  apertado: { rotulo: "Apertado", classe: "border-gold/60 bg-gold/10 text-gold-strong" },
  "nao-recomendado": { rotulo: "Não recomendado", classe: "border-danger/50 bg-danger/10 text-danger" },
};

type Pedido = { booking: Doc<BookingDoc>; nivel: NivelDoEncaixe };
export type LivreEscolhido = { hora: string; barbeiroId: string | null };

export function GradeDoDia({
  dia,
  reservas,
  pedidos,
  schedule,
  equipe,
  openWeekdays,
  filtro,
  selecionadoId,
  aoSelecionar,
  aoMarcarLivre,
  podeEditar,
  mensalistas,
  emEnvio,
}: {
  /** Clientes com plano ativo (`useMensalistasAtivos`). */
  mensalistas?: Set<string>;
  /** Reservas com conclusão/falta esperando o "Desfazer": id → "Concluindo…". */
  emEnvio?: ReadonlyMap<string, string>;
  dia: string;
  reservas: Doc<BookingDoc>[];
  pedidos: Pedido[];
  schedule: EntradaDeJornada | null | undefined;
  /** A equipe do salão; cada barbeiro ativo que trabalha no dia ganha uma coluna. */
  equipe: BarbeiroDaGrade[];
  /** `policies.openWeekdays`, como o servidor. */
  openWeekdays?: number[];
  /** Barbeiro do filtro (`null` = Todos). */
  filtro: string | null;
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
  /** Recebe a hora da linha e o barbeiro da coluna (nulo na coluna única). */
  aoMarcarLivre: (livre: LivreEscolhido) => void;
  podeEditar: boolean;
}) {
  const ocupantes = reservas.filter((b) => OCCUPIES_SLOT.includes(b.status));
  const doPedido = pedidos.map((p) => p.booking);
  const comum = { dia, schedule, equipe, openWeekdays, reservas: ocupantes, pedidos: doPedido, filtro };
  const emColunas = montarGrade({ ...comum, modo: "colunas" });
  if (emColunas.colunas.length === 0 && pedidos.length === 0) return null;

  const nomeDe = (id: string | null | undefined, gravado?: string | null) =>
    equipe.find((b) => b.id === id)?.name ?? gravado ?? "";
  const varios = equipe.filter((b) => b.active !== false).length > 1;
  const props = { pedidos, selecionadoId, aoSelecionar, aoMarcarLivre, podeEditar, mensalistas, nomeDe, varios, emEnvio };

  /* Uma coluna só (barbearia de um barbeiro, ou filtro): serve a qualquer tela.
   * Com o nome do barbeiro no cabeçalho — filtrar não pode apagar de quem é a
   * coluna (a coluna única sem nome é a barbearia sem equipe cadastrada). */
  if (emColunas.colunas.length <= 1) {
    return <Grade {...props} montada={emColunas} comCabecalho={!!emColunas.colunas[0]?.nome} comNome={false} />;
  }

  return (
    <>
      <div className="hidden md:block">
        <Grade {...props} montada={emColunas} comCabecalho comNome={false} />
      </div>
      <div className="md:hidden">
        <Grade {...props} montada={montarGrade({ ...comum, modo: "unica" })} comCabecalho={false} comNome />
      </div>
    </>
  );
}

function Grade({
  montada,
  pedidos,
  selecionadoId,
  aoSelecionar,
  aoMarcarLivre,
  podeEditar,
  mensalistas,
  nomeDe,
  varios,
  emEnvio,
  comCabecalho,
  comNome,
}: {
  emEnvio?: ReadonlyMap<string, string>;
  montada: GradeMontada<Doc<BookingDoc>>;
  pedidos: Pedido[];
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
  aoMarcarLivre: (livre: LivreEscolhido) => void;
  podeEditar: boolean;
  mensalistas?: Set<string>;
  nomeDe: (id: string | null | undefined, gravado?: string | null) => string;
  /** Mais de um barbeiro ativo: o pedido de encaixe diz de quem é. */
  varios: boolean;
  /** Linha de nomes no topo das colunas (desktop). */
  comCabecalho: boolean;
  /** Nome do barbeiro em cada cartão (celular em "Todos"). */
  comNome: boolean;
}) {
  const { grade, abre, linhas, colunas } = montada;
  const linhaDe = (min: number) => Math.floor((min - abre) / grade) + 1;
  const temPedidos = pedidos.length > 0;
  const lado = colunas.length > 1;

  /* Em que trilha do grid cada coluna começa (a primeira é a das horas). */
  const inicios: number[] = [];
  let proxima = 2;
  for (const c of colunas) {
    inicios.push(proxima);
    proxima += c.nFaixas;
  }
  const totalFaixas = Math.max(1, proxima - 2);
  /* Largura mínima e máxima por quantidade de colunas: uma só não estica na
   * tela toda (parecia vazia), duas ou três não ficam espremidas nem gigantes. */
  const medidas = medidasDasColunas(colunas.length);
  const colunasCss = `3rem repeat(${totalFaixas}, ${medidas.trilha})${temPedidos ? ` ${medidas.pedidos}` : ""}`;
  const janelaDe = (b: Doc<BookingDoc>) => {
    const ini = paraMinutos(b.time) ?? 0;
    return [ini, ini + (Number(b.durationMin) || grade)] as const;
  };

  return (
    <div
      className={
        "overflow-x-auto rounded-superficie border border-border bg-surface p-2 " +
        (medidas.contida ? "w-fit max-w-full" : "")
      }
    >
      <div className={lado && !medidas.contida ? "min-w-[34rem]" : undefined}>
        {(temPedidos || comCabecalho) && (
          <div className="mb-1 grid gap-x-1 text-[12.5px] text-ink-muted" style={{ gridTemplateColumns: colunasCss }}>
            <span />
            {comCabecalho ? (
              colunas.map((c, i) => (
                <span
                  key={c.id ?? `c${i}`}
                  className="flex min-w-0 items-center justify-center gap-2 py-1 font-semibold text-ink"
                  style={{ gridColumn: `${inicios[i]} / span ${c.nFaixas}` }}
                  title={c.nome}
                >
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gold/15 text-[11px] font-semibold text-gold-strong"
                  >
                    {iniciaisDe(c.nome)}
                  </span>
                  <span className="truncate">{c.nome}</span>
                </span>
              ))
            ) : (
              <span style={{ gridColumn: `2 / span ${totalFaixas}` }}>Agenda</span>
            )}
            {temPedidos && <span>Pedidos de encaixe</span>}
          </div>
        )}
        <div
          className="grid gap-x-1"
          style={{ gridTemplateColumns: colunasCss, gridTemplateRows: `repeat(${linhas.length}, minmax(2.75rem, auto))` }}
        >
          {linhas.map((t, i) => (
            <div
              key={`h${t}`}
              className="border-t border-border/60 pr-1 pt-0.5 text-right text-[12.5px] tabular-nums text-ink-muted"
              style={{ gridColumn: 1, gridRow: i + 1 }}
            >
              {paraHora(t)}
            </div>
          ))}

          {colunas.map((c, ci) => {
            const lugar = { gridColumn: `${inicios[ci]} / span ${c.nFaixas}` };
            const chave = c.id ?? `c${ci}`;
            return (
              <ColunaDaGradeView
                key={chave}
                aoMarcarLivre={aoMarcarLivre}
                podeEditar={podeEditar}
                coluna={c}
                lugar={lugar}
                linhaDe={linhaDe}
                linhas={linhas}
                abre={abre}
                grade={grade}
                inicio={inicios[ci]}
                comNome={comNome}
                selecionadoId={selecionadoId}
                aoSelecionar={aoSelecionar}
                mensalistas={mensalistas}
                nomeDe={nomeDe}
                emEnvio={emEnvio}
              />
            );
          })}

          {pedidos.map(({ booking: b, nivel }) => {
            const [inicio, fim] = janelaDe(b);
            const estilo = ESTILO_DO_NIVEL[nivel];
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => aoSelecionar(b.id)}
                aria-pressed={selecionadoId === b.id}
                className={
                  "my-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-controle border border-dashed px-2 py-1 text-left " +
                  (selecionadoId === b.id ? "ring-2 ring-gold-strong " : "") +
                  estilo.classe
                }
                style={{ gridColumn: 2 + totalFaixas, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
              >
                <span className="w-full truncate text-xs font-semibold text-ink">
                  {paraHora(inicio)}–{paraHora(fim)} · {b.clientName}
                </span>
                {varios && (
                  <span className="w-full truncate text-[12.5px] text-ink-muted">{nomeDe(b.staffId)}</span>
                )}
                <span className="text-[12.5px] font-medium">{estilo.rotulo}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Os elementos de UMA coluna: intervalos, livres e os atendimentos dela. */
function ColunaDaGradeView({
  coluna: c,
  lugar,
  inicio: trilhaInicial,
  linhaDe,
  linhas,
  abre,
  grade,
  comNome,
  selecionadoId,
  aoSelecionar,
  aoMarcarLivre,
  podeEditar,
  mensalistas,
  nomeDe,
  emEnvio,
}: {
  emEnvio?: ReadonlyMap<string, string>;
  coluna: GradeMontada<Doc<BookingDoc>>["colunas"][number];
  lugar: { gridColumn: string };
  inicio: number;
  linhaDe: (min: number) => number;
  linhas: number[];
  abre: number;
  grade: number;
  comNome: boolean;
  selecionadoId: string | null;
  aoSelecionar: (id: string) => void;
  aoMarcarLivre: (livre: LivreEscolhido) => void;
  podeEditar: boolean;
  mensalistas?: Set<string>;
  nomeDe: (id: string | null | undefined, gravado?: string | null) => string;
}) {
  const linhaDoInicio = (t: number) => Math.floor((t - abre) / grade) + 1;
  const prefixo = c.id ?? "todos";
  return (
    <>
      {c.folga && (
        <div
          className="my-0.5 flex items-center justify-center rounded-controle bg-surface-raised px-2 text-center text-[12.5px] text-ink-muted"
          style={{ ...lugar, gridRow: `1 / ${linhas.length + 1}` }}
        >
          Não trabalha neste dia
        </div>
      )}

      {c.intervalos.map((t) => (
        <div
          key={`p${prefixo}${t}`}
          className="my-0.5 flex items-center rounded-controle bg-surface-raised px-2 text-[12.5px] text-ink-muted"
          style={{ ...lugar, gridRow: linhaDoInicio(t) }}
        >
          Intervalo
        </div>
      ))}

      {c.livres.map((t) =>
        podeEditar ? (
          /* A célula livre fica limpa: "Livre · marcar" em todas, com seis colunas,
           * era ruído. O convite aparece ao passar o mouse ou focar; no toque, a
           * célula inteira é o alvo e abre o balcão já na hora e no barbeiro. */
          <button
            key={`l${prefixo}${t}`}
            type="button"
            onClick={() => aoMarcarLivre({ hora: paraHora(t), barbeiroId: c.id })}
            aria-label={`Marcar às ${paraHora(t)}${c.nome ? ` com ${c.nome}` : ""}`}
            className="group my-0.5 flex cursor-pointer items-center rounded-controle border-t border-border/50 px-2 text-left text-[12.5px] text-ink-muted transition-colors duration-150 hover:border-transparent hover:bg-gold/10 hover:text-gold-strong focus-visible:border-transparent focus-visible:bg-gold/10 focus-visible:text-gold-strong"
            style={{ ...lugar, gridRow: linhaDoInicio(t) }}
          >
            <span
              aria-hidden
              className="opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              + Marcar {paraHora(t)}
            </span>
          </button>
        ) : (
          <div
            key={`l${prefixo}${t}`}
            className="my-0.5 flex items-center rounded-controle border-t border-border/50 px-2 text-[12.5px] text-ink-muted"
            style={{ ...lugar, gridRow: linhaDoInicio(t) }}
          >
            <span className="sr-only">Livre às {paraHora(t)}</span>
          </div>
        )
      )}

      {c.faixas.map(({ booking: b, inicio, fim, faixa }) => {
        const falta = b.status === "no_show";
        const feito = b.status === "completed";
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => aoSelecionar(b.id)}
            aria-pressed={selecionadoId === b.id}
            className={
              "my-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-controle border px-2 py-1 text-left transition-colors duration-150 " +
              (selecionadoId === b.id ? "ring-2 ring-gold-strong " : "") +
              (falta
                ? "border-danger/40 bg-danger/5 text-ink-muted"
                : feito
                  ? "border-success/40 bg-success/5 text-ink"
                  : b.isFitIn
                    ? "border-encaixe/50 border-l-4 border-l-encaixe bg-encaixe/5 text-ink"
                    : "border-gold/40 bg-gold/5 text-ink")
            }
            style={{ gridColumn: trilhaInicial + faixa, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
          >
            <span className="flex w-full min-w-0 items-center gap-1.5 text-xs font-semibold">
              <span className="truncate">
                {paraHora(inicio)}–{paraHora(fim)} · {b.clientName}
              </span>
              {b.isFitIn && <EtiquetaEncaixe />}
              {mensalistas?.has(b.clientId) && <EtiquetaMensalista />}
            </span>
            <span className="w-full truncate text-[12.5px] text-ink-muted">
              {comNome && <span className="font-medium text-ink">{nomeDe(b.staffId)} · </span>}
              {((b as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço"}
              {b.horarioFixoId ? " · horário fixo" : ""}
              {emEnvio?.get(b.id)
                ? ` · ${emEnvio.get(b.id)!.toLowerCase()}`
                : feito
                  ? " · concluído"
                  : falta
                    ? " · não veio"
                    : ""}
            </span>
          </button>
        );
      })}
    </>
  );
}
