import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { available, go, startDemo } from './helpers'

test('exportar, rechazar copias inválidas sin tocar datos e importar una válida', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
  expect(download.suggestedFilename()).toMatch(/^margen-demo-copia-.*\.json$/)
  const backup = JSON.parse(readFileSync((await download.path())!, 'utf8'))
  expect(backup.format).toBe('margen-backup')
  expect(backup.data.transactions.length).toBeGreaterThan(20)

  const input = page.getByTestId('import-file')

  // 1) No es JSON
  await input.setInputFiles({ name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{esto no es json') })
  await expect(page.getByText('No se importó el archivo')).toBeVisible()
  await expect(page.getByText('El archivo no es JSON válido.')).toBeVisible()

  // 2) Importe con decimales (no son centavos enteros)
  const bad = structuredClone(backup)
  bad.data.transactions[0].amountMinor = 12.5
  await input.setInputFiles({ name: 'malo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) })
  await expect(page.getByText('El importe debe ser un número entero de centavos.')).toBeVisible()
  await expect(await available(page)).toHaveText('$136.78')

  // 3) Copia válida con un cambio: pide confirmación y reemplaza.
  await go(page, '/ajustes')
  const good = structuredClone(backup)
  good.data.accounts[0].name = 'Cuenta importada'
  await page.getByTestId('import-file').setInputFiles({ name: 'buena.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) })
  const dialog = page.getByRole('dialog', { name: '¿Reemplazar tus datos con esta copia?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Son datos de demostración')).toBeVisible()
  await dialog.getByRole('button', { name: 'Reemplazar datos' }).click()
  await expect(page.getByText('Copia importada')).toBeVisible()
  await expect(page.getByText('Cuenta importada').first()).toBeVisible()

  // Tras recargar, sigue la versión importada.
  await page.reload()
  await go(page, '/ajustes')
  await expect(page.getByText('Cuenta importada').first()).toBeVisible()
})
