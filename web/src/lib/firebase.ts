import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

/* O SDK falha com "auth/invalid-api-key" — mensagem que não diz o que fazer — e
 * como este módulo é avaliado no prerender de TODA rota, o build inteiro morre
 * sem explicação. Falhar antes, dizendo exatamente o que falta. */
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingKeys.length > 0) {
  throw new Error(
    `Firebase: configuração incompleta (${missingKeys.join(", ")}).\n` +
      `Copie web/.env.example para web/.env.local e preencha as chaves do projeto ` +
      `no console do Firebase (Configurações do projeto → Seus apps → Web).`
  );
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* Auth é o único carregado de imediato: o AuthProvider está no layout raiz, ou
 * seja, roda em toda página. O resto do SDK é importado sob demanda — juntos,
 * Firestore/Storage/Functions/Analytics pesam mais de 400 KB, e cobrar isso de
 * quem só abriu a tela de agendar atrasa toda navegação. */
export const auth = getAuth(firebaseApp);

/* Emulador local: permite exercitar cadastro, regras e onboarding de verdade
 * sem tocar no projeto de produção. Ligado por NEXT_PUBLIC_USE_EMULATOR. */
const useEmulator = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";

if (useEmulator && typeof window !== "undefined") {
  const w = window as unknown as { __emuAuth?: boolean };
  if (!w.__emuAuth) {
    w.__emuAuth = true;
    void import("firebase/auth").then(({ connectAuthEmulator }) => {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    });
  }
}

let dbPromise: Promise<import("firebase/firestore").Firestore> | null = null;

export async function getDb() {
  dbPromise ??= (async () => {
    const mod = await import("firebase/firestore");
    const noNavegador = typeof window !== "undefined";

    /* Cache em IndexedDB, SÓ no navegador.
     *
     * Sem cache persistente, sair de uma tela e voltar refaz toda a busca — é
     * o que o dono sente como lentidão a cada troca de aba.
     *
     * Mas `persistentLocalCache` depende de IndexedDB, que NÃO EXISTE no Node.
     * Aplicá-lo no servidor faz `getDoc` falhar em silêncio: a resolução do
     * subdomínio cai no tenant padrão, o app inteiro passa a consultar uma
     * barbearia que não existe, e o dono é expulso do próprio painel porque o
     * claim dele não bate com o id errado. Custou um deploy inteiro para
     * aparecer, porque em desenvolvimento o servidor e o navegador são a mesma
     * máquina e o sintoma não surge.
     *
     * `persistentMultipleTabManager` porque o painel costuma ficar aberto em
     * mais de uma aba — sem ele, a segunda aba falha ao abrir o cache. */
    const db = noNavegador
      ? mod.initializeFirestore(firebaseApp, {
          localCache: mod.persistentLocalCache({
            tabManager: mod.persistentMultipleTabManager(),
          }),
        })
      : mod.getFirestore(firebaseApp);

    if (useEmulator) mod.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    return db;
  })();
  return dbPromise;
}

export async function getAppStorage() {
  const { getStorage } = await import("firebase/storage");
  return getStorage(firebaseApp);
}

let functionsPromise: Promise<import("firebase/functions").Functions> | null = null;

export async function getAppFunctions() {
  functionsPromise ??= (async () => {
    const { getFunctions, connectFunctionsEmulator } = await import("firebase/functions");
    const fns = getFunctions(firebaseApp, "southamerica-east1");
    if (useEmulator) connectFunctionsEmulator(fns, "127.0.0.1", 5001);
    return fns;
  })();
  return functionsPromise;
}

/** Chama uma Cloud Function tipada. */
export async function callFunction<TInput, TOutput>(name: string, data: TInput) {
  const fns = await getAppFunctions();
  const { httpsCallable } = await import("firebase/functions");
  const result = await httpsCallable<TInput, TOutput>(fns, name)(data);
  return result.data;
}

export async function getFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;
  return getAnalytics(firebaseApp);
}
