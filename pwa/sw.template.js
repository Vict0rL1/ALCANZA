/*
 * Service worker de Margen (generado en cada `npm run build`).
 * - Guarda en caché la app completa de ESTA versión para usarla sin conexión.
 * - Sirve siempre desde la caché de su versión (coherencia entre HTML y archivos).
 * - Una versión nueva se instala en segundo plano y la app muestra «Actualizar».
 * - Nunca guarda datos financieros: esos viven en localStorage.
 */
const VERSION = '__VERSION__'
const CACHE = `margen-${VERSION}`
const PRECACHE = __PRECACHE__

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k.startsWith('margen-') && k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // La app usa rutas con # (hash), así que toda navegación es la página principal.
  const key = request.mode === 'navigate' ? '/' : request
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(key)
      if (hit) return hit
      const response = await fetch(request)
      if (response.ok && request.mode !== 'navigate') cache.put(request, response.clone())
      return response
    }),
  )
})
