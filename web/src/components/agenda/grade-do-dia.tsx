"use client";

import { useEffect, useState } from "react";
import { paraHora, paraMinutos, type EntradaDeJornada } from "@/lib/jornada";
import { OCCUPIES_SLOT, type BookingDoc } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";
import type { NivelDoEncaixe } from "@/lib/encaixe";
import { montarGrade, type BarbeiroDaGrade, type GradeMontada } from "@/lib/grade-por-barbeiro";
import { EtiquetaMensalista } from "@/components/agenda/etiqueta-mensalista";
import { EtiquetaEncaixe } from "@/components/agenda/etiqueta-encaixe";
import { medidasDasColunas } from "@/lib/barra-da-agenda";
import { iniciaisDe } from "@/lib/monograma";
import { toISODate } from "@/lib/format";

/**
 * O dia inteiro em grade — pedido do dono (28/09): ver de relance o que está
 * livre, o que está ocupado e onde cada pedido de encaixe cairia, lado a lado.
 *
 * Linhas = horários da jornada (a grade da barbearia). Cada atendimento ocupa
 * as linhas do SEU tempo (um combo de 90 min ocupa três linhas de 30).
 *
 * Uma COLUNA POR BARBEIRO (auditoria de 09/10): dois barbeiros com cliente às
 * 10h são duas cadeiras, não um encaixe. O horário livre é de cada coluna —
 * numa barbearia de três cadeiras a vaga de um não some porque o outro está
 * ocupado. Encaixe aprovado que sobrepõe outro atendimento DO MESMO barbeiro
 * continua indo para uma segunda faixa, lado a lado — é exatamente o aperto que
 * ele representa. Pedidos ainda sem resposta ficam na coluna da direita, na
 * altura do horário pedido, com a sugestão.
 *
 * Desenho (guia do dono, 09/10): como uma agenda de verdade — linhas finas por
 * hora (tracejadas na meia hora), nenhuma caixa nos horários vazios, e cada
 * atendimento como um bloco solto com a situação numa barra de 4px à esquerda
 * e fundo quase transparente. O nome do cliente é o que mais se lê.
 *
 * No celular colunas lado a lado não cabem: em "Todos" a grade volta a ser uma
 * coluna só, com o nome do barbeiro em cada cartão; escolhendo um barbeiro no
 * filtro, só a coluna dele. Barbearia de um barbeiro só continua como sempre.
 *
 * A conta mora em `lib/grade-por-barbeiro.ts` (com teste); aqui só se desenha.
 * A grade só MOSTRA. Tocar num atendimento ou pedido seleciona, e as ações
 * aparecem na janela do atendimento.
 */

const ESTILO_DO_NIVEL: Record<NivelDoEncaixe, { rotulo: string; classe: string }> = {
  vagou: { rotulo: "Pode aprovar", classe: "border-success/50 bg-success/10 text-success" },
  cabe: { rotulo: "Dá para encaixar", classe: "border-success/50 bg-success/10 text-success" },
  apertado: { rotulo: "Apertado", classe: "border-gold/60 bg-gold/10 text-gold-strong" },
  "nao-recomendado": { rotulo: "Não recomendado", classe: "border-danger/50 bg-danger/10 text-danger" },
};

/** Altura de cada linha da grade. Fixa de propósito: com altura variável a
 * linha do "agora" não tem onde cair e as colunas desalinham quando um bloco
 * tem mais texto que o vizinho. */
const ALTURA_DA_LINHA_PX = 52;

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
  const props = { dia, pedidos, selecionadoId, aoSelecionar, aoMarcarLivre, podeEditar, mensalistas, nomeDe, varios, emEnvio };

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

/** A hora de agora, renovada a cada minuto — para a linha do "agora" e o
 * "Atrasado" dos blocos. */
function useAgora() {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return agora;
}

