"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { Voltar } from "@/components/ui/voltar";
import {
  combineStatus,
  useBookings,
  useServices,
  useStaff,
  useSubscribers,
} from "@/lib/db/use-shop-data";
import { useTenant } from "@/lib/tenant-context";
import { formatBRL, formatDatePtBR, formatPhonePtBR, rotuloDoMes } from "@/lib/format";
import { contar } from "@/lib/plural";
import {
  mesDoParametro,
  mesVizinho,
  montarRelatorio,
  type LinhaDoRelatorio,
} from "@/lib/relatorio-da-agenda";

/**
 * O relatório mensal da agenda, para o dono imprimir ou salvar em PDF.
 *
 * ## Por que `window.print()` e não uma biblioteca de PDF
 *
 * O navegador já sabe fazer PDF: no Chrome e no Android o destino "Salvar como
 * PDF" é a própria janela de impressão, e no iPhone a folha de impressão tem o
 * compartilhar › Salvar em Arquivos. Uma biblioteca somaria centenas de KB a um
 * painel que o dono abre no celular, para gerar um arquivo que teria de
 * reproduzir à mão o mesmo layout que o CSS de impressão já desenha. O que
 * esconde menu e botões e evita cortar o dia no meio está em `globals.css`,
 * sob `[data-relatorio]`.
 *
 * ## De onde vêm os dados
 *
 * Da MESMA assinatura de reservas da Agenda (`useBookings`): as duas telas
 * pedem a coleção com as mesmas opções, então o repositório compartilha o
 * listener, e ir da Agenda para o relatório não refaz a leitura. O recorte do
 * mês acontece em `montarRelatorio`, que é puro e testado.
 */
