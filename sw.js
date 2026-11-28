// Service worker : ÉlectroLab fonctionne entièrement hors connexion.
// Stratégie « copie locale d'abord » : l'application s'ouvre instantanément depuis le cache,
// même sans réseau, et se met à jour en arrière-plan quand internet est disponible.
const CACHE = 'electrolab-v3';
const FILES = ['./', 'index.html', 'legal.html', 'css/app.css', 'js/app.js', 'js/components.js', 'js/engine.js', 'js/solver.js',
  'js/library.js', 'js/checker.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' évite de remplir le cache avec une version périmée du cache HTTP
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    // Mise à jour silencieuse en arrière-plan (ignorée si pas de réseau)
    const update = fetch(req).then((r) => {
      if (r && r.ok) cache.put(req, r.clone());
      return r;
    }).catch(() => null);
    if (cached) { e.waitUntil(update); return cached; }
    const fresh = await update;
    if (fresh) return fresh;
    // Hors connexion et fichier jamais vu : on renvoie l'application
    if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
    return Response.error();
  })());
});
