// service-worker.js
const CACHE_NAME = 'megane-chat-v1';
const STATIC_CACHE = 'megane-static-v1';
const DYNAMIC_CACHE = 'megane-dynamic-v1';

// Fichiers à mettre en cache lors de l'installation
const STATIC_ASSETS = [
  '/Megane_chat/',
  '/Megane_chat/index.html',
  '/Megane_chat/auth.html',
  '/Megane_chat/recherche.html',
  '/Megane_chat/chat.html',
  '/Megane_chat/blog.html',
  '/Megane_chat/para.html',
  '/Megane_chat/profil.html',
  '/Megane_chat/signal.html',
  '/Megane_chat/aide.html',
  '/Megane_chat/contact.html',
  '/Megane_chat/propos.html',
  '/Megane_chat/manifest.json',
  '/Megane_chat/css/nav-bar.css',
  '/Megane_chat/css/index.css',
  '/Megane_chat/css/auth.css',
  '/Megane_chat/css/recherche.css',
  '/Megane_chat/css/chat.css',
  '/Megane_chat/css/blog.css',
  '/Megane_chat/css/para.css',
  '/Megane_chat/css/profil.css',
  '/Megane_chat/css/signal.css',
  '/Megane_chat/js/auth.js',
  '/Megane_chat/js/index.js',
  '/Megane_chat/js/recherche.js',
  '/Megane_chat/js/chat.js',
  '/Megane_chat/js/blog.js',
  '/Megane_chat/js/para.js',
  '/Megane_chat/js/profil.js',
  '/Megane_chat/js/signal.js',
  '/Megane_chat/js/utils.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Installation du Service Worker
self.addEventListener('install', (event) => {
  console.log('[SW] Installation');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Mise en cache des assets statiques');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activation et nettoyage des anciens caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('[SW] Suppression de l\'ancien cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Stratégie de cache : Network First pour les API, Cache First pour les assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Ne pas intercepter les requêtes Supabase (toujours réseau)
  if (url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Pour les fichiers statiques (CSS, JS, HTML)
  if (STATIC_ASSETS.includes(event.request.url) || 
      event.request.destination === 'style' ||
      event.request.destination === 'script' ||
      event.request.destination === 'document') {
    
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          // Mise à jour en arrière-plan
          fetch(event.request).then((networkResponse) => {
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          });
          return cachedResponse;
        }
        return fetch(event.request).then((networkResponse) => {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }
  
  // Pour les requêtes API (nos endpoints)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch((error) => {
        console.error('[SW] Erreur réseau API:', error);
        return new Response(
          JSON.stringify({ error: 'Pas de connexion internet' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }
  
  // Pour les autres requêtes (images, etc.) : Cache First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      });
    })
  );
});

// Gestion des notifications push (à implémenter plus tard)
self.addEventListener('push', (event) => {
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/launchericon-192-192.png',
    badge: '/launchericon-192-192.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/index.html'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mégane Chat', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/index.html';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Gestion des messages du client
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
