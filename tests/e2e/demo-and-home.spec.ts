import { expect, test } from '@playwright/test'
import { openExplain, nav, startDemo } from './helpers'

test('la demostración se identifica y muestra el disponible con su explicación', async ({ page }) => {
  await startDemo(page)
  await expect(page.getByText('Demo · datos ficticios')).toBeVisible()
  await expect(page.getByTestId('avatar')).toHaveAttribute('aria-label', 'Cuenta (invitado)')
  // Saldo 901.57 − pagos 704.79 − apartados 60.00 = 136.78, en 6 días.
  await expect(page.getByTestId('available')).toHaveText('$136.78')
  await expect(page.getByText('Por día', { exact: true })).toBeVisible()
  await expect(page.locator('.stat__value').first()).toHaveText('$22.79')
  await expect(page.getByText('Tienes 1 pago vencido sin marcar')).toBeVisible()

  await openExplain(page)
  await expect(page.getByText('Pagos reservados (3)')).toBeVisible()
  await expect(page.getByText('Los ingresos futuros no se suman', { exact: false })).toBeVisible()
  await expect(page.getByText('Guardado')).toBeVisible()

  // Vista completa (C1): bandeja y próximos pagos a la vista; lo secundario, plegado en «Más en tu Inicio».
  await page.getByRole('button', { name: 'Ver Inicio completo' }).click()
  await expect(page.getByTestId('home-sections')).toBeVisible()
  await page.getByTestId('home-more').locator('summary').click()
  await expect(page.getByText('Saldo registrado:')).toBeVisible()
})

test('reiniciar y salir de la demostración piden confirmación', async ({ page }) => {
  await startDemo(page)
  await nav(page, 'Ajustes').click()
  await page.getByTestId('settings-row-reinicio').click()
  await page.getByRole('button', { name: 'Reiniciar datos de demostración' }).click()
  const dialog = page.getByRole('dialog', { name: '¿Reiniciar la demostración?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(dialog).toBeHidden()

  await page.getByRole('main').getByRole('button', { name: 'Empezar con mis datos' }).click()
  await page.getByRole('dialog', { name: '¿Salir de la demostración?' }).getByRole('button', { name: 'Empezar con mis datos' }).click()
  await expect(page.getByRole('heading', { name: 'Hola, esto es Clara' })).toBeVisible()
})

test('el cambio de día (y de mes) actualiza el periodo sin recargar', async ({ page }) => {
  // 23:59 del 30-sep en Toronto: el ingreso de la demo es el 6-oct (6 días).
  await startDemo(page, new Date('2026-09-30T23:59:00-04:00'))
  await expect(page.locator('.hero__sub')).toContainText('6 días')
  await page.clock.fastForward('02:00')
  await expect(page.locator('.hero__sub')).toContainText('5 días')
})
