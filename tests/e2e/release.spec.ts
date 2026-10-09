import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

/**
 * Ronda 4 · preparación de la beta: versión visible (H1), manifiesto instalable con sus iconos
 * precacheados (H2) y cabeceras de Cloudflare Pages generadas al compilar (J2).
 */

const pngSize = (buf: Buffer) => ({ width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) })

test('H1 · Acerca de muestra la versión 1.0.0-beta.1 y el hash corto de la compilación', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes/acerca')
  await expect(page.getByText(/Clara 1\.0\.0-beta\.1 · prototipo local/)).toBeVisible()
  await expect(page.getByTestId('about-build')).toHaveText(/^Compilación: ([0-9a-f]{7}|dev)$/)
})

test('H2 · manifiesto «Clara» con id, categoría, atajos e iconos; icono de Apple y título', async ({ page, request }) => {
  await page.goto('/')
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    name: string
    short_name: string
    id: string
    categories: string[]
    shortcuts: { name: string; url: string; icons: { src: string; sizes: string; type: string }[] }[]
  }
  expect(manifest.name).toBe('Clara')
  expect(manifest.id).toBe('/')
  expect(manifest.categories).toEqual(['finance'])
  expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/#/movimientos/nuevo?kind=expense', '/#/movimientos/nuevo?kind=income', '/#/asistente'])
  for (const s of manifest.shortcuts) {
    expect(s.icons[0]!.sizes).toBe('96x96')
    const png = await request.get(s.icons[0]!.src)
    expect(png.ok()).toBe(true)
    expect(pngSize(await png.body())).toEqual({ width: 96, height: 96 })
  }
  const apple = page.locator('link[rel="apple-touch-icon"]')
  await expect(apple).toHaveAttribute('sizes', '180x180')
  const appleHref = (await apple.getAttribute('href'))!
  expect(pngSize(await (await request.get(appleHref)).body())).toEqual({ width: 180, height: 180 })
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', 'Clara')
  // Los iconos nuevos van en la precaché del service worker (V5); `_headers` no.
  const sw = await (await request.get('/sw.js')).text()
  for (const f of [appleHref, ...manifest.shortcuts.map((s) => s.icons[0]!.src)]) expect(sw).toContain(`"${f}"`)
  expect(sw).not.toContain('_headers')
})

test('J2 · dist/_headers lleva la misma CSP que la etiqueta <meta> servida, más frame-ancestors', async ({ page }) => {
  await page.goto('/')
  const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(meta).toContain("default-src 'self'")
  const headers = readFileSync(new URL('../../dist/_headers', import.meta.url), 'utf8')
  expect(headers.match(/^ {2}Content-Security-Policy: (.+)$/m)?.[1]).toBe(`${meta}; frame-ancestors 'none'`)
  expect(headers).toContain('  X-Robots-Tag: noindex')
})
