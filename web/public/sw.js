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
  /* A marca DESTA barbearia — o worker é por origem, e cada subdomínio
   * pré-cacheia a sua. Eram os arquivos do piloto, iguais para todas. */
  "/marca.svg",
  "/icone/192",
  "/icone/512",
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

  /* Pedido para FORA do site passa direto pelo navegador (incidente de 28/09).
   *
   * O worker interceptava tudo, inclusive o script do reCAPTCHA no Google. E o
   * `fetch` feito DE DENTRO do worker obedece à CSP com que o worker foi
   * instalado: celulares com o worker antigo — CSP sem `www.google.com` —
   * bloqueavam o reCAPTCHA, o App Check nunca conseguia token, e o app
   * inteiro ficava esperando: ninguém marcava horário. O que é de outra
   * origem não é deste cache nem desta política. */
  if (new URL(request.url).origin !== self.location.origin) return;

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

  /* REDE PRIMEIRO (incidente de 28/09). Era cache primeiro: depois de um
   * deploy, a tela vinha da versão anterior guardada no celular, pedia
   * arquivos que não existem mais (404) e parava de responder — e cada deploy
   * do dia acumulava mais versões velhas. O cache fica só para quando a rede
   * falhar (offline). */
  if (isRsc) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error()))
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

/* ------------------------------------------------------------------ */
/* Notificação do app (01/10/2026)                                     */
/* ------------------------------------------------------------------ */
/* O servidor manda só `data` pelo Firebase Cloud Messaging
 * (`functions/src/push/push.ts`); quem desenha a notificação é este worker.
 * Nada aqui toca no cache: os dois blocos acima continuam exatamente como
 * estavam depois do incidente de 28/09. */
self.addEventListener("push", (event) => {
  let carga = {};
  try {
    carga = event.data ? event.data.json() : {};
  } catch {
    carga = {};
  }
  /* O FCM entrega `{ data: {...}, from, fcmMessageId }`. */
  const d = carga.data || carga;
  const titulo = d.titulo || "Topete";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.corpo || "",
      icon: "/icone/192",
      badge: "/icone/192",
      tag: d.tag || undefined,
      data: { url: d.url || "/painel" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || "/painel", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      /* App já aberto: traz para a frente e navega; senão, abre. */
      for (const janela of abertas) {
        if (janela.url.startsWith(self.location.origin) && "focus" in janela) {
          return janela.focus().then((j) => (j && "navigate" in j ? j.navigate(destino) : j));
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
