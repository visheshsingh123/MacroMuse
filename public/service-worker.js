// Originally developed by Vishesh Singh — June 2026
const CACHE_NAME = 'nutriglance-v3';
const PRECACHE = [
  '/',
  '/dashboard',
  '/meals',
  '/progress',
  '/aichef',
  '/settings',
  '/login',
  '/reminders.js',
];

// Install: pre-cache core pages
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first, fall back to cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || typeof payload.body !== 'string') return;
    await self.registration.showNotification('A little check-in from NutriGlance', {
      body: payload.body.slice(0, 300), tag: String(payload.tag || 'nutriglance-reminder').slice(0, 100),
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: '/dashboard' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (!event.notification.tag.startsWith('nutriglance-reminder-')) return;
  event.waitUntil((async () => {
    const url = new URL('/dashboard', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const dashboard = windows.find(client => new URL(client.url).pathname === '/dashboard');
    if (dashboard) return dashboard.focus();
    return self.clients.openWindow(url);
  })());
});
