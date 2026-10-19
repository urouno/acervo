/*  Acervo · service worker
    Guarda la app para abrirla sin conexión y conserva las portadas ya vistas.
    Nunca toca las llamadas al Apps Script: esas son POST y pasan de largo.  */

const VERSION = 'acervo-1.1';
const CONCHA  = VERSION + '-app';
const FOTOS   = VERSION + '-img';
const TOPE_FOTOS = 160;

const BASE = new URL('./', self.location).pathname;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CONCHA)
      .then(c => c.addAll([BASE, BASE + 'index.html']))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.indexOf(VERSION) !== 0).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                     // guardar/editar siempre va a la red
  const url = new URL(req.url);
  if (/script\.google\.com$/.test(url.hostname)) return; // el backend nunca se cachea

  if (req.mode === 'navigate')        { e.respondWith(redPrimero(req)); return; }
  if (url.origin === location.origin) { e.respondWith(cachePrimero(req)); return; }
  if (req.destination === 'image')    { e.respondWith(foto(req)); return; }
});

/** La app: red si la hay (para recibir actualizaciones), caché si no. */
function redPrimero(req) {
  return new Promise(resolve => {
    let resuelto = false;
    const alCache = () => {
      if (resuelto) return;
      resuelto = true;
      caches.match(BASE + 'index.html')
        .then(r => r || caches.match(BASE))
        .then(r => resolve(r || respuestaSinRed()))
        .catch(() => resolve(respuestaSinRed()));
    };
    const reloj = setTimeout(alCache, 3500);            // red lenta = caché

    fetch(req).then(res => {
      clearTimeout(reloj);
      if (resuelto) return;
      resuelto = true;
      caches.open(CONCHA).then(c => c.put(BASE + 'index.html', res.clone())).catch(() => {});
      resolve(res);
    }).catch(() => { clearTimeout(reloj); alCache(); });
  });
}

/** Archivos propios: caché primero, y se refresca por detrás. */
function cachePrimero(req) {
  return caches.match(req).then(hit => {
    const red = fetch(req).then(res => {
      if (res && res.ok) caches.open(CONCHA).then(c => c.put(req, res.clone())).catch(() => {});
      return res;
    }).catch(() => hit);
    return hit || red;
  });
}

/** Portadas: una vez vistas, quedan disponibles sin conexión. */
function foto(req) {
  return caches.open(FOTOS).then(c =>
    c.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { c.put(req, res.clone()); podar(c); }
        return res;
      }).catch(() => hit || Response.error());
    })
  );
}

function podar(c) {
  c.keys().then(ks => {
    if (ks.length <= TOPE_FOTOS) return;
    ks.slice(0, ks.length - TOPE_FOTOS).forEach(k => c.delete(k));
  });
}

function respuestaSinRed() {
  return new Response(
    '<!doctype html><meta charset="utf-8"><title>Acervo</title>' +
    '<body style="margin:0;background:#16110E;color:#EFE3D4;font:16px -apple-system,sans-serif;' +
    'display:grid;place-items:center;height:100vh;text-align:center;padding:24px">' +
    '<div><p style="font-size:19px">Acervo todavía no está guardado en este dispositivo.</p>' +
    '<p style="color:#A08E7D">Ábrelo una vez con conexión y después funcionará sin ella.</p></div>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}
