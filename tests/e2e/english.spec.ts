import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { go, openApp } from './helpers'

test('la app funciona en inglés y se puede volver a español', async ({ page }) => {
  await openApp(page)
  await page.getByRole('radio', { name: 'English' }).check()
  await expect(page.getByRole('heading', { name: 'Hi, this is Clara' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Explore with demo data' }).click()

  await expect(page.getByText('You can spend')).toBeVisible()
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
