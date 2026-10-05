import { expect, test, type Page } from '@playwright/test'
import { go, movementCount, START, startDemo } from './helpers'

const KEY = 'margen.data.v1'

async function addExpense(page: Page, amount: string, note: string) {
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill(amount)
  await page.getByLabel('Nota (opcional)').fill(note)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
}

/** Hace que el navegador rechace escrituras (como con el almacenamiento lleno). */
async function failWrites(page: Page, name: 'QuotaExceededError' | 'SecurityError') {
  await page.evaluate((n) => {
    const w = window as unknown as { __realSetItem?: typeof Storage.prototype.setItem }
    w.__realSetItem ??= Storage.prototype.setItem
    Storage.prototype.setItem = function () {
      throw new DOMException('simulado', n)
    }
  }, name)
}
async function restoreWrites(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __realSetItem?: typeof Storage.prototype.setItem }
    if (w.__realSetItem) Storage.prototype.setItem = w.__realSetItem
  })
}
const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), KEY)

test('almacenamiento lleno: nunca dice «Guardado», conserva lo guardado y permite descargar y reintentar', async ({ page }) => {
  await startDemo(page)
  const before = await stored(page)
  const count = await movementCount(page)
  await failWrites(page, 'QuotaExceededError')
  await addExpense(page, '12.34', 'Prueba sin espacio')
  const banner = page.getByTestId('save-problem')
  await expect(banner).toContainText('Tus últimos cambios no se guardaron')
  await expect(banner).toContainText('no tiene espacio')
  await expect(page.locator('.save-indicator')).not.toContainText('Guardado')
  expect(await stored(page)).toBe(before) // último estado válido intacto
  // Descargar una copia de lo que se ve (incluye el cambio no guardado).
  const download = page.waitForEvent('download')
  await banner.getByRole('button', { name: 'Descargar copia de lo que ves' }).click()
  expect((await download).suggestedFilename()).toMatch(/^margen-demo-copia-.*\.json$/)
  // Al liberar espacio, reintentar guarda todo.
  await restoreWrites(page)
  await banner.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(banner).toHaveCount(0)
  await expect(page.locator('.save-indicator')).toContainText('Guardado')
  await page.reload()
  expect(await movementCount(page)).toBe(count + 1)
})

test('abrir con el almacenamiento lleno muestra los datos (no la bienvenida ni una demo nueva)', async ({ page }) => {
  await startDemo(page)
  const count = await movementCount(page)
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException('simulado', 'QuotaExceededError')
    }
  })
  await page.reload()
  await go(page, '/')
  await expect(page.getByTestId('available')).toBeVisible()
  expect(await movementCount(page)).toBe(count)
  await expect(page.getByText('No se puede guardar en este navegador.')).toHaveCount(0)
})

test('dos pestañas: la segunda no sobrescribe en silencio lo que guardó la primera', async ({ page, context }) => {
  await page.clock.install({ time: START })
  await startDemo(page)
  const other = await context.newPage()
  await other.clock.install({ time: START })
  await other.goto('/')
  await expect(other.getByTestId('available')).toBeVisible()

  await addExpense(page, '5', 'Desde la pestaña A')
  const savedByA = await stored(page)
  await addExpense(other, '7', 'Desde la pestaña B')
  const banner = other.getByTestId('save-problem')
  await expect(banner).toContainText('Otra pestaña')
  expect(await stored(other)).toBe(savedByA)
  // Cargar lo guardado trae el cambio de A (y descarta el de B, como dice el botón).
  await banner.getByRole('button', { name: /Cargar lo guardado/ }).click()
  await go(other, '/movimientos')
  await expect(other.locator('a.item', { hasText: 'Desde la pestaña A' })).toBeVisible()
  await expect(other.locator('a.item', { hasText: 'Desde la pestaña B' })).toHaveCount(0)
  // Ahora B puede guardar sin pisar a A.
  await addExpense(other, '7', 'Desde la pestaña B')
  await go(other, '/movimientos')
  await expect(other.locator('a.item', { hasText: 'Desde la pestaña A' })).toBeVisible()
  await expect(other.locator('a.item', { hasText: 'Desde la pestaña B' })).toBeVisible()
})

test('datos de una versión más nueva: se explican, no se tocan y empezar de nuevo pide confirmación', async ({ page }) => {
  await startDemo(page)
  const future = await page.evaluate((k) => {
    const d = JSON.parse(localStorage.getItem(k)!)
    d.schemaVersion = 99
    const text = JSON.stringify(d)
    localStorage.setItem(k, text)
    return text
  }, KEY)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('Estos datos son de una versión más nueva de Margen')
  expect(await stored(page)).toBe(future)
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Empezar de nuevo?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  expect(await stored(page)).toBe(future)
})

test('restaurar una copia se puede deshacer en el momento', async ({ page }) => {
  await startDemo(page)
  await go(page, '/ajustes')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar copia' }).click()
  const file = await (await download).path()
  await addExpense(page, '3.21', 'Después de exportar')
  const count = await movementCount(page)
  await go(page, '/ajustes')
  await page.getByTestId('import-file').setInputFiles(file)
  await page.getByRole('dialog').getByRole('button', { name: 'Reemplazar datos' }).click()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText('Importación deshecha')).toBeVisible()
  expect(await movementCount(page)).toBe(count)
})
