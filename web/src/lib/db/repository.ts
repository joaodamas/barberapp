"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { shopCollectionPath, shopDocPath, type ShopCollection } from "@/lib/db/paths";

/**
 * Acesso a uma subcoleção da barbearia.
 *
 * Tudo é escopado por `barbershopId`, que vem do tenant resolvido pelo
 * subdomínio — não há como uma tela consultar dado de outra barbearia sem
 * escrever o id da outra explicitamente.
 *
 * O SDK do Firestore é carregado sob demanda (`getDb()`): são ~558 KB que não
 * podem entrar no carregamento inicial de quem só abriu a tela de agendar.
 */
export type Doc<T> = T & { id: string };

export type ListOptions = {
  /** Campo pelo qual ordenar. */
  orderByField?: string;
  direction?: "asc" | "desc";
  /** Filtros simples de igualdade. */
  equals?: Record<string, unknown>;
};

function constraintsFrom(options: ListOptions = {}): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  for (const [field, value] of Object.entries(options.equals ?? {})) {
    if (value !== undefined) constraints.push(where(field, "==", value));
  }
  if (options.orderByField) {
    constraints.push(orderBy(options.orderByField, options.direction ?? "asc"));
  }
  return constraints;
}

/**
 * Assina uma coleção em tempo real.
 *
 * Tempo real não é enfeite aqui: a agenda do dia precisa refletir na hora um
 * encaixe aprovado pelo WhatsApp, e o painel costuma ficar aberto o expediente
 * inteiro num tablet.
 *
 * Devolve a função de cancelamento — sempre chamar no cleanup do efeito.
 */
export function subscribeToCollection<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  handlers: {
    onData: (items: Doc<T>[]) => void;
    onError?: (error: Error) => void;
  },
  options?: ListOptions
): () => void {
  let unsubscribe: (() => void) | null = null;
  let cancelled = false;

  getDb()
    .then((db) => {
      if (cancelled) return;
      const ref = collection(db, shopCollectionPath(barbershopId, collectionName));
      unsubscribe = onSnapshot(
        query(ref, ...constraintsFrom(options)),
        (snapshot) => {
          handlers.onData(
            snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) }))
          );
        },
        (error) => handlers.onError?.(error)
      );
    })
    .catch((error) => handlers.onError?.(error as Error));

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** Cria um documento e devolve o id gerado. */
export async function createDoc<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  data: T
) {
  const db = await getDb();
  const ref = await addDoc(
    collection(db, shopCollectionPath(barbershopId, collectionName)),
    stripUndefined(data)
  );
  return ref.id;
}

/** Cria ou substitui um documento com id conhecido. */
export async function putDoc<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string,
  data: T
) {
  const db = await getDb();
  await setDoc(
    doc(db, shopDocPath(barbershopId, collectionName, docId)),
    stripUndefined(data),
    { merge: true }
  );
}

export async function patchDoc(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string,
  data: DocumentData
) {
  const db = await getDb();
  await updateDoc(doc(db, shopDocPath(barbershopId, collectionName, docId)), stripUndefined(data));
}

export async function removeDoc(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string
) {
  const db = await getDb();
  await deleteDoc(doc(db, shopDocPath(barbershopId, collectionName, docId)));
}

/**
 * O Firestore rejeita `undefined` com erro em tempo de execução, e campos
 * opcionais de formulário chegam assim o tempo todo (observação em branco,
 * fornecedor não informado). Omitir é o comportamento esperado.
 */
function stripUndefined<T extends DocumentData>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  ) as T;
}