export function RelatorioDoMes({ mesParam }: { mesParam?: string }) {
  const tenant = useTenant();
  const router = useRouter();
  const reservas = useBookings();
  const equipe = useStaff();
  const servicos = useServices();
  const assinaturas = useSubscribers();
  const status = combineStatus(reservas, equipe, servicos, assinaturas);

  const [emitidoEm] = useState(() => new Date());
  const mes = mesDoParametro(mesParam, emitidoEm);
  const nomeDoMes = rotuloDoMes(mes);
  const nomeDaBarbearia = tenant.brand.name;

  const relatorio = useMemo(() => {
    const barbeiros = new Map(equipe.items.map((s) => [s.id, s.name]));
    const cardapio = new Map(servicos.items.map((s) => [s.id, s.name]));
    const mensalistas = new Set(
      assinaturas.items.filter((a) => a.status === "ativo").map((a) => a.clientId)
    );
    return montarRelatorio(reservas.items, mes, {
      nomeDoBarbeiro: (id) => barbeiros.get(id),
      nomeDoServico: (id) => cardapio.get(id),
      mensalistas,
      gradeMin: tenant.schedule?.slotMinutes ?? 30,
    });
  }, [reservas.items, equipe.items, servicos.items, assinaturas.items, mes, tenant.schedule?.slotMinutes]);

  /* O título da página vira o nome do arquivo que o navegador sugere ao salvar
   * o PDF. Sem isto, todo relatório sairia com o mesmo nome genérico do app, e
   * o dono teria três "Painel.pdf" na pasta sem saber qual é qual mês. */
  useEffect(() => {
    const anterior = document.title;
    document.title = `Agenda ${nomeDoMes} · ${nomeDaBarbearia}`;
    return () => {
      document.title = anterior;
    };
  }, [nomeDoMes, nomeDaBarbearia]);

  const irPara = (m: string) => router.push(`/painel/agenda/relatorio?mes=${m}`);
  const opcoes = useMemo(() => {
    /* Um ano para trás e três meses para frente: fechamento do mês passado e
     * a agenda que a janela de 60 dias dos mensalistas já abriu. O mês da URL
     * entra mesmo fora da faixa, senão o seletor mostraria outro mês. */
    const base = mesDoParametro(undefined, emitidoEm);
    const lista = Array.from({ length: 16 }, (_, i) => mesVizinho(base, 3 - i));
    return lista.includes(mes) ? lista : [mes, ...lista].sort().reverse();
  }, [emitidoEm, mes]);

  const { resumo } = relatorio;
  const emissao = emitidoEm.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div data-relatorio className="flex flex-col gap-4 pt-1 md:gap-6 md:pt-2">
      {/* Tudo que é controle fica de fora do papel. */}
      <div className="flex flex-col gap-3 print:hidden">
        <Voltar href="/painel/agenda" label="Agenda" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Mês anterior"
              onClick={() => irPara(mesVizinho(mes, -1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted hover:text-ink"
            >
              <ChevronLeft size={18} />
            </button>
            <select
              aria-label="Mês do relatório"
              value={mes}
              onChange={(e) => irPara(e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            >
              {opcoes.map((m) => (
                <option key={m} value={m}>
                  {rotuloDoMes(m)}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Próximo mês"
              onClick={() => irPara(mesVizinho(mes, 1))}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted hover:text-ink"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <Button onClick={() => window.print()} disabled={status !== "pronto"}>
            <Printer size={16} />
            Baixar PDF
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          Na janela que abrir, escolha “Salvar como PDF”. No iPhone, a folha de impressão tem o botão
          de compartilhar para salvar o arquivo; se ela não abrir pelo app instalado, abra o painel no
          Safari e use Compartilhar › Imprimir.
        </p>
      </div>

      <header className="flex flex-col gap-1 border-b border-border pb-3">
        <p className="text-sm text-ink-muted">{nomeDaBarbearia}</p>
        <h1 className="text-xl text-ink md:text-3xl md:tracking-tight">Agenda de {nomeDoMes.toLowerCase()}</h1>
        <p className="text-xs text-ink-muted">Emitido em {emissao}</p>
      </header>

      {status === "carregando" && <LoadingRows rows={4} oQue="o relatório" />}
      {status === "erro" && (
        <ErroAoCarregar
          oQue="o relatório"
          erro={reservas.error ?? equipe.error ?? servicos.error ?? assinaturas.error}
        />
      )}

      {status === "pronto" && (
        <>
          <section aria-label="Resumo do mês" className="sem-quebra flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6 print:grid-cols-6">
              <Numero rotulo="Reservas no mês" valor={resumo.total} />
              <Numero rotulo="Concluídos" valor={resumo.concluidos} />
              <Numero rotulo="A fazer" valor={resumo.aFazer} />
              <Numero rotulo="Faltas" valor={resumo.faltas} />
              <Numero rotulo="Cancelados" valor={resumo.cancelados} />
              {resumo.encaixesPendentes > 0 && (
                <Numero rotulo="Encaixes pendentes" valor={resumo.encaixesPendentes} />
              )}
              {resumo.outros > 0 && <Numero rotulo="Situação não reconhecida" valor={resumo.outros} />}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
              <Card padding="sm" className="print:border-border-strong">
                <p className="text-xs text-ink-muted">Valor previsto</p>
                <p className="font-display text-xl text-ink">{formatBRL(resumo.valorPrevisto)}</p>
                <p className="text-xs text-ink-muted">Concluídos e a fazer</p>
              </Card>
              <Card padding="sm" className="print:border-border-strong">
                <p className="text-xs text-ink-muted">Valor realizado</p>
                <p className="font-display text-xl text-ink">{formatBRL(resumo.valorRealizado)}</p>
                <p className="text-xs text-ink-muted">
                  Pago nos atendimentos concluídos
                  {resumo.valorCobertoPeloPlano > 0 &&
                    ` · mais ${formatBRL(resumo.valorCobertoPeloPlano)} cobertos pelo plano (a mensalidade entra no Financeiro)`}
                </p>
              </Card>
            </div>
          </section>

          {relatorio.dias.length === 0 && relatorio.cancelados.length === 0 && (
            <EmptyState
              icon={CalendarClock}
              title={`Nenhum horário marcado em ${nomeDoMes.toLowerCase()}`}
              description="Quando houver reservas neste mês, elas aparecem aqui, dia a dia."
            />
          )}

          {relatorio.dias.map((dia) => {
            const valorDoDia = dia.linhas
              .filter((l) => l.grupo === "concluido" || l.grupo === "a_fazer")
              .reduce((s, l) => s + l.valor, 0);
            return (
              <section key={dia.data} className="sem-quebra flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h2 className="text-base text-ink first-letter:uppercase">{formatDatePtBR(dia.data)}</h2>
                  <p className="text-xs text-ink-muted">
                    {contar(dia.linhas.length, "horário", "horários")} · {formatBRL(valorDoDia)} previsto
                  </p>
                </div>
                <TabelaDoDia linhas={dia.linhas} />
              </section>
            );
          })}

          {relatorio.cancelados.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-base text-ink">
                Cancelados e expirados · {relatorio.cancelados.length}
              </h2>
              <TabelaDoDia linhas={relatorio.cancelados} comData />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card padding="sm" className="print:border-border-strong">
      <p className="text-xs text-ink-muted">{rotulo}</p>
      <p className="font-display text-xl text-ink">{valor}</p>
    </Card>
  );
}

/**
 * Uma tabela por dia. `comData` é a seção de cancelados, que mistura dias.
 *
 * No celular a tabela rola para o lado em vez de espremer oito colunas; no
 * papel ela ocupa a largura da folha (o CSS de impressão tira a rolagem).
 */
function TabelaDoDia({ linhas, comData = false }: { linhas: LinhaDoRelatorio[]; comData?: boolean }) {
  const th = "px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted";
  const td = "px-2 py-1.5 align-top";
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface print:overflow-visible print:border-border-strong">
      <table className="w-full min-w-[720px] border-collapse text-xs text-ink print:min-w-0 print:text-[9.5pt]">
        <thead className="border-b border-border bg-surface-raised">
          <tr>
            {comData && <th className={th}>Dia</th>}
            <th className={th}>Horário</th>
            <th className={th}>Cliente</th>
            <th className={th}>Telefone</th>
            <th className={th}>Serviços</th>
            <th className={th}>Barbeiro</th>
            <th className={th}>Situação</th>
            <th className={th + " text-right"}>Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-border last:border-b-0">
              {comData && (
                <td className={td + " whitespace-nowrap"}>
                  {l.data.slice(8)}/{l.data.slice(5, 7)}
                </td>
              )}
              <td className={td + " whitespace-nowrap font-medium"}>
                {l.inicio}–{l.fim}
              </td>
              <td className={td}>
                {l.cliente}
                {(l.mensalista || l.encaixe) && (
                  <span className="block text-[11px] text-ink-muted">
                    {[l.mensalista && "Mensalista", l.encaixe && "Encaixe"].filter(Boolean).join(" · ")}
                  </span>
                )}
              </td>
              <td className={td + " whitespace-nowrap"}>{l.telefone ? formatPhonePtBR(l.telefone) : "—"}</td>
              <td className={td}>{l.servicos}</td>
              <td className={td}>{l.barbeiro}</td>
              <td
                className={
                  td +
                  (l.grupo === "falta" || l.grupo === "cancelado"
                    ? " text-danger"
                    : l.grupo === "concluido"
                      ? " text-success"
                      : "")
                }
              >
                {l.status}
              </td>
              <td className={td + " whitespace-nowrap text-right tabular-nums"}>{formatBRL(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
