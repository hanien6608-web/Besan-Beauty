// Service Worker — Besan Beauty (واجهة العميل)
const CACHE_NAME = 'besan-client-shell-v34';
const APP_START = './index.html';
const SHELL_FILES = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './i18n-en.js',
  './config.js',
  './pwa.js',
  './customer-push.js',
  './manifest.json',
  './logo-192.png',
  './logo-512.png',
  './logo.svg',
  './order.mp3',
  './chat.mp3'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('besan-client-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Network-first للملفات المحلية حتى تظهر التحديثات، مع نسخة مخزنة عند انقطاع الإنترنت.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' }).then((response) => {
      if (response && response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') return caches.match(APP_START);
      return Response.error();
    })
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Besan Beauty', body: 'لديكِ تحديث جديد ✨', url: APP_START };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(self.registration.showNotification(data.title || 'Besan Beauty', {
    body: data.body || 'لديكِ تحديث جديد ✨',
    icon: './logo-192.png',
    badge: './badge-96.png',
    // customer replies: one notification per push (a shared tag makes a burst replace itself and re-alert only once)
    tag: data.type === 'customer-reply' ? ('besan-customer-reply-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)) : (data.tag || ('besan-client-' + Date.now())),
    renotify: true,
    data: { url: data.url || APP_START, type: data.type || '' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // resolve against the SW scope (the /Besan-Beauty/ folder), not the bare origin, or the link 404s on GitHub Pages
  const scope = self.registration.scope;
  const data = event.notification.data || {};
  let rawUrl = data.url || APP_START;
  if (data.type === 'customer-reply') rawUrl = './index.html?openSupport=true';
  let target;
  try {
    target = new URL(rawUrl, scope);
    if (!target.href.startsWith(scope)) target = new URL(APP_START, scope);
  } catch (_) {
    target = new URL(APP_START, scope);
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(scope) && 'focus' in client) {
          return client.focus().then(() => client.navigate(target.href));
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target.href) : undefined;
    })
  );
});

