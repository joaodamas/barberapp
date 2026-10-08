import type { Doc } from "@/lib/db/repository";

/**
 * `status` distingue "carregando" de "vazio de verdade". Sem isso, toda tela
 * pisca o estado vazio antes dos dados chegarem — o defeito que a revisão de
 * UI/UX apontou como o próximo a aparecer quando o Firestore entrasse.
 *
 * Mora fora de `use-collection.ts` para ser testável sem Auth nem Firebase.
 */
export type CollectionState<T> = {
  items: Doc<T>[];
  status: "carregando" | "pronto" | "erro";
  error: Error | null;
};

const SEM_ITENS: Doc<never>[] = [];

/** O estado guardado: o resultado e a assinatura de onde ele veio. */
export type EstadoGuardado<T> = CollectionState<T> & { chave: string | null };

/**
 * O que a tela vê, dado o que está guardado e a assinatura pedida agora.
 *
 * Trocar o filtro (outro mês, outro barbeiro) mantinha `status: "pronto"` com
 * os itens da consulta ANTERIOR até a nova chegar: a comissão de setembro
 * aparecia sob o título de outubro, como se fosse dela. Resultado de outra
 * chave é "carregando" — sem itens, para nenhuma tela somar o recorte errado.
 */
export function estadoDaChave<T>(guardado: EstadoGuardado<T>, chave: string): CollectionState<T> {
  /* Lista vazia ÚNICA: um `[]` novo a cada render dispararia de novo todo
   * `useMemo`/`useEffect` que dependa de `items` enquanto carrega. */
  if (guardado.chave !== chave) {
    return { items: SEM_ITENS as Doc<T>[], status: "carregando", error: null };
  }
  return { items: guardado.items, status: guardado.status, error: guardado.error };
}
