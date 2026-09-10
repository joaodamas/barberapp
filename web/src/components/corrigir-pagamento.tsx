"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
import type { PaymentMethod } from "@/lib/types";

/**
 * R1 — corrigir como um atendimento concluído foi pago.
 *
 * ## Por que é um modal PRÓPRIO, e não o de conclusão reaberto
 *
 * Reabrir o fluxo de conclusão sobre uma reserva `completed` é o caminho que
 * produz o vazamento: ele grava `bookings.paymentMethod` e mais nada, o card
 * crítico some, e o `PaymentDoc` — de onde sai todo o dinheiro das telas —
 * continua com método nulo e taxa zero.
 *
 * E a razão de fundo é mais forte que o vazamento: reabrir `completed` é a mesma
 * superfície por onde o "Veio depois" opera. As duas operações não podem
 * compartilhar caminho.
 *
 * A correção é operação própria: vai pela Cloud Function, numa transação que
 * atualiza pagamento e reserva juntos e grava o `audit_log`. A tela não escreve
 * dinheiro — nem poderia: `audit_log` é imutável para o cliente
 * (`allow write: if false`), então ou a mudança nasce numa callable ou ela não
 * é auditável.
 *
 * ## Por que a tela avisa que a taxa é a de hoje
 *
 * R1.1 decidiu a tabela vigente no momento da correção, sem versionamento. Um
 * dono que corrige em agosto um atendimento de agosto feito com outra taxa
 * cadastrada precisa saber qual das duas vale — senão a diferença aparece no DRE
 * sem explicação. É a mesma frase que o modal de conclusão já diz.
 */

export function CorrigirPagamento(params: {
  aberto: boolean;
  aoFechar: () => void;
  bookingId: string;
  /** O que está sendo corrigido, em uma linha. */
  descricao: string;
  /** Bruto do atendimento, para a conta que o dono confere. */
  valor: number;
  /** O que está registrado hoje. `null` é o caso 1 — o plano não cobriu. */
  metodoAtual: PaymentMethod | null;
  /** A forma registrada hoje, quando havia uma. */
  formaAtual?: string | null;
  /** O rótulo congelado dela, que sobrevive a renomear e a excluir. */
  formaAtualLabel?: string | null;
  aoCorrigir?: (metodo: PaymentMethod) => void;
}) {
  const tenant = useTenant();

  const [escolhida, setEscolhida] = useState<FormaDePagamento | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Nasce na MONTAGEM, e o pai monta este componente condicionalmente — então
   * cada abertura ganha uma chave nova. Reaproveitar a chave faria a segunda
   * correção cair no caminho de idempotência do servidor: ele devolveria o
   * evento anterior e a tela diria "pronto" sem nada ter acontecido. */
  const [chave] = useState(chaveDeIdempotencia);

  /* O rótulo CONGELADO no documento vence o cadastro de hoje: a forma pode ter
   * sido renomeada ou apagada desde o fechamento, e o que o dono precisa ler é
   * o que está registrado, não o que existe agora. */
  const rotuloAtual =
    params.formaAtualLabel ??
    (params.formaAtual
      ? formasAtivas(tenant.policies).find((f) => f.id === params.formaAtual)?.label
      : null) ??
    (params.metodoAtual ? NOME_DO_MEIO[params.metodoAtual] : null);

  /* A forma atual não é oferecida: o servidor recusa "corrigir" para o mesmo
   * meio, e um botão que só existe para dar erro é uma promessa falsa.
   *
   * O filtro é pela FORMA quando há uma registrada, e pelo MEIO quando não há.
   * Numa barbearia com "Crédito aproximação" e "Crédito inserido", corrigir de
   * uma para a outra é justamente a correção mais comum — e filtrar por meio
   * esconderia a única opção que o dono foi ali procurar. */
  const opcoes = formasAtivas(tenant.policies).filter((f) =>
    params.formaAtual ? f.id !== params.formaAtual : f.base !== params.metodoAtual
  );
  const podeConfirmar = escolhida !== null;

  async function confirmar() {
    if (!escolhida) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("corrigirPagamentoDeAtendimento", {
        barbershopId: tenant.id,
        bookingId: params.bookingId,
        paymentMethod: escolhida.base,
        paymentFormId: escolhida.id,
        idempotencyKey: chave,
      });
      params.aoCorrigir?.(escolhida.base);
      params.aoFechar();
    } catch (e) {
      /* A mensagem do servidor é a que explica — "esse pagamento já teve
       * devolução", "é de outro mês". Trocá-la por uma genérica esconderia do
       * dono a única informação que o ajuda a decidir o que fazer. */
      setErro(e instanceof Error ? e.message : "Não consegui corrigir o pagamento agora.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={params.aberto}
      onClose={() => !salvando && params.aoFechar()}
      title="Corrigir pagamento"
      description={params.descricao}
      footer={
        <>
          <Button variant="ghost" onClick={params.aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar || salvando}>
            {salvando ? "Corrigindo…" : "Confirmar correção"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-border bg-surface-raised px-3 py-2.5">
          <p className="text-xs text-ink-muted">Registrado hoje</p>
          <p className="text-sm text-ink">
            {rotuloAtual ?? /* O caso 1, dito com as palavras do que aconteceu.
                 "A pagar no salão" num atendimento que já terminou é uma
                 cobrança que ninguém vai fazer. */
              "Não informado"}{" "}
            · {formatBRL(params.valor)}
          </p>
        </div>

        <p className="text-xs uppercase tracking-wider text-ink-muted">
          Como o cliente pagou de verdade
        </p>

        <div className={opcoes.length > 4 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3"}>
          {opcoes.map((forma) => (
            <button
              key={forma.id}
              type="button"
              disabled={salvando}
              aria-pressed={escolhida?.id === forma.id}
              onClick={() => setEscolhida(forma)}
              className={
                escolhida?.id === forma.id
                  ? "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-gold bg-gold/15 px-2 text-center text-sm font-medium text-gold-strong"
                  : "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-border px-2 text-center text-sm font-medium text-ink transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-strong"
              }
            >
              <span className="leading-tight">{forma.label}</span>
              {forma.feePct > 0 && (
                <span className="text-[11px] font-normal text-ink-muted">
                  {formatPctPtBR(forma.feePct, 2)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Um segundo clique aqui é deliberado, ao contrário da conclusão.
            Concluir é o gesto mais repetido do dia e acontece com o cliente na
            frente; corrigir mexe em dinheiro já registrado, e é a única das
            duas que ninguém deveria acionar sem querer. */}
        <div className="rounded-xl border border-border bg-surface-raised/60 p-3 text-xs text-ink-muted">
          <p className="mb-1 font-semibold text-ink">O que vai ser registrado</p>
          <p>· O pagamento e o atendimento passam a dizer a mesma coisa</p>
          <p>· O valor recebido não muda — {formatBRL(params.valor)} continua sendo o bruto</p>
          <p>· Fica registrado quem corrigiu, quando, e o que mudou</p>
          <p className="mt-1.5">
            A taxa aplicada é a que está cadastrada hoje, e não a de quando o
            atendimento foi concluído. Ajuste em Configurações antes, se ela
            mudou.
          </p>
        </div>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Os quatro meios, para descrever um pagamento anterior às formas. */
const NOME_DO_MEIO: Record<PaymentMethod, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
};
