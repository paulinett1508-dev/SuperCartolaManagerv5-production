// =====================================================================
// service-worker.js - Service Worker do PWA v4.3 (CACHE FALLBACK 5xx)
// Destino: /participante/service-worker.js
// ✅ v4.3: REPUBLISH RESILIENCE - SW intercepta HTML e mostra retry page quando servidor está down
// ✅ v4.2: TTL DINÂMICO - Backend usa 30s com jogos ao vivo, 5min sem
// ✅ v4.1: CACHE BUST - Forçar atualização de tabelas-esportes.js (tempo jogos + refresh 30s)
// ✅ v4.0: FIX MOBILE MODULES - Não interceptar ES module imports (causa falha em mobile)
// ✅ v3.9: FIX MOBILE - Normalizar query params no cache, preservar fallback offline
// ✅ v3.8: RANKING FIX - Corrigir temporada 2025 hardcoded para dinâmica
// ✅ v3.7: RODADAS REDESIGN - Grupos expansíveis + slider horizontal
// ✅ v3.6: PUSH NOTIFICATIONS - Handlers de push, click e close
// ✅ v3.5: HOME PREMIUM UI - Cores hardcoded, fonte 72px, match cards azul
// ✅ v3.3: SALDO INICIAL FIX - Força reload para correções de saldo
// ✅ v3.2: FORCE CACHE CLEAR - Limpar cache antigo que causava erros
// ✅ v3.1: Network-First com cache fallback (FIX fetch failures)
// ✅ v3.0: Força limpeza de caches antigos
// BUILD: 2026-02-28T00:00:00Z
// =====================================================================

const CACHE_NAME = "super-cartola-v28-20260228";

// Arquivos essenciais para cache inicial
const STATIC_ASSETS = [
    "/participante/css/tailwind.css",
    "/participante/css/participante.css",
    "/participante/css/splash-screen.css",
    "/participante/css/pull-refresh.css",
    "/escudos/default.png",
    "/escudos/placeholder.png",
    "/img/newlogo-supercartola.png",
    "/img/logo-osfuleros.png",
];

// Extensões que devem usar Cache First
const CACHE_FIRST_EXTENSIONS = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf'];

// ✅ Instalação - cachear arquivos estáticos
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches
            .open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
            .catch((err) => console.warn("[SW] Erro no install:", err)),
    );
});

// ✅ Ativação - limpar caches antigos
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name)),
                );
            })
            .then(() => self.clients.claim()),
    );
});

// ✅ v4.3: Página de retry quando servidor está down (Republish)
function gerarPaginaRetry() {
    var html = '<!DOCTYPE html><html lang="pt-BR"><head>' +
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Atualizando...</title>' +
        '<style>' +
        '*{margin:0;padding:0;box-sizing:border-box}' +
        'body{background:#111827;color:#f3f4f6;font-family:"Inter",-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}' +
        '.c{text-align:center;padding:2rem}' +
        'h1{font-family:"Russo One",sans-serif;font-size:1.5rem;margin-bottom:.75rem;color:#60a5fa}' +
        'p{font-size:.95rem;color:#9ca3af;margin-bottom:1.5rem}' +
        '.spinner{width:36px;height:36px;border:3px solid #374151;border-top-color:#60a5fa;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto}' +
        '@keyframes spin{to{transform:rotate(360deg)}}' +
        '#status{font-size:.8rem;color:#6b7280;margin-top:.5rem}' +
        '#retry-btn{display:none;margin-top:1rem;padding:.6rem 1.5rem;background:#1d4ed8;color:#fff;border:none;border-radius:8px;font-size:.95rem;cursor:pointer}' +
        '#retry-btn:active{background:#1e40af}' +
        '</style></head>' +
        '<body><div class="c">' +
        '<div class="spinner"></div>' +
        '<h1 style="margin-top:1.25rem">Servidor reiniciando</h1>' +
        '<p>Uma atualizacao foi aplicada. A pagina sera recarregada automaticamente.</p>' +
        '<div id="status"></div>' +
        '<button id="retry-btn" onclick="location.reload()">Toque para recarregar</button>' +
        '</div>' +
        '<script>' +
        '(function(){' +
        'var t=0,max=90,iv=2000;' +
        'var s=document.getElementById("status");' +
        'var b=document.getElementById("retry-btn");' +
        'function go(){' +
        't++;' +
        'if(s)s.textContent="Tentativa "+t+"...";' +
        'fetch(location.href,{method:"HEAD",cache:"no-store"}).then(function(r){' +
        'if(r.ok||r.status===304){location.reload();}' +
        'else if(t<max){setTimeout(go,iv);}' +
        'else{done();}' +
        '}).catch(function(){' +
        'if(t<max){setTimeout(go,iv);}' +
        'else{done();}' +
        '});' +
        '}' +
        'function done(){' +
        'if(s)s.textContent="Servidor ainda indisponivel.";' +
        'if(b)b.style.display="inline-block";' +
        '}' +
        'setTimeout(go,iv);' +
        'setTimeout(function(){if(b)b.style.display="inline-block";},20000);' +
        '})();' +
        '<\/script>' +
        '</body></html>';
    return new Response(html, {
        status: 503,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
    });
}

