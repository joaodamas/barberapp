"use client";

import { useState } from "react";
import { useFeature, useTenant } from "@/lib/tenant-context";
import { RecursoBloqueado } from "@/components/recurso-bloqueado";
import { CalendarClock, MessageCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR, safePct } from "@/lib/format";
import { useClients, usePlans, useSubscribers, useSubscriptionInvoices } from "@/lib/db/use-shop-data";
import { GerirMensalistas } from "@/components/gerir-mensalistas";
import { HorariosFixos } from "@/components/horarios-fixos";
import { mesAtual } from "@/lib/db/use-financeiro";
import { estagioDaFatura, type EstagioDaRegua } from "@/lib/mensalidade";
import {
  contagemPorEstagio,
  faturaRelevante,
  hojeNoFuso,
  mensagemDeLembrete,
  precisaLembrarHoje,
  situacaoNaRegua,
} from "@/lib/aviso-da-mensalidade";
import { normalizarWhatsapp } from "@/lib/whatsapp-numero";
import { contar } from "@/lib/plural";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { Users } from "lucide-react";
import type { SubscriberDoc } from "@/lib/domain";

type SubscriberStatus = SubscriberDoc["status"];

const STATUS_META: Record<
  SubscriberStatus,
  { label: string; tone: "success" | "danger" | "neutral" }
