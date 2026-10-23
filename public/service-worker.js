// Public app files only. Account data remains in owner-scoped app storage.
const CACHE_NAME = 'nutriglance-v62';
const LIBRARY_CACHE = 'nutriglance-public-libraries-v1';
const PAGES = [
  "/",
  "/dashboard",
  "/meals",
  "/progress",
  "/aichef",
  "/settings",
  "/login",
  "/about",
  "/privacy",
  "/premium",
  "/download",
  "/qr",
  "/feedback",
  "/blogs",
  "/offline",
  "/blogs/add-protein-to-everyday-meals",
  "/blogs/build-a-balanced-plate",
  "/blogs/make-meal-tracking-stick",
  "/blogs/read-food-labels-with-confidence"
];
const PRECACHE = [...PAGES,
  '/accessibility.js',
  '/account-plan.js',
  '/app-interactions.css',
  '/app-interactions.js',
  '/app.css',
  '/avatar-options.js',
  '/blogs.css',
  '/blogs.js',
  '/chef-recipes.css',
  '/chef-recipes.js',
  '/dashboard-guidance.js',
  '/dashboard.css',
  '/design-system.css',
  '/dialogs.css',
  '/dialogs.js',
  '/download.css',
  '/feedback.css',
  '/feedback.js',
  '/free-usage.css',
  '/free-usage.js',
  '/hero-nutrition-small.webp',
  '/hero-nutrition.webp',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/landing-navigation.js',
  '/landing-session.js',
  '/landing.css',
  '/landing.js',
  '/login-events.js',
  '/login.css',
  '/manifest.json',
  '/meal-actions.js',
  '/meal-photo.js',
  '/meals.css',
  '/nutrition-goals.js',
  '/onboarding.css',
  '/onboarding.js',
  '/premium.css',
  '/premium.js',
  '/pro-activation.js',
  '/pro-cancellation.js',
  '/profile-avatar.css',
  '/profile-avatar.js',
  '/progress-export.js',
  '/progress-layout.css',
  '/progress-print.css',
  '/reminders.js',
  '/saved-recipes.js',
  '/security.css',
  '/security.js',
  '/site-shell.css',
  '/site-shell.js',
  '/weekly-insights.js',
  '/workspace-pages.css',
];
const PUBLIC_LIBRARIES = new Set([
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
]);
const assets = new Set(PRECACHE);
function pagePath(path) {
  const clean = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return ({ '/index': '/', '/nutriglance': '/dashboard', '/privacy-policy': '/privacy', '/blog': '/blogs' })[clean] || clean;
}
function cacheKey(url) {
  const path = pagePath(url.pathname);
  return url.origin === self.location.origin && (PAGES.includes(path) || assets.has(url.pathname)) ? self.location.origin + (PAGES.includes(path) ? path : url.pathname) : url.href;
}
async function remember(cacheName, key, response) {
  if (response.ok && response.type !== 'opaque' && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
    try { await (await caches.open(cacheName)).put(key, response.clone()); } catch {} // Storage pressure must not break navigation.
  }
  return response;
}
async function download(cacheName, url) {
  const response = await fetch(url, { credentials: 'omit', cache: 'reload', signal: globalThis.AbortSignal?.timeout?.(15000) });
  return remember(cacheName, cacheKey(new URL(url, self.location.origin)), response);
}
self.addEventListener('install', event => {
  // One unavailable optional page or CDN must not discard all the working files.
  event.waitUntil((async () => {
    await download(CACHE_NAME, '/offline');
    await Promise.allSettled(PRECACHE.filter(path => path !== '/offline').map(path => download(CACHE_NAME, path)));
    await Promise.allSettled([...PUBLIC_LIBRARIES].map(url => download(LIBRARY_CACHE, url)));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('nutriglance-') && ![CACHE_NAME, LIBRARY_CACHE].includes(key)).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || request.headers.has('Authorization') || request.cache === 'no-store') return;
  // Only these exact, public code files may be cached cross-origin. No Firebase
  // authentication, database, API, or other cross-origin traffic is intercepted.
  const library = PUBLIC_LIBRARIES.has(url.href);
  if (url.origin !== self.location.origin && !library || url.pathname.startsWith('/api/')) return;
  const navigation = request.mode === 'navigate';
  const key = cacheKey(url), cacheName = library ? LIBRARY_CACHE : CACHE_NAME;
  if (!library && !navigation && !assets.has(url.pathname) && !PAGES.includes(pagePath(url.pathname))) return;
  const network = () => fetch(request).then(response => remember(cacheName, key, response));
  event.respondWith((async () => {
    const cache = await caches.open(cacheName), cached = await cache.match(key);
    // Versioned app assets and pinned public libraries work immediately offline.
    if (!navigation && cached) return cached;
    try { const response = await network();return cached && response.status >= 500 ? cached : response; }
    catch {
      if (cached) return cached;
      if (navigation) {
        const offline = await cache.match(self.location.origin + '/offline');
        if (offline) return offline;
      }
      return new Response('This file is not available offline yet.', { status: 503, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
    }
  })());
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!payload || typeof payload.body !== 'string') return;
    await self.registration.showNotification('A little check-in from MacroMuse', {
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
