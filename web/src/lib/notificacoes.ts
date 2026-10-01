/**
 * Notificação do app neste aparelho (01/10/2026).
 *
 * O worker do app (`public/sw.js`) é quem recebe e mostra; aqui só pedimos a
 * permissão, pegamos o endereço de entrega do Firebase Cloud Messaging e o
 * registramos no servidor (`registrarPush`).
 *
 * iPhone: o Safari só entrega notificação de site ADICIONADO À TELA DE INÍCIO
 * (iOS 16.4+), aberto pelo ícone. Fora disso a tela explica como fazer, em vez
 * de mostrar um botão que não funciona.
 */

export type EstadoDaNotificacao = "carregando" | "indisponivel" | "precisa-tela-inicio" | "bloqueado" | "desligado" | "ligado";

const CHAVE = (shop: string) => `topete-push-${shop}`;

function lerLocal(shop: string): string | null {
  try {
    return localStorage.getItem(CHAVE(shop));
  } catch {
    return null;
  }
}
function gravarLocal(shop: string, token: string | null) {
  try {
    if (token) localStorage.setItem(CHAVE(shop), token);
    else localStorage.removeItem(CHAVE(shop));
  } catch {
    /* modo privado: segue sem lembrar */
  }
}

function ehIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function instaladoNaTelaDeInicio() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function estadoDaNotificacao(barbershopId: string): Promise<EstadoDaNotificacao> {
  if (typeof window === "undefined") return "carregando";
  if (ehIOS() && !instaladoNaTelaDeInicio()) return "precisa-tela-inicio";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "indisponivel";
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported().catch(() => false))) return "indisponivel";
  if (Notification.permission === "denied") return "bloqueado";
  return Notification.permission === "granted" && lerLocal(barbershopId) ? "ligado" : "desligado";
}

export async function ativarNotificacao(barbershopId: string): Promise<EstadoDaNotificacao> {
  const permissao = await Notification.requestPermission();
  if (permissao !== "granted") return permissao === "denied" ? "bloqueado" : "desligado";
  const registro = await navigator.serviceWorker.ready;
  const { callFunction, firebaseApp } = await import("@/lib/firebase");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const token = await getToken(getMessaging(firebaseApp), { serviceWorkerRegistration: registro });
  if (!token) throw new Error("O aparelho não devolveu o endereço de notificação. Tente de novo.");
  await callFunction("registrarPush", {
    barbershopId,
    token,
    plataforma: `${ehIOS() ? "iOS" : /Android/.test(navigator.userAgent) ? "Android" : "Computador"}`,
  });
  gravarLocal(barbershopId, token);
  return "ligado";
}

export async function desativarNotificacao(barbershopId: string): Promise<EstadoDaNotificacao> {
  const token = lerLocal(barbershopId);
  if (token) {
    const { callFunction, firebaseApp } = await import("@/lib/firebase");
    await callFunction("removerPush", { barbershopId, token }).catch(() => undefined);
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    await deleteToken(getMessaging(firebaseApp)).catch(() => undefined);
  }
  gravarLocal(barbershopId, null);
  return "desligado";
}