// ✅ v2.0: Estratégias de cache otimizadas
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // ❌ IGNORAR completamente requisições externas
    if (url.origin !== self.location.origin) {
        return;
    }

    // ❌ Ignorar requisições não-GET
    if (request.method !== "GET") {
        return;
    }

    // ❌ NETWORK ONLY: APIs - nunca cachear
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    // ✅ v4.3: NETWORK FIRST + RETRY PAGE para HTML/navegação
    // Quando servidor está DOWN (Republish), o proxy Replit retorna "Internal Server Error".
    // Sem interceptação, o usuário fica preso nesse erro.
    // Agora o SW detecta falha/5xx e responde com página de retry automático.
    if (url.pathname.endsWith('.html') ||
        url.pathname === '/participante/' ||
        url.pathname === '/participante') {
        event.respondWith(
            fetch(request).then(function(response) {
                // Servidor respondeu — se ok, retorna normal
                if (response.ok || response.status === 304) {
                    return response;
                }
                // Servidor retornou erro (5xx) — mostrar página de retry
                if (response.status >= 500) {
                    return gerarPaginaRetry();
                }
                // Outros status (3xx, 4xx) — retorna como está
                return response;
            }).catch(function() {
                // Rede falhou completamente (servidor down) — página de retry
                return gerarPaginaRetry();
            })
        );
        return;
    }

    // ❌ NETWORK ONLY: ES Modules - respondWith() quebra dynamic import() em mobile
    // Mobile browsers (Safari/iOS, Chrome Mobile) falham quando SW intercepta module requests
    if (url.pathname.includes('/js/modules/')) {
        return; // Deixa o navegador resolver imports diretamente
    }

    // ✅ NETWORK FIRST: Assets estáticos (CSS, JS, imagens, fontes)
    const isCacheableAsset = CACHE_FIRST_EXTENSIONS.some(ext => url.pathname.endsWith(ext));

    if (isCacheableAsset) {
        // ✅ FIX MOBILE: Normalizar URL removendo query params para cache consistente
        const cleanUrl = new URL(url.pathname, url.origin).href;
        const cleanRequest = new Request(cleanUrl, { mode: request.mode, credentials: request.credentials });

        event.respondWith(
            // Tenta da rede primeiro, fallback para cache se falhar
            fetch(request)
                .then((networkResponse) => {
                    // Sucesso na rede - cacheia com URL limpa (sem query params)
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(cleanRequest, responseClone);
                        });
                        return networkResponse;
                    }

                    // ✅ v4.3: Servidor retornou 5xx (ex: 503 pós-republish Replit)
                    // Antes de entregar o erro, tenta servir do cache (versão anterior ainda válida)
                    if (networkResponse.status >= 500) {
                        return caches.match(cleanRequest).then((cachedResponse) => {
                            if (cachedResponse) {
                                console.warn('[SW] Servidor 5xx, servindo do cache:', request.url);
                                return cachedResponse;
                            }
                            return networkResponse; // sem cache, entrega o erro
                        });
                    }

                    return networkResponse;
                })
                .catch((fetchError) => {
                    // Falha na rede - buscar do cache usando URL limpa
                    return caches.match(cleanRequest).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }

                        // Nem rede nem cache funcionaram
                        console.warn('[SW] Failed to fetch and no cache:', request.url);
                        throw new Error('Offline and no cache available');
                    });
                })
        );
        return;
    }

    // Demais recursos: deixa o navegador lidar
});

