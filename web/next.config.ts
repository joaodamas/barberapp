import path from "node:path";
import type { NextConfig } from "next";

/* Firebase Auth abre popup de OAuth e o SDK conversa com vários domínios do
 * Google — a CSP precisa listá-los explicitamente, senão o login quebra. */
const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' é exigido pelo runtime do Next; 'unsafe-eval' NÃO é.
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com https://www.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.cloudfunctions.net",
  // reCAPTCHA (login por SMS) e o popup de conta Google.
  "frame-src https://*.firebaseapp.com https://www.google.com https://accounts.google.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // O login com Google usa popup: 'same-origin' puro quebraria o fluxo.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  /* Um package-lock.json no $HOME estava vencendo o do projeto e o Turbopack
   * inferia a raiz errada do workspace. */
  turbopack: {
    root: path.join(__dirname),
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/:path*",
        headers: securityHeaders,
      },

      /* Resolver a barbearia pelo subdomínio tornou todas as rotas dinâmicas:
       * não dá para prerenderizar uma marca que só se conhece na requisição.
       * Sem mitigação, cada acesso vira uma execução de servidor.
       *
       * O HTML servido é a casca do app — idêntico para todos os visitantes de
       * uma mesma barbearia, porque todo conteúdo logado é renderizado no
       * cliente depois do AuthGuard. Logo, pode ser cacheado na borda, e o CDN
       * já separa o cache por hostname. O render acontece uma vez por
       * barbearia, não uma vez por visita.
       *
       * ⚠️ ISTO DEIXA DE SER SEGURO no dia em que qualquer dado de usuário for
       * renderizado no servidor. Se um `await getDoc(...)` de dado pessoal
       * entrar numa page, este bloco tem de sair junto — senão a resposta de um
       * cliente é servida ao próximo. */
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
          },
          { key: "Vary", value: "Host" },
        ],
      },
    ];
  },
};

export default nextConfig;