> = {
  ativo: { label: "Ativo", tone: "success" },
  suspenso: { label: "Suspenso", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

const RULER_STAGES = ["D-5", "D-3", "D-1", "D0", "D+1", "D+3", "D+5"] as const;

type Filter = "todos" | SubscriberStatus;

/** Recorte pela régua: um marco, ou "quem precisa de lembrete hoje". */
type FiltroDaRegua = EstagioDaRegua | "lembrar" | null;

const FILTER_LABELS: Record<Filter, string> = {
  todos: "Todos",
  ativo: "Ativo",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
};

/* O gate mora num componente à parte, e não num retorno antecipado dentro do
 * conteúdo: os hooks do conteúdo passariam a ser chamados condicionalmente. */
export default function MensalPage() {
  const liberado = useFeature("subscriptions");

  if (!liberado) {
    return (
      <RecursoBloqueado
        titulo="Mensalistas"
        oQueFaz="Cadastra planos de assinatura, acompanha quem está em dia e quem atrasou, e mostra a receita recorrente no fechamento do mês."
        porQueVale="É a receita que entra mesmo na semana em que a barbearia esvazia — e a que faz o cliente voltar sem você precisar chamar."
      />
    );
  }

  return <MensalConteudo />;
}

function MensalConteudo() {
  const tenant = useTenant();
  const [filter, setFilter] = useState<Filter>("todos");
  const [filtroDaRegua, setFiltroDaRegua] = useState<FiltroDaRegua>(null);
  const { items: subscribers, status, error } = useSubscribers();
  const { items: faturas } = useSubscriptionInvoices();
  /* Só para o telefone do botão "Lembrar": sem a leitura, o botão some — o
   * resto da tela não depende dela. */
  const { items: clientes } = useClients();
  /* O vazio AFIRMAVA que não havia planos sem nunca ter lido `plans`. Ler é a
   * condição para poder afirmar — a mesma régua do `ErroAoCarregar`: só se diz
   * "não há" depois de ter lido. Mesmo filtro de `GerirMensalistas`, que é
   * quem oferece os planos no modal logo acima. */
  const { items: planos, status: statusDosPlanos } = usePlans();
  const planosAtivos = planos.filter((p) => p.active !== false);

  /* MRR derivado da lista: cobrável = ativos; contratado inclui suspensos, que
   * voltam a pagar ao regularizar. */
  const mrr = {
    billed: subscribers.filter((s) => s.status === "ativo").reduce((t, s) => t + s.price, 0),
    contracted: subscribers.filter((s) => s.status !== "cancelado").reduce((t, s) => t + s.price, 0),
  };
  const mrrPct = Math.round(safePct(mrr.billed, mrr.contracted));

  /* A régua vem das faturas, não do campo morto, e do dia NO FUSO DA LOJA. */
  const competencia = mesAtual();
  const hoje = hojeNoFuso(tenant.locale.timeZone);

  /* Uma fatura por mensalista: a aberta mais antiga (dívida velha não some
   * quando o mês vira) ou, não havendo, a paga do mês. Cancelado fica fora da
   * cobrança. Os números do topo e a lista saem da MESMA conta — contar uma
   * coisa e filtrar outra faria o número prometer linhas que não aparecem. */
  const faturaDe = (subscriptionId: string, st: SubscriberStatus) =>
    st === "cancelado"
      ? null
      : faturaRelevante(faturas.filter((f) => f.subscriptionId === subscriptionId), hoje);
  const reguaPorEstagio = contagemPorEstagio(
    subscribers.map((s) => faturaDe(s.id, s.status)),
    hoje
  );
  const quantosLembrar = subscribers.filter((s) =>
    precisaLembrarHoje(faturaDe(s.id, s.status), hoje)
  ).length;

  const filtered = subscribers
    .filter((s) => filter === "todos" || s.status === filter)
    .filter((s) => {
      if (!filtroDaRegua) return true;
      const f = faturaDe(s.id, s.status);
      if (filtroDaRegua === "lembrar") return precisaLembrarHoje(f, hoje);
      return f !== null && estagioDaFatura(f, hoje) === filtroDaRegua;
    });

  const alternarRegua = (f: Exclude<FiltroDaRegua, null>) =>
    setFiltroDaRegua((atual) => (atual === f ? null : f));

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      {/* O menu diz "Mensalistas", o bloqueio de plano diz "Mensalistas", o
          componente se chama `GerirMensalistas`, a landing diz "mensalistas" —
          e a tela dizia "Mensal". É o mesmo defeito de "DRE Gerencial": o dono
          clica num nome e chega em outro. UX-01 documentou por que o menu
          mudou ("mensal o quê" — adjetivo sem substantivo, colidindo com o
          fechamento do mês do Financeiro); faltava a tela acompanhar.
          O sobretítulo e o título também estavam invertidos em relação a todas
          as outras telas, onde o pequeno é o contexto e o grande é o nome. */}
      <div>
        <p className="text-sm text-ink-muted md:text-base">Receita que se repete</p>
        <h1 className="text-xl text-ink md:text-4xl md:tracking-tight">Mensalistas</h1>
      </div>

      {/* G2 · contratar e receber vem PRIMEIRO.
          O dono abre a tela Mensal para cobrar quem está devendo, não para ler
          MRR. O bloco de indicadores continua abaixo, e o "Recebido" daqui é o
          único número da tela com lastro de pagamento. */}
      <GerirMensalistas competencia={competencia} />

      <HorariosFixos />

      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr] md:gap-8">
        <Card className="flex flex-col gap-3 md:p-6">
          {/* "MRR" é a sigla que `navegacao.test.ts` já proíbe em rótulo de
              menu, pela mesma razão que "DRE" saiu: é vocabulário de quem
              vende SaaS, não de quem tem barbearia. O número é a soma da
              mensalidade de quem está ativo — e é isso que o rótulo passa a
              dizer. A barra ao lado já compara com o contratado. */}
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ink-muted">Mensalidade de quem está ativo</span>
            <span className="font-display font-semibold text-gold-strong md:text-2xl">
              {formatBRL(mrr.billed)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised md:h-2.5">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-300"
              style={{ width: `${mrrPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-ink-muted md:text-sm">
            <span>{mrrPct}% do contratado</span>
            <span>Contratado: {formatBRL(mrr.contracted)}</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 md:p-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            <CalendarClock size={12} /> Régua de cobrança
          </p>
          <div className="flex items-center justify-between gap-1 md:gap-2">
            {RULER_STAGES.map((stage) => {
              /* Contava por `s.dueStage` — campo que NINGUÉM nunca gravou, então
                 os sete baldes mostravam zero para sempre. A régua passou a ser
                 derivada de `dueDate` das FATURAS, que é o documento que sabe a
                 competência e responde certo em qualquer data. */
              const count = reguaPorEstagio[stage] ?? 0;
              const ativo = filtroDaRegua === stage;
              return (
                /* Clicável: o número filtra a lista logo abaixo. Sem ninguém
                   no marco, não há o que filtrar — fica desabilitado. */
                <button
                  key={stage}
                  type="button"
                  disabled={count === 0 && !ativo}
                  aria-pressed={ativo}
                  aria-label={`${stage}: ${contar(count, "mensalista", "mensalistas")}`}
                  onClick={() => alternarRegua(stage)}
                  className="alvo-toque flex flex-1 flex-col items-center gap-1 disabled:cursor-default md:gap-2"
                >
                  <div
                    className={
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors md:h-11 md:w-11 md:text-sm " +
                      (ativo
                        ? "bg-gold text-ink ring-2 ring-gold-strong ring-offset-2 ring-offset-surface"
                        : count > 0
                          ? "bg-gold text-ink"
                          : "border border-border text-ink-muted/50")
                    }
                  >
                    {count > 0 ? count : ""}
                  </div>
                  <span className="text-[11px] text-ink-muted md:text-xs">{stage}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-ink-muted md:text-xs">
            Toque num número para ver só quem está naquele marco.
          </p>
        </Card>
      </div>

      {status === "carregando" && <LoadingRows rows={3} oQue="os mensalistas" />}
      {status === "erro" && <ErroAoCarregar oQue="os mensalistas" erro={error} />}

      {status === "pronto" && subscribers.length === 0 && (
        /* Continua valendo o que motivou o texto anterior: NENHUMA tela do
           painel cria plano — `plans` só é escrita pelo script de semeadura —,
           e o botão "Criar plano" que existia aqui levava para /painel/loja,
           que cadastra produto. Uma porta que não abre é pior que porta
           nenhuma. Ver o STOP em `docs/VOCABULARIO.md`.

           O que a correção anterior errou foi o ALCANCE: ela trocou a porta
           falsa por uma AFIRMAÇÃO falsa, dita a todo mundo. Numa barbearia com
           dois planos ativos — que é o estado normal de quem já foi
           provisionado — a tela dizia "seus planos precisam estar cadastrados"
           enquanto o botão "Novo mensalista", quinze centímetros acima, abria
           os dois planos e concluía a contratação. A tela negava o que a
           própria tela faz.

           São duas ausências diferentes e o vazio agora as distingue: "não há
           PLANO" é um pedido de provisionamento; "não há MENSALISTA" é um
           convite a usar o botão que já está ali.

           A afirmação de ausência só é feita depois de LER: com `plans` ainda
           carregando ou em erro, a tela aponta o botão, e é o próprio modal —
           que já guarda por `planosAtivos.length === 0` — quem diz a verdade
           sobre o que ele encontrou. */
        <EmptyState
          icon={Users}
          title="Nenhum mensalista ainda"
          description={
            statusDosPlanos === "pronto" && planosAtivos.length === 0
              ? "Mensalista é o cliente que paga todo mês e volta sem você precisar chamar — é a receita que entra na semana em que a barbearia esvazia. Para contratar o primeiro, cadastre um plano em “Planos”, aqui em cima."
              : "Mensalista é o cliente que paga todo mês e volta sem você precisar chamar — é a receita que entra na semana em que a barbearia esvazia. Use “Novo mensalista”, aqui em cima, para contratar o primeiro."
          }
        />
      )}

      {subscribers.length > 0 && (
      <section>
        <div className="mb-2 flex items-center justify-between md:mb-3">
          {/* "Assinantes" era a segunda palavra para a mesma pessoa, na tela
              que agora se chama Mensalistas do menu ao título. */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Mensalistas
          </h2>
          <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            aria-pressed={filtroDaRegua === "lembrar"}
            onClick={() => alternarRegua("lembrar")}
            className={`alvo-toque rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
              filtroDaRegua === "lembrar"
                ? "border-gold bg-gold text-ink"
                : "border-border bg-surface text-ink-muted hover:text-ink"
            }`}
          >
            Precisa lembrar hoje ({quantosLembrar})
          </button>
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  f === filter ? "bg-gold text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
          </div>
        </div>

        <Card className="table-scroll overflow-x-auto p-0">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-3 font-medium md:px-6">Cliente</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Próxima cobrança</th>
                {/* As outras duas tabelas do painel — a agenda de Hoje e as
                    mensalidades logo acima nesta mesma tela — chamam a coluna
                    de "Situação". Esta era a única em inglês. */}
                <th className="px-4 py-3 font-medium">Situação</th>
                <th className="px-4 py-3 font-medium md:px-6">Mensalidade</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const meta = STATUS_META[s.status];
                const fatura = faturaDe(s.id, s.status);
                const naRegua = situacaoNaRegua(fatura, hoje);
                const telefone = normalizarWhatsapp(
                  clientes.find((c) => c.id === s.clientId)?.whatsapp ?? ""
                );
                /* O dono revisa e envia no próprio WhatsApp: é um link, e o
                   produto não manda nada sozinho. */
                const lembrar =
                  fatura && naRegua?.estagio && telefone
                    ? `https://wa.me/${telefone}?text=${encodeURIComponent(
                        mensagemDeLembrete(fatura, hoje, s.name, tenant.brand.name)
                      )}`
                    : null;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
                  >
                    <td className="px-4 py-3 text-ink md:px-6">{s.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{s.planName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {/* `nextCharge` virou opcional em G2: o vencimento passou
                          a ser derivado da FATURA (`dueDate`), que é o
                          documento que sabe a competência. A assinatura guarda
                          `billingDay`, não uma data solta que envelhece. */}
                      {s.nextCharge && s.nextCharge !== "—"
                        ? formatDatePtBR(s.nextCharge)
                        : s.billingDay
                          ? `todo dia ${s.billingDay}`
                          : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </td>
                    <td className="px-4 py-3 md:px-6">
                      {naRegua ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={naRegua.tom}>{naRegua.rotulo}</Pill>
                          {lembrar && (
                            <a href={lembrar} target="_blank" rel="noopener noreferrer">
                              <Button variant="secondary" size="sm">
                                <MessageCircle size={14} />
                                Lembrar no WhatsApp
                              </Button>
                            </a>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  {/* Vazio de FILTRO, não de dado: existe mensalista, só não
                      neste status. Sem dizer a saída, o dono lê como se a
                      lista tivesse sumido. */}
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-ink-muted md:px-6">
                    {filtroDaRegua
                      ? "Ninguém neste recorte da régua. Toque de novo no filtro para desfazê-lo."
                      : "Nenhum mensalista neste status. Toque em “Todos” para ver a lista inteira."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>
      )}
    </div>
  );
}
