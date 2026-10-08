"use client";

import { createContext, useContext } from "react";
import type { EstadoDaFichaAoVivo } from "@/lib/onboarding-concluido";

/**
 * A ficha ao vivo já veio do SERVIDOR?
 *
 * Enquanto não vem, o tenant da tela é o do servidor do Next (até 300 s de
 * idade) ou o do cache local do Firestore — e decidir algo irreversível com
 * ele, como mandar o dono de volta ao passo 1 do onboarding que ele acabou de
 * concluir, é decidir com a ficha velha. Ver `onboarding-concluido.ts`.
 *
 * Mora fora de `tenant-live.tsx` de propósito: aquele arquivo importa o SDK
 * do Firestore, e o `AuthGuard` — que lê este contexto — também guarda o app
 * do cliente, que não pode carregar o SDK logo na abertura.
 */
export const FichaAoVivoContext = createContext<EstadoDaFichaAoVivo>("sem-escuta");

export function useEstadoDaFichaAoVivo(): EstadoDaFichaAoVivo {
  return useContext(FichaAoVivoContext);
}
