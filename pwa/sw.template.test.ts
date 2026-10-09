import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const ORIGIN = 'https://clara.example'

/** Caché falsa que, como la de verdad, respeta `Vary` salvo con `ignoreVary`. */
function fakeCaches() {
  const entries: { request: Request; response: Response }[] = []
  const cache = {
    async put(request: Request, response: Response) {
      entries.push({ request, response })
    },
    async match(key: Request | string, opts?: { ignoreVary?: boolean }) {
      const query = typeof key === 'string' ? new Request(new URL(key, ORIGIN)) : key
      for (const e of entries) {
        if (e.request.url !== query.url) continue
        const vary = (e.response.headers.get('vary') ?? '').split(',').map((h) => h.trim()).filter(Boolean)
        if (!opts?.ignoreVary && vary.some((h) => e.request.headers.get(h) !== query.headers.get(h))) continue
        return e.response.clone()
      }
      return undefined
    },
  }
  return { cache, caches: { open: async () => cache, keys: async () => [], delete: async () => true } }
}

/** Carga el sw.js real (plantilla) y devuelve su manejador de `fetch`. */
function loadServiceWorker(caches: unknown) {
  const listeners: Record<string, (event: unknown) => void> = {}
  const source = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf8').replace('__VERSION__', 'test').replace('__PRECACHE__', '[]')
  runInNewContext(source, {
    self: { addEventListener: (type: string, fn: (event: unknown) => void) => (listeners[type] = fn), location: { origin: ORIGIN } },
    caches,
    fetch: () => Promise.reject(new TypeError('Failed to fetch (sin conexión)')),
    URL,
  })
  return (request: Request) =>
    new Promise<Response>((resolve, reject) => {
      listeners.fetch!({ request, respondWith: (p: Promise<Response>) => p.then(resolve, reject) })
    })
}

describe('service worker sin conexión', () => {
  it('sirve un archivo precacheado aunque la petición traiga otra cabecera de `Vary` (p. ej. Origin en un import() de Chromium 153)', async () => {
    const { cache, caches } = fakeCaches()
    // Precargado sin `Origin`; el servidor respondió con `Vary: Origin` (vite preview lo hace).
    await cache.put(new Request(`${ORIGIN}/assets/Settings-abc.js`), new Response('export {}', { headers: { vary: 'Origin', 'content-type': 'text/javascript' } }))
    const handle = loadServiceWorker(caches)
    const moduleRequest = new Request(`${ORIGIN}/assets/Settings-abc.js`, { headers: { Origin: ORIGIN } })
    const response = await handle(moduleRequest)
    expect(await response.text()).toBe('export {}')
  })

  it('una navegación sin conexión abre la página principal precacheada', async () => {
    const { cache, caches } = fakeCaches()
    await cache.put(new Request(`${ORIGIN}/`), new Response('<html>Clara</html>', { headers: { vary: 'Origin' } }))
    const handle = loadServiceWorker(caches)
    const navigation = { method: 'GET', mode: 'navigate', url: `${ORIGIN}/#/ajustes/almacenamiento`, headers: new Headers() } as unknown as Request
    expect(await (await handle(navigation)).text()).toBe('<html>Clara</html>')
  })
})
