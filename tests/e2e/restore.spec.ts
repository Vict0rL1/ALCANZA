import { readFileSync } from 'node:fs'
import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test'
import { go, setupFirstUse, START, storedData } from './helpers'

/**
 * K4 · Simulacro de restauración (docs/RESTORE.md): exportar en un navegador e importar en otro
 * recién estrenado (otro contexto: sin datos, como una app recién instalada) desde la bienvenida.
 * Mismas cifras, mismos registros y mismos ajustes.
 */
const COLLECTIONS = ['accounts', 'transactions', 'schedules', 'goals', 'categories', 'categoryRules', 'tags', 'plans', 'favorites'] as const

/** Un navegador nuevo con el mismo tamaño, idioma y zona horaria que el proyecto. */
async function freshBrowser(browser: Browser, info: TestInfo): Promise<Page> {
  const u = info.project.use
  const context = await browser.newContext({
    viewport: u.viewport,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    deviceScaleFactor: u.deviceScaleFactor,
    userAgent: u.userAgent,
    locale: u.locale,
    timezoneId: u.timezoneId,
    baseURL: u.baseURL,
  })
  const page = await context.newPage()
  await page.clock.install({ time: START })
  return page
}

const figures = async (page: Page) => ({
  available: await page.getByTestId('available').textContent(),
  income: await page.getByTestId('period-income').textContent(),
  expenses: await page.getByTestId('period-expenses').textContent(),
})

const records = async (page: Page): Promise<Record<string, unknown> & { transactions: unknown[] }> => {
  const d = JSON.parse((await storedData(page)) ?? '{}') as Record<string, unknown>
  return { settings: d.settings, ...Object.fromEntries(COLLECTIONS.map((c) => [c, d[c]])) } as unknown as Record<string, unknown> & { transactions: unknown[] }
}

test('exportar en un navegador e importar en otro nuevo: mismas cifras, registros y ajustes', async ({ page, browser }, info) => {
  // Navegador A: datos reales (configuración + un gasto) y un ajuste cambiado.
  await setupFirstUse(page)
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Importe', { exact: true }).fill('25.50')
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await go(page, '/ajustes/copia')
  await page.getByLabel('Recordatorio de copia').selectOption('monthly')
  await go(page, '/')
  const before = await figures(page)
  expect(before.available).toBe('$374.50')
  const beforeRecords = await records(page)
  expect(beforeRecords.transactions.length).toBeGreaterThan(0)

  await go(page, '/ajustes/copia')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
  const file = readFileSync((await download.path())!)

  // Navegador B, recién estrenado: bienvenida → «Restaurar una copia».
  const fresh = await freshBrowser(browser, info)
  await fresh.goto('/')
  await expect(fresh.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
  await fresh.getByTestId('welcome-import-file').setInputFiles({ name: download.suggestedFilename(), mimeType: 'application/json', buffer: file })
  const preview = fresh.getByTestId('welcome-restore-preview')
  await expect(preview).toContainText(`movimientos: ${beforeRecords.transactions.length}`)
  // Nada se guarda antes de confirmar.
  expect(await storedData(fresh)).toBeNull()
  await fresh.getByRole('button', { name: 'Restaurar', exact: true }).click()

  await expect(fresh.getByTestId('available')).toBeVisible()
  expect(await figures(fresh)).toEqual(before)
  expect(await records(fresh)).toEqual(beforeRecords)
  // Tras recargar, sigue ahí.
  await fresh.reload()
  await expect(fresh.getByTestId('available')).toHaveText(before.available!)
  await fresh.context().close()
})

test('bienvenida: una copia no válida no restaura nada y lo explica', async ({ page }) => {
  await page.clock.install({ time: START })
  await page.goto('/')
  await page.getByTestId('welcome-import-file').setInputFiles({ name: 'roto.json', mimeType: 'application/json', buffer: Buffer.from('{esto no es json') })
  await expect(page.getByText('No se importó el archivo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
  expect(await storedData(page)).toBeNull()
})