// ✅ Mensagem para forçar atualização
self.addEventListener("message", (event) => {
    if (!event.data) return;
    if (event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
        return;
    }
    if (event.data.type === "FORCE_UPDATE") {
        event.waitUntil(
            self.clients.matchAll({ type: "window", includeUncontrolled: true })
                .then((clientList) => {
                    clientList.forEach((client) => {
                        client.postMessage({ type: "FORCE_UPDATE" });
                    });
                })
        );
    }
});

// =====================================================================
// PUSH NOTIFICATIONS - v1.0 (FEAT-003)
// =====================================================================

// ✅ Receber Push Notification
self.addEventListener("push", (event) => {
    console.log("[SW] Push recebido:", event);

    // Payload padrão caso não tenha dados
    // Badge: usa default.png como fallback (TODO: criar badge-72x72.png monocromático)
    let payload = {
        title: "Super Cartola",
        body: "Você tem uma nova notificação",
        icon: "/img/newlogo-supercartola.png",
        badge: "/img/newlogo-supercartola.png",
        url: "/participante/",
        tag: "default",
    };

    // Parsear payload JSON se existir
    if (event.data) {
        try {
            const data = event.data.json();
            payload = {
                title: data.title || payload.title,
                body: data.body || payload.body,
                icon: data.icon || payload.icon,
                badge: data.badge || payload.badge,
                url: data.url || payload.url,
                tag: data.tag || payload.tag,
                data: data.data || {}, // dados extras
            };
        } catch (e) {
            // Se não for JSON, usa como texto simples
            payload.body = event.data.text() || payload.body;
        }
    }

    // Opções da notificação
    const options = {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        vibrate: [200, 100, 200], // Vibração: on-off-on (ms)
        requireInteraction: false, // Auto-dismiss após alguns segundos
        data: {
            url: payload.url,
            ...payload.data,
        },
        actions: [
            {
                action: "open",
                title: "Abrir",
            },
            {
                action: "close",
                title: "Fechar",
            },
        ],
    };

    const forceUpdate = payload?.data?.forceUpdate === true;

    // Se for push de atualização forçada, avisa clientes imediatamente
    if (forceUpdate) {
        event.waitUntil(
            self.clients.matchAll({ type: "window", includeUncontrolled: true })
                .then((clientList) => {
                    clientList.forEach((client) => {
                        client.postMessage({ type: "FORCE_UPDATE" });
                    });
                })
        );
        return;
    }

    // Exibir notificação normal
    event.waitUntil(self.registration.showNotification(payload.title, options));
});

// ✅ Clique na Notificação
self.addEventListener("notificationclick", (event) => {
    console.log("[SW] Notificação clicada:", event.action);

    // Fechar a notificação
    event.notification.close();

    // Se clicou em "close", apenas fecha
    if (event.action === "close") {
        return;
    }

    // URL para navegar (padrão ou customizada)
    const urlToOpen = event.notification.data?.url || "/participante/";

    // Abrir URL ao clicar
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // Procurar janela já aberta do app
                for (const client of clientList) {
                    const clientUrl = new URL(client.url);

                    // Se já tem uma janela do participante aberta, foca nela
                    if (clientUrl.pathname.startsWith("/participante") && "focus" in client) {
                        // Navegar para a URL específica
                        return client.navigate(urlToOpen).then(() => client.focus());
                    }
                }

                // Se não tem janela aberta, abre uma nova
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});

// ✅ Notificação fechada (swipe ou timeout)
self.addEventListener("notificationclose", (event) => {
    console.log("[SW] Notificação fechada:", event.notification.tag);
    // Pode ser usado para analytics no futuro
});
