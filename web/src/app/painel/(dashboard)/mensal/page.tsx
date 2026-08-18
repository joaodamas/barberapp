"use client";

import { useState } from "react";
import { useFeature } from "@/lib/tenant-context";
import { RecursoBloqueado } from "@/components/recurso-bloqueado";
import { CalendarClock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR, safePct, toISODate } from "@/lib/format";
import { useSubscribers, useSubscriptionInvoices } from "@/lib/db/use-shop-data";
import { GerirMensalistas } from "@/components/gerir-mensalistas";
import { mesAtual } from "@/lib/db/use-financeiro";
import { resumoDasFaturas } from "@/lib/mensalidade";
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
  const [filter, setFilter] = useState<Filter>("todos");
  const { items: subscribers, status } = useSubscribers();
  const { items: faturas } = useSubscriptionInvoices();

  /* MRR derivado da lista: cobrável = ativos; contratado inclui suspensos, que
   * voltam a pagar ao regularizar. */
  const mrr = {
    billed: subscribers.filter((s) => s.status === "ativo").reduce((t, s) => t + s.price, 0),
    contracted: subscribers.filter((s) => s.status !== "cancelado").reduce((t, s) => t + s.price, 0),
  };
  const mrrPct = Math.round(safePct(mrr.billed, mrr.contracted));

  const filtered =
    filter === "todos" ? subscribers : subscribers.filter((s) => s.status === filter);

  /* A régua vem das faturas, não do campo morto. Mesma fonte que
     `GerirMensalistas` usa logo acima — uma conta só para os dois blocos. */
  const competencia = mesAtual();
  const reguaPorEstagio = resumoDasFaturas(
    faturas,
    competencia,
    toISODate(new Date())
  ).porEstagio;

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
        <p className="text-sm text-ivory-muted md:text-base">Receita que se repete</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Mensalistas</h1>
      </div>

      {/* G2 · contratar e receber vem PRIMEIRO.
          O dono abre a tela Mensal para cobrar quem está devendo, não para ler
          MRR. O bloco de indicadores continua abaixo, e o "Recebido" daqui é o
          único número da tela com lastro de pagamento. */}
      <GerirMensalistas competencia={competencia} />

      <div className="grid gap-4 md:grid-cols-[1fr_1.3fr] md:gap-8">
        <Card className="flex flex-col gap-3 md:p-6">
          {/* "MRR" é a sigla que `navegacao.test.ts` já proíbe em rótulo de
              menu, pela mesma razão que "DRE" saiu: é vocabulário de quem
              vende SaaS, não de quem tem barbearia. O número é a soma da
              mensalidade de quem está ativo — e é isso que o rótulo passa a
              dizer. A barra ao lado já compara com o contratado. */}
          <div className="flex items-center justify-between text-sm md:text-base">
            <span className="text-ivory-muted">Mensalidade de quem está ativo</span>
            <span className="font-display font-semibold text-gold-light md:text-2xl">
              {formatBRL(mrr.billed)}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-raised md:h-2.5">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-300"
              style={{ width: `${mrrPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-ivory-muted md:text-sm">
            <span>{mrrPct}% do contratado</span>
            <span>Contratado: {formatBRL(mrr.contracted)}</span>
          </div>
        </Card>

        <Card className="flex flex-col gap-3 md:p-6">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            <CalendarClock size={12} /> Régua de cobrança
          </p>
          <div className="flex items-center justify-between gap-1 md:gap-2">
            {RULER_STAGES.map((stage) => {
              /* Contava por `s.dueStage` — campo que NINGUÉM nunca gravou, então
                 os sete baldes mostravam zero para sempre. A régua passou a ser
                 derivada de `dueDate` das FATURAS, que é o documento que sabe a
                 competência e responde certo em qualquer data. */
              const count = reguaPorEstagio[stage] ?? 0;
              return (
                <div key={stage} className="flex flex-1 flex-col items-center gap-1 md:gap-2">
                  <div
                    className={
                      "flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors md:h-11 md:w-11 md:text-sm " +
                      (count > 0
                        ? "bg-gold text-ivory"
                        : "border border-border text-ivory-muted/50")
                    }
                  >
                    {count > 0 ? count : ""}
                  </div>
                  <span className="text-[11px] text-ivory-muted md:text-xs">{stage}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {status === "carregando" && <LoadingRows rows={3} oQue="os mensalistas" />}
      {status === "erro" && <ErroAoCarregar oQue="os mensalistas" />}

      {status === "pronto" && subscribers.length === 0 && (
        /* O botão dizia "Criar plano" e levava para /painel/loja, que cadastra
           PRODUTO e não tem editor de plano nenhum. Não foi só o destino
           errado: não existe tela no painel que crie plano — `plans` só é
           escrita pelo script de semeadura, e `GerirMensalistas` manda
           "cadastrar em Serviços", onde também não há.
           Uma porta que não abre é pior que porta nenhuma: o dono clica, chega
           na Loja, não acha, e conclui que não entendeu o produto. Enquanto a
           tela de planos não existir, o vazio diz a verdade e não oferece
           saída falsa. Registrado como STOP em `docs/VOCABULARIO.md`. */
        <EmptyState
          icon={Users}
          title="Nenhum mensalista ainda"
          description="Mensalista é o cliente que paga todo mês e volta sem você precisar chamar — é a receita que entra na semana em que a barbearia esvazia. Para contratar o primeiro, seus planos precisam estar cadastrados; fale com quem cuida da sua conta na plataforma."
        />
      )}

      {subscribers.length > 0 && (
      <section>
        <div className="mb-2 flex items-center justify-between md:mb-3">
          {/* "Assinantes" era a segunda palavra para a mesma pessoa, na tela
              que agora se chama Mensalistas do menu ao título. */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Mensalistas
          </h2>
          <div className="flex gap-1 rounded-lg border border-border bg-surface p-0.5">
            {(Object.keys(FILTER_LABELS) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  f === filter ? "bg-gold text-ivory" : "text-ivory-muted hover:text-ivory"
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <Card className="table-scroll overflow-x-auto p-0">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-ivory-muted">
                <th className="px-4 py-3 font-medium md:px-6">Cliente</th>
                <th className="px-4 py-3 font-medium">Plano</th>
                <th className="px-4 py-3 font-medium">Próxima cobrança</th>
                {/* As outras duas tabelas do painel — a agenda de Hoje e as
                    mensalidades logo acima nesta mesma tela — chamam a coluna
                    de "Situação". Esta era a única em inglês. */}
                <th className="px-4 py-3 font-medium md:px-6">Situação</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const meta = STATUS_META[s.status];
                return (
                  <tr
                    key={s.id}
                    className="border-b border-border/60 transition-colors last:border-0 hover:bg-surface-raised/60"
                  >
                    <td className="px-4 py-3 text-ivory md:px-6">{s.name}</td>
                    <td className="px-4 py-3 text-ivory-muted">{s.planName}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ivory-muted">
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
                    <td className="px-4 py-3 md:px-6">
                      <Pill tone={meta.tone}>{meta.label}</Pill>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  {/* Vazio de FILTRO, não de dado: existe mensalista, só não
                      neste status. Sem dizer a saída, o dono lê como se a
                      lista tivesse sumido. */}
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-ivory-muted md:px-6">
                    Nenhum mensalista neste status. Toque em &quot;Todos&quot; para
                    ver a lista inteira.
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
