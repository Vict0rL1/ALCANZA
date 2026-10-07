import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { go, openApp } from './helpers'

test('la app funciona en inglés y se puede volver a español', async ({ page }) => {
  await openApp(page)
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(page.getByRole('heading', { name: 'Hi, this is Clara' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Explore with demo data' }).click()

  await expect(page.getByText('You can spend', { exact: true })).toBeVisible()
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await expect(page.getByText('Demo mode:')).toBeVisible()
  await expect(page.getByText('Room rent').filter({ visible: true }).first()).toBeVisible()

  for (const route of ['/', '/alcanza', '/plan/proyeccion', '/ajustes']) {
    await go(page, route)
    if (route === '/alcanza') {
      await page.getByLabel('Price').fill('150')
      await expect(page.getByTestId('verdict')).toHaveText('Only with money set aside')
    }
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.map((v) => v.id), route).toEqual([])
  }

  // New screens in English: trash, favorites, balance verification and backup status.
  await go(page, '/')
  await expect(page.getByRole('navigation', { name: 'Favorites' }).getByRole('link', { name: /Coffee/ })).toBeVisible()
  await expect(page.getByTestId('verification')).toContainText('Last recorded transaction')
  for (const [route, heading] of [
    ['/movimientos/papelera', 'Trash'],
    ['/movimientos/favoritos', 'Favorites'],
    ['/conciliar', 'Verify balance'],
  ] as const) {
    await go(page, route)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(results.violations.map((v) => v.id), route).toEqual([])
  }
  await go(page, '/plan/proyeccion')
  await expect(page.getByRole('group', { name: 'Variable income scenario' })).toBeVisible()
  await go(page, '/ajustes')
  await expect(page.getByTestId('backup-status')).toContainText('You have never exported a backup.')

  await go(page, '/ajustes')
  await page.getByLabel('Language').selectOption('es')
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await page.reload()
  await expect(page.getByRole('link', { name: 'Movimientos' }).first()).toBeVisible()
})

test('las pantallas nuevas no dejan texto en español al usar inglés', async ({ page }) => {
  await openApp(page)
  await page.getByRole('radio', { name: 'English' }).check()
  await page.getByRole('button', { name: 'Explore with demo data' }).click()
  await expect(page.getByTestId('available')).toBeVisible()
  // Un cambio para que el historial y «¿Qué cambió?» tengan contenido.
  await go(page, '/movimientos/nuevo')
  await page.getByLabel('Amount', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // Palabras de interfaz en español que no deberían aparecer (los nombres de la demo están traducidos).
  const spanish = /\b(Guardar|Cancelar|Importe|Disponible|Historial|Plantilla|Borrador|Revertir|Supuesto|Registrado|faltante|Comparar|Ajustes|Movimiento|Inicio)\b|¿|¡/
  for (const route of ['/', '/movimientos/nuevo', '/cambios', '/ajustes/historial', '/movimientos/plantillas', '/movimientos/plantillas/nueva?tipo=distribution', '/alcanza/faltante', '/ajustes', '/estadisticas', '/plan/planes']) {
    await go(page, route)
    if (route === '/cambios') await page.getByLabel('Compare with').selectOption('historyStart')
    await page.waitForTimeout(200)
    const text = await page.locator('#main').innerText()
    expect(text.match(spanish)?.[0] ?? null, route).toBeNull()
  }
})
