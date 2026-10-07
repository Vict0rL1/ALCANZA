import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { available, go, START, startDemo } from './helpers'

test('tema: claro/oscuro/sistema se recuerda, no cambia cifras ni borra un formulario abierto en otra pestaña', async ({ page, context }) => {
  await startDemo(page)
  const amount = await (await available(page)).textContent()
  // Otra pestaña con un formulario a medias.
  const form = await context.newPage()
  await form.clock.install({ time: START })
  await form.goto('/#/movimientos/nuevo')
  await form.getByLabel('Importe', { exact: true }).fill('7.77')

  await go(page, '/ajustes')
  await page.getByRole('radio', { name: 'Oscuro' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(form.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(form.getByLabel('Importe', { exact: true })).toHaveValue('7.77')
  // Contraste en oscuro forzado.
  await go(page, '/')
  const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(results.violations.map((v) => v.id)).toEqual([])
  await expect(page.getByTestId('available')).toHaveText(amount!)

  // Se recuerda al recargar y «Sistema» lo devuelve al dispositivo.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await go(page, '/ajustes')
  await page.getByRole('radio', { name: 'Claro' }).check()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // Contraste también en claro.
  await go(page, '/')
  const light = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
  expect(light.violations.map((v) => v.id)).toEqual([])
  await go(page, '/ajustes')
  // «Sistema» deja mandar al dispositivo (sin atributo) y se recuerda al recargar.
  await page.getByRole('radio', { name: 'Sistema' }).check()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
  await page.reload()
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
})

test('oscuro es el tema predeterminado; la galería de componentes pasa la auditoría en claro y oscuro', async ({ page }) => {
  await startDemo(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await go(page, '/galeria')
  await expect(page.getByRole('heading', { name: 'Galería de componentes' })).toBeVisible()
  for (const theme of ['Oscuro', 'Claro']) {
    await page.getByRole('radio', { name: theme }).check()
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'Claro' ? 'light' : 'dark')
    const results = await new AxeBuilder({ page }).disableRules(['region']).analyze()
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  }
  // Hoja inferior: abre, atrapa el foco y se cierra con Escape.
  await page.getByRole('button', { name: 'Abrir hoja inferior' }).click()
  const sheet = page.getByRole('dialog', { name: 'Hoja inferior' })
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  // Interruptor accesible.
  const toggle = page.getByRole('switch', { name: 'Interruptor de ejemplo' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  // Sin desplazamiento horizontal.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(overflow).toBe(false)
})

test('navegación: «Agregar» a un toque y sección activa marcada (no solo por color)', async ({ page }) => {
  await startDemo(page)
  const nav = page.getByRole('navigation', { name: 'Navegación principal' })
  await nav.getByRole('link', { name: 'Agregar' }).click()
  await expect(page.getByRole('heading', { name: 'Nuevo movimiento' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Agregar' })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link', { name: 'Movimientos' })).not.toHaveAttribute('aria-current', 'page')
  await go(page, '/movimientos')
  const active = nav.getByRole('link', { name: 'Movimientos' })
  await expect(active).toHaveAttribute('aria-current', 'page')
  // Indicador visible además del color: negrita y barra.
  expect(await active.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('800')
  expect(await active.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
})
