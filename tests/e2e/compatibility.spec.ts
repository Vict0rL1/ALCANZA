import { expect, test, type Page } from '@playwright/test'
import { available, go, START, startDemo } from './helpers'

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test.describe('importes con formatos regionales', () => {
  for (const [locale, typed, shown] of [
    ['es-MX', '1,234.56', '$1,234.56'],
    ['es-ES', '1.234,56', '1234,56'],
    ['fr-CA', '1 234,56', '1 234,56'],
    ['en-CA', '1234.56', '$1,234.56'],
  ] as const) {
    test(`${locale}: «${typed}» se guarda como 1,234.56 exactos`, async ({ page }) => {
      await startDemo(page)
      await go(page, '/ajustes')
      await page.getByLabel('Formato de números').selectOption(locale)
      await go(page, '/movimientos/nuevo')
      const amount = page.getByLabel('Importe', { exact: true })
      await expect(amount).toHaveAttribute('inputmode', 'decimal') // teclado numérico en el celular
      await amount.fill(typed)
      await page.getByLabel('Nota (opcional)').fill('Formato regional')
      await page.getByRole('button', { name: 'Guardar', exact: true }).click()
      await go(page, '/movimientos')
      // Mismo importe exacto, mostrado con el formato elegido (los espacios pueden ser finos).
      const text = (await page.locator('a.item', { hasText: 'Formato regional' }).textContent())!.replace(/[\s  ]/g, ' ')
      expect(text).toContain(shown.replace(/[\s  ]/g, ' '))
    })
  }

  test('una entrada ambigua o inválida no se guarda y se explica', async ({ page }) => {
    await startDemo(page)
    await go(page, '/movimientos/nuevo')
    await page.getByLabel('Importe', { exact: true }).fill('12.3.4')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible()
    await expect(page.getByLabel('Importe', { exact: true })).toHaveAttribute('aria-invalid', 'true')
  })
})

test.describe('celular en horizontal', () => {
  test.use({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true })

  test('pantallas y diálogos caben y se pueden usar', async ({ page }) => {
    await startDemo(page)
    for (const route of ['/', '/movimientos', '/movimientos/nuevo', '/plan/calendario', '/ajustes', '/pendientes']) {
      await go(page, route)
      expect(await overflow(page), route).toBeLessThanOrEqual(0)
    }
    await go(page, '/ajustes')
    await page.getByRole('button', { name: 'Agregar cuenta' }).click()
    const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
    await expect(dialog).toBeVisible()
    const save = dialog.getByRole('button', { name: 'Guardar' })
    await save.scrollIntoViewIfNeeded()
    await expect(save).toBeInViewport()
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).toHaveCount(0)
  })
})

test.describe('teclado del celular abierto (pantalla baja)', () => {
  test.use({ viewport: { width: 390, height: 330 }, isMobile: true, hasTouch: true })

  test('el campo enfocado y el botón de guardar quedan accesibles', async ({ page }) => {
    await startDemo(page)
    await go(page, '/movimientos/nuevo')
    const amount = page.getByLabel('Importe', { exact: true })
    await amount.tap()
    await expect(amount).toBeFocused()
    // Visible y sin quedar tapado por las barras fijas.
    const covered = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement
        const r = el.getBoundingClientRect()
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) !== el
      })
    await amount.scrollIntoViewIfNeeded()
    expect(await covered()).toBe(false)
    await amount.fill('4.25')
    const save = page.getByRole('button', { name: 'Guardar', exact: true })
    await save.scrollIntoViewIfNeeded()
    await expect(save).toBeInViewport()
    // El botón no queda debajo de la barra inferior: tocarlo guarda (no navega a otra pantalla).
    await save.tap()
    await expect(await available(page)).toHaveText('$132.53')
  })
})

test('diálogos con texto al 200 % en 320 px: sin desplazamiento horizontal y con botones alcanzables', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.clock.install({ time: START })
  await startDemo(page)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  await go(page, '/ajustes')
  await page.getByRole('button', { name: 'Agregar cuenta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva cuenta' })
  expect(await overflow(page)).toBeLessThanOrEqual(0)
  const box = await dialog.boundingBox()
  expect(box!.width).toBeLessThanOrEqual(320)
  const save = dialog.getByRole('button', { name: 'Guardar' })
  await save.scrollIntoViewIfNeeded()
  await expect(save).toBeInViewport()
  await context.close()
})
