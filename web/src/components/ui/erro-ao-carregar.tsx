"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { explicarFalha } from "@/lib/erro-de-leitura";

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
  erro,
  className,
  onTentarDeNovo,
}: {
  /** O que falhou, em linguagem de dono: "as despesas", "sua agenda". */
  oQue: string;
  /**
   * O erro cru do listener, quando a tela tiver.
   *
   * Opcional de propósito: sem ele o componente diz exatamente o que dizia
   * antes. É o que permite ligar a distinção permissão × conexão sem tocar nas
   * telas que outra equipe está reescrevendo.
   */
  erro?: unknown;
  className?: string;
  onTentarDeNovo?: () => void;
}) {
  const { explicacao, temRetry } = explicarFalha(erro);
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
      {/* Permissão e conexão pedem ações diferentes de quem está lendo — e essa
          diferença agora é dita, em vez de deixada como "ou" para o dono
          resolver. Ver `lib/erro-de-leitura.ts`. */}
      <p className="text-xs text-ivory-muted">{explicacao}</p>
      {/* Sem retry quando recarregar não pode funcionar: um botão que promete
          uma saída inexistente é pior que botão nenhum. O dono clica três
          vezes, conclui que o produto quebrou, e a causa real nunca chega. */}
      {temRetry && (
        /* `size="sm"` em vez de `min-h-9` na mão: o alvo continua com 36px de
           desenho e volta a ter 44px de área. Escrito à mão, este era o botão
           MAIS estreito do produto — `px-0` deixava a área do lado com a largura
           exata das palavras. */
        <Button
          variant="ghost"
          size="sm"
          onClick={onTentarDeNovo ?? (() => window.location.reload())}
          className="px-0"
        >
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

/**
 * A linha equivalente, para dentro de tabela.
 *
 * Mesma mensagem, sem o cartão — um `<div>` dentro de `<tbody>` quebra a
 * estrutura e o navegador o move para fora da tabela silenciosamente.
 *
 * Dizia só a metade que o cartão diz. Quem lê "Não foi possível carregar as
 * despesas" numa tabela e não recebe mais nada fica com a mesma dúvida que a
 * versão em cartão foi escrita para resolver: perdi alguma coisa? o que eu
 * faço? Fato, consequência e saída são as três partes, e valem igual nos dois
 * formatos — a tabela não é um lugar onde o dono precisa de menos.
 */
export function LinhaDeErro({
  oQue,
  erro,
  colSpan,
  onTentarDeNovo,
}: {
  oQue: string;
  erro?: unknown;
  colSpan: number;
  onTentarDeNovo?: () => void;
}) {
  const { explicacao, temRetry } = explicarFalha(erro);
  return (
    <tr>
      <td colSpan={colSpan} role="alert" className="px-4 py-10 text-center md:px-6">
        <p className="text-sm text-ivory">Não foi possível carregar {oQue}.</p>
        <p className="mt-1 text-xs text-ivory-muted">{explicacao}</p>
        {temRetry && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTentarDeNovo ?? (() => window.location.reload())}
            className="mt-1"
          >
            Tentar de novo
          </Button>
        )}
      </td>
    </tr>
  );
}
