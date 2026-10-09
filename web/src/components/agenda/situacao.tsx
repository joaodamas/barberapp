import { cn } from "@/lib/cn";
import type { SituacaoDoHorario } from "@/lib/situacao-do-horario";

const PONTO = {
  ok: "bg-success",
  alerta: "bg-gold-strong",
  erro: "bg-danger",
  neutro: "bg-ink-muted",
} as const;

/**
 * A situação como texto com um ponto — não uma pílula preenchida.
 *
 * O ponto é decoração semântica (`aria-hidden`): a palavra ao lado é quem diz
 * "concluído" ou "atrasado". Só o atraso recebe o texto colorido, porque é o
 * único estado que pede ação de quem está olhando.
 */
export function Situacao({
  situacao,
  className,
}: {
  situacao: NonNullable<SituacaoDoHorario>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "linha-muda inline-flex items-center gap-1.5 whitespace-nowrap text-[13px]",
        situacao.tom === "erro" && situacao.texto.startsWith("Atrasado") ? "text-danger" : "text-ink-muted",
        className
      )}
    >
      <i aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PONTO[situacao.tom])} />
      {situacao.texto}
    </span>
  );
}
