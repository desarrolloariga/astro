// Service worker mínimo: solo habilita la instalación como PWA
// (escritorio y móvil). No cachea agresivamente porque la app es
// mayormente dinámica y depende de sesión/RLS por request.
const CACHE = 'ariga-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    fetch(event.request)
      .then((respuesta) => {
        const copia = respuesta.clone()
        caches.open(CACHE).then((cache) => cache.put(event.request, copia)).catch(() => {})
        return respuesta
      })
      .catch(() => caches.match(event.request)),
  )
})
