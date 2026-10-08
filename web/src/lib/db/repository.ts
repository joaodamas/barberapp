"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
import {
  shopCollectionPath,
  shopDocPath,
  shopPath,
  type ShopCollection,
} from "@/lib/db/paths";
import { conferirEscrita } from "@/lib/db/trava-de-escrita";

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
  /**
   * Recorte por intervalo num campo (inclusive nas duas pontas) — 05/10, painel
   * do barbeiro: a agenda dele assina só os dias vistos, não a coleção inteira.
   */
  range?: { field: string; from?: string; to?: string };
};

function constraintsFrom(options: ListOptions = {}): QueryConstraint[] {
  const constraints: QueryConstraint[] = [];
  for (const [field, value] of Object.entries(options.equals ?? {})) {
    if (value !== undefined) constraints.push(where(field, "==", value));
  }
  if (options.range?.from !== undefined) constraints.push(where(options.range.field, ">=", options.range.from));
  if (options.range?.to !== undefined) constraints.push(where(options.range.field, "<=", options.range.to));
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

    /* Escuta que falhou está morta: o Firestore encerra o listener depois do
     * erro e não volta sozinho. Se a entrada ficasse no mapa, quem chegasse
     * nos 30 s seguintes entraria de carona numa escuta que nunca mais vai
     * entregar nada — a tela ficaria "carregando" para sempre (o erro só
     * chegou a quem estava ouvindo na hora). Então: avisa quem está ouvindo e
     * tira a chave, para o próximo assinante abrir uma escuta nova. */
    const morreu = (error: Error) => {
      if (assinaturas.get(chave) === nova) assinaturas.delete(chave);
      nova.unsubscribe();
      nova.erros.forEach((fn) => fn(error));
    };

    let cancelado = false;
    /* Cancelado antes de o SDK carregar: o `then` abaixo não abre a escuta. */
    nova.unsubscribe = () => {
      cancelado = true;
    };
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
          (error) => morreu(error)
        );
        nova.unsubscribe = () => {
          cancelado = true;
          parar();
        };
      })
      .catch((error) => morreu(error as Error));
  }

  /* A limpeza mira a entrada em que ESTE assinante entrou, não a que estiver
   * no mapa agora: depois de uma escuta morrer, a chave pode já apontar para
   * a escuta nova de outra tela — e cancelar aquela derrubaria quem não tem
   * nada a ver com isto. */
  const minha = assinatura;
  minha.ouvintes.add(onData);
  minha.erros.add(onError);

  // Quem chega depois não espera a rede: recebe o que já se sabe.
  if (minha.ultimo) onData(minha.ultimo);

  return () => {
    minha.ouvintes.delete(onData);
    minha.erros.delete(onError);

    /* Não cancela na hora: navegar para outra tela e voltar recriaria o
     * listener e refaria a busca. Uma folga curta cobre a troca de tela sem
     * segurar assinatura de tela que ninguém está vendo. */
    if (minha.ouvintes.size === 0) {
      setTimeout(() => {
        if (minha.ouvintes.size !== 0) return;
        minha.unsubscribe();
        if (assinaturas.get(chave) === minha) assinaturas.delete(chave);
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
  conferirEscrita();
  const db = await getDb();
  const ref = await addDoc(
    collection(db, shopCollectionPath(barbershopId, collectionName)),
    stripUndefined(data)
  );
  return ref.id;
}

/** Um id novo para a coleção, gerado no aparelho, sem ir à rede. */
export async function novoIdDe(barbershopId: string, collectionName: ShopCollection) {
  const db = await getDb();
  return doc(collection(db, shopCollectionPath(barbershopId, collectionName))).id;
}

/**
 * Grava um documento novo com id escolhido ANTES — e não espera o servidor.
 *
 * `createDoc` usa `addDoc`, que sorteia o id a cada chamada e só resolve
 * quando o servidor confirma. Offline, isso deixava o formulário preso em
 * "Salvando…" e convidava a salvar de novo: cada tentativa virava um
 * documento a mais quando a conexão voltasse. Com o id fixado por quem chama
 * (`novoIdDe`), repetir sobrescreve o mesmo documento em vez de duplicar.
 *
 * Devolve assim que o SDK aceitou a gravação local; `noServidor` é a
 * confirmação do servidor, para a tela dizer "salvo" ou "vai sincronizar"
 * (ver `esperarServidorOuSeguir`).
 */
export async function gravarNovo<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string,
  data: T
): Promise<{ id: string; noServidor: Promise<void> }> {
  conferirEscrita();
  const db = await getDb();
  const noServidor = setDoc(
    doc(db, shopDocPath(barbershopId, collectionName, docId)),
    stripUndefined(data)
  );
  return { id: docId, noServidor };
}

/** Cria ou substitui um documento com id conhecido. */
export async function putDoc<T extends DocumentData>(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string,
  data: T
) {
  conferirEscrita();
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
  conferirEscrita();
  const db = await getDb();
  await updateDoc(doc(db, shopDocPath(barbershopId, collectionName, docId)), stripUndefined(data));
}

/**
 * Atualiza o documento da própria barbearia.
 *
 * Separado de `patchDoc` porque aquele endereça subcoleções
 * (`barbershops/{id}/{colecao}/{doc}`) e o tenant é o documento pai.
 *
 * Aceita caminho pontilhado (`"policies.paymentFees"`) de propósito: enviar o
 * objeto `policies` inteiro sobrescreveria cancelamento, comissão e alíquota
 * com o que a tela que está salvando por acaso conhece. As regras barram
 * qualquer tentativa de tocar em campo de contrato.
 */
export async function patchTenant(barbershopId: string, data: DocumentData) {
  conferirEscrita();
  const db = await getDb();
  await updateDoc(doc(db, shopPath(barbershopId)), stripUndefined(data));
}

/**
 * A marca da barbearia — tela "Sua marca".
 *
 * Caminho pontilhado, campo a campo: `brand` inteiro levaria junto
 * `panelLabel`, `clientTagline` e `themeColor`, que o dono não edita e a
 * regra não deixa ele tocar (`marcaDoDonoValida`).
 *
 * `logo`:
 * - `string` — URL do `logo.png` que acabou de subir; os ícones saem dela;
 * - `null` — remover: volta o monograma. Leva junto `icones` e
 *   `logoHorizontal`, senão uma barbearia com ícones próprios gravados pela
 *   plataforma ficaria com o monograma no app e o ícone antigo no celular;
 * - `undefined` — não mexe.
 */
export async function salvarMarca(
  barbershopId: string,
  marca: { name?: string; shortName?: string; accentColor?: string; logo?: string | null }
) {
  conferirEscrita();
  const db = await getDb();
  const data: DocumentData = {};
  if (marca.name !== undefined) data["brand.name"] = marca.name;
  if (marca.shortName !== undefined) data["brand.shortName"] = marca.shortName;
  if (marca.accentColor !== undefined) data["brand.accentColor"] = marca.accentColor;
  if (marca.logo === null) {
    data["brand.logo"] = deleteField();
    data["brand.logoHorizontal"] = deleteField();
    data["brand.icones"] = deleteField();
  } else if (marca.logo !== undefined) {
    data["brand.logo"] = marca.logo;
  }
  if (Object.keys(data).length === 0) return;
  await updateDoc(doc(db, shopPath(barbershopId)), data);
}

/**
 * Taxas, formas de pagamento e comissão da casa — em `private/financeiro`.
 *
 * Moravam na ficha pública da barbearia, que qualquer pessoa lê sem login
 * (auditoria de segurança de 28/09, M4). `merge` para gravar só o que a tela
 * conhece; as regras aceitam do dono apenas estes três campos.
 */
export async function salvarFinanceiro(
  barbershopId: string,
  data: { paymentForms?: unknown; paymentFees?: unknown; commissionSplit?: unknown }
) {
  conferirEscrita();
  const db = await getDb();
  await setDoc(doc(db, shopPath(barbershopId), "private", "financeiro"), stripUndefined(data), {
    merge: true,
  });
}

export async function removeDoc(
  barbershopId: string,
  collectionName: ShopCollection,
  docId: string
) {
  conferirEscrita();
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
