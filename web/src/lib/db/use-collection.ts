"use client";

import { useEffect, useState } from "react";
import type { DocumentData } from "firebase/firestore";
import { useTenant } from "@/lib/tenant-context";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToCollection,
  type Doc,
  type ListOptions,
} from "@/lib/db/repository";

/**
 * Assina uma subcoleção da barbearia atual.
 *
 * O `barbershopId` vem do tenant do subdomínio — a tela nunca informa. O
 * carregamento só começa depois que o Auth resolve: consultar antes garante
 * `permission-denied`, porque a regra depende do token.
 *
 * `status` distingue "carregando" de "vazio de verdade". Sem isso, toda tela
 * pisca o estado vazio antes dos dados chegarem — o defeito que a revisão de
 * UI/UX apontou como o próximo a aparecer quando o Firestore entrasse.
 */
export type CollectionState<T> = {
  items: Doc<T>[];
  status: "carregando" | "pronto" | "erro";
  error: Error | null;
};

export function useShopCollection<T extends DocumentData>(
  collectionName: Parameters<typeof subscribeToCollection>[1],
  options?: ListOptions & { enabled?: boolean }
): CollectionState<T> {
  const { id: barbershopId } = useTenant();
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState<CollectionState<T>>({
    items: [],
    status: "carregando",
    error: null,
  });

  const enabled = options?.enabled ?? true;
  // Serializado porque `equals` é um objeto novo a cada render.
  const optionsKey = JSON.stringify({
    orderByField: options?.orderByField,
    direction: options?.direction,
    equals: options?.equals,
  });

  useEffect(() => {
    if (authLoading || !user || !enabled) return;

    /* Sem `setState("carregando")` aqui de propósito, por duas razões: o React
     * Compiler desiste de otimizar o componente quando encontra setState no
     * corpo do efeito, e manter os dados anteriores enquanto a nova assinatura
     * chega evita o pisca-vazio na troca de filtro. O estado inicial já é
     * "carregando". */
    const unsubscribe = subscribeToCollection<T>(
      barbershopId,
      collectionName,
      {
        onData: (items) => setState({ items, status: "pronto", error: null }),
        onError: (error) => {
          console.error(`[firestore] ${collectionName}`, error);
          setState({ items: [], status: "erro", error });
        },
      },
      JSON.parse(optionsKey)
    );

    return unsubscribe;
  }, [barbershopId, collectionName, optionsKey, authLoading, user, enabled]);

  return state;
}
