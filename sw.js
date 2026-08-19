/* Service Worker для мини-приложения «Атмосфера».
   Кэширует HTML, шрифт и данные API — повторные открытия мгновенны.
   При обновлении index.html — меняйте версию CACHE. */
const CACHE = 'atmos-v6';
const API_PREFIX = 'https://script.google.com/macros/s/';
const API_TTL = 120000; // 2 минуты

self.addEventListener('install', function () {
  self.skipWaiting();
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
  if (url.indexOf(API_PREFIX) === 0) {
    e.respondWith(cachedApi(req));
    return;
  }
  if (url.indexOf(self.location.origin) === 0) {
    e.respondWith(cachedStatic(req));
  }
});

async function cachedStatic(req) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(req);
  if (hit) return hit;
  try {
    var res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return hit || new Response('', { status: 502 });
  }
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
    if (res && res.ok) {
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
    var hit = await cache.match(req);
    return hit || new Response(JSON.stringify({ success: false, error: 'offline' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
