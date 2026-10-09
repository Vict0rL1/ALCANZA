import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { go, startDemo, storedData } from './helpers'

/**
 * M3 · Informe de errores: `window.onerror`, `unhandledrejection` y el límite de error de las
 * pantallas guardan los 20 últimos fallos en el dispositivo (fuera de los datos y de las copias),
 * saneados: ningún importe, nota, comercio ni nombre de cuenta.
 */
// Sin service worker: así `page.route` ve la descarga de las pantallas diferidas.
test.use({ serviceWorkers: 'block' })

type Entry = { at: string; version: string; route: string; message: string }
const errorLog = async (page: Page) => page.evaluate(() => localStorage.getItem('clara.errors.v1'))
const entries = async (page: Page) => JSON.parse((await errorLog(page)) ?? '[]') as Entry[]

async function stubClipboard(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: (t: string) => ((w.__copied = t), Promise.resolve()), readText: () => Promise.resolve('') } })
  })
}

/** La demostración no tiene comercios: se registra uno antes (con el enlace de L1 y «Guardar»). */
const MERCHANT = 'Panadería Rosales'

/** Textos de la persona que nunca pueden acabar en el informe. */
async function secrets(page: Page) {
  const d = JSON.parse((await storedData(page))!) as { accounts: { name: string }[]; transactions: { note?: string; merchant?: string; amountMinor: number }[] }
  const withMerchant = d.transactions.find((t) => t.merchant === MERCHANT)!
  const withNote = d.transactions.find((t) => t.note && t.note.length >= 4)!
  return { account: d.accounts[0]!.name, merchant: withMerchant.merchant!, note: withNote.note!, amount: (withMerchant.amountMinor / 100).toFixed(2) }
}

test('un fallo con datos de la persona se guarda saneado: sin importes, notas, comercios ni cuentas; ni en los datos ni en la copia', async ({ page }) => {
  await stubClipboard(page)
  await startDemo(page)
  await go(page, `/movimientos/nuevo?kind=expense&importe=37.80&comercio=${encodeURIComponent(MERCHANT)}`)
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Movimiento guardado').first()).toBeVisible()
  await go(page, '/movimientos')
  const s = await secrets(page)
  expect(s.amount).toBe('37.80')
  await page.evaluate(({ account, merchant, note, amount }) => {
    // `queueMicrotask` y no `setTimeout`: el reloj simulado de Playwright atrapa lo que lanzan sus temporizadores.
    queueMicrotask(() => {
      throw new Error(`${account} ${merchant} ${note} ${amount}`)
    })
    void Promise.reject(new TypeError(`«${merchant}» ${amount} in ${account}`))
  }, s)
  await expect.poll(async () => (await entries(page)).length).toBe(2)

  const log = await entries(page)
  const raw = (await errorLog(page))!.toLowerCase()
  for (const secret of [s.account, s.merchant, s.note, s.amount]) expect(raw, secret).not.toContain(secret.toLowerCase())
  for (const e of log) {
    expect(e.route).toBe('/movimientos')
    expect(e.message).not.toMatch(/\d/)
    expect(e.message.length).toBeLessThanOrEqual(40)
    expect(e.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(new Date(e.at).toString()).not.toBe('Invalid Date')
  }
  expect(log.map((e) => e.message).sort()).toEqual(['Error: … … … ##.##', 'TypeError: … ##.## in …'])

  // Fuera de los datos guardados y de la copia de seguridad.
  expect(await storedData(page)).not.toContain('TypeError')
  await go(page, '/ajustes/copia')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar copia' }).click()])
  const backup = readFileSync((await download.path())!, 'utf8')
  expect(backup).not.toContain('TypeError')
  expect(backup).not.toContain('clara.errors')

  // Ajustes › Acerca de › Informe de errores: lo que se ve es lo que se copia; «Borrar» lo vacía.
  await go(page, '/ajustes/acerca')
  const report = page.getByTestId('error-report')
  await expect(report.getByRole('heading', { name: 'Informe de errores' })).toBeVisible()
  const text = (await report.getByTestId('error-report-text').textContent())!
  expect(text.split('\n')).toHaveLength(3)
  expect(text).toMatch(/^Clara \d+\.\d+\.\d+\S* \(\S+\)\n/)
  await report.getByRole('button', { name: 'Copiar informe' }).click()
  await expect(page.getByText('Informe copiado')).toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { __copied?: string }).__copied)).toBe(text)
  await report.getByRole('button', { name: 'Borrar informe' }).click()
  await expect(report.getByTestId('error-report-empty')).toHaveText('Ningún error registrado en este dispositivo.')
  expect(await errorLog(page)).toBeNull()
})

test('una pantalla que no carga queda en el informe con su ruta; los datos no cambian', async ({ page }) => {
  await startDemo(page)
  const before = await storedData(page)
  await page.route(/\/assets\/Statistics-[^/]+\.js$/, (route) => route.abort())
  await go(page, '/estadisticas')
  await expect(page.getByRole('heading', { name: 'No se pudo abrir esta pantalla' })).toBeVisible()
  await expect.poll(async () => (await entries(page)).length).toBeGreaterThan(0)
  const [entry] = await entries(page)
  expect(entry!.route).toBe('/estadisticas')
  expect(entry!.message).toMatch(/^TypeError: /)
  expect(entry!.message).not.toMatch(/\d/)
  expect(await storedData(page)).toBe(before)
})

test('«Enviar comentarios» solo añade el informe si la persona lo marca, y entonces se ve en el texto', async ({ page }) => {
  await startDemo(page)
  await page.evaluate(() => {
    void Promise.reject(new Error('fallo de prueba'))
  })
  await expect.poll(async () => (await entries(page)).length).toBe(1)
  await go(page, '/ajustes/comentarios')
  const preview = page.getByTestId('feedback-preview')
  await expect(preview).not.toContainText('fallo de prueba')
  await page.getByLabel('Añadir el informe de errores (1)').check()
  await expect(preview).toContainText('Informe de errores:')
  await expect(preview).toContainText('Error: fallo de prueba')
  const body = decodeURIComponent((await page.getByTestId('feedback-mailto').getAttribute('href'))!.match(/body=([^&]*)/)![1]!)
  expect(body).toContain('Error: fallo de prueba')
})
