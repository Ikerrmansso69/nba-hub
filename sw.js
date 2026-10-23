// Service worker: guarda la web para que abra al instante y funcione sin conexión.
// Los datos en directo (ESPN y la copia de respaldo) no se guardan aquí: siempre van a la red.
const VERSION = "nbahub-v5";
const SHELL = [
  "./", "index.html", "css/styles.css",
  "js/data.js", "js/api.js", "js/app.js", "js/news.js", "js/game.js", "js/players.js", "js/videos.js", "js/porra.js", "js/tonight.js", "js/team.js", "js/search.js", "js/guess.js", "js/multi.js", "js/season.js", "js/share.js",
  "manifest.webmanifest", "img/icon-192.png", "img/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Archivos de la propia web: red primero (para recibir cambios) y caché si no hay conexión
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("index.html")))
    );
    return;
  }

});
