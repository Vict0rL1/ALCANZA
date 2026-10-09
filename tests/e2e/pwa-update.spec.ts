/**
 * Actualización real entre dos versiones de la app (service worker), con dos pestañas.
 * Un servidor local propio sirve la compilación de `dist/`; la «versión B» es la misma app
 * con otro `sw.js` (otra versión de caché), que es lo que el navegador compara.
 */
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

let server: Server
let base = ''
let version: 'A' | 'B' = 'A'

test.beforeAll(async () => {
  const root = join(process.cwd(), 'dist')
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const file = normalize(join(root, path === '/' ? 'index.html' : path))
    if (!file.startsWith(root)) return void res.writeHead(403).end()
    try {
      let body: Buffer | string = await readFile(file)
      if (path === '/sw.js' && version === 'B') body = body.toString().replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-b'")
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' })
      res.end(body)
    } catch {
      res.writeHead(404).end()
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  base = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`
})

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

async function controlled(page: Page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active)
  // Tras activarse, la página puede tardar una recarga más en quedar controlada (B7).
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.reload()
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) return
    await page.waitForTimeout(500 * (attempt + 1))
  }
  throw new Error('La página no quedó controlada por el service worker tras varias recargas')
}
const mark = (page: Page) => page.evaluate(() => ((window as unknown as { __mark: number }).__mark = 1))
const marked = (page: Page) => page.evaluate(() => (window as unknown as { __mark?: number }).__mark === 1)

test('versión nueva: se ofrece sin forzar, no interrumpe un formulario de otra pestaña y conserva los datos', async ({ context }) => {
  version = 'A'
  const home = await context.newPage()
  await home.goto(base)
  await home.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(home.getByTestId('available')).toBeVisible()
  const amountBefore = await home.getByTestId('available').textContent()
  await controlled(home)

  // Segunda pestaña con un formulario a medias.
  const form = await context.newPage()
  await form.goto(`${base}/#/movimientos/nuevo`)
  await form.waitForFunction(() => !!navigator.serviceWorker.controller)
  await form.getByLabel('Importe', { exact: true }).fill('12.34')
  await mark(home)
  await mark(form)

  // Se publica la versión B y el navegador la descubre.
  version = 'B'
  await home.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())

  // Inicio ofrece actualizar; la pestaña del formulario solo avisa (sin botón).
  const homeBanner = home.getByTestId('update-banner')
  await expect(homeBanner).toContainText('Hay una versión nueva de Clara')
  const formBanner = form.getByTestId('update-banner')
  await expect(formBanner).toContainText('termina o cancela este formulario')
  await expect(formBanner.getByRole('button')).toHaveCount(0)
  // Nada se recargó solo.
  expect(await marked(home)).toBe(true)
  expect(await marked(form)).toBe(true)

  // Actualizar recarga SOLO la pestaña que lo pidió.
  await homeBanner.getByRole('button', { name: 'Actualizar ahora' }).click()
  await home.waitForFunction(() => (window as unknown as { __mark?: number }).__mark !== 1)
  await expect(home.getByTestId('available')).toHaveText(amountBefore!)
  await expect(home.getByTestId('update-banner')).toHaveCount(0)
  // La caché anterior se borró y quedó solo la nueva (sin datos financieros dentro).
  const keys = await home.evaluate(() => caches.keys())
  expect(keys).toHaveLength(1)
  expect(keys[0]).toMatch(/-b$/)

  // La otra pestaña sigue con su formulario intacto y un aviso para recargar después.
  expect(await marked(form)).toBe(true)
  await expect(formBanner).toContainText('Se activó una versión nueva de Clara en otra pestaña')
  await expect(form.getByLabel('Importe', { exact: true })).toHaveValue('12.34')
  await form.getByRole('button', { name: 'Guardar', exact: true }).click()
  // Fuera del formulario ya se puede recargar; lo guardado sigue ahí.
  await expect(formBanner.getByRole('button', { name: 'Recargar' })).toBeVisible()
  await formBanner.getByRole('button', { name: 'Recargar' }).click()
  await form.waitForFunction(() => (window as unknown as { __mark?: number }).__mark !== 1)
  await form.evaluate(() => (window.location.hash = '/movimientos'))
  await expect(form.locator('a.item', { hasText: '$12.34' }).first()).toBeVisible()
})

test('versión nueva descubierta al recargar (sin pedir nada): se ofrece igual', async ({ context }) => {
  version = 'A'
  const page = await context.newPage()
  await page.goto(base)
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
  await controlled(page)
  version = 'B'
  // Al navegar, el navegador compara sw.js y empieza a instalar la versión B en segundo plano.
  await page.reload()
  await expect(page.getByTestId('update-banner')).toContainText('Hay una versión nueva de Clara', { timeout: 15_000 })
  await expect(page.getByTestId('update-banner').getByRole('button', { name: 'Actualizar ahora' })).toBeVisible()
})