function Grade({
  montada,
  dia,
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
  dia: string;
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
  const agora = useAgora();
  const ehHoje = dia === toISODate(agora);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

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
  const colunasCss = `3.5rem repeat(${totalFaixas}, ${medidas.trilha})${temPedidos ? ` ${medidas.pedidos}` : ""}`;
  const janelaDe = (b: Doc<BookingDoc>) => {
    const ini = paraMinutos(b.time) ?? 0;
    return [ini, ini + (Number(b.durationMin) || grade)] as const;
  };
  const fimDoDia = abre + linhas.length * grade;
  const mostraAgora = ehHoje && minutosAgora >= abre && minutosAgora <= fimDoDia;
  const topoDoAgora = ((minutosAgora - abre) / grade) * ALTURA_DA_LINHA_PX;
  const todasAsLinhas = `1 / ${linhas.length + 1}`;

  return (
    <div
      className={
        "overflow-x-auto rounded-superficie border border-border bg-surface " +
        (medidas.contida ? "w-fit max-w-full" : "")
      }
    >
      <div className={lado && !medidas.contida ? "min-w-[34rem]" : undefined}>
        {(temPedidos || comCabecalho) && (
          <div className="grid border-b border-border text-[13px] text-ink-muted" style={{ gridTemplateColumns: colunasCss }}>
            <span />
            {comCabecalho ? (
              colunas.map((c, i) => (
                <span
                  key={c.id ?? `c${i}`}
                  className={
                    "flex min-w-0 items-center gap-2 px-3 py-2.5 font-semibold text-ink " +
                    (i > 0 ? "border-l border-border" : "")
                  }
                  style={{ gridColumn: `${inicios[i]} / span ${c.nFaixas}` }}
                  title={c.nome}
                >
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[10.5px] font-semibold text-ink-muted"
                  >
                    {iniciaisDe(c.nome)}
                  </span>
                  <span className="truncate">{c.nome}</span>
                </span>
              ))
            ) : (
              <span className="px-3 py-2.5" style={{ gridColumn: `2 / span ${totalFaixas}` }}>
                Agenda
              </span>
            )}
            {temPedidos && <span className="border-l border-border px-3 py-2.5">Pedidos de encaixe</span>}
          </div>
        )}
        <div
          className="relative grid"
          style={{ gridTemplateColumns: colunasCss, gridTemplateRows: `repeat(${linhas.length}, ${ALTURA_DA_LINHA_PX}px)` }}
        >
          {/* Fundo: uma linha fina por hora, tracejada na meia hora, e o
              separador de cada barbeiro. Nenhuma caixa por horário vazio. */}
          {linhas.map((t, i) => {
            const cheia = t % 60 === 0;
            return (
              <div key={`g${t}`} className="contents">
                <div
                  aria-hidden
                  className={"pointer-events-none border-t " + (cheia ? "border-border-strong/45" : "border-dashed border-border-strong/25")}
                  style={{ gridColumn: "2 / -1", gridRow: i + 1 }}
                />
                <div
                  className={
                    "pr-2 pt-1 text-right tabular-nums " +
                    (cheia ? "text-[11.5px] font-medium text-ink-muted" : "text-[10.5px] text-ink-muted/60")
                  }
                  style={{ gridColumn: 1, gridRow: i + 1 }}
                >
                  {paraHora(t)}
                </div>
              </div>
            );
          })}
          {colunas.map((c, ci) =>
            ci === 0 ? null : (
              <div
                key={`s${c.id ?? ci}`}
                aria-hidden
                className="pointer-events-none border-l border-border"
                style={{ gridColumn: inicios[ci], gridRow: todasAsLinhas }}
              />
            )
          )}
          {temPedidos && (
            <div
              aria-hidden
              className="pointer-events-none border-l border-border"
              style={{ gridColumn: 2 + totalFaixas, gridRow: todasAsLinhas }}
            />
          )}

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
                minutosAgora={ehHoje ? minutosAgora : null}
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
                  "relative z-10 mx-1 my-0.5 flex min-w-0 flex-col items-start overflow-hidden rounded-md border border-dashed px-2 py-1 text-left " +
                  (selecionadoId === b.id ? "ring-2 ring-gold-strong " : "") +
                  estilo.classe
                }
                style={{ gridColumn: 2 + totalFaixas, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
              >
                <span className="w-full truncate text-[12.5px] font-semibold text-ink">{b.clientName}</span>
                <span className="w-full truncate text-[11.5px] text-ink-muted">
                  {paraHora(inicio)}–{paraHora(fim)}
                  {varios ? ` · ${nomeDe(b.staffId)}` : ""}
                </span>
                <span className="text-[11.5px] font-medium">{estilo.rotulo}</span>
              </button>
            );
          })}

          {mostraAgora && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-0 z-20 border-t-2 border-danger"
              style={{ top: `${topoDoAgora}px`, left: "3.5rem" }}
            >
              <span className="absolute -left-1.5 -top-[5px] h-2 w-2 rounded-full bg-danger" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Cor da situação: só a barra de 4px à esquerda e um fundo quase
 * transparente (guia do dono, 09/10). Cartão inteiro pintado gritava; borda em
 * volta de todos virava gaiola. */
function estiloDoBloco(b: Doc<BookingDoc>, atrasado: boolean): { classe: string; situacao: string | null; tom: string } {
  if (b.status === "no_show") return { classe: "border-l-danger bg-danger/[0.06]", situacao: "Não veio", tom: "text-danger" };
  if (b.status === "completed") return { classe: "border-l-success bg-success/[0.07]", situacao: null, tom: "" };
  if (atrasado) return { classe: "border-l-danger bg-surface", situacao: "Atrasado", tom: "text-danger" };
  if (b.isFitIn) return { classe: "border-l-encaixe bg-encaixe/[0.07]", situacao: null, tom: "" };
  return { classe: "border-l-confirmado bg-confirmado/[0.06]", situacao: null, tom: "" };
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
  minutosAgora,
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
  /** Minutos de agora quando a grade é de hoje; `null` em outro dia. */
  minutosAgora: number | null;
}) {
  const linhaDoInicio = (t: number) => Math.floor((t - abre) / grade) + 1;
  const prefixo = c.id ?? "todos";
  /* Atendimento em aberto que começou há mais de 5 minutos, hoje. */
  const atrasado = (inicio: number) => minutosAgora !== null && inicio < minutosAgora - 5;
  /* Horário livre de hoje que já passou não convida a marcar. */
  const passou = (t: number) => minutosAgora !== null && t + grade <= minutosAgora;

  return (
    <>
      {c.folga && (
        <div
          className="mx-1 my-0.5 flex items-center justify-center rounded-md bg-surface-raised px-2 text-center text-[12.5px] text-ink-muted"
          style={{ ...lugar, gridRow: `1 / ${linhas.length + 1}` }}
        >
          Não trabalha neste dia
        </div>
      )}

      {c.intervalos.map((t) => (
        <div
          key={`p${prefixo}${t}`}
          className="mx-1 my-0.5 flex items-center rounded-md bg-surface-raised px-2 text-[11.5px] text-ink-muted"
          style={{ ...lugar, gridRow: linhaDoInicio(t) }}
        >
          Intervalo
        </div>
      ))}

      {c.livres.map((t) =>
        podeEditar && !passou(t) ? (
          /* A célula livre fica limpa: o convite aparece ao passar o mouse ou
           * focar; no toque, a célula inteira abre o balcão já na hora e no
           * barbeiro. */
          <button
            key={`l${prefixo}${t}`}
            type="button"
            onClick={() => aoMarcarLivre({ hora: paraHora(t), barbeiroId: c.id })}
            aria-label={`Marcar às ${paraHora(t)}${c.nome ? ` com ${c.nome}` : ""}`}
            className="group relative z-[1] mx-1 my-0.5 flex cursor-pointer items-center rounded-md px-2 text-left text-[12px] text-ink-muted transition-colors duration-150 hover:bg-surface-raised focus-visible:bg-surface-raised"
            style={{ ...lugar, gridRow: linhaDoInicio(t) }}
          >
            <span
              aria-hidden
              className="font-medium opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              + {paraHora(t)}
            </span>
          </button>
        ) : (
          <div key={`l${prefixo}${t}`} style={{ ...lugar, gridRow: linhaDoInicio(t) }}>
            <span className="sr-only">Livre às {paraHora(t)}</span>
          </div>
        )
      )}

      {c.faixas.map(({ booking: b, inicio, fim, faixa }) => {
        const aberto = b.status !== "completed" && b.status !== "no_show";
        const estilo = estiloDoBloco(b, aberto && atrasado(inicio));
        const enviando = emEnvio?.get(b.id);
        const servico = ((b as { serviceNames?: string[] }).serviceNames ?? []).join(" + ") || "Serviço";
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => aoSelecionar(b.id)}
            aria-pressed={selecionadoId === b.id}
            title={`${paraHora(inicio)}–${paraHora(fim)} · ${b.clientName} · ${servico}`}
            className={
              "relative z-10 mx-1 my-0.5 flex min-w-0 flex-col items-start justify-start overflow-hidden rounded-md border-l-4 px-2 py-1 text-left transition-[filter] duration-150 hover:brightness-[0.97] " +
              (selecionadoId === b.id ? "ring-2 ring-gold-strong " : "") +
              (enviando ? "opacity-70 " : "") +
              estilo.classe
            }
            style={{ gridColumn: trilhaInicial + faixa, gridRow: `${linhaDe(inicio)} / ${linhaDe(fim - 1) + 1}` }}
          >
            <span className="flex w-full min-w-0 items-center gap-1.5">
              <span
                className={
                  "truncate text-[13px] font-semibold leading-tight " +
                  (b.status === "completed" ? "text-ink-muted" : "text-ink")
                }
              >
                {b.clientName}
              </span>
              {b.isFitIn && <EtiquetaEncaixe />}
              {mensalistas?.has(b.clientId) && <EtiquetaMensalista />}
            </span>
            <span className="w-full truncate text-[11.5px] leading-tight text-ink-muted">
              <span className="tabular-nums">
                {paraHora(inicio)}–{paraHora(fim)}
              </span>
              {comNome && <> · {nomeDe(b.staffId)}</>}
              {" · "}
              {servico}
              {b.horarioFixoId ? " · fixo" : ""}
              {enviando ? (
                <span className="font-medium text-ink"> · {enviando.toLowerCase()}</span>
              ) : estilo.situacao ? (
                <span className={"font-semibold " + estilo.tom}> · {estilo.situacao}</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </>
  );
}
