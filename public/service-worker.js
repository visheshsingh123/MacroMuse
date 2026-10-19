// Originally developed by Vishesh Singh — June 2026
const CACHE_NAME = 'nutriglance-v24';
const PRECACHE = [
  '/',
  '/landing-session.js',
  '/dashboard',
  '/meals',
  '/progress',
  '/aichef',
  '/settings',
  '/login',
  '/reminders.js',
  '/security.js',
  '/nutrition-goals.js',
  '/weekly-insights.js',
  '/onboarding.js',
  '/onboarding.css',
  '/security.css',
  '/app-interactions.css',
  '/app-interactions.js',
  '/meal-actions.js',
  '/dashboard-guidance.js',
  '/chef-recipes.js',
  '/profile-avatar.js',
  '/profile-avatar.css',
  '/avatar-options.js',
  '/saved-recipes.js',
  '/design-system.css',
  '/accessibility.js',
  '/chef-recipes.css',
  '/app.css',
  '/feedback',
  '/blogs',
  '/blogs/build-a-balanced-plate',
  '/blogs/make-meal-tracking-stick',
  '/blogs.css',
  '/blogs.js',
  '/feedback.js',
  '/feedback.css',
  '/dialogs.js',
  '/dialogs.css',
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
  const url = new URL(event.request.url);
  // Never cache API responses, authenticated requests, or Firebase traffic.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || event.request.headers.has('Authorization')) return;
  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && !/no-store|private/i.test(res.headers.get('Cache-Control') || '')) {
          const clone = res.clone();
          event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone)).catch(() => {}));
        }
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
