// Service worker do Oasis Mind: funciona offline e recebe notificações push.
const CACHE = 'oasis-v2';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/i18n.js', '/data.js', '/config.js',
  '/manifest.webmanifest', '/assets/logo.png', '/assets/symbol.png', '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Rede primeiro, cache quando estiver offline
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Oasis', {
    body: d.body || 'Time for your check-in.',
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    data: { url: d.url || '/#hoje' },
    tag: 'oasis-reminder'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
