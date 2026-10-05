import { expect, type Page } from '@playwright/test'

/** Mediodía del 28-sep-2026 en Toronto. El reloj avanza con normalidad desde aquí. */
export const START = new Date('2026-09-28T12:00:00-04:00')

export async function openApp(page: Page, time: Date = START) {
  await page.clock.install({ time })
  await page.goto('/')
}

/** Abre la app y carga los datos de demostración (fechas relativas a START). */
export async function startDemo(page: Page, time: Date = START) {
  await openApp(page, time)
  await page.getByRole('button', { name: 'Explorar con datos de demostración' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
}

export function nav(page: Page, name: 'Inicio' | 'Movimientos' | 'Plan' | 'Ajustes') {
  return page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name })
}

export async function go(page: Page, hash: string) {
  await page.evaluate((h) => {
    window.location.hash = h
  }, hash)
  await expect(page.locator('#page-title')).toBeVisible()
}

export async function available(page: Page) {
  await go(page, '/')
  return page.getByTestId('available')
}

/** Número de movimientos según el resumen de la lista. */
export async function movementCount(page: Page): Promise<number> {
  await go(page, '/movimientos')
  const text = (await page.locator('.summary-line').textContent()) ?? ''
  return Number(/(\d+) movimiento/.exec(text)?.[1] ?? NaN)
}

/** Inicio agrupa los avisos secundarios en «N avisos más»: los despliega si existen. */
export async function showAllNotices(page: Page) {
  const more = page.getByTestId('more-notices')
  if ((await more.count()) > 0 && !(await more.evaluate((d) => (d as HTMLDetailsElement).open))) await more.locator('summary').click()
}
