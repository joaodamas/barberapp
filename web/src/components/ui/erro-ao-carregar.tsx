"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Não consegui ler — e isso NÃO é "está vazio" (D27).
 *
 * ## O defeito que este componente existe para impedir
 *
 * `useShopCollection` sempre expôs `status: "erro"`. Treze telas usam `status`
 * e **duas** o tratavam. Nas outras onze, uma falha de leitura caía no ramo de
 * lista vazia e a tela dizia *"Nenhuma despesa em agosto"* quando a verdade era
 * *"não consegui ler as despesas"*.
 *
 * O dado estava certo, o hook estava certo, e a tela afirmava algo falso. É
 * exatamente a classe da Rodada 1 — com o agravante de ser um estado que
 * ninguém abre para testar.
 *
 * ## Os três estados, e por que precisam ser distintos
 *
 * ```
 * carregando   "Carregando despesas…"                   ainda não sei
 * vazio        "Nenhuma despesa em agosto"              sei, e não há
 * erro         "Não foi possível carregar as despesas"  não consegui saber
 * ```
 *
 * O segundo e o terceiro parecem iguais numa tabela em branco e significam
 * coisas opostas: um é informação, o outro é ausência de informação. O dono
 * decide com base neles — e no mês em que ele conclui "não gastei nada" porque
 * a leitura falhou, o lucro aparece inflado no valor da conta que ele não viu.
 *
 * ## Por que oferece recarregar, e não um retry silencioso
 *
 * A causa mais comum é conexão ou permissão. Um retry automático em laço
 * esconde as duas: a tela fica "quase carregando" para sempre, e o dono não
 * descobre que perdeu acesso. O botão devolve a decisão para quem está olhando.
 */
export function ErroAoCarregar({
  oQue,
  className,
  onTentarDeNovo,
}: {
  /** O que falhou, em linguagem de dono: "as despesas", "sua agenda". */
  oQue: string;
  className?: string;
  onTentarDeNovo?: () => void;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border border-danger/30 bg-danger/5 p-4",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0 text-danger" />
        <p className="text-sm text-ivory">Não foi possível carregar {oQue}.</p>
      </div>
      {/* Diz as duas causas prováveis em vez de "erro inesperado": permissão e
          conexão pedem ações diferentes de quem está lendo. */}
      <p className="text-xs text-ivory-muted">
        Pode ser a conexão ou uma permissão que mudou. Nada foi perdido.
      </p>
      <Button
        variant="ghost"
        onClick={onTentarDeNovo ?? (() => window.location.reload())}
        className="min-h-9 px-0 text-xs"
      >
        Tentar de novo
      </Button>
    </div>
  );
}

/**
 * A linha equivalente, para dentro de tabela.
 *
 * Mesma mensagem, sem o cartão — um `<div>` dentro de `<tbody>` quebra a
 * estrutura e o navegador o move para fora da tabela silenciosamente.
 */
export function LinhaDeErro({ oQue, colSpan }: { oQue: string; colSpan: number }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        role="alert"
        className="px-4 py-10 text-center text-sm text-danger md:px-6"
      >
        Não foi possível carregar {oQue}.
      </td>
    </tr>
  );
}
