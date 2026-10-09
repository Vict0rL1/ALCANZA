import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { applyFilters, go, openDetails, openFilters, openMoreMenu, startDemo, storedData } from './helpers'

/**
 * L1 · Enlace externo a «nuevo movimiento» (Atajos de iPhone):
 *   #/movimientos/nuevo?kind=expense&importe=12.50&comercio=Starbucks&source=shortcut
 * Rellena el formulario y avisa; nunca guarda solo. `amount` (unidades menores) no cambia.
 */
const amount = (page: Page) => page.getByLabel('Importe', { exact: true })
const storedCount = async (page: Page) => (JSON.parse((await storedData(page)) ?? '{}') as { transactions: unknown[] }).transactions.length
const lastTx = async (page: Page) => {
  const d = JSON.parse((await storedData(page)) ?? '{}') as { transactions: { amountMinor: number; merchant?: string; source?: string; categoryId?: string; createdAt: string }[] }
  return [...d.transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]!
}

test('atajo de iPhone: rellena importe, comercio y categoría, avisa y solo guarda al pulsar Guardar', { tag: '@smoke' }, async ({ page }) => {
  await startDemo(page)
  const before = await storedCount(page)
  await go(page, '/movimientos/nuevo?kind=expense&importe=12.50&comercio=Starbucks&source=shortcut')
  await expect(page.getByTestId('shortcut-banner')).toContainText('Llegó desde un atajo · revisa y guarda')
  await expect(amount(page)).toHaveValue('12.50')
  await openDetails(page)
  await expect(page.getByLabel('Comercio')).toHaveValue('Starbucks')
  await expect(page.getByLabel('Categoría', { exact: true })).toHaveAttribute('data-value', 'dining')
  await expect(page.getByText('Categoría sugerida por el comercio «Starbucks»')).toBeVisible()
  // Nada se registra solo (contado en lo guardado, sin salir del formulario).
  expect(await storedCount(page)).toBe(before)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  expect(await storedCount(page)).toBe(before + 1)
  expect(await lastTx(page)).toMatchObject({ amountMinor: 1250, merchant: 'Starbucks', source: 'shortcut', categoryId: 'dining' })
})

test('el origen «Atajo» aparece en el filtro del historial y en el CSV', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo?kind=expense&importe=7.25&comercio=Tim%20Hortons&source=shortcut')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await go(page, '/movimientos')
  const sheet = await openFilters(page)
  await sheet.getByRole('group', { name: 'Origen' }).getByRole('button', { name: 'Atajo' }).click()
  await applyFilters(page)
  await expect(page.getByTestId('history-tools')).toContainText('1 movimiento')
  await expect(page.locator('.tx-group .item').first()).toContainText('7.25')
  const [download] = await Promise.all([page.waitForEvent('download'), (await openMoreMenu(page)).getByRole('button', { name: 'Exportar CSV' }).click()])
  const csv = readFileSync((await download.path())!, 'utf8')
  expect(csv.split('\r\n')[0]).toMatch(/Origen$/)
  expect(csv).toContain('Atajo')
})

test('`amount` sigue en unidades menores (25 → 0.25) e `importe` en mayores (25 → 25.00); si vienen los dos, manda `importe`', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo?amount=25')
  await expect(amount(page)).toHaveValue('0.25')
  await go(page, '/')
  await go(page, '/movimientos/nuevo?importe=25')
  await expect(amount(page)).toHaveValue('25.00')
  await go(page, '/')
  await go(page, '/movimientos/nuevo?amount=25&importe=12,50')
  await expect(amount(page)).toHaveValue('12.50')
  // Sin `source=shortcut` no hay aviso de atajo.
  await expect(page.getByTestId('shortcut-banner')).toHaveCount(0)
})

for (const [label, value] of [
  ['texto', 'doce'],
  ['vacío', ''],
  ['enorme', '99999999999999'],
] as const) {
  test(`importe ${label}: el campo queda vacío y se dice que no se entendió (nunca se adivina)`, async ({ page }) => {
    await startDemo(page)
    await go(page, `/movimientos/nuevo?importe=${encodeURIComponent(value)}&source=shortcut`)
    await expect(amount(page)).toHaveValue('')
    await expect(page.getByText('No se entendió el importe del atajo')).toBeVisible()
  })
}

test('importe en otra moneda: se rellena el número tal cual y se avisa', async ({ page }) => {
  await startDemo(page)
  await go(page, '/movimientos/nuevo?importe=12%20USD&source=shortcut')
  await expect(amount(page)).toHaveValue('12.00')
  await expect(page.getByText('El atajo envió el importe en USD; este presupuesto usa CAD')).toBeVisible()
})

test('importe grande pero válido: pasa por la confirmación de importe desproporcionado (G5)', async ({ page }) => {
  await startDemo(page)
  const before = await storedCount(page)
  await go(page, '/movimientos/nuevo?kind=expense&importe=50000&source=shortcut')
  await expect(amount(page)).toHaveValue('50000.00')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: /¿Seguro\?/ })
  await expect(dialog).toBeVisible()
  expect(await storedCount(page)).toBe(before)
  await dialog.getByRole('button', { name: 'Sí, es correcto' }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  expect((await lastTx(page)).source).toBe('shortcut')
})
