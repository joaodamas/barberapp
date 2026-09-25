import { ViewTransition } from "react";

/**
 * O movimento de troca de tela, e o que cada um quer dizer.
 *
 * A troca não é animada por padrão: só anima a navegação que diz de que tipo
 * ela é, pelo `transitionTypes` do `<Link>`. Assim o primeiro carregamento, o
 * botão voltar do navegador e qualquer `startTransition` de dentro de uma tela
 * continuam trocando seco, como sempre, em vez de herdar uma animação que não
 * foi pensada para eles.
 *
 * - `aba`: trocar de destino pela barra de baixo ou pela lateral. São telas
 *   irmãs, então não há "para frente" nem "para trás" — só troca de lugar, e o
 *   movimento é um esmaecer curto.
 * - `avancar`: descer um nível (Financeiro → DRE). Desliza da direita.
 * - `voltar`: subir de volta (o "‹ Financeiro"). Desliza da esquerda.
 *
 * As classes estão em `globals.css`, junto com a redução de movimento.
 */
export const TIPO_DE_NAVEGACAO: Record<"aba" | "avancar" | "voltar", string[]> = {
  aba: ["nav-aba"],
  avancar: ["nav-avancar"],
  voltar: ["nav-voltar"],
};

const PELO_TIPO = {
  "nav-aba": "nav-aba",
  "nav-avancar": "nav-avancar",
  "nav-voltar": "nav-voltar",
  default: "none",
};

/**
 * Envolve o conteúdo que troca entre telas. Mora no layout, e não em cada
 * página: o layout continua montado na navegação, então a troca chega aqui como
 * `update` — e é por isso que o `update` recebe o mesmo mapa de `enter`/`exit`.
 *
 * Cabeçalho, barra de baixo e lateral ficam FORA dela e têm nome próprio
 * (`view-transition-name` em cada um), para ficarem parados enquanto o conteúdo
 * se mexe: é a referência que diz ao olho que foi a tela que trocou, e não o
 * app inteiro.
 */
export function TransicaoDeTela({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      name="conteudo-da-tela"
      enter={PELO_TIPO}
      exit={PELO_TIPO}
      update={PELO_TIPO}
      share="none"
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
