/**
 * A versão vem da URL de registro (`/sw.js?v=<build>`), e não de uma constante.
 *
 * Como constante, ela nunca mudava — e é isso que mantinha um usuário existente
 * na versão anterior depois de publicar. O navegador só procura service worker
 * novo quando o BYTE do arquivo muda; `sw.js` é estático e não muda a cada
 * build, então nenhum deploy jamais disparou `updatefound`. O aviso "Nova
 * versão disponível" existia e nunca teve como aparecer, e o cache atravessava
 * publicação após publicação servindo RSC e chunks de builds antigos.
 *
 * Com o build na query, cada publicação muda a URL do script: o navegador vê
 * worker novo, instala, e o `activate` abaixo — que já apagava tudo com nome
 * diferente — passa a ter o que apagar.
 */
const VERSAO = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `barbearia-${VERSAO}`;
const OFFLINE_URL = "/offline";
const APP_SHELL = [
  OFFLINE_URL,
  "/logo.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  // `addAll` é atômico: um único 404 derruba o precache inteiro e a página
  // offline nunca chega a ser cacheada. Cada item falha por conta própria.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            console.warn("[sw] falhou ao pré-cachear", url, err);
          })
        )
      )
    )
  );
  // Sem skipWaiting() automático: ativar o SW novo enquanto uma aba ainda roda
  // o JS do build anterior faz ela pedir chunks que já não existem. O app
  // decide a hora de trocar, mandando a mensagem SKIP_WAITING.
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        // `caches.match` pode devolver undefined; respondWith(undefined) vira
        // erro de rede em vez da página offline.
        const cached = await caches.match(OFFLINE_URL);
        return (
          cached ??
          new Response("Você está offline.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  const { pathname } = new URL(request.url);
  const isAppShell = APP_SHELL.includes(pathname);
  // Assets do build têm hash no nome: o conteúdo nunca muda para a mesma URL.
  const isImmutable = pathname.startsWith("/_next/static/");

  if (isAppShell || isImmutable) {
    // Cache-first. Em asset imutável não há risco de servir versão velha — um
    // build novo gera URLs novas — e evita esperar a rede a cada navegação,
    // que era o que deixava a troca de tela lenta e piscando em branco.
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  /* Respostas que podem conter dado de UM usuário nunca vão para o
   * CacheStorage — ele é compartilhado pelo dispositivo e não tem chave por
   * conta. Num celular emprestado no salão, o próximo login leria o cache do
   * anterior. Vale para payloads RSC (`?_rsc=`), rotas de API e qualquer
   * resposta marcada como privada. */
  const url = new URL(request.url);

  /* Rota de API pode devolver dado de UM usuário: nunca entra no cache, que é
   * compartilhado pelo dispositivo. */
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  /* Payload de navegação (RSC). Contém a casca da tela e a marca da barbearia
   * — o mesmo para todo visitante DESTE subdomínio, porque o conteúdo logado é
   * renderizado no cliente depois do AuthGuard. Cada barbearia tem sua origem,
   * então o cache do navegador já as separa.
   *
   * Serve do cache na hora e revalida atrás: é o que faz trocar de tela ser
   * instantâneo em vez de esperar a rede a cada clique.
   *
   * ⚠️ Se algum dia uma page renderizar dado de usuário no servidor, este
   * bloco tem de sair junto — senão a tela de um cliente é servida ao próximo.
   */
  const isRsc =
    url.searchParams.has("_rsc") ||
    request.headers.get("Accept")?.includes("text/x-component");

  if (isRsc) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const rede = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || rede;
      })
    );
    return;
  }

  // Demais requisições do mesmo domínio: rede primeiro, cache como rede de
  // segurança para offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          request.url.startsWith(self.location.origin) &&
          response.headers.get("Cache-Control")?.includes("private") !== true
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
