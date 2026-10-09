import { expect, test, type Page } from '@playwright/test'
import { go, startDemo, storedData } from './helpers'

/**
 * K1 · «Exportar copia» abre la hoja de compartir del sistema cuando el navegador puede compartir
 * archivos (en el iPhone: «Guardar en Archivos»); si no, descarga. `navigator.share` se simula de
 * tres formas: termina bien, la persona cierra la hoja (AbortError) y no existe.
 */
type ShareMode = 'resolve' | 'abort' | 'unsupported'

async function stubShare(page: Page, mode: ShareMode) {
  await page.addInitScript((m) => {
    const w = window as unknown as { __shared?: string[] }
    if (m === 'unsupported') {
      Object.defineProperty(Navigator.prototype, 'share', { value: undefined, configurable: true })
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true })
      return
    }
    Object.defineProperty(Navigator.prototype, 'canShare', { value: (d: ShareData) => !!d.files?.length, configurable: true })
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: async (d: ShareData) => {
        if (m === 'abort') throw new DOMException('Share canceled', 'AbortError')
        w.__shared = (d.files ?? []).map((f) => `${f.name}:${f.type}:${f.size}`)
      },
    })
  }, mode)
}

const lastExportAt = async (page: Page) => (JSON.parse((await storedData(page)) ?? '{}') as { backup?: { lastExportAt?: string } }).backup?.lastExportAt

test('compartir termina bien: archivo de copia en la hoja, «exportada» registrada y sin descarga', async ({ page }) => {
  await stubShare(page, 'resolve')
  await startDemo(page)
  await go(page, '/ajustes/copia')
  const before = await lastExportAt(page)
  let downloaded = false
  page.on('download', () => (downloaded = true))
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await expect(page.getByText('Copia enviada con «Compartir»')).toBeVisible()
  const shared = await page.evaluate(() => (window as unknown as { __shared?: string[] }).__shared)
  expect(shared).toHaveLength(1)
  expect(shared![0]).toMatch(/^clara-demo-copia-.*\.json:application\/json:\d+$/)
  await expect.poll(() => lastExportAt(page)).not.toBe(before)
  expect(downloaded).toBe(false)
})

test('cerrar la hoja (AbortError): no se registra, no descarga y no hay aviso de error', async ({ page }) => {
  await stubShare(page, 'abort')
  await startDemo(page)
  await go(page, '/ajustes/copia')
  const before = await lastExportAt(page)
  let downloaded = false
  page.on('download', () => (downloaded = true))
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  await page.waitForTimeout(500)
  await expect(page.locator('.toast')).toHaveCount(0)
  expect(await lastExportAt(page)).toBe(before)
  expect(downloaded).toBe(false)
})

test('sin hoja de compartir: descarga como siempre y registra la exportación', async ({ page }) => {
  await stubShare(page, 'unsupported')
  await startDemo(page)
  await go(page, '/ajustes/copia')
  const before = await lastExportAt(page)
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
  expect(download.suggestedFilename()).toMatch(/^clara-demo-copia-.*\.json$/)
  await expect(page.getByText('Descarga solicitada')).toBeVisible()
  await expect.poll(() => lastExportAt(page)).not.toBe(before)
})
