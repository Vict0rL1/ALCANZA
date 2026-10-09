/**
 * J4 · Actualización real en el mismo origen: el service worker de la compilación A queda
 * instalado; después el mismo servidor sirve la compilación B (otra versión de la app, compilada
 * de verdad con otros archivos). Se ofrece «Actualizar» sin interrumpir un formulario abierto,
 * tras actualizar las cifras son las mismas y la recarga sin conexión funciona con B.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { waitForPrecache } from './helpers'

const VERSION_B = '1.0.0-beta.2'
const BUILD_B = 'b0b0b0b'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}

let server: Server
let base = ''
let buildB = ''
let serving: 'A' | 'B' = 'A'

test.beforeAll(async () => {
  test.setTimeout(240_000)
  // Compilación B: la misma app con otra versión (y otro hash) → otros archivos y otro sw.js.
  buildB = mkdtempSync(join(tmpdir(), 'clara-build-b-'))
  execFileSync(process.execPath, [join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', buildB, '--emptyOutDir', '--logLevel', 'warn'], {
    env: { ...process.env, CLARA_APP_VERSION: VERSION_B, CLARA_BUILD_SHA: BUILD_B },
    stdio: 'pipe',
  })
  const roots = { A: join(process.cwd(), 'dist'), B: buildB }
  server = createServer(async (req, res) => {
    const root = roots[serving]
    const path = new URL(req.url ?? '/', 'http://x').pathname
    const file = normalize(join(root, path === '/' ? 'index.html' : path))
    if (!file.startsWith(root)) return void res.writeHead(403).end()
    try {
      const body = await readFile(file)
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
  await new Promise((resolve) => server?.close(resolve))
  if (buildB) rmSync(buildB, { recursive: true, force: true })
})

async function controlled(page: Page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active)
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.reload()
    if (await page.evaluate(() => !!navigator.serviceWorker.controller)) return
    await page.waitForTimeout(500 * (attempt + 1))
  }
  throw new Error('La página no quedó controlada por el service worker tras varias recargas')
}

const goHash = (page: Page, hash: string) => page.evaluate((h) => (window.location.hash = h), hash)
const aboutText = async (page: Page) => {
  await goHash(page, '/ajustes/acerca')
  return (await page.getByTestId('about-build').locator('xpath=..').textContent()) ?? ''
}

test('J4 · compilación B en el mismo origen: «Actualizar» espera al formulario, mismas cifras y sin conexión con B', async ({ page, context }) => {
  serving = 'A'
  await page.goto(base)
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  const available = page.getByTestId('available')
  await expect(available).toBeVisible()
  const before = await available.textContent()
  await controlled(page)
  await waitForPrecache(page)
  expect(await aboutText(page)).toContain('1.0.0-beta.1')
  await expect(page.getByTestId('about-build')).not.toContainText(BUILD_B)

  // Formulario a medias y se publica B; el navegador la descubre.
  await goHash(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('12.34')
  serving = 'B'
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())
  const banner = page.getByTestId('update-banner')
  await expect(banner).toContainText('termina o cancela este formulario', { timeout: 20_000 })
  await expect(banner.getByRole('button')).toHaveCount(0)
  await expect(page.getByLabel('Importe', { exact: true })).toHaveValue('12.34')

  // Fuera del formulario se ofrece; actualizar recarga con B y las cifras son las mismas.
  await goHash(page, '/')
  await banner.getByRole('button', { name: 'Actualizar ahora' }).click()
  await expect(available).toHaveText(before!)
  await expect(banner).toHaveCount(0)
  await expect.poll(() => aboutText(page)).toContain(VERSION_B)
  await expect(page.getByTestId('about-build')).toContainText(BUILD_B)
  expect(await page.evaluate(() => caches.keys())).toHaveLength(1)

  // Sin conexión, la recarga abre B con los mismos datos.
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('about-build')).toContainText(BUILD_B, { timeout: 15_000 })
  await goHash(page, '/')
  await expect(available).toHaveText(before!)
  await context.setOffline(false)
})
