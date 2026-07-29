/**
 * HM Finanças — service-worker.js
 * Service Worker para o Progressive Web App (PWA).
 * Implementa cache básico e a estratégia "Network First" (Tentar a rede, cair pro cache se offline).
 */

const CACHE_NAME = 'hm-financas-cache-v1';

// Arquivos principais que compõem o App Shell (interface estática básica).
// Não cacheamos as chamadas para o Firebase, pois queremos que os dados reais
// venham sempre online ou através do SDK do Firebase offline-persistence.
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/reset.css',
  '/styles/variables.css',
  '/styles/global.css',
  '/styles/layout.css',
  '/styles/components.css',
  '/styles/themes.css',
  '/scripts/app.js',
  '/scripts/router.js',
  '/scripts/pwa-register.js'
];

/**
 * Evento 'install'
 * Disparado quando o SW é baixado pelo navegador.
 * Realiza o pré-cache dos arquivos essenciais (App Shell).
 */
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Fazendo pré-cache do App Shell');
      return cache.addAll(APP_SHELL);
    })
  );
  // Força o SW atual a assumir o controle imediatamente
  self.skipWaiting();
});

/**
 * Evento 'activate'
 * Disparado quando o SW começa a controlar a página.
 * Útil para limpar caches de versões anteriores.
 */
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((chavesDosCaches) => {
      return Promise.all(
        chavesDosCaches.map((chave) => {
          if (chave !== CACHE_NAME) {
            console.log('[Service Worker] Removendo cache antigo:', chave);
            return caches.delete(chave);
          }
        })
      );
    })
  );
  // Assume o controle de todos os clientes abertos
  self.clients.claim();
});

/**
 * Evento 'fetch'
 * Disparado em todas as requisições de rede feitas pela aplicação.
 * Estratégia: Network First (Rede primeiro), com fallback para o Cache.
 */
self.addEventListener('fetch', (evento) => {
  // Ignora requisições que não sejam GET (ex: POST, PUT) ou que sejam para o Firebase/APIs externas
  if (evento.request.method !== 'GET' || !evento.request.url.startsWith(self.location.origin)) {
    return;
  }

  evento.respondWith(
    // 1. Tenta buscar na rede (para ter a versão mais atualizada sempre)
    fetch(evento.request)
      .then((respostaDaRede) => {
        // Se deu certo, clona a resposta e atualiza no cache silenciosamente
        const respostaClonada = respostaDaRede.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(evento.request, respostaClonada);
        });
        return respostaDaRede;
      })
      .catch(() => {
        // 2. Se a rede falhar (offline), busca no cache local
        console.warn('[Service Worker] Conexão falhou. Buscando no cache:', evento.request.url);
        return caches.match(evento.request);
      })
  );
});
