/**
 * O navegador de dentro de outro aplicativo (Instagram, Facebook, Messenger,
 * Line…), onde "Continuar com Google" NÃO funciona.
 *
 * O Google recusa o login em WebView embutida com `403 disallowed_useragent`.
 * O link da barbearia circula justamente pelo Instagram, então esse é o
 * primeiro lugar onde o cliente toca no botão — e a falha não é dele nem
 * nossa: a tela só pode avisar e oferecer o caminho (abrir no navegador).
 *
 * Detecção por `User-Agent`, só pelas marcas que esses aplicativos assinam.
 * De propósito NÃO inclui a heurística "iPhone sem `Safari` no UA": é como o
 * app instalado na tela de início (standalone) se apresenta, e esconder o
 * Google de quem instalou o Topete seria o defeito oposto.
 */
const MARCAS_DE_APP = [
  /\bInstagram\b/i,
  /\bFBAN\b/, // Facebook para iOS
  /\bFBAV\b/, // Facebook para Android/iOS
  /\bFB_IAB\b/, // Facebook in-app browser (Android)
  /\bFBIOS\b/,
  /\bMessenger\b/i,
  /\bLine\//,
  /\bMicroMessenger\b/, // WeChat
  /\bSnapchat\b/i,
  /\bBytedanceWebview\b|\bmusical_ly\b|\bTikTok\b/i,
  /\bLinkedInApp\b/,
  /\bPinterest\b/i,
  /\bTwitter\b/i,
  /; wv\)/, // WebView genérica do Android
];

export function ehNavegadorEmbutido(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return MARCAS_DE_APP.some((marca) => marca.test(userAgent));
}
