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

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/* Auth é o único carregado de imediato: o AuthProvider está no layout raiz, ou
 * seja, roda em toda página. O resto do SDK é importado sob demanda — juntos,
 * Firestore/Storage/Functions/Analytics pesam mais de 400 KB, e cobrar isso de
 * quem só abriu a tela de agendar atrasa toda navegação. */
export const auth = getAuth(firebaseApp);

export async function getDb() {
  const { getFirestore } = await import("firebase/firestore");
  return getFirestore(firebaseApp);
}

export async function getAppStorage() {
  const { getStorage } = await import("firebase/storage");
  return getStorage(firebaseApp);
}

export async function getAppFunctions() {
  const { getFunctions } = await import("firebase/functions");
  return getFunctions(firebaseApp, "southamerica-east1");
}

export async function getFirebaseAnalytics() {
  if (typeof window === "undefined") return null;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;
  return getAnalytics(firebaseApp);
}
