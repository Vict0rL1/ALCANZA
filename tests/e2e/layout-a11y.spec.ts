import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { go, startDemo } from './helpers'

const ROUTES = ['/', '/movimientos', '/movimientos/nuevo', '/alcanza', '/plan/calendario', '/plan/metas', '/plan/proyeccion', '/ajustes', '/plan/programado/nuevo', '/plan/metas/nueva']

async function horizontalOverflow(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
}

test('ninguna pantalla tiene desplazamiento horizontal', async ({ page }) => {
  await startDemo(page)
  for (const route of ROUTES) {
    await go(page, route)
    if (route === '/alcanza') await page.getByLabel('Precio').fill('45')
    expect(await horizontalOverflow(page), route).toBeLessThanOrEqual(0)
  }
})

test('con texto ampliado al 200 % no aparece desplazamiento horizontal', async ({ page }) => {
  await startDemo(page)
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' })
  for (const route of ['/', '/movimientos', '/alcanza', '/plan/calendario']) {
    await go(page, route)
    expect(await horizontalOverflow(page), route).toBeLessThanOrEqual(0)
  }
})

test('navegación con teclado: saltar al contenido y llegar a «¿Me alcanza?»', async ({ page }) => {
  await startDemo(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
  const afford = page.getByRole('link', { name: '¿Me alcanza?' })
  await afford.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '¿Me alcanza?' })).toBeVisible()
  await expect(page.getByLabel('Precio')).toBeFocused()
})

test('sin problemas de accesibilidad detectables automáticamente', async ({ page }) => {
  await startDemo(page)
  for (const route of ROUTES) {
    await go(page, route)
    if (route === '/alcanza') await page.getByLabel('Precio').fill('45')
    if (route === '/') await page.getByText('¿Cómo se calculó?').click()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    const summary = results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
    expect(summary, route).toEqual([])
  }
})

test('modo oscuro también pasa la auditoría de contraste', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await startDemo(page)
  for (const route of ['/', '/alcanza', '/plan/calendario', '/plan/proyeccion']) {
    await go(page, route)
    if (route === '/alcanza') await page.getByLabel('Precio').fill('45')
    const results = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
    expect(results.violations.map((v) => v.nodes.map((n) => n.target.join(' ')).join(' | ')), route).toEqual([])
  }
  await context.close()
})
