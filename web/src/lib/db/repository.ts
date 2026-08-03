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
type Assinatura = {
  unsubscribe: () => void;
  ouvintes: Set<(items: Doc<DocumentData>[]) => void>;
  erros: Set<(e: Error) => void>;
  ultimo: Doc<DocumentData>[] | null;
};

/**
 * Assinaturas compartilhadas por (barbearia, coleção, filtros).
 *
 * Sem isto, cada componente abre o próprio listener: a tela de Números
 * chamava `useFinanceiro` duas vezes e abria DOZE listeners sobre as mesmas
 * seis coleções, porque o recorte de mês acontece em memória. Agora o segundo
 * assinante entra de carona e recebe na hora o último resultado conhecido.
 */
const assinaturas = new Map<string, Assinatura>();

export function subscribeToCollection<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  handlers: {
    onData: (items: Doc<T>[]) => void;
    onError?: (error: Error) => void;
  },
  options?: ListOptions
): () => void {
  const chave = `${barbershopId}:${collectionName}:${JSON.stringify(options ?? {})}`;

  const onData = handlers.onData as (items: Doc<DocumentData>[]) => void;
  const onError = handlers.onError ?? (() => {});

  let assinatura = assinaturas.get(chave);

  if (!assinatura) {
    const nova: Assinatura = {
      unsubscribe: () => {},
      ouvintes: new Set(),
      erros: new Set(),
      ultimo: null,
    };
    assinaturas.set(chave, nova);
    assinatura = nova;

    let cancelado = false;
    getDb()
      .then((db) => {
        if (cancelado) return;
        const ref = collection(db, shopCollectionPath(barbershopId, collectionName));
        const parar = onSnapshot(
          query(ref, ...constraintsFrom(options)),
          (snapshot) => {
            const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            nova.ultimo = items;
            nova.ouvintes.forEach((fn) => fn(items));
          },
          (error) => nova.erros.forEach((fn) => fn(error))
        );
        nova.unsubscribe = () => {
          cancelado = true;
          parar();
        };
      })
      .catch((error) => nova.erros.forEach((fn) => fn(error as Error)));
  }

  assinatura.ouvintes.add(onData);
  assinatura.erros.add(onError);

  // Quem chega depois não espera a rede: recebe o que já se sabe.
  if (assinatura.ultimo) onData(assinatura.ultimo);

  return () => {
    const atual = assinaturas.get(chave);
    if (!atual) return;
    atual.ouvintes.delete(onData);
    atual.erros.delete(onError);

    /* Não cancela na hora: navegar para outra tela e voltar recriaria o
     * listener e refaria a busca. Uma folga curta cobre a troca de tela sem
     * segurar assinatura de tela que ninguém está vendo. */
    if (atual.ouvintes.size === 0) {
      setTimeout(() => {
        const ainda = assinaturas.get(chave);
        if (ainda && ainda.ouvintes.size === 0) {
          ainda.unsubscribe();
          assinaturas.delete(chave);
        }
      }, 30_000);
    }
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
