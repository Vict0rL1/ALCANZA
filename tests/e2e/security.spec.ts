import { expect, test } from '@playwright/test'
import { go, startDemo, storedData, openDetails } from './helpers'

const PAYLOAD = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script>'

test('notas, nombres y descripciones importadas con HTML se muestran como texto y no se ejecutan', async ({ page }) => {
  const external: string[] = []
  page.on('request', (r) => {
    const url = new URL(r.url())
    if (!['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol.startsWith('http')) external.push(r.url())
  })
  await startDemo(page)
  // La versión compilada declara una política de seguridad de contenido.
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toContain("script-src 'self'")
  expect(csp).toContain("connect-src 'self'")

  // Nota de un movimiento.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('1')
  await openDetails(page)
  await page.getByLabel('Nota (opcional)').fill(PAYLOAD)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  // Descripción de un CSV del banco.
  await go(page, '/movimientos/importar')
  const csv = ['Date,Description,Amount', `09/27/2026,"${PAYLOAD.replace(/"/g, '""')}",-2.00`].join('\r\n')
  await page.getByTestId('bank-file').setInputFiles({ name: 'banco.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await page.getByRole('button', { name: /Importar 1 movimiento/ }).click()

  await go(page, '/movimientos')
  await expect(page.locator('a.item', { hasText: '<img src=x' }).first()).toBeVisible()
  await go(page, `/buscar?q=${encodeURIComponent('<script>')}`)
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined()
  expect(await page.locator('main img[src="x"], main script').count()).toBe(0)
  expect(external).toEqual([])
})

test('un archivo de copia mal formado o enorme no bloquea la app ni cambia nada', async ({ page }) => {
  await startDemo(page)
  const before = await storedData(page)
  await go(page, '/ajustes/copia')
  const deep = '['.repeat(100000) + ']'.repeat(100000)
  for (const [name, text] of [
    ['profundo.json', deep],
    ['raro.json', JSON.stringify({ format: 'margen-backup', formatVersion: 1, data: { schemaVersion: 7, accounts: 'x' } })],
    ['grande.json', 'x'.repeat(6 * 1024 * 1024)],
  ] as const) {
    await page.getByTestId('import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })
    await expect(page.getByRole('alert').first()).toBeVisible()
    expect(await storedData(page)).toBe(before)
  }
  await go(page, '/')
  await expect(page.getByTestId('available')).toBeVisible()
})
