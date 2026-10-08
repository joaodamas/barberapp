"use client";

import { useEffect, useState } from "react";
import type { DocumentData } from "firebase/firestore";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToCollection,
  type ListOptions,
} from "@/lib/db/repository";
import {
  estadoDaChave,
  type CollectionState,
  type EstadoGuardado,
} from "@/lib/db/estado-da-chave";

export type { CollectionState };

/**
 * Assina uma subcoleção da barbearia atual.
 *
 * O `barbershopId` vem do tenant do subdomínio — a tela nunca informa. O
 * carregamento só começa depois que o Auth resolve: consultar antes garante
 * `permission-denied`, porque a regra depende do token.
 *
 * O estado e a regra da troca de filtro estão em `estado-da-chave.ts`.
 */
export function useShopCollection<T extends DocumentData>(
  collectionName: Parameters<typeof subscribeToCollection>[1],
  options?: ListOptions & { enabled?: boolean; publica?: boolean }
): CollectionState<T> {
  const { id: barbershopId } = useTenant();
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<EstadoGuardado<T>>({
    items: [],
    status: "carregando",
    error: null,
    chave: null,
  });

  const enabled = options?.enabled ?? true;
  /* Coleção de vitrine (serviços, equipe, planos): as regras deixam ler sem
   * conta, e a tela pública precisa dela antes de qualquer login. */
  const publica = options?.publica === true;
  // Serializado porque `equals` é um objeto novo a cada render.
  const optionsKey = JSON.stringify({
    orderByField: options?.orderByField,
    direction: options?.direction,
    equals: options?.equals,
    range: options?.range,
  });
  const chave = `${barbershopId}:${collectionName}:${optionsKey}`;

  useEffect(() => {
    if (authLoading || (!user && !publica) || !enabled) return;

    /* Sem `setState("carregando")` aqui de propósito, por duas razões: o React
     * Compiler desiste de otimizar o componente quando encontra setState no
     * corpo do efeito, e o estado inicial já é "carregando". Na troca de
     * filtro, quem diz "carregando" é `estadoDaChave`: o resultado guardado é
     * de outra chave. Manter os itens antigos como "pronto" evitava piscar,
     * mas mostrava o recorte anterior sob o título do novo — carregando não é
     * vazio, e a tela tem esqueleto para ele. */
    const unsubscribe = subscribeToCollection<T>(
      barbershopId,
      collectionName,
      {
        onData: (items) => setState({ items, status: "pronto", error: null, chave }),
        onError: (error) => {
          console.error(`[firestore] ${collectionName}`, error);
          setState({ items: [], status: "erro", error, chave });
        },
      },
      JSON.parse(optionsKey)
    );

    return unsubscribe;
  }, [barbershopId, collectionName, optionsKey, chave, authLoading, user, enabled, publica]);

  return estadoDaChave(state, chave);
}
