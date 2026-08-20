"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
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
  aoCorrigir?: (metodo: PaymentMethod) => void;
}) {
  const tenant = useTenant();

  const [escolhido, setEscolhido] = useState<PaymentMethod | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /* Nasce na MONTAGEM, e o pai monta este componente condicionalmente — então
   * cada abertura ganha uma chave nova. Reaproveitar a chave faria a segunda
   * correção cair no caminho de idempotência do servidor: ele devolveria o
   * evento anterior e a tela diria "pronto" sem nada ter acontecido. */
  const [chave] = useState(chaveDeIdempotencia);

  /* O método atual não é oferecido: o servidor recusa "corrigir" para o mesmo
   * meio, e um botão que só existe para dar erro é uma promessa falsa. */
  const opcoes = PAYMENT_METHODS.filter((m) => m !== params.metodoAtual);
  const podeConfirmar = escolhido !== null;

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("corrigirPagamentoDeAtendimento", {
        barbershopId: tenant.id,
        bookingId: params.bookingId,
        paymentMethod: escolhido,
        idempotencyKey: chave,
      });
      params.aoCorrigir?.(escolhido);
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
          <p className="text-xs text-ivory-muted">Registrado hoje</p>
          <p className="text-sm text-ivory">
            {params.metodoAtual
              ? paymentMethodLabel[params.metodoAtual]
              : /* O caso 1, dito com as palavras do que aconteceu. "A pagar no
                   salão" num atendimento que já terminou é uma cobrança que
                   ninguém vai fazer. */
                "Não informado"}{" "}
            · {formatBRL(params.valor)}
          </p>
        </div>

        <p className="text-xs uppercase tracking-wider text-ivory-muted">
          Como o cliente pagou de verdade
        </p>

        <div className="grid grid-cols-2 gap-3">
          {opcoes.map((metodo) => (
            <button
              key={metodo}
              type="button"
              disabled={salvando}
              aria-pressed={escolhido === metodo}
              onClick={() => setEscolhido(metodo)}
              className={
                escolhido === metodo
                  ? "flex min-h-16 cursor-pointer items-center justify-center rounded-xl border border-gold bg-gold/15 text-sm font-medium text-gold-light"
                  : "flex min-h-16 cursor-pointer items-center justify-center rounded-xl border border-border text-sm font-medium text-ivory transition-colors hover:border-gold hover:bg-gold/10 hover:text-gold-light"
              }
            >
              {paymentMethodLabel[metodo]}
            </button>
          ))}
        </div>

        {/* Um segundo clique aqui é deliberado, ao contrário da conclusão.
            Concluir é o gesto mais repetido do dia e acontece com o cliente na
            frente; corrigir mexe em dinheiro já registrado, e é a única das
            duas que ninguém deveria acionar sem querer. */}
        <div className="rounded-xl border border-border bg-surface-raised/60 p-3 text-xs text-ivory-muted">
          <p className="mb-1 font-semibold text-ivory">O que vai ser registrado</p>
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
