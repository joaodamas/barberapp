import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

/**
 * O cartão centrado que a tela mostra quando NÃO tem a lista para mostrar.
 *
 * ## Por que existe
 *
 * A mesma composição — círculo com ícone, uma frase que nomeia a situação, uma
 * frase que diz o que fazer, um botão — estava escrita três vezes, com três
 * medidas diferentes para a mesma coisa:
 *
 * ```
 *                    respiro          largura do texto   título
 * EmptyState         py-12 md:py-16   max-w-sm           text-sm md:text-base
 * BloqueioPlano      py-14 md:py-20   max-w-md           text-base
 * RecursoBloqueado   py-12 md:py-16   max-w-md           text-sm md:text-base
 * ```
 *
 * Nenhuma das diferenças foi decidida: elas apareceram porque cada tela foi
 * escrita num dia. O efeito é que "não há nada aqui", "seu teste terminou" e
 * "isso não está no seu plano" — três frases que o dono lê no mesmo lugar da
 * tela, em dias diferentes — chegam com três pesos visuais. Consistência não é
 * capricho aqui: é o que faz o produto parecer um sistema em vez de uma coleção
 * de telas.
 *
 * ## O que este componente NÃO decide
 *
 * O texto. Quem chama sabe se está falando de despesa, de agenda ou de plano —
 * e a regra de microcopy do produto é que a frase diga o que fazer, não o que
 * houve. Um texto genérico embutido aqui ("Nenhum registro encontrado") seria
 * exatamente o que a régua proíbe.
 *
 * `RecursoBloqueado` (`components/recurso-bloqueado.tsx`) era a terceira cópia
 * e foi adotado na integração — o arquivo é de outra frente, e a mudança de
 * contrato (`descricao` aceitando `ReactNode`) passou pelo orquestrador, como
 * manda o protocolo.
 */
export function EstadoCentral({
  icon: Icon,
  titulo,
  descricao,
  acao,
  className,
}: {
  icon: LucideIcon;
  /** A situação, nomeada. Ex.: "Nenhum cliente cadastrado ainda". */
  titulo: string;
  /**
   * O que fazer para sair dela. Nunca só o que aconteceu.
   *
   * `ReactNode` e não `string` por decisão de orquestração: `RecursoBloqueado`
   * precisa de DUAS frases — o que o recurso faz e por que vale — e juntá-las
   * num parágrafo só perderia a separação que o dono lê como duas ideias.
   * String continua valendo, então nenhum chamador mudou.
   */
  descricao: React.ReactNode;
  /** Botão ou link. Opcional: nem toda situação tem saída pela própria tela. */
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-col items-center gap-4 py-12 text-center md:py-16", className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-strong">
        <Icon size={22} aria-hidden />
      </div>

      {/* `max-w-md` limita a LINHA, não o cartão: texto centrado que atravessa
          um monitor de 27" perde o começo da linha seguinte a cada quebra. */}
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="text-sm font-medium text-ink md:text-base">{titulo}</p>
        <p className="text-xs leading-relaxed text-ink-muted md:text-sm">{descricao}</p>
      </div>

      {acao}
    </Card>
  );
}
