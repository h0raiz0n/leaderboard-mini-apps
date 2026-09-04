/* Service Worker для экосистемы «Атмосфера» (ТВ, Пульт ведущего, Лидерборд).
   Кэширует HTML, CSS, JS, шрифты и данные API для мгновенного старта (0ms cold start).
   Динамические шины Firebase Realtime Database и Telegram исключены из кэша (Network-Only). */

const CACHE = 'atmos-v17';
const API_PREFIX = 'https://script.google.com/macros/s/';
const API_TTL = 120000; // 2 минуты

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/tv',
  '/tv/index.html',
  '/tv/styles.css',
  '/tv/tv.js',
  '/dealer',
  '/dealer/index.html',
  '/dealer/styles.css',
  '/dealer/dealer.js',
  '/shared/poker-config.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE_URLS).catch(function () {});
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  // Исключаем динамические запросы Firebase Realtime Database и Telegram API (всегда Network-Only)
  if (url.indexOf('firebasedatabase.app') > -1 || url.indexOf('api.telegram.org') > -1 || url.indexOf('gstatic.com/firebasejs') > -1) {
    return;
  }

  // Запросы к Google Apps Script API
  if (url.indexOf(API_PREFIX) === 0) {
    if (url.indexOf('_t=') > -1) {
      e.respondWith(refreshApi(req, null));
      return;
    }
    e.respondWith(cachedApi(req));
    return;
  }

  // ТВ и Пульт дилера: Network-First для 100% актуальности интерфейса при любых обновлениях
  if (url.indexOf('/tv') > -1 || url.indexOf('/dealer') > -1 || url.indexOf('/shared/') > -1) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Статические ассеты (HTML, CSS, JS, шрифты): Stale-While-Revalidate для 0ms отдачи
  if (url.indexOf(self.location.origin) === 0 || url.indexOf('fonts.googleapis.com') > -1 || url.indexOf('fonts.gstatic.com') > -1) {
    e.respondWith(staleWhileRevalidate(req));
  }
});

// Стратегия Network-First для ТВ и дилерских пультов
async function networkFirst(req) {
  try {
    var res = await fetch(req);
    if (res && res.ok) {
      var cache = await caches.open(CACHE);
      cache.put(req, res.clone());
      return res;
    }
    return res;
  } catch (err) {
    var cache = await caches.open(CACHE);
    var hit = await cache.match(req);
    return hit || new Response('Offline', { status: 503 });
  }
}

// Стратегия Stale-While-Revalidate: мгновенный возврат из кэша с фоновым обновлением
async function staleWhileRevalidate(req) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(req);

  var fetchPromise = fetch(req).then(function (res) {
    if (res && res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  }).catch(function () {
    return hit || new Response('', { status: 502 });
  });

  return hit || fetchPromise;
}

async function cachedApi(req) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(req);
  var now = Date.now();
  if (hit) {
    var ts = Number(hit.headers.get('x-fetched-at') || 0);
    if (now - ts < API_TTL) return hit;
    refreshApi(req, cache);
    return hit;
  }
  return refreshApi(req, cache);
}

async function refreshApi(req, cache) {
  try {
    var res = await fetch(req);
    if (res && res.ok && cache) {
      var copy = res.clone();
      var headers = new Headers(copy.headers);
      headers.set('x-fetched-at', String(Date.now()));
      cache.put(req, new Response(copy.body, {
        status: copy.status,
        statusText: copy.statusText,
        headers: headers
      }));
    }
    return res;
  } catch (err) {
    var hit = cache ? await cache.match(req) : null;
    return hit || new Response(JSON.stringify({ success: false, error: 'offline' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
